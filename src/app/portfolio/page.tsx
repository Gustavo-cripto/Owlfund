"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { btnPrimary } from "@/lib/ui/buttons";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { loadStripe } from "@stripe/stripe-js";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";

import AppShell from "@/components/AppShell";
import PnlSummaryCard from "@/components/PnlSummaryCard";
import PortfolioChartSection from "@/components/PortfolioChartSection";
import ScenarioSimulator from "@/components/ScenarioSimulator";
import { createClient } from "@/lib/supabase/client";
import { loadWalletSnapshot, updateWalletSnapshot, type StoredWalletEntry, type WalletSnapshot } from "@/lib/wallets/storage";
import { pushWalletCloud, pullWalletCloud } from "@/lib/portfolios/cloudSync";
import { getActiveAccountId, listAccounts } from "@/lib/portfolios/accounts";
import { getEvmBalance } from "@/lib/wallets/evm";
import { getSolBalance } from "@/lib/wallets/solana";
import { getBtcBalanceFromAddress } from "@/lib/wallets/bitcoin";
import { getAdaBalanceByAddress } from "@/lib/wallets/cardano";
import { useRequireAuth } from "@/lib/auth/useRequireAuth";
import { useCurrencyFormat } from "@/lib/theme/ThemeContext";
import { traditionalAssets } from "@/lib/traditional/assets";
import { loadTraditionalHoldings, type TraditionalHoldings } from "@/lib/traditional/storage";
import { loadCryptoHoldings, loadStablecoinEntries, type CryptoHoldings, type StablecoinEntry } from "@/lib/crypto/storage";
import { loadNickname } from "@/lib/user/nickname";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ""
);

type WalletBalance = {
  label: string;
  symbol: string;
  balance?: string;
  address?: string;
  network?: string; // "Ethereum" | "Arbitrum" | "Base" | ...
};

type SubscriptionStatus = {
  status: string;
  current_period_end: string | null;
};

type SnapshotRow = {
  id: number;
  created_at: string;
  data: WalletSnapshot;
};

// Preços em EUR por símbolo (CoinGecko IDs)
const COINGECKO_IDS: Record<string, string> = {
  ETH: "ethereum",
  SOL: "solana",
  BTC: "bitcoin",
  ADA: "cardano",
};

type TokenPrices = Record<string, number> & { usdToEur?: number }; // symbol → EUR price

type PricesApiResponse = {
  prices?: TokenPrices;
  benchmark?: Record<string, number>;
  error?: string;
};

type HistoricalPrices = {
  "1d": Record<string, number>;
  "7d": Record<string, number>;
  "30d": Record<string, number>;
};

async function fetchTokenPricesEur(): Promise<TokenPrices> {
  try {
    const res = await fetch("/api/prices", { cache: "no-store" });
    if (!res.ok) return {};
    const data = (await res.json()) as PricesApiResponse;
    return data.prices ?? {};
  } catch {
    return {};
  }
}

async function fetchPricesWithBenchmark(): Promise<PricesApiResponse> {
  try {
    const res = await fetch("/api/prices", { cache: "no-store" });
    if (!res.ok) return {};
    return (await res.json()) as PricesApiResponse;
  } catch {
    return {};
  }
}

// Snapshot do benchmark (BTC, S&P 500, ouro) no momento da gravação — base para
// calcular o Beta do portfólio vs mercado. Só guardamos o que vier > 0.
type BenchSnapshot = { btc?: number; sp500?: number; gold?: number };
async function fetchBenchmarkSnapshot(): Promise<BenchSnapshot | null> {
  try {
    const res = await fetch("/api/prices", { cache: "no-store" });
    if (!res.ok) return null;
    const b = ((await res.json()) as PricesApiResponse).benchmark;
    if (!b) return null;
    const out: BenchSnapshot = {};
    if (b.btc_eur > 0) out.btc = b.btc_eur;
    if (b.sp500 > 0) out.sp500 = b.sp500;
    if (b.gold_eur > 0) out.gold = b.gold_eur;
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}

// Logótipo do ChainFolioAI como data URL (base64), para embutir no PDF/Excel.
// Usa o apple-touch-icon (leve, ~43KB). Cacheado após o primeiro fetch.
let _logoDataUrl: string | null = null;
async function loadLogoDataUrl(): Promise<string | null> {
  if (_logoDataUrl) return _logoDataUrl;
  try {
    const res = await fetch("/apple-touch-icon.png");
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as string);
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
    _logoDataUrl = dataUrl;
    return dataUrl;
  } catch {
    return null;
  }
}

async function fetchHistoricalPrices(): Promise<HistoricalPrices> {
  try {
    const res = await fetch("/api/historical-prices", { cache: "no-store" });
    if (!res.ok) return { "1d": {}, "7d": {}, "30d": {} };
    return (await res.json()) as HistoricalPrices;
  } catch {
    return { "1d": {}, "7d": {}, "30d": {} };
  }
}

const sumEntries = (entries?: StoredWalletEntry[]) =>
  (entries ?? []).reduce((sum, entry) => {
    const value = Number(entry.balance ?? 0);
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);

const snapshotTotal = (snapshot: WalletSnapshot, prices: TokenPrices = {}) =>
  sumEntries(snapshot.eth) * (prices.ETH ?? 0) +
  sumEntries(snapshot.sol) * (prices.SOL ?? 0) +
  sumEntries(snapshot.btc) * (prices.BTC ?? 0) +
  sumEntries(snapshot.ada) * (prices.ADA ?? 0);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const snapshotToWallets = (snapshot: WalletSnapshot, _prices?: TokenPrices): WalletBalance[] => {
  const seen = new Set<string>();
  const dedup = (entries: StoredWalletEntry[] | undefined) =>
    (entries ?? []).filter((e) => {
      const k = `${e.address ?? ""}:${e.network ?? ""}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

  return [
  // Each ETH wallet entry as its own row (mainnet + L2s) — balance is raw token amount
  // Nome amigável (nunca o endereço): a carteira é identificada pelo label
  // escolhido ou por "<Rede> #n". Privacidade: o endereço nunca é mostrado aqui.
  ...dedup(snapshot.eth).map((entry, i) => ({
    label: entry.label || `${entry.network ?? "Ethereum"} #${i + 1}`,
    symbol: "ETH",
    balance: String(Number(entry.balance ?? 0)),
    address: entry.address,
    network: entry.network ?? "Ethereum",
  })),
  ...dedup(snapshot.sol).map((entry, i) => ({
    label: entry.label || `Solana #${i + 1}`,
    symbol: "SOL",
    balance: String(Number(entry.balance ?? 0)),
    address: entry.address,
    network: "Solana",
  })),
  ...dedup(snapshot.btc).map((entry, i) => ({
    label: entry.label || `Bitcoin #${i + 1}`,
    symbol: "BTC",
    balance: String(Number(entry.balance ?? 0)),
    address: entry.address,
    network: "Bitcoin",
  })),
  ...dedup(snapshot.ada).map((entry, i) => ({
    label: entry.label || `Cardano #${i + 1}`,
    symbol: "ADA",
    balance: String(Number(entry.balance ?? 0)),
    address: entry.address,
    network: "Cardano",
  })),
  ]};

const sumCrypto = (balances: WalletBalance[], prices: TokenPrices = {}) => {
  return balances.reduce((sum, item) => {
    const raw = Number(item.balance ?? 0);
    const price = prices[item.symbol] ?? 0;
    const eur = raw * price;
    return Number.isFinite(eur) ? sum + eur : sum;
  }, 0);
};

const toNumber = (value?: string) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatValue = (value: number) => {
  return value.toLocaleString("pt-PT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const getPercent = (value: number, total: number): string => {
  if (!total || total <= 0) return "0";
  return String(Math.round((value / total) * 100));
};

const STABLE_SYMBOLS = new Set([
  "USDT", "USDC", "DAI", "BUSD", "TUSD", "FDUSD", "USDE", "PYUSD", "USDP", "EURC", "GUSD", "FRAX",
]);

function SnapshotList({ snapshots, onRestore }: { snapshots: SnapshotRow[]; onRestore: (row: SnapshotRow) => void }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? snapshots : snapshots.slice(0, 3);
  const hasMore = snapshots.length > 3;
  return (
    <div className="mt-6 space-y-3">
      {visible.map((row) => (
        <div
          key={row.id}
          className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p className="text-sm font-semibold text-white">
              {new Date(row.created_at).toLocaleString("pt-BR")}
            </p>
            <p className="text-xs text-slate-500">ID #{row.id}</p>
          </div>
          <button
            type="button"
            onClick={() => onRestore(row)}
            className="rounded-full border border-orange-400/40 px-4 py-2 text-xs font-semibold text-orange-200 transition hover:border-orange-400 hover:text-white"
          >
            Restaurar
          </button>
        </div>
      ))}
      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full rounded-xl border border-slate-700 py-2 text-xs font-semibold text-slate-400 transition hover:border-slate-500 hover:text-white"
        >
          {expanded ? `Mostrar menos ▲` : `Ver mais ${snapshots.length - 3} snapshots ▼`}
        </button>
      )}
    </div>
  );
}

export default function PortfolioPage() {
  const supabase = createClient();
  useRequireAuth("/login");
  const { t } = useLanguage();
  const { format: fmt, formatSigned: fmtSigned, convert: fx, symbol: curSym, hideBalances } = useCurrencyFormat();
  const [wallets, setWallets] = useState<WalletBalance[]>([]);
  const [tokenPrices, setTokenPrices] = useState<TokenPrices>({});
  const [historicalPrices, setHistoricalPrices] = useState<HistoricalPrices>({ "1d": {}, "7d": {}, "30d": {} });
  // Ref keeps prices always fresh for async callbacks (avoids stale closure)
  const tokenPricesRef = useRef<TokenPrices>({});
  const [traditionalHoldings, setTraditionalHoldings] = useState<TraditionalHoldings>({});
  const [cryptoHoldings, setCryptoHoldings] = useState<CryptoHoldings>({});
  const [stablecoinEntries, setStablecoinEntries] = useState<StablecoinEntry[]>([]);
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([]);
  // Intervalo do gráfico PNL histórico (içado para cá — hooks não podem viver no IIFE do gráfico).
  const [chartRange, setChartRange] = useState<string>(t("pf_all"));
  const [isSnapshotsLoading, setIsSnapshotsLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isPro, setIsPro] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isBillingLoading, setIsBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // IA contextual
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiReply, setAiReply] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [portfolioNote, setPortfolioNote] = useState("");
  const [snapshotCexUsd, setSnapshotCexUsd] = useState(0);
  const [snapshotDefiUsd, setSnapshotDefiUsd] = useState(0);
  const [snapshotManualEur, setSnapshotManualEur] = useState<number | null>(null);
  const [usdToEur, setUsdToEur] = useState(0.92); // fallback ~0.92

  useEffect(() => {
    const snap = loadWalletSnapshot();
    if (typeof snap.cexUsd === "number") setSnapshotCexUsd(snap.cexUsd);
    if (typeof snap.defiUsd === "number") setSnapshotDefiUsd(snap.defiUsd);
    if (typeof snap.manualEur === "number") setSnapshotManualEur(snap.manualEur);
  }, []);

  // Buscar benchmark + crypto prices via proxy server-side (evita rate limits CoinGecko)
  useEffect(() => {
    const applyPrices = (prices: TokenPrices) => {
      tokenPricesRef.current = prices;
      setTokenPrices(prices);
      const snapshot = loadWalletSnapshot();
      setWallets(snapshotToWallets(snapshot as WalletSnapshot, prices));
    };

    const loadPrices = () => {
      setBenchmarkLoading(true);
      fetchPricesWithBenchmark()
        .then((data) => {
          if (data.benchmark) {
            setBenchmarkPrices({
              btc_eur: data.benchmark.btc_eur ?? 0,
              btc_24h: data.benchmark.btc_24h ?? 0,
              btc_7d: data.benchmark.btc_7d ?? 0,
              btc_30d: data.benchmark.btc_30d ?? 0,
              eth_eur: data.benchmark.eth_eur ?? 0,
              eth_24h: data.benchmark.eth_24h ?? 0,
              eth_7d: data.benchmark.eth_7d ?? 0,
              eth_30d: data.benchmark.eth_30d ?? 0,
              gold_eur: data.benchmark.gold_eur ?? 0,
              gold_24h: data.benchmark.gold_24h ?? 0,
              gold_7d: data.benchmark.gold_7d ?? 0,
              gold_30d: data.benchmark.gold_30d ?? 0,
            });
          }
          if (data.prices && Object.keys(data.prices).length > 0) {
            applyPrices(data.prices);
            if (data.prices.usdToEur && data.prices.usdToEur > 0) {
              setUsdToEur(data.prices.usdToEur);
            }
          }
        })
        .catch(() => {})
        .finally(() => setBenchmarkLoading(false));
    };

    loadPrices();
    // Fetch historical prices once on mount (cached for 1h server-side)
    fetchHistoricalPrices().then(setHistoricalPrices).catch(() => {});
    // Refresh current prices every 60s to keep portfolio value live
    const interval = setInterval(loadPrices, 60_000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync wallet config: load from cloud if localStorage empty, then refresh on-chain balances
  useEffect(() => {
    const run = async () => {
      // Sincroniza SEMPRE com a nuvem: funde o registo de contas (união, nunca
      // remove) e preenche dados em falta sem sobrescrever os locais. Assim as
      // contas aparecem em todos os dispositivos mesmo quando já há dados locais.
      const restored = await pullWalletCloud();
      if (restored) {
        setTraditionalHoldings(loadTraditionalHoldings());
        setCryptoHoldings(loadCryptoHoldings());
        setStablecoinEntries(loadStablecoinEntries());
      }
      const snapshot = loadWalletSnapshot();
      if (snapshot.eth?.length || snapshot.sol?.length || snapshot.btc?.length || snapshot.ada?.length) {
        setWallets(snapshotToWallets(snapshot, tokenPricesRef.current));
      }
      // Após o merge, envia o estado local para a nuvem — garante que a app
      // mobile (e outros dispositivos) veem os dados mesmo sem edições novas.
      pushWalletCloud();

      if (!snapshot.eth?.length && !snapshot.sol?.length && !snapshot.btc?.length && !snapshot.ada?.length) return;

      const patch: WalletSnapshot = {};
      const refreshEntries = async (
        entries: StoredWalletEntry[] | undefined,
        fetcher: (addr: string, entry: StoredWalletEntry) => Promise<string>
      ): Promise<StoredWalletEntry[] | undefined> => {
        if (!entries?.length) return undefined;
        return Promise.all(
          entries.map(async (e) => {
            if (!e.address) return e;
            try { return { ...e, balance: await fetcher(e.address, e) }; }
            catch { return e; }
          })
        );
      };

      const [eth, sol, btc, ada] = await Promise.allSettled([
        refreshEntries(snapshot.eth, (a, e) => getEvmBalance(a as `0x${string}`, (e.network ?? "Ethereum") as Parameters<typeof getEvmBalance>[1])),
        refreshEntries(snapshot.sol, (a) => getSolBalance(a)),
        refreshEntries(snapshot.btc, (a) => getBtcBalanceFromAddress(a).then(String)),
        refreshEntries(snapshot.ada, (a) => getAdaBalanceByAddress(a).then(String)),
      ]);

      if (eth.status === "fulfilled" && eth.value) patch.eth = eth.value;
      if (sol.status === "fulfilled" && sol.value) patch.sol = sol.value;
      if (btc.status === "fulfilled" && btc.value) patch.btc = btc.value;
      if (ada.status === "fulfilled" && ada.value) patch.ada = ada.value;

      if (Object.keys(patch).length > 0) {
        updateWalletSnapshot(patch);
        const fresh = loadWalletSnapshot();
        setWallets(snapshotToWallets(fresh as WalletSnapshot, tokenPricesRef.current));
        // Sync updated balances back to cloud (todas as contas)
        pushWalletCloud();
      }
    };
    run();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setTraditionalHoldings(loadTraditionalHoldings());
  }, []);

  useEffect(() => {
    setCryptoHoldings(loadCryptoHoldings());
  }, []);

  useEffect(() => {
    setStablecoinEntries(loadStablecoinEntries());
  }, []);

  useEffect(() => {
    const loadAuth = async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) {
        setIsLoadingAuth(false);
        return;
      }

      setUserId(user.id);
      setUserEmail(user.email ?? null);

      const { data: subscription } = await supabase
        .from("subscriptions")
        .select("status, current_period_end, price_id")
        .eq("user_id", user.id)
        .order("current_period_end", { ascending: false })
        .limit(1)
        .maybeSingle();

      const isActive =
        subscription?.status === "active" || subscription?.status === "trialing";
      const periodEnd = subscription?.current_period_end
        ? new Date(subscription.current_period_end).getTime()
        : null;

      const pro = isActive && (!periodEnd || periodEnd > Date.now());
      const premiumPriceId = process.env.NEXT_PUBLIC_STRIPE_PREMIUM_PRICE_ID;
      const premium = pro && !!premiumPriceId && subscription?.price_id === premiumPriceId;
      setIsPro(pro);
      setIsPremium(premium);

      setIsSnapshotsLoading(true);

      // Free: 30 dias | Pro: 1 ano | Premium: ilimitado
      const historyFrom = premium
        ? new Date(0).toISOString()
        : new Date(Date.now() - (pro ? 365 : 30) * 24 * 60 * 60 * 1000).toISOString();
      const { data: snapshotRows } = await supabase
        .from("portfolio_snapshots")
        .select("id, created_at, data")
        .eq("user_id", user.id)
        .gte("created_at", historyFrom)
        .order("created_at", { ascending: false })
        .limit(premium ? 3650 : pro ? 365 : 30);

      const rows = (snapshotRows ?? []) as SnapshotRow[];
      setSnapshots(rows);

      const latest = rows[0];
      if (latest?.data) {
        const localSnapshot = loadWalletSnapshot();
        const latestTotal = snapshotTotal(latest.data);
        const localTotal = snapshotTotal(localSnapshot);
        if (latestTotal > 0 || localTotal === 0) {
          // Use ref to always get latest prices, avoiding race condition
          setWallets(snapshotToWallets(latest.data, tokenPricesRef.current));
        }
      }

      setIsSnapshotsLoading(false);
      setIsLoadingAuth(false);
    };

    loadAuth();
  }, [supabase]);

  const handleCheckout = async () => {
    if (!userId || !userEmail) return;
    setBillingError(null);
    setIsBillingLoading(true);

    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, email: userEmail }),
      });

      const data = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !data.url) {
        throw new Error(data.error ?? t("pf_pay_fail"));
      }

      const stripe = await stripePromise;
      if (stripe) {
        window.location.href = data.url;
      }
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : t("pf_pay_error"));
    } finally {
      setIsBillingLoading(false);
    }
  };

  const handleSaveSnapshot = async (silent = false) => {
    if (!userId) return;
    if (!silent) setSaveMessage(null);

    const snapshot = loadWalletSnapshot();
    // Guardamos o total EUR e o benchmark do momento dentro de data, para que o
    // PNL histórico use preços reais e para poder calcular o Beta vs mercado.
    const bench = await fetchBenchmarkSnapshot();
    const dataWithTotal = {
      ...snapshot,
      _totalEur: portfolioTotal,
      ...(bench ? { _bench: bench } : {}),
    };
    const { error } = await supabase
      .from("portfolio_snapshots")
      .insert({ user_id: userId, data: dataWithTotal });

    if (error) {
      if (!silent) setSaveMessage(t("pf_save_fail"));
      return;
    }

    if (!silent) setSaveMessage(t("pf_save_ok"));

    const historyFrom2 = isPremium
      ? new Date(0).toISOString()
      : new Date(Date.now() - (isPro ? 365 : 30) * 24 * 60 * 60 * 1000).toISOString();
    const { data: snapshotRows } = await supabase
      .from("portfolio_snapshots")
      .select("id, created_at, data")
      .eq("user_id", userId)
      .gte("created_at", historyFrom2)
      .order("created_at", { ascending: false })
      .limit(isPremium ? 3650 : isPro ? 365 : 30);

    setSnapshots((snapshotRows ?? []) as SnapshotRow[]);
  };

  // Auto-snapshot: guardar automaticamente se passaram mais de 24h desde o último
  useEffect(() => {
    if (!userId || isLoadingAuth) return;
    const latest = snapshots[0];
    const lastSaved = latest ? new Date(latest.created_at).getTime() : 0;
    const hoursSince = (Date.now() - lastSaved) / (1000 * 60 * 60);
    if (hoursSince >= 24) {
      handleSaveSnapshot(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, isLoadingAuth]);

  useEffect(() => {
    try { setPortfolioNote(localStorage.getItem("portfolio-note") ?? ""); } catch {}
  }, []);

  const handleRestoreSnapshot = (row: SnapshotRow) => {
    setWallets(snapshotToWallets(row.data, tokenPricesRef.current));
    setSaveMessage(`Snapshot de ${new Date(row.created_at).toLocaleString("pt-BR")} carregado.`);
  };

  const snapshotCexEur = snapshotCexUsd * usdToEur;
  const snapshotDefiEur = snapshotDefiUsd * usdToEur;

  const manualCryptoTotal = useMemo(() => {
    // O snapshot guarda o valor de mercado dos manuais (quantidade × preço), calculado
    // na página de Carteiras onde há preços por símbolo. Preferimo-lo aqui para o total
    // refletir o mercado; caímos no valor investido quando o snapshot ainda não existe.
    if (snapshotManualEur != null && snapshotManualEur > 0) return snapshotManualEur;
    return Object.values(cryptoHoldings).reduce((sum, holding) => {
      const value = Number(holding.buyValue ?? 0);
      return Number.isFinite(value) ? sum + value : sum;
    }, 0);
  }, [snapshotManualEur, cryptoHoldings]);

  const cryptoTotal = useMemo(() => sumCrypto(wallets, tokenPrices) + manualCryptoTotal + snapshotCexEur + snapshotDefiEur, [wallets, tokenPrices, manualCryptoTotal, snapshotCexEur, snapshotDefiEur]);
  const stablecoinTotal = useMemo(() => {
    return stablecoinEntries.reduce((sum, e) => sum + (parseFloat(e.balance ?? "0") || 0), 0);
  }, [stablecoinEntries]);
  // Stablecoins registadas como "cripto manual" (ex.: USDT no seletor de ativos)
  // também contam como reserva estável no Score — sem afetar o total (já estão
  // incluídas em cryptoTotal, aqui só são reclassificadas para a % de reserva).
  const manualStableEur = useMemo(() => {
    return Object.entries(cryptoHoldings).reduce((sum, [symbol, holding]) => {
      if (!STABLE_SYMBOLS.has(symbol.toUpperCase())) return sum;
      const value = Number(holding.buyValue ?? 0);
      return Number.isFinite(value) ? sum + value : sum;
    }, 0);
  }, [cryptoHoldings]);
  const traditionalTotal = useMemo(() => {
    return Object.values(traditionalHoldings).reduce((sum, holding) => {
      const value = Number(holding.buyValue ?? 0);
      return Number.isFinite(value) ? sum + value : sum;
    }, 0);
  }, [traditionalHoldings]);
  const portfolioTotal = cryptoTotal + stablecoinTotal + traditionalTotal;
  const manualTotals = manualCryptoTotal + traditionalTotal + stablecoinTotal;

  const snapshotTotals = useMemo(() => {
    return snapshots
      .map((row) => {
        // Use stored EUR total if available (saved after this fix was deployed)
        // Falls back to recalculating with current prices for older snapshots
        const storedTotal = (row.data as WalletSnapshot & { _totalEur?: number })._totalEur;
        const total = storedTotal != null
          ? storedTotal + manualTotals
          : snapshotTotal(row.data, tokenPrices) + manualTotals;
        return {
          id: row.id,
          createdAt: new Date(row.created_at).getTime(),
          total,
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [snapshots, manualTotals, tokenPrices]);

  // PNL usando preços históricos — funciona desde o 1º dia, sem depender de snapshots
  const pnlSummary = useMemo(() => {
    const currentTotal = portfolioTotal;
    const snapshot = loadWalletSnapshot();

    // Calcula o valor do portfolio de carteiras com preços históricos
    const portfolioAtPrice = (prices: Record<string, number>) =>
      sumEntries(snapshot.eth) * (prices.ETH ?? 0) +
      sumEntries(snapshot.sol) * (prices.SOL ?? 0) +
      sumEntries(snapshot.btc) * (prices.BTC ?? 0) +
      sumEntries(snapshot.ada) * (prices.ADA ?? 0) +
      manualTotals;

    const total1d  = portfolioAtPrice(historicalPrices["1d"]);
    const total7d  = portfolioAtPrice(historicalPrices["7d"]);
    const total30d = portfolioAtPrice(historicalPrices["30d"]);

    const today   = total1d  > 0 ? currentTotal - total1d  : 0;
    const days7   = total7d  > 0 ? currentTotal - total7d  : 0;
    const days30  = total30d > 0 ? currentTotal - total30d : 0;
    const daily7d = days7 !== 0 ? days7 / 7 : 0;

    // position: usa snapshot mais antigo do Supabase se existir, senão usa 30d
    const oldest = snapshotTotals[snapshotTotals.length - 1];
    const position = oldest
      ? currentTotal - oldest.total
      : days30;

    return { position, today, days30, daily7d };
  }, [portfolioTotal, historicalPrices, manualTotals, snapshotTotals]);

  const pnlTotal = pnlSummary.position;

  // ── Métricas avançadas calculadas a partir dos snapshots ──
  const advancedMetrics = useMemo(() => {
    const chrono = [...snapshotTotals].reverse(); // cronológico
    if (chrono.length < 2) return null;

    // Limpeza: descartar snapshots claramente incompletos (total ~0 face à
    // mediana). São capturas parciais — o portfólio não valeu mesmo 0 — e
    // faziam a queda máxima disparar para -100%.
    const positives = chrono.map((s) => s.total).filter((v) => v > 0).sort((a, b) => a - b);
    const median = positives.length ? positives[Math.floor(positives.length / 2)] : 0;
    const sorted = chrono.filter((s) => s.total > median * 0.05);
    if (sorted.length < 2) return null;

    const oldest = sorted[0];
    const current = portfolioTotal;
    const base = oldest.total;
    if (base <= 0) return null;

    const days = (Date.now() - oldest.createdAt) / (1000 * 60 * 60 * 24);

    // ROI
    const roi = ((current - base) / base) * 100;

    // CAGR (só faz sentido com >= 30 dias)
    const cagr = days >= 30 ? (Math.pow(current / base, 365 / days) - 1) * 100 : null;

    // Retornos entre snapshots consecutivos
    const rawReturns: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1].total;
      const cur = sorted[i].total;
      if (prev > 0) rawReturns.push((cur - prev) / prev);
    }
    // Para as métricas de risco, ignorar saltos > ±50% entre snapshots: quase
    // sempre são depósitos/levantamentos (entrada ou saída de capital), não
    // movimento de mercado — e inflacionavam a volatilidade de forma irreal.
    const dailyReturns = rawReturns.filter((r) => Math.abs(r) < 0.5);

    // Anualização a partir do espaçamento real dos snapshots (não assumir 1/dia).
    const stepsPerYear = rawReturns.length > 0 && days > 0
      ? Math.min(365, Math.max(12, 365 / (days / rawReturns.length)))
      : 252;
    const ann = Math.sqrt(stepsPerYear);

    // Sharpe Ratio (benchmark risk-free ≈ 0)
    let sharpe: number | null = null;
    if (dailyReturns.length >= 5) {
      const mean = dailyReturns.reduce((s, r) => s + r, 0) / dailyReturns.length;
      const variance =
        dailyReturns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / dailyReturns.length;
      const stdDev = Math.sqrt(variance);
      if (stdDev > 0) sharpe = (mean / stdDev) * ann;
    }

    // Max Drawdown
    let peak = sorted[0].total;
    let maxDrawdown = 0;
    for (const s of sorted) {
      if (s.total > peak) peak = s.total;
      const dd = (s.total - peak) / peak;
      if (dd < maxDrawdown) maxDrawdown = dd;
    }
    // vs current
    const curDd = (current - peak) / peak;
    if (curDd < maxDrawdown) maxDrawdown = curDd;

    // Volatilidade anualizada
    let volatility: number | null = null;
    if (dailyReturns.length >= 5) {
      const mean = dailyReturns.reduce((s, r) => s + r, 0) / dailyReturns.length;
      const variance =
        dailyReturns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / dailyReturns.length;
      volatility = Math.sqrt(variance) * ann * 100;
    }

    const maxDdPct = maxDrawdown * 100;

    // Sortino (como o Sharpe mas só penaliza a queda)
    let sortino: number | null = null;
    if (dailyReturns.length >= 5) {
      const mean = dailyReturns.reduce((s, r) => s + r, 0) / dailyReturns.length;
      const downsideVar =
        dailyReturns.reduce((s, r) => s + (r < 0 ? r * r : 0), 0) / dailyReturns.length;
      const dd = Math.sqrt(downsideVar);
      if (dd > 0) sortino = (mean / dd) * ann;
    }

    // Calmar = CAGR / |Max Drawdown|
    const calmar = cagr !== null && maxDdPct < 0 ? cagr / Math.abs(maxDdPct) : null;

    // Win rate + melhor/pior período
    let winRate: number | null = null;
    let bestReturn: number | null = null;
    let worstReturn: number | null = null;
    if (dailyReturns.length >= 1) {
      winRate = (dailyReturns.filter((r) => r > 0).length / dailyReturns.length) * 100;
      bestReturn = Math.max(...dailyReturns) * 100;
      worstReturn = Math.min(...dailyReturns) * 100;
    }

    // Drawdown atual + dias desde o pico
    let peakVal = sorted[0].total;
    let peakAt = sorted[0].createdAt;
    for (const s of sorted) {
      if (s.total > peakVal) { peakVal = s.total; peakAt = s.createdAt; }
    }
    if (current > peakVal) { peakVal = current; peakAt = Date.now(); }
    const currentDrawdown = peakVal > 0 ? ((current - peakVal) / peakVal) * 100 : 0;
    const daysSincePeak = Math.max(0, Math.round((Date.now() - peakAt) / (1000 * 60 * 60 * 24)));

    // VaR 95% histórico — perda diária no 5º percentil (negativo)
    let var95: number | null = null;
    if (dailyReturns.length >= 10) {
      const s = [...dailyReturns].sort((a, b) => a - b);
      var95 = s[Math.floor(0.05 * s.length)] * 100;
    }

    return {
      roi, cagr, sharpe, sortino, calmar,
      maxDrawdown: maxDdPct, volatility,
      winRate, bestReturn, worstReturn, currentDrawdown, daysSincePeak, var95,
      days: Math.round(days),
    };
  }, [snapshotTotals, portfolioTotal]);

  // ── Beta vs mercado (BTC e S&P 500) ──
  // Usa apenas snapshots gravados ao vivo (com _totalEur e _bench reais). Vai
  // acumulando desde o dia em que a captura de benchmark entrou; até ter
  // capturas suficientes mostra "a acumular". Beta ≈ 1 → move com o mercado;
  // <1 → menos volátil; >1 → amplifica; <0 → move ao contrário.
  const beta = useMemo(() => {
    const NEEDED = 8; // capturas mínimas com benchmark
    type Row = { t: number; total: number; bench: BenchSnapshot };
    const series: Row[] = snapshots
      .map((r) => {
        const d = r.data as WalletSnapshot & { _totalEur?: number; _bench?: BenchSnapshot };
        return { t: new Date(r.created_at).getTime(), total: Number(d._totalEur ?? 0), bench: d._bench ?? {} };
      })
      .filter((x) => x.total > 0 && (x.bench.btc || x.bench.sp500))
      .sort((a, b) => a.t - b.t);

    const computeBeta = (key: keyof BenchSnapshot): number | null => {
      const pr: number[] = [];
      const br: number[] = [];
      for (let i = 1; i < series.length; i++) {
        const p0 = series[i - 1].total, p1 = series[i].total;
        const b0 = series[i - 1].bench[key], b1 = series[i].bench[key];
        if (p0 > 0 && b0 && b1 && b0 > 0) {
          const pRet = (p1 - p0) / p0;
          const bRet = (b1 - b0) / b0;
          // ignorar saltos de capital (>±50%), como nas outras métricas de risco
          if (Math.abs(pRet) < 0.5) { pr.push(pRet); br.push(bRet); }
        }
      }
      if (pr.length < NEEDED - 2) return null;
      const pMean = pr.reduce((s, r) => s + r, 0) / pr.length;
      const bMean = br.reduce((s, r) => s + r, 0) / br.length;
      let cov = 0, varB = 0;
      for (let i = 0; i < pr.length; i++) {
        cov += (pr[i] - pMean) * (br[i] - bMean);
        varB += (br[i] - bMean) ** 2;
      }
      return varB > 0 ? cov / varB : null;
    };

    const ready = series.length >= NEEDED;
    return {
      count: series.length,
      needed: NEEDED,
      ready,
      btc: ready ? computeBeta("btc") : null,
      sp500: ready ? computeBeta("sp500") : null,
    };
  }, [snapshots]);

  // ── Estado do benchmark ──
  const [benchmarkPrices, setBenchmarkPrices] = useState<Record<string, number>>({});
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);

  const cryptoAllocations = useMemo(() => {
    const manualItems = Object.entries(cryptoHoldings).map(([symbol, holding]) => ({
      label: `${symbol} Manual`,
      symbol: t("pf_manual"),
      value: Number(holding.buyValue ?? 0),
    }));
    const items = [
      ...wallets.map((wallet) => ({
        label: wallet.label,
        symbol: wallet.symbol,
        value: toNumber(wallet.balance),
      })),
      ...manualItems.filter((item) => Number.isFinite(item.value) && item.value > 0),
      { label: t("pf_stablecoins"), symbol: t("pf_usdt_usdc"), value: stablecoinTotal },
      ...(snapshotCexEur > 0 ? [{ label: t("pf_cex"), symbol: "CEX", value: snapshotCexEur }] : []),
      ...(snapshotDefiEur > 0 ? [{ label: "DeFi", symbol: "DeFi", value: snapshotDefiEur }] : []),
    ];
    const total = items.reduce((sum, item) => sum + item.value, 0);
    return items.map((item) => ({
      ...item,
      percent: getPercent(item.value, total),
    }));
  }, [wallets, stablecoinTotal, cryptoHoldings, snapshotCexUsd, snapshotDefiUsd]);

  const traditionalAllocations = useMemo(() => {
    const byCategory: Record<string, number> = {};
    const byAsset: Array<{ label: string; value: number; category: string }> = [];

    traditionalAssets.forEach((asset) => {
      const holding = traditionalHoldings[asset.id];
      if (!holding) return;
      const value = Number(holding.buyValue ?? 0);
      if (!Number.isFinite(value) || value <= 0) return;
      byCategory[asset.category] = (byCategory[asset.category] ?? 0) + value;
      byAsset.push({ label: asset.label, value, category: asset.category });
    });

    const items = Object.entries(byCategory).map(([category, value]) => ({
      label: category,
      value,
    }));
    const total = items.reduce((sum, item) => sum + item.value, 0);
    return {
      categories: items.map((item) => ({
        ...item,
        percent: getPercent(item.value, total),
      })),
      assets: byAsset,
    };
  }, [traditionalHoldings]);

  // Concentração / diversificação (a partir das posições atuais)
  const concentration = useMemo(() => {
    const values = [
      ...cryptoAllocations.filter((a) => a.value > 0).map((a) => a.value),
      ...traditionalAllocations.assets.filter((a) => a.value > 0).map((a) => a.value),
    ];
    const total = values.reduce((s, v) => s + v, 0);
    if (total <= 0 || values.length === 0 || portfolioTotal <= 0) return null;
    const shares = values.map((v) => v / total);
    return {
      numAssets: values.length,
      topHolding: Math.max(...shares) * 100,
      hhi: Math.round(shares.reduce((s, w) => s + w * w, 0) * 10000), // 0–10000
      cryptoPct: (cryptoTotal / portfolioTotal) * 100,
      stablecoinPct: (stablecoinTotal / portfolioTotal) * 100,
      traditionalPct: (traditionalTotal / portfolioTotal) * 100,
    };
  }, [cryptoAllocations, traditionalAllocations, cryptoTotal, stablecoinTotal, traditionalTotal, portfolioTotal]);

  // ── Score do portfólio (0–100) — depois de cryptoAllocations ──
  const portfolioScore = useMemo(() => {
    if (portfolioTotal <= 0) return null;
    let score = 0;
    const reasons: { label: string; points: number; max: number; ok: boolean }[] = [];

    const allocValues = cryptoAllocations.filter(a => a.value > 0).map(a => a.value);
    const maxAlloc = allocValues.length > 0 ? Math.max(...allocValues) : portfolioTotal;
    const maxPct = portfolioTotal > 0 ? (maxAlloc / portfolioTotal) * 100 : 100;
    const diversPts = maxPct > 80 ? 5 : maxPct > 60 ? 15 : maxPct > 40 ? 22 : 30;
    score += diversPts;
    reasons.push({ label: t("pf_diversification"), points: diversPts, max: 30, ok: diversPts >= 22 });

    const tradPct = portfolioTotal > 0 ? (traditionalTotal / portfolioTotal) * 100 : 0;
    const tradPts = tradPct > 20 ? 20 : tradPct > 10 ? 15 : tradPct > 5 ? 10 : tradPct > 0 ? 5 : 0;
    score += tradPts;
    reasons.push({ label: t("pf_mix"), points: tradPts, max: 20, ok: tradPts >= 10 });

    const stableValue = stablecoinTotal + manualStableEur;
    const stablePct = portfolioTotal > 0 ? (stableValue / portfolioTotal) * 100 : 0;
    const stablePts = stablePct >= 5 && stablePct <= 30 ? 10 : stablePct > 0 ? 5 : 0;
    score += stablePts;
    reasons.push({ label: t("pf_stable_reserve"), points: stablePts, max: 10, ok: stablePts >= 5 });

    const roiPts = advancedMetrics ? (advancedMetrics.roi > 20 ? 20 : advancedMetrics.roi > 10 ? 15 : advancedMetrics.roi > 0 ? 10 : 0) : 0;
    score += roiPts;
    reasons.push({ label: t("pf_perf_roi"), points: roiPts, max: 20, ok: roiPts >= 10 });

    const riskPts = advancedMetrics
      ? (advancedMetrics.maxDrawdown > -50 ? 10 : 5) + (advancedMetrics.volatility !== null && advancedMetrics.volatility < 80 ? 10 : advancedMetrics.volatility !== null && advancedMetrics.volatility < 150 ? 5 : 0)
      : 0;
    score += riskPts;
    reasons.push({ label: t("pf_risk_mgmt"), points: riskPts, max: 20, ok: riskPts >= 12 });

    const label = score >= 80 ? t("pf_excellent") : score >= 60 ? "Bom" : score >= 40 ? t("pf_fair") : t("pf_improving");
    const color = score >= 80 ? "text-emerald-400" : score >= 60 ? "text-orange-300" : score >= 40 ? "text-yellow-400" : "text-rose-400";
    return { score, label, color, reasons };
  }, [portfolioTotal, cryptoAllocations, traditionalTotal, stablecoinTotal, manualStableEur, advancedMetrics]);

  const portfolioSplit = useMemo(() => {
    const total = cryptoTotal + traditionalTotal;
    return {
      crypto: getPercent(cryptoTotal, total),
      traditional: getPercent(traditionalTotal, total),
    };
  }, [cryptoTotal, traditionalTotal]);

  return (
    <AppShell>
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 pb-20 pt-2">
        {/* ── Título ── */}
        <div className="animate-fade-in-up flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-white">{t("port_title")}</h1>
          <p className="text-sm text-slate-400">{t("port_subtitle")}</p>
        </div>

        {/* ── Portfolio Chart + Tabs ── */}
        <PortfolioChartSection
          portfolioTotal={portfolioTotal}
          pnlToday={pnlSummary.today}
          snapshotTotals={snapshotTotals}
          historicalPrices={historicalPrices}
          wallets={wallets}
          tokenPrices={tokenPrices}
          cryptoTotal={cryptoTotal}
          traditionalTotal={traditionalTotal}
        />

        <section className="grid gap-6 md:grid-cols-[1.2fr_0.8fr]">
          <div className="animate-fade-in-up rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-orange-300/80">
              Visão geral
            </p>
            <h2 className="mt-2 text-xl font-bold text-white">{t("port_overview")}</h2>
            <div className="mt-4 flex flex-wrap items-end gap-6">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                  Valor total
                </p>
                <p className="metric-value mt-2 text-4xl font-black text-white">
                  {fmt(portfolioTotal)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">{t("pf_pnl_pos")}</p>
                <p
                  className={`metric-value mt-2 text-xl font-bold ${
                    pnlTotal >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {fmtSigned(pnlTotal)}
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              <div className="flex items-center justify-between text-sm text-slate-300">
                <span>{t("port_pnl_position")}</span>
                <span
                  className={pnlSummary.position >= 0 ? "text-emerald-300" : "text-rose-300"}
                >
                  {fmtSigned(pnlSummary.position)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm text-slate-300">
                <span>{t("port_pnl_today")}</span>
                <span className={pnlSummary.today >= 0 ? "text-emerald-300" : "text-rose-300"}>
                  {fmtSigned(pnlSummary.today)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm text-slate-300">
                <span>{t("port_pnl_30d")}</span>
                <span
                  className={pnlSummary.days30 >= 0 ? "text-emerald-300" : "text-rose-300"}
                >
                  {fmtSigned(pnlSummary.days30)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm text-slate-300">
                <span>{t("port_pnl_7d")}</span>
                <span className={pnlSummary.daily7d >= 0 ? "text-emerald-300" : "text-rose-300"}>
                  {fmtSigned(pnlSummary.daily7d)}
                </span>
              </div>
              {snapshotTotals.length === 0 ? (
                <div className="mt-3 rounded-xl border border-orange-500/20 bg-orange-500/5 px-4 py-3">
                  <p className="text-xs font-semibold text-orange-300">📸 Como ativar o PNL histórico</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Guarda o teu primeiro snapshot para que o sistema comece a calcular lucro/perda ao longo do tempo. Clica em <strong className="text-white">{t("pf_save_snapshot")}</strong> abaixo.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  {snapshotTotals.length} snapshot{snapshotTotals.length > 1 ? "s" : ""} guardado{snapshotTotals.length > 1 ? "s" : ""}. PNL calculado desde o primeiro.
                </p>
              )}
            </div>

            <div className="mt-6 space-y-4">
              <div>
                <div className="flex items-center justify-between text-sm text-slate-300">
                  <span>{t("port_blockchain")}</span>
                  <span>{portfolioSplit.crypto}%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-orange-400"
                    style={{ width: `${portfolioSplit.crypto}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between text-sm text-slate-300">
                  <span>{t("port_traditional")}</span>
                  <span>{portfolioSplit.traditional}%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-sky-500"
                    style={{ width: `${portfolioSplit.traditional}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                Distribuição total
              </p>
              <p className="mt-2 text-sm text-slate-400">
                Percentual do total entre Blockchain e Tradicional.
              </p>
              <div className="mt-6 space-y-3">
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <p className="text-sm font-semibold text-white">{t("port_blockchain")}</p>
                  <p className="text-xs text-slate-500">
                    {fmt(cryptoTotal)} · {portfolioSplit.crypto}%
                  </p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <p className="text-sm font-semibold text-white">{t("port_traditional")}</p>
                  <p className="text-xs text-slate-500">
                    {fmt(traditionalTotal)} · {portfolioSplit.traditional}%
                  </p>
                </div>
              </div>
            </div>

            <PnlSummaryCard
              position={pnlSummary.position}
              today={pnlSummary.today}
              days30={pnlSummary.days30}
              daily7d={pnlSummary.daily7d}
              className="mt-2"
              metrics={[
                {
                  label: t("pf_connected_assets"),
                  value: String(wallets.filter(w => Number(w.balance) > 0).length + Object.keys(cryptoHoldings).length + Object.keys(traditionalHoldings).length),
                },
                {
                  label: t("pf_snapshots_saved"),
                  value: String(snapshots.length),
                },
                {
                  label: t("pf_last_update"),
                  value: snapshots[0]
                    ? new Date(snapshots[0].created_at).toLocaleDateString("pt-PT", { day: "2-digit", month: "short" })
                    : "—",
                },
              ]}
            />
          </div>
        </section>

        {/* ── GRÁFICOS ── */}
        <section className="grid gap-6 md:grid-cols-2">
          {/* Gráfico PNL por período — top-left */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <div className="mb-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{t("pf_performance")}</p>
              <h2 className="text-base font-bold text-white mt-0.5">{t("pf_pnl_period")}</h2>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={[
                { periodo: t("pf_position"), pnl: parseFloat(pnlSummary.position.toFixed(2)) },
                { periodo: t("pf_today"), pnl: parseFloat(pnlSummary.today.toFixed(2)) },
                { periodo: "30 dias", pnl: parseFloat((pnlSummary.days30 ?? 0).toFixed(2)) },
                { periodo: "7d (média)", pnl: parseFloat(pnlSummary.daily7d.toFixed(2)) },
              ]} barSize={48}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="periodo" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#64748b", fontSize: 11 }} tickFormatter={v => hideBalances ? "" : `${curSym}${Math.round(fx(v))}`} width={55} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8 }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(v: any) => { const n = typeof v === "number" ? v : 0; return [fmt(Math.abs(n)), n >= 0 ? t("pf_profit") : t("pf_loss")]; }}
                />
                <Bar dataKey="pnl" radius={[6, 6, 0, 0]}>
                  {[pnlSummary.position, pnlSummary.today, pnlSummary.days30 ?? 0, pnlSummary.daily7d].map((v, i) => (
                    <Cell key={i} fill={v >= 0 ? "#10b981" : "#ef4444"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Gráfico distribuição por ativo */}
          {(() => {
            const ASSET_COLOR: Record<string, string> = {
              BTC: "#f7931a", ETH: "#627eea", SOL: "#9945ff", ADA: "#0033ad",
              BNB: "#f0b90b", MATIC: "#8247e5", AVAX: "#e84142", DOT: "#e6007a",
              LINK: "#2a5ada", UNI: "#ff007a", AAVE: "#b6509e",
              XRP: "#346aa9", LTC: "#345d9d", DOGE: "#c2a633",
              Stable: "#64748b", "Trad.": "#475569", CEX: "#10b981", DeFi: "#8b5cf6",
            };
            const assetColor = (name: string) => ASSET_COLOR[name] ?? `hsl(${(name.charCodeAt(0) * 47) % 360},65%,55%)`;
            // Group by symbol — values in EUR
            const rawEntries = [
              ...wallets.filter(w => Number(w.balance) > 0).map(w => ({
                name: w.symbol,
                value: Number(w.balance) * (tokenPrices[w.symbol] ?? 0),
              })),
              ...Object.entries(cryptoHoldings).filter(([,h]) => Number(h.buyValue) > 0).map(([k,h]) => ({ name: k, value: Number(h.buyValue) })),
              ...(stablecoinTotal > 0 ? [{ name: t("pf_stable"), value: stablecoinTotal }] : []),
              ...(traditionalTotal > 0 ? [{ name: t("pf_trad"), value: traditionalTotal }] : []),
              ...(snapshotCexEur > 0 ? [{ name: "CEX", value: snapshotCexEur }] : []),
              ...(snapshotDefiEur > 0 ? [{ name: "DeFi", value: snapshotDefiEur }] : []),
            ].filter(d => d.value > 0);
            const grouped: Record<string, number> = {};
            rawEntries.forEach(e => { grouped[e.name] = (grouped[e.name] ?? 0) + e.value; });
            const pieData = Object.entries(grouped)
              .map(([name, value]) => ({ name, value }))
              .sort((a, b) => b.value - a.value);
            const total = pieData.reduce((s, d) => s + d.value, 0);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const renderLabel = ({ cx, cy, midAngle, outerRadius, percent }: any) => {
              if ((percent as number) < 0.03) return null;
              const RADIAN = Math.PI / 180;
              const r = outerRadius + 22;
              const x = cx + r * Math.cos(-midAngle * RADIAN);
              const y = cy + r * Math.sin(-midAngle * RADIAN);
              return (
                <text x={x} y={y} fill="#94a3b8" textAnchor="middle" dominantBaseline="central"
                  style={{ fontSize: 10, fontWeight: 600 }}>
                  {((percent as number) * 100).toLocaleString("pt-PT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
                </text>
              );
            };
            return (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
                <div className="mb-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{t("pf_distribution")}</p>
                  <h2 className="text-base font-bold text-white mt-0.5">{t("pf_alloc_asset")}</h2>
                </div>
                {pieData.length === 0 ? (
                  <div className="flex h-[200px] items-center justify-center">
                    <p className="text-sm text-slate-500">{t("pf_no_assets")}</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={85}
                          paddingAngle={2}
                          dataKey="value"
                          label={renderLabel}
                          labelLine={false}
                        >
                          {pieData.map((entry, i) => <Cell key={i} fill={assetColor(entry.name)} />)}
                        </Pie>
                        <Tooltip
                          contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8 }}
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          formatter={(v: any) => {
                            const val = typeof v === "number" ? v : 0;
                            const pct = total > 0 ? ((val / total) * 100).toLocaleString("pt-PT", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "0,0";
                            return [`${fmt(val)} · ${pct}%`, ""];
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    {/* Legend: name + EUR value */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                      {pieData.map((entry) => (
                        <div key={entry.name} className="flex items-center gap-2 min-w-0">
                          <span className="shrink-0 h-2.5 w-2.5 rounded-full" style={{ background: assetColor(entry.name) }} />
                          <span className="text-xs text-slate-300 font-medium truncate">{entry.name}</span>
                          <span className="ml-auto text-xs text-slate-400 shrink-0">{fmt(entry.value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Gráfico PNL histórico — bottom, full width */}
          {(() => {
            const RANGES = [
              { label: "1H", ms: 3_600_000 },
              { label: "4H", ms: 4 * 3_600_000 },
              { label: "1D", ms: 86_400_000 },
              { label: "7D", ms: 7 * 86_400_000 },
              { label: "30D", ms: 30 * 86_400_000 },
              { label: "90D", ms: 90 * 86_400_000 },
              { label: t("pf_all"), ms: 0 },
            ] as const;
            const now = Date.now();
            const ms = RANGES.find(r => r.label === chartRange)?.ms ?? 0;
            const chartData = [...snapshotTotals]
              .filter(s => ms === 0 || now - new Date(s.createdAt).getTime() <= ms)
              .reverse()
              .map(s => ({
                data: new Date(s.createdAt).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" }),
                valor: parseFloat(s.total.toFixed(2)),
              }));
            return (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 md:col-span-2">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{t("pf_history")}</p>
                    <h2 className="text-base font-bold text-white mt-0.5">{t("pf_evolution")}</h2>
                  </div>
                  <span className={`text-sm font-bold ${pnlSummary.position >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {fmtSigned(pnlSummary.position)}
                  </span>
                </div>
                <div className="flex gap-1 mb-3">
                  {RANGES.map(r => (
                    <button key={r.label} onClick={() => setChartRange(r.label)}
                      className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
                        chartRange === r.label ? "bg-orange-500 text-white" : "bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700"
                      }`}>
                      {r.label}
                    </button>
                  ))}
                </div>
                {chartData.length >= 2 ? (
                  <ResponsiveContainer width="100%" height={130}>
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="colorValor" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f97316" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="data" tick={{ fill: "#64748b", fontSize: 11 }} />
                      <YAxis tick={{ fill: "#64748b", fontSize: 11 }} tickFormatter={v => hideBalances ? "" : `${curSym}${Math.round(fx(v))}`} width={60} />
                      <Tooltip
                        contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8 }}
                        labelStyle={{ color: "#94a3b8" }}
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        formatter={(v: any) => [fmt(typeof v === "number" ? v : 0), t("pf_value")]}
                      />
                      <Area type="monotone" dataKey="valor" stroke="#f97316" strokeWidth={2} fill="url(#colorValor)" dot={chartData.length < 30 ? { fill: "#f97316", r: 3 } : false} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-[130px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-700">
                    <p className="text-2xl">📸</p>
                    <p className="text-sm text-slate-400 text-center">{t("pf_need_2_snap")}</p>
                    <p className="text-xs text-slate-500">{snapshotTotals.length}/2 {t("port_snapshots")}</p>
                  </div>
                )}
              </div>
            );
          })()}

        </section>

        {/* ── SCORE + BENCHMARK ── */}
        <section className="grid gap-6 md:grid-cols-[1fr_1.6fr]">
          {/* Score do portfólio */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{t("pf_evaluation")}</p>
            <h2 className="text-base font-bold text-white mt-0.5 mb-4">{t("pf_score")}</h2>
            {portfolioTotal <= 0 ? (
              <div className="flex h-32 items-center justify-center text-sm text-slate-500">{t("pf_add_for_score")}</div>
            ) : portfolioScore ? (
              <div className="space-y-5 animate-fade-in">
                {/* Score circular com progress ring */}
                <div className="flex items-center gap-5">
                  <div className="relative flex-shrink-0">
                    <svg width="80" height="80" viewBox="0 0 80 80" className="-rotate-90">
                      <circle cx="40" cy="40" r="32" fill="none" stroke="rgb(30,41,59)" strokeWidth="6" />
                      <circle
                        cx="40" cy="40" r="32" fill="none"
                        stroke={portfolioScore.score >= 80 ? "#34d399" : portfolioScore.score >= 60 ? "#fb923c" : portfolioScore.score >= 40 ? "#facc15" : "#f87171"}
                        strokeWidth="6"
                        strokeLinecap="round"
                        strokeDasharray={`${(portfolioScore.score / 100) * 201} 201`}
                        style={{ transition: "stroke-dasharray 1s ease" }}
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className={`metric-value text-xl font-black leading-none ${portfolioScore.color}`}>{portfolioScore.score}</span>
                      <span className="text-[9px] text-slate-500 font-bold">/100</span>
                    </div>
                  </div>
                  <div>
                    <p className={`text-xl font-black ${portfolioScore.color}`}>{portfolioScore.label}</p>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">{t("pf_score_desc")}</p>
                  </div>
                </div>
                {/* Breakdown com barras */}
                <div className="space-y-2.5">
                  {portfolioScore.reasons.map(r => (
                    <div key={r.label}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs ${r.ok ? "text-emerald-400" : "text-rose-400"}`}>{r.ok ? "✓" : "✗"}</span>
                        <span className="text-xs text-slate-300 flex-1">{r.label}</span>
                        <span className="text-[10px] font-semibold text-slate-500 tabular-nums">{r.points}/{r.max}</span>
                      </div>
                      <div className="h-1 w-full rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${r.ok ? "bg-emerald-500/60" : "bg-rose-500/40"}`}
                          style={{ width: `${(r.points / r.max) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {/* Resumo do portfólio */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 flex flex-col gap-5">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{t("pf_summary")}</p>
              <h2 className="text-base font-bold text-white mt-0.5">{t("pf_total_portfolio")}</h2>
            </div>

            {/* Valor total destacado */}
            <div className="rounded-xl bg-slate-950/60 border border-slate-800 px-5 py-4">
              <p className="text-xs text-slate-500 mb-1">{t("pf_total_value")}</p>
              <p className="text-3xl font-black text-white tracking-tight">{fmt(portfolioTotal)}</p>
              <p className={`text-sm mt-1 font-semibold ${pnlSummary.today >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {pnlSummary.today >= 0 ? "▲" : "▼"} {fmt(Math.abs(pnlSummary.today))} hoje
              </p>
            </div>

            {/* Métricas em grid 2x2 */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: t("pf_crypto"), value: fmt(cryptoTotal), sub: `${portfolioSplit.crypto}% do total`, color: "text-orange-300" },
                { label: t("pf_traditional"), value: fmt(traditionalTotal), sub: `${portfolioSplit.traditional}% do total`, color: "text-sky-400" },
                { label: "PNL 30 dias", value: fmtSigned(pnlSummary.days30), sub: portfolioTotal > 0 ? `${((pnlSummary.days30 / portfolioTotal) * 100).toLocaleString("pt-PT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` : "—", color: pnlSummary.days30 >= 0 ? "text-emerald-400" : "text-rose-400" },
                { label: t("pf_pnl_pos"), value: fmtSigned(pnlSummary.position), sub: advancedMetrics ? `ROI ${advancedMetrics.roi >= 0 ? "+" : ""}${advancedMetrics.roi.toFixed(1)}%` : "—", color: pnlSummary.position >= 0 ? "text-emerald-400" : "text-rose-400" },
              ].map(m => (
                <div key={m.label} className="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">{m.label}</p>
                  <p className={`text-base font-bold ${m.color}`}>{m.value}</p>
                  <p className="text-[10px] text-slate-600 mt-0.5">{m.sub}</p>
                </div>
              ))}
            </div>

            {/* Carteiras activas */}
            <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500">{t("pf_connected_assets")}</p>
                <p className="text-base font-bold text-white mt-0.5">
                  {wallets.filter(w => Number(w.balance) > 0).length + Object.keys(cryptoHoldings).length + Object.keys(traditionalHoldings).length}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">{t("pf_snapshots")}</p>
                <p className="text-base font-bold text-white mt-0.5">{snapshots.length}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">{t("pf_last_snapshot")}</p>
                <p className="text-base font-bold text-white mt-0.5">
                  {snapshots[0] ? new Date(snapshots[0].created_at).toLocaleDateString("pt-PT", { day: "2-digit", month: "short" }) : "—"}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── PNL AVANÇADO + PDF ── */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{t("pf_analysis")}</p>
              <h2 className="text-base font-bold text-white mt-0.5">{t("pf_adv_metrics")}</h2>
            </div>
            <div className="flex items-center gap-2">
            <button
              id="btn-export-pdf"
              onClick={async () => {
                const { default: jsPDF } = await import("jspdf");
                const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
                const now = new Date().toLocaleDateString("pt-PT", { day: "2-digit", month: "long", year: "numeric" });
                let y = 20;
                const spacer = (n = 4) => { y += n; };
                const checkPage = () => {
                  if (y > 272) {
                    doc.addPage();
                    doc.setFillColor(15, 23, 42);
                    doc.rect(0, 0, 210, 297, "F");
                    doc.setTextColor(255, 255, 255);
                    y = 20;
                  }
                };
                // Cabeçalho de secção (laranja da marca)
                const head = (text: string) => {
                  checkPage();
                  doc.setTextColor(249, 115, 22);
                  doc.setFontSize(13);
                  doc.setFont("helvetica", "bold");
                  doc.text(text, 15, y);
                  doc.setTextColor(255, 255, 255);
                  y += 8;
                };
                // Linha de corpo em 2 colunas
                const kv2 = (a: string, b?: string) => {
                  checkPage();
                  doc.setFontSize(10);
                  doc.setFont("helvetica", "normal");
                  doc.setTextColor(226, 232, 240);
                  doc.text(a, 15, y);
                  if (b) doc.text(b, 108, y);
                  doc.setTextColor(255, 255, 255);
                  y += 6.5;
                };

                let accName = "";
                try { accName = listAccounts().find((x) => x.id === getActiveAccountId())?.name ?? ""; } catch { /* ignore */ }

                doc.setFillColor(15, 23, 42);
                doc.rect(0, 0, 210, 297, "F");
                doc.setTextColor(255, 255, 255);

                // Logótipo + título
                const logo = await loadLogoDataUrl();
                if (logo) { try { doc.addImage(logo, "PNG", 15, 12, 20, 20); } catch { /* ignore */ } }
                const titleX = logo ? 40 : 15;
                doc.setFontSize(22);
                doc.setFont("helvetica", "bold");
                doc.text("ChainFolioAI", titleX, 24);
                doc.setFontSize(10);
                doc.setFont("helvetica", "normal");
                doc.setTextColor(148, 163, 184);
                doc.text(`Relatório de Portfólio — ${now}${accName ? ` · ${accName}` : ""}`, titleX, 31);
                doc.setTextColor(255, 255, 255);
                y = 42;
                doc.setDrawColor(249, 115, 22);
                doc.setLineWidth(0.5);
                doc.line(15, y, 195, y);
                spacer(8);

                head(t("pf_summary"));
                kv2(`Total: ${curSym} ${formatValue(fx(portfolioTotal))}`, `Cripto: ${curSym} ${formatValue(fx(cryptoTotal))}`);
                kv2(`Tradicional: ${curSym} ${formatValue(fx(traditionalTotal))}`, stablecoinTotal > 0 ? `Stablecoins: ${curSym} ${formatValue(fx(stablecoinTotal))}` : undefined);
                spacer(3);

                head("PNL");
                kv2(`Posição: ${curSym} ${formatValue(fx(Math.abs(pnlSummary.position)))} ${pnlSummary.position >= 0 ? "(ganho)" : "(perda)"}`, `Hoje: ${curSym} ${formatValue(fx(Math.abs(pnlSummary.today)))}`);
                kv2(`30 dias: ${curSym} ${formatValue(fx(Math.abs(pnlSummary.days30 ?? 0)))}`);
                spacer(3);

                if (advancedMetrics) {
                  const m = advancedMetrics;
                  head(t("pf_adv_metrics"));
                  kv2(`ROI: ${m.roi.toFixed(2)}%`, m.cagr !== null ? `CAGR: ${m.cagr.toFixed(2)}%` : undefined);
                  kv2(m.sharpe !== null ? `Sharpe: ${m.sharpe.toFixed(2)}` : "Sharpe: —", m.sortino !== null ? `Sortino: ${m.sortino.toFixed(2)}` : undefined);
                  kv2(m.calmar !== null ? `Calmar: ${m.calmar.toFixed(2)}` : "Calmar: —", m.volatility !== null ? `Volatilidade: ${m.volatility.toFixed(2)}%` : undefined);
                  kv2(`Queda máxima: ${m.maxDrawdown.toFixed(2)}%`, `Drawdown atual: ${m.currentDrawdown.toFixed(2)}%${m.currentDrawdown < 0 ? ` (há ${m.daysSincePeak}d)` : ""}`);
                  kv2(m.winRate !== null ? `Win rate: ${m.winRate.toFixed(0)}%` : "Win rate: —", m.var95 !== null ? `VaR 95%: ${m.var95.toFixed(2)}%` : undefined);
                  if (m.bestReturn !== null || m.worstReturn !== null) {
                    kv2(m.bestReturn !== null ? `Melhor período: ${m.bestReturn >= 0 ? "+" : ""}${m.bestReturn.toFixed(2)}%` : "", m.worstReturn !== null ? `Pior período: ${m.worstReturn.toFixed(2)}%` : undefined);
                  }
                  kv2(`Período: ${m.days} dias`, beta.btc !== null ? `Beta BTC: ${beta.btc.toFixed(2)}` : undefined);
                  if (beta.sp500 !== null) kv2(`Beta S&P 500: ${beta.sp500.toFixed(2)}`);
                  if (!beta.ready) kv2(`Beta vs BTC/S&P: a acumular (${beta.count}/${beta.needed})`);
                  spacer(3);
                }

                if (concentration) {
                  head("Concentração");
                  kv2(`Nº de ativos: ${concentration.numAssets}`, `Maior posição: ${concentration.topHolding.toFixed(1)}%`);
                  kv2(`HHI: ${concentration.hhi}`, `Cripto: ${concentration.cryptoPct.toFixed(1)}% · Trad.: ${concentration.traditionalPct.toFixed(1)}%`);
                  spacer(3);
                }

                head(t("pf_distribution"));
                cryptoAllocations.filter(a => a.value > 0).forEach(a => {
                  checkPage();
                  doc.setFontSize(10);
                  doc.setFont("helvetica", "normal");
                  doc.setTextColor(226, 232, 240);
                  doc.text(`${a.label} (${a.symbol}): ${curSym} ${formatValue(fx(a.value))} · ${a.percent}`, 15, y);
                  doc.setTextColor(255, 255, 255);
                  y += 6;
                });
                spacer(6);

                doc.setFontSize(8);
                doc.setTextColor(100, 116, 139);
                doc.text(`Gerado por ChainFolioAI em ${now}. Apenas para referência pessoal.`, 15, 287);

                const pdfName = `chainfolioai-portfolio-${new Date().toISOString().slice(0, 10)}.pdf`;
                const pdfBlob = doc.output("blob");
                const nav = navigator as Navigator & {
                  canShare?: (d: { files: File[] }) => boolean;
                  share?: (d: { files?: File[]; title?: string }) => Promise<void>;
                };
                const pdfFile = typeof File !== "undefined" ? new File([pdfBlob], pdfName, { type: "application/pdf" }) : null;
                if (pdfFile && nav.canShare && nav.canShare({ files: [pdfFile] }) && nav.share) {
                  nav.share({ files: [pdfFile], title: pdfName }).catch(() => {});
                } else {
                  doc.save(pdfName);
                }
              }}
              className="flex items-center gap-2 rounded-xl border border-orange-500/40 px-4 py-2 text-sm font-semibold text-orange-300 hover:bg-orange-500/10 transition"
            >
              ↓ Exportar PDF
            </button>
            <button
              id="btn-export-csv"
              onClick={async () => {
                // Excel (.xlsx) formatado: larguras de coluna certas, cabeçalhos
                // a negrito e números com formato — resolve o CSV cortado/"###".
                const mod = await import("exceljs");
                const ExcelJS = (mod as unknown as { default?: typeof mod }).default ?? mod;
                const wb = new ExcelJS.Workbook();
                wb.creator = "ChainFolioAI";
                wb.created = new Date();
                const ws = wb.addWorksheet("Portfólio");

                const logoUrl = await loadLogoDataUrl();
                const logoImgId = logoUrl ? wb.addImage({ base64: logoUrl.split(",")[1], extension: "png" }) : null;

                [26, 22, 16, 18, 12].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
                const money = `#,##0.00 "${curSym}"`;
                const pctFmt = '0.00"%"';
                const BRAND = "FFF97316";
                const DARK = "FF0F172A";

                let accName = "";
                try { accName = listAccounts().find((x) => x.id === getActiveAccountId())?.name ?? ""; } catch { /* ignore */ }

                const bandRow = (label: string, argb: string, size = 12) => {
                  const r = ws.addRow([label]);
                  ws.mergeCells(r.number, 1, r.number, 5);
                  const c = r.getCell(1);
                  c.font = { bold: true, size, color: { argb: "FFFFFFFF" } };
                  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
                  c.alignment = { vertical: "middle" };
                  r.height = 20;
                  return r;
                };
                const boldRow = (r: import("exceljs").Row) => { r.eachCell((c) => { c.font = { bold: true }; }); return r; };

                const titleRow = bandRow("ChainFolioAI — Exportação de portfólio", DARK, 14);
                if (logoImgId != null) {
                  titleRow.height = 46;
                  titleRow.getCell(1).alignment = { vertical: "middle", indent: 8 };
                  ws.addImage(logoImgId, { tl: { col: 0.15, row: 0.15 }, ext: { width: 46, height: 46 } });
                } else {
                  titleRow.height = 24;
                }
                ([
                  ["Conta", accName || "—"],
                  ["Data", new Date().toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" })],
                  ["Moeda", curSym],
                ] as [string, string][]).forEach(([k, v]) => {
                  const r = ws.addRow([k, v]);
                  r.getCell(1).font = { bold: true, color: { argb: "FF64748B" } };
                });
                ws.addRow([]);

                bandRow("RESUMO", BRAND);
                boldRow(ws.addRow(["Métrica", "Valor"]));
                const metric = (label: string, value: number, fmt?: string) => {
                  const r = ws.addRow([label, value]);
                  if (fmt) r.getCell(2).numFmt = fmt;
                };
                metric("Total", fx(portfolioTotal), money);
                metric("Cripto", fx(cryptoTotal), money);
                if (stablecoinTotal > 0) metric("Stablecoins", fx(stablecoinTotal), money);
                metric("Tradicional", fx(traditionalTotal), money);
                metric("PNL Posição", fx(pnlSummary.position), money);
                metric("PNL Hoje", fx(pnlSummary.today), money);
                metric("PNL 30 dias", fx(pnlSummary.days30 ?? 0), money);
                if (advancedMetrics) {
                  metric("ROI", advancedMetrics.roi, pctFmt);
                  if (advancedMetrics.cagr !== null) metric("CAGR", advancedMetrics.cagr, pctFmt);
                  if (advancedMetrics.sharpe !== null) metric("Sharpe", advancedMetrics.sharpe, "0.00");
                  if (advancedMetrics.sortino !== null) metric("Sortino", advancedMetrics.sortino, "0.00");
                  if (advancedMetrics.calmar !== null) metric("Calmar", advancedMetrics.calmar, "0.00");
                  metric("Queda máxima", advancedMetrics.maxDrawdown, pctFmt);
                  if (advancedMetrics.volatility !== null) metric("Volatilidade", advancedMetrics.volatility, pctFmt);
                  if (advancedMetrics.winRate !== null) metric("Win rate", advancedMetrics.winRate, pctFmt);
                  if (advancedMetrics.var95 !== null) metric("VaR 95%", advancedMetrics.var95, pctFmt);
                  metric("Drawdown atual", advancedMetrics.currentDrawdown, pctFmt);
                  if (advancedMetrics.bestReturn !== null) metric("Melhor período", advancedMetrics.bestReturn, pctFmt);
                  if (advancedMetrics.worstReturn !== null) metric("Pior período", advancedMetrics.worstReturn, pctFmt);
                  metric("Período (dias)", advancedMetrics.days, "0");
                }
                if (beta.btc !== null) metric("Beta BTC", beta.btc, "0.00");
                if (beta.sp500 !== null) metric("Beta S&P 500", beta.sp500, "0.00");
                ws.addRow([]);

                if (concentration) {
                  bandRow("CONCENTRAÇÃO", BRAND);
                  boldRow(ws.addRow(["Métrica", "Valor"]));
                  metric("Nº de ativos", concentration.numAssets, "0");
                  metric("Maior posição", concentration.topHolding, pctFmt);
                  metric("HHI (0–10000)", concentration.hhi, "0");
                  metric("% Cripto", concentration.cryptoPct, pctFmt);
                  if (concentration.stablecoinPct > 0) metric("% Stablecoins", concentration.stablecoinPct, pctFmt);
                  metric("% Tradicional", concentration.traditionalPct, pctFmt);
                  ws.addRow([]);
                }

                bandRow("POSIÇÕES", BRAND);
                boldRow(ws.addRow(["Categoria", "Ativo", "Símbolo", `Valor (${curSym})`, "% do total"]));
                const posRows: [string, string, string, number, number][] = [];
                cryptoAllocations.filter((a) => a.value > 0).forEach((a) => {
                  posRows.push(["Cripto", a.label, a.symbol, fx(a.value), portfolioTotal > 0 ? (a.value / portfolioTotal) * 100 : 0]);
                });
                traditionalAllocations.assets.filter((a) => a.value > 0).forEach((a) => {
                  posRows.push(["Tradicional", a.label, a.category ?? "", fx(a.value), portfolioTotal > 0 ? (a.value / portfolioTotal) * 100 : 0]);
                });
                if (posRows.length === 0) {
                  const r = ws.addRow(["Sem posições registadas"]);
                  r.getCell(1).font = { italic: true, color: { argb: "FF94A3B8" } };
                } else {
                  posRows.forEach((p) => {
                    const r = ws.addRow(p);
                    r.getCell(4).numFmt = money;
                    r.getCell(5).numFmt = pctFmt;
                  });
                }

                const buf = await wb.xlsx.writeBuffer();
                const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
                const filename = `chainfolioai-portfolio-${new Date().toISOString().slice(0, 10)}.xlsx`;
                const nav = navigator as Navigator & {
                  canShare?: (d: { files: File[] }) => boolean;
                  share?: (d: { files?: File[]; title?: string }) => Promise<void>;
                };
                const file = typeof File !== "undefined" ? new File([blob], filename, { type: blob.type }) : null;
                if (file && nav.canShare && nav.canShare({ files: [file] }) && nav.share) {
                  // Telemóvel (iOS/Android): folha de partilha → "Guardar em Ficheiros"
                  nav.share({ files: [file], title: filename }).catch(() => {});
                } else {
                  // Desktop: download clássico (revoke adiado para não cancelar)
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = filename;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  setTimeout(() => URL.revokeObjectURL(url), 4000);
                }
              }}
              className="flex items-center gap-2 rounded-xl border border-slate-600/50 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-700/30 transition"
            >
              ↓ Exportar Excel
            </button>
            </div>
          </div>

          {!advancedMetrics ? (
            <div className="rounded-xl border border-dashed border-slate-700 p-6 text-center">
              <p className="text-sm text-slate-400">{t("pf_need_at_least")} <strong className="text-white">2 snapshots</strong> para calcular métricas avançadas.</p>
              <p className="text-xs text-slate-500 mt-1">{t("pf_save_snap_periodic")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {[
                {
                  label: "ROI",
                  value: `${advancedMetrics.roi >= 0 ? "+" : ""}${advancedMetrics.roi.toFixed(2)}%`,
                  color: advancedMetrics.roi >= 0 ? "text-emerald-400" : "text-rose-400",
                  hint: `Desde ${advancedMetrics.days}d atrás`,
                },
                ...(advancedMetrics.cagr !== null ? [{
                  label: "CAGR",
                  value: `${advancedMetrics.cagr >= 0 ? "+" : ""}${advancedMetrics.cagr.toFixed(2)}%`,
                  color: advancedMetrics.cagr >= 0 ? "text-emerald-400" : "text-rose-400",
                  hint: t("pf_annual_return"),
                }] : []),
                ...(advancedMetrics.sharpe !== null ? [{
                  label: "Sharpe",
                  value: advancedMetrics.sharpe.toFixed(2),
                  color: advancedMetrics.sharpe >= 1 ? "text-emerald-400" : advancedMetrics.sharpe >= 0 ? "text-orange-300" : "text-rose-400",
                  hint: ">1 = bom",
                }] : []),
                {
                  label: t("pf_max_drawdown"),
                  value: `${advancedMetrics.maxDrawdown.toFixed(2)}%`,
                  color: "text-rose-400",
                  hint: t("pf_max_drawdown"),
                },
                ...(advancedMetrics.volatility !== null ? [{
                  label: t("pf_volatility"),
                  value: `${advancedMetrics.volatility.toFixed(2)}%`,
                  color: "text-orange-300",
                  hint: t("pf_annualized"),
                }] : []),
                ...(advancedMetrics.sortino !== null ? [{
                  label: "Sortino",
                  value: advancedMetrics.sortino.toFixed(2),
                  color: advancedMetrics.sortino >= 1 ? "text-emerald-400" : advancedMetrics.sortino >= 0 ? "text-orange-300" : "text-rose-400",
                  hint: "Só penaliza a queda",
                }] : []),
                ...(advancedMetrics.calmar !== null ? [{
                  label: "Calmar",
                  value: advancedMetrics.calmar.toFixed(2),
                  color: advancedMetrics.calmar >= 1 ? "text-emerald-400" : advancedMetrics.calmar >= 0 ? "text-orange-300" : "text-rose-400",
                  hint: "Retorno ÷ queda",
                }] : []),
                ...(advancedMetrics.winRate !== null ? [{
                  label: "Win rate",
                  value: `${advancedMetrics.winRate.toFixed(0)}%`,
                  color: advancedMetrics.winRate >= 50 ? "text-emerald-400" : "text-orange-300",
                  hint: "Períodos positivos",
                }] : []),
                {
                  label: "Drawdown atual",
                  value: `${advancedMetrics.currentDrawdown.toFixed(2)}%`,
                  color: advancedMetrics.currentDrawdown < 0 ? "text-rose-400" : "text-emerald-400",
                  hint: advancedMetrics.currentDrawdown < 0 ? `há ${advancedMetrics.daysSincePeak}d do pico` : "no pico",
                },
                ...(advancedMetrics.bestReturn !== null ? [{
                  label: "Melhor",
                  value: `${advancedMetrics.bestReturn >= 0 ? "+" : ""}${advancedMetrics.bestReturn.toFixed(2)}%`,
                  color: "text-emerald-400",
                  hint: "melhor período",
                }] : []),
                ...(advancedMetrics.worstReturn !== null ? [{
                  label: "Pior",
                  value: `${advancedMetrics.worstReturn.toFixed(2)}%`,
                  color: "text-rose-400",
                  hint: "pior período",
                }] : []),
                ...(advancedMetrics.var95 !== null ? [{
                  label: "VaR 95%",
                  value: `${advancedMetrics.var95.toFixed(2)}%`,
                  color: "text-rose-400",
                  hint: "perda diária (95%)",
                }] : []),
                ...(concentration ? [{
                  label: "Nº ativos",
                  value: String(concentration.numAssets),
                  color: "text-slate-200",
                  hint: "posições",
                }, {
                  label: "Maior posição",
                  value: `${concentration.topHolding.toFixed(1)}%`,
                  color: concentration.topHolding > 50 ? "text-rose-400" : concentration.topHolding > 30 ? "text-orange-300" : "text-emerald-400",
                  hint: "concentração",
                }, {
                  label: "HHI",
                  value: String(concentration.hhi),
                  color: concentration.hhi > 2500 ? "text-rose-400" : concentration.hhi > 1500 ? "text-orange-300" : "text-emerald-400",
                  hint: ">2500 = concentrado",
                }] : []),
                ...(beta.btc !== null ? [{
                  label: "Beta BTC",
                  value: beta.btc.toFixed(2),
                  color: beta.btc > 1.1 ? "text-rose-400" : beta.btc < 0 ? "text-orange-300" : "text-emerald-400",
                  hint: "vs Bitcoin",
                }] : []),
                ...(beta.sp500 !== null ? [{
                  label: "Beta S&P 500",
                  value: beta.sp500.toFixed(2),
                  color: beta.sp500 > 1.1 ? "text-rose-400" : beta.sp500 < 0 ? "text-orange-300" : "text-emerald-400",
                  hint: "vs mercado ações",
                }] : []),
              ].map((m, i) => (
                <div key={m.label} className={`card-hover rounded-xl border border-slate-700 bg-slate-900/80 p-4 text-center animate-count-up delay-${i * 100}`}>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">{m.label}</p>
                  <p className={`metric-value text-2xl font-black ${m.color}`}>{m.value}</p>
                  <p className="text-[10px] text-slate-600 mt-1.5">{m.hint}</p>
                </div>
              ))}
            </div>
          )}

          {advancedMetrics && (
            <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2.5">
                O que significa cada indicador
              </p>
              <dl className="grid gap-x-6 gap-y-2 text-[12px] leading-snug text-slate-400 sm:grid-cols-2">
                {[
                  ["ROI", "Retorno total desde o primeiro snapshot: quanto ganhaste ou perdeste em % sobre o valor inicial."],
                  ["CAGR", "Taxa de crescimento anual composta — o teu ROI convertido para ritmo por ano (só a partir de 30 dias de histórico)."],
                  ["Sharpe", "Retorno por unidade de risco total. Acima de 1 é bom; negativo indica que assumiste risco sem ser compensado."],
                  ["Sortino", "Como o Sharpe, mas só penaliza a volatilidade das quedas — ignora oscilações positivas."],
                  ["Calmar", "Retorno anual (CAGR) a dividir pela maior queda. Mede quanto ganhas face ao pior tombo."],
                  ["Volatilidade", "Oscilação anualizada dos retornos. Quanto maior, mais o valor sobe e desce."],
                  ["Queda máxima", "A maior queda do topo até ao fundo no período. Mede o pior cenário que já viveste."],
                  ["Drawdown atual", "Quanto estás abaixo do teu máximo histórico agora — e há quantos dias vens do pico."],
                  ["Win rate", "Percentagem de períodos entre snapshots em que o portfólio subiu."],
                  ["VaR 95%", "Num dia mau típico (pior 5% dos casos), a perda esperada. Ex.: −4% = em 1 de cada 20 leituras perdes ao menos 4%."],
                  ["Nº ativos · Maior posição", "Quantas posições tens e o peso da maior. Acima de ~50% numa só é muita concentração."],
                  ["HHI", "Índice de concentração (0–10000). Abaixo de 1500 = diversificado; acima de 2500 = concentrado."],
                  ["Beta BTC / S&P 500", "Sensibilidade ao mercado. 1 = move igual; abaixo de 1 = mais calmo; acima = amplifica; negativo = move ao contrário."],
                ].map(([term, def]) => (
                  <div key={term}>
                    <dt className="inline font-semibold text-slate-300">{term}: </dt>
                    <dd className="inline">{def}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-[11px] leading-snug text-slate-500">
                Nota: as métricas de risco são calculadas a partir dos teus snapshots. Saltos de valor causados por depósitos ou levantamentos (variações acima de ±50% entre snapshots) são ignorados para não distorcer a volatilidade. Quantos mais snapshots tiveres, mais fiáveis ficam.
              </p>
              {!beta.ready && (
                <p className="mt-2 text-[11px] leading-snug text-sky-400/80">
                  Beta vs BTC/S&P 500: a acumular dados ({beta.count}/{beta.needed} capturas com preço de mercado). Cada snapshot novo passa a guardar a cotação do BTC e do S&P 500 — assim que houver capturas suficientes, o Beta aparece automaticamente aqui.
                </p>
              )}
            </div>
          )}
        </section>

        <section className="grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <h2 className="text-lg font-semibold text-white">{t("pf_blockchain_wallets")}</h2>
            <p className="text-sm text-slate-400">
              {t("port_total_assets")}: {fmt(cryptoTotal)}
            </p>

            <div className="mt-6 space-y-4">
              {cryptoAllocations.map((item) => (
                <div key={item.label} className="space-y-2">
                  <div className="flex items-center justify-between text-sm text-slate-300">
                    <span>
                      {item.label} <span className="text-xs text-slate-500">{item.symbol}</span>
                    </span>
                    <span>{item.percent}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-orange-400"
                      style={{ width: `${item.percent}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <h2 className="text-lg font-semibold text-white">{t("pf_traditional_wallets")}</h2>
            <p className="text-sm text-slate-400">
              Ativos totais: {fmt(traditionalTotal)}
            </p>
            <div className="mt-6 space-y-4">
              {traditionalAllocations.categories.length === 0 ? (
                <p className="text-xs text-slate-500">
                  Ainda não tens ativos tradicionais na carteira.
                </p>
              ) : (
                traditionalAllocations.categories.map((item) => (
                  <div key={item.label} className="space-y-2">
                    <div className="flex items-center justify-between text-sm text-slate-300">
                      <span>{item.label}</span>
                      <span>{item.percent}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full bg-sky-500"
                        style={{ width: `${item.percent}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
              {traditionalAllocations.assets.length ? (
                <div className="mt-4 space-y-2">
                  {traditionalAllocations.assets.map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center justify-between text-xs text-slate-400"
                    >
                      <span>{item.label}</span>
                      <span>{fmt(item.value)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-orange-500/20 bg-slate-900/60 p-6">
          <h2 className="text-lg font-semibold text-white">{t("pf_snapshots_plan")}</h2>
          {isLoadingAuth ? (
            <p className="mt-2 text-sm text-slate-400">{t("loading")}</p>
          ) : userId ? (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-slate-300">
                {isPro
                  ? "Plano Pro ativo. Snapshots automáticos a cada 24h."
                  : "Plano Free — snapshots manuais e automáticos disponíveis gratuitamente."}
              </p>
              {saveMessage ? (
                <p className={`text-sm ${saveMessage.includes("sucesso") ? "text-emerald-400" : "text-rose-300"}`}>{saveMessage}</p>
              ) : null}
              {billingError ? (
                <p className="text-sm text-rose-300">{billingError}</p>
              ) : null}
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  className={`${btnPrimary} px-6 py-3 text-sm`}
                  onClick={() => handleSaveSnapshot(false)}
                  type="button"
                >
                  📸 Salvar snapshot agora
                </button>
                {!isPro ? (
                  <button
                    className="rounded-full border border-orange-400/40 px-6 py-3 text-sm font-semibold text-orange-200 transition hover:border-orange-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-70"
                    onClick={handleCheckout}
                    type="button"
                    disabled={isBillingLoading}
                  >
                    {isBillingLoading ? t("pf_starting") : "✨ Ativar plano Pro"}
                  </button>
                ) : null}
                <a
                  className="rounded-full border border-slate-700 px-6 py-3 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
                  href="/account"
                >
                  Gerir conta
                </a>
              </div>
              {saveMessage ? (
                <p className="text-sm text-emerald-300">{saveMessage}</p>
              ) : null}
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-slate-300">
                Faça login para guardar o seu portfólio e acessar a versão paga.
              </p>
              <a
                className="inline-flex rounded-full border border-orange-400/40 px-6 py-3 text-sm font-semibold text-orange-200 transition hover:border-orange-400 hover:text-white"
                href="/login"
              >
                Entrar
              </a>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">{t("pf_portfolio_history")}</h2>
              <p className="text-sm text-slate-400">
                {isPremium ? t("pf_unlimited_history") : isPro ? "Últimos 365 dias de snapshots (Plano Pro)." : <>{t("pf_30days_free")} <a href="/pricing" className="text-orange-400 underline hover:text-orange-300">{t("pf_pro_1year")}</a></>}
              </p>
            </div>
            <a
              className="rounded-full border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
              href="/dashboard"
            >
              Voltar ao dashboard
            </a>
          </div>

          {isLoadingAuth || isSnapshotsLoading ? (
            <p className="mt-4 text-sm text-slate-400">{t("loading")}</p>
          ) : snapshots.length === 0 ? (
            <p className="mt-4 text-sm text-slate-400">
              Ainda não tens snapshots salvos. Salva um para aparecer aqui.
            </p>
          ) : (
            <SnapshotList snapshots={snapshots} onRestore={handleRestoreSnapshot} />
          )}
        </section>
        {/* ── SIMULADOR DE CENÁRIOS ── */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <div className="mb-5">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{t("pf_simulation")}</p>
            <h2 className="text-base font-bold text-white mt-0.5">{t("pf_scenario_sim")}</h2>
            <p className="text-xs text-slate-400 mt-0.5">{t("pf_sim_desc")}</p>
          </div>
          {portfolioTotal <= 0 ? (
            <p className="text-sm text-slate-500">{t("pf_add_for_sim")}</p>
          ) : (
            <ScenarioSimulator
              portfolioTotal={portfolioTotal}
              allocations={cryptoAllocations}
              traditionalTotal={traditionalTotal}
              stablecoinTotal={stablecoinTotal}
            />
          )}
        </section>

        {/* ── IA CONTEXTUAL ── */}
        <section className="rounded-2xl border border-orange-500/20 bg-orange-50 dark:bg-slate-950 dark:bg-gradient-to-br dark:from-orange-500/5 dark:via-slate-900 dark:to-slate-950 p-6">
          <div className="mb-4">
            <p className="text-xs uppercase tracking-[0.2em] text-orange-600 dark:text-orange-300">{t("pf_ai")}</p>
            <h2 className="mt-1 text-base font-bold text-slate-900 dark:text-white">{t("pf_analyze_portfolio")}</h2>
            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
              A IA tem acesso aos teus dados reais — totais, PNL, distribuição e métricas avançadas.
            </p>
          </div>

          {/* Sugestões rápidas */}
          <div className="flex flex-wrap gap-2 mb-4">
            {[
              t("pf_q1"),
              t("pf_q2"),
              t("pf_q3"),
              t("pf_q4"),
            ].map((q) => (
              <button
                key={q}
                onClick={() => setAiQuestion(q)}
                className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 hover:border-orange-400 hover:text-orange-600 transition dark:border-slate-700 dark:bg-transparent dark:text-slate-300 dark:hover:border-orange-400/40 dark:hover:text-orange-200"
              >
                {q}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={aiQuestion}
              onChange={(e) => setAiQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !aiLoading) {
                  e.preventDefault();
                  void (async () => {
                    if (!aiQuestion.trim()) return;
                    setAiLoading(true);
                    setAiReply(null);
                    setAiError(null);
                    try {
                      const context = {
                        totalEur: portfolioTotal,
                        pnlPosition: pnlSummary.position,
                        pnlToday: pnlSummary.today,
                        pnl30d: pnlSummary.days30 ?? 0,
                        ...(advancedMetrics ?? {}),
                        allocations: cryptoAllocations.map((a) => ({
                          label: a.label,
                          symbol: a.symbol,
                          valueEur: a.value,
                          percent: a.percent,
                        })),
                      };
                      const res = await fetch("/api/portfolio-ai", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ question: aiQuestion.trim(), context, nickname: loadNickname() || undefined }),
                      });
                      const data = (await res.json()) as { reply?: string; error?: string };
                      if (!res.ok || data.error) { setAiError(data.error ?? t("pf_error")); return; }
                      setAiReply(data.reply ?? "");
                    } catch (err) {
                      setAiError(err instanceof Error ? err.message : t("pf_error"));
                    } finally {
                      setAiLoading(false);
                    }
                  })();
                }
              }}
              placeholder={t("pf_ask_ph")}
              className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-orange-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
            />
            <button
              disabled={aiLoading || !aiQuestion.trim()}
              onClick={async () => {
                if (!aiQuestion.trim()) return;
                setAiLoading(true);
                setAiReply(null);
                setAiError(null);
                try {
                  const context = {
                    totalEur: portfolioTotal,
                    pnlPosition: pnlSummary.position,
                    pnlToday: pnlSummary.today,
                    pnl30d: pnlSummary.days30 ?? 0,
                    ...(advancedMetrics ?? {}),
                    allocations: cryptoAllocations.map((a) => ({
                      label: a.label,
                      symbol: a.symbol,
                      valueEur: a.value,
                      percent: a.percent,
                    })),
                  };
                  const res = await fetch("/api/portfolio-ai", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ question: aiQuestion.trim(), context, nickname: loadNickname() || undefined }),
                  });
                  const data = (await res.json()) as { reply?: string; error?: string };
                  if (!res.ok || data.error) { setAiError(data.error ?? t("pf_no_response")); return; }
                  setAiReply(data.reply ?? "");
                } catch (err) {
                  setAiError(err instanceof Error ? err.message : t("pf_no_response_conn"));
                } finally {
                  setAiLoading(false);
                }
              }}
              className={`${btnPrimary} px-5 py-2.5 text-sm`}
            >
              {aiLoading ? "…" : t("pf_ask")}
            </button>
          </div>

          {aiLoading && (
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400 animate-pulse">{t("pf_analyzing")}</p>
          )}
          {aiError && (
            <p className="mt-3 text-xs text-rose-500 dark:text-rose-400">{aiError}</p>
          )}
          {aiReply && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/80">
              <p className="flex items-center gap-1.5 text-xs text-orange-500 dark:text-orange-300/80 font-semibold mb-2"><img src="/chainfolioai-icon.png" alt="" className="h-4 w-4 rounded-full object-cover" /> ChainFolioAI — Assistente IA</p>
              <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">{aiReply}</p>
            </div>
          )}
        </section>

        {/* ── NOTAS ── */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <div className="mb-3">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{t("pf_personal")}</p>
            <h2 className="text-base font-bold text-white mt-0.5">{t("pf_portfolio_notes")}</h2>
          </div>
          <textarea
            className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-slate-200 placeholder-slate-600 outline-none transition focus:border-orange-400 resize-none"
            rows={4}
            placeholder={t("pf_notes_ph")}
            value={portfolioNote}
            onChange={(e) => {
              const v = e.target.value;
              setPortfolioNote(v);
              try { localStorage.setItem("portfolio-note", v); } catch {}
            }}
          />
          <p className="mt-1.5 text-[10px] text-slate-600">{t("pf_saved_local")}</p>
        </section>

      </main>
    </div>
    </AppShell>
  );
}
