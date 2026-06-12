"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { getEvmBalance } from "@/lib/wallets/evm";
import { getSolBalance } from "@/lib/wallets/solana";
import { getBtcBalanceFromAddress } from "@/lib/wallets/bitcoin";
import { getAdaBalanceByAddress } from "@/lib/wallets/cardano";
import { useRequireAuth } from "@/lib/auth/useRequireAuth";
import { traditionalAssets } from "@/lib/traditional/assets";
import { loadTraditionalHoldings, type TraditionalHoldings } from "@/lib/traditional/storage";
import { loadCryptoHoldings, loadStablecoinEntries, type CryptoHoldings, type StablecoinEntry } from "@/lib/crypto/storage";

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

const snapshotToWallets = (snapshot: WalletSnapshot, prices: TokenPrices = {}): WalletBalance[] => [
  // Each ETH wallet entry as its own row (mainnet + L2s)
  ...(snapshot.eth ?? []).map((entry) => ({
    label: entry.label || (entry.address ? `${entry.address.slice(0, 6)}…${entry.address.slice(-4)}` : "Ethereum"),
    symbol: "ETH",
    balance: (Number(entry.balance ?? 0) * (prices.ETH ?? 0)).toFixed(2),
    address: entry.address,
    network: entry.network ?? "Ethereum",
  })),
  // SOL wallets
  ...(snapshot.sol ?? []).map((entry) => ({
    label: entry.label || (entry.address ? `${entry.address.slice(0, 6)}…${entry.address.slice(-4)}` : "Solana"),
    symbol: "SOL",
    balance: (Number(entry.balance ?? 0) * (prices.SOL ?? 0)).toFixed(2),
    address: entry.address,
    network: "Solana",
  })),
  // BTC wallets
  ...(snapshot.btc ?? []).map((entry) => ({
    label: entry.label || (entry.address ? `${entry.address.slice(0, 6)}…${entry.address.slice(-4)}` : "Bitcoin"),
    symbol: "BTC",
    balance: (Number(entry.balance ?? 0) * (prices.BTC ?? 0)).toFixed(2),
    address: entry.address,
    network: "Bitcoin",
  })),
  // ADA wallets
  ...(snapshot.ada ?? []).map((entry) => ({
    label: entry.label || (entry.address ? `${entry.address.slice(0, 6)}…${entry.address.slice(-4)}` : "Cardano"),
    symbol: "ADA",
    balance: (Number(entry.balance ?? 0) * (prices.ADA ?? 0)).toFixed(2),
    address: entry.address,
    network: "Cardano",
  })),
];

const formatAddress = (address?: string) => {
  if (!address) return "—";
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

const sumCrypto = (balances: WalletBalance[]) => {
  return balances.reduce((sum, item) => {
    const value = Number(item.balance ?? 0);
    return Number.isFinite(value) ? sum + value : sum;
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

const formatSignedCurrency = (value: number) => {
  const sign = value >= 0 ? "+" : "-";
  return `${sign} € ${formatValue(Math.abs(value))}`;
};

const getPercent = (value: number, total: number): string => {
  if (!total || total <= 0) return "0";
  return String(Math.round((value / total) * 100));
};

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
  const [wallets, setWallets] = useState<WalletBalance[]>([]);
  const [tokenPrices, setTokenPrices] = useState<TokenPrices>({});
  const [historicalPrices, setHistoricalPrices] = useState<HistoricalPrices>({ "1d": {}, "7d": {}, "30d": {} });
  // Ref keeps prices always fresh for async callbacks (avoids stale closure)
  const tokenPricesRef = useRef<TokenPrices>({});
  const [traditionalHoldings, setTraditionalHoldings] = useState<TraditionalHoldings>({});
  const [cryptoHoldings, setCryptoHoldings] = useState<CryptoHoldings>({});
  const [stablecoinEntries, setStablecoinEntries] = useState<StablecoinEntry[]>([]);
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([]);
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
  const [snapshotCexUsd, setSnapshotCexUsd] = useState(0);
  const [snapshotDefiUsd, setSnapshotDefiUsd] = useState(0);
  const [usdToEur, setUsdToEur] = useState(0.92); // fallback ~0.92

  useEffect(() => {
    const snap = loadWalletSnapshot();
    if (typeof snap.cexUsd === "number") setSnapshotCexUsd(snap.cexUsd);
    if (typeof snap.defiUsd === "number") setSnapshotDefiUsd(snap.defiUsd);
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

  // Re-fetch saldos frescos das carteiras ao carregar
  useEffect(() => {
    const snapshot = loadWalletSnapshot();
    if (!snapshot.eth?.length && !snapshot.sol?.length && !snapshot.btc?.length && !snapshot.ada?.length) return;

    const patch: WalletSnapshot = {};
    const refreshEntries = async (
      entries: StoredWalletEntry[] | undefined,
      fetcher: (addr: string) => Promise<string>
    ): Promise<StoredWalletEntry[] | undefined> => {
      if (!entries?.length) return undefined;
      return Promise.all(
        entries.map(async (e) => {
          if (!e.address) return e;
          try {
            const balance = await fetcher(e.address);
            return { ...e, balance };
          } catch { return e; }
        })
      );
    };

    Promise.allSettled([
      refreshEntries(snapshot.eth, (a) => getEvmBalance(a as `0x${string}`, "Ethereum")),
      refreshEntries(snapshot.sol, getSolBalance),
      refreshEntries(snapshot.btc, (a) => getBtcBalanceFromAddress(a).then(String)),
      refreshEntries(snapshot.ada, (a) => getAdaBalanceByAddress(a).then(String)),
    ]).then(([eth, sol, btc, ada]) => {
      if (eth.status === "fulfilled" && eth.value) patch.eth = eth.value;
      if (sol.status === "fulfilled" && sol.value) patch.sol = sol.value;
      if (btc.status === "fulfilled" && btc.value) patch.btc = btc.value;
      if (ada.status === "fulfilled" && ada.value) patch.ada = ada.value;
      if (Object.keys(patch).length > 0) {
        updateWalletSnapshot(patch);
        const fresh = loadWalletSnapshot();
        // Use ref to get latest prices (avoids stale closure)
        const prices = tokenPricesRef.current;
        setWallets(snapshotToWallets(fresh as WalletSnapshot, prices));
      }
    }).catch(() => {});
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
        throw new Error(data.error ?? "Não foi possível iniciar o pagamento.");
      }

      const stripe = await stripePromise;
      if (stripe) {
        window.location.href = data.url;
      }
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : "Erro no pagamento.");
    } finally {
      setIsBillingLoading(false);
    }
  };

  const handleSaveSnapshot = async (silent = false) => {
    if (!userId) return;
    if (!silent) setSaveMessage(null);

    const snapshot = loadWalletSnapshot();
    // Store current EUR total inside data so historical PNL reflects real prices
    const dataWithTotal = { ...snapshot, _totalEur: portfolioTotal };
    const { error } = await supabase
      .from("portfolio_snapshots")
      .insert({ user_id: userId, data: dataWithTotal });

    if (error) {
      if (!silent) setSaveMessage("Não foi possível salvar o portfólio.");
      return;
    }

    if (!silent) setSaveMessage("Portfólio salvo com sucesso.");

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

  const handleRestoreSnapshot = (row: SnapshotRow) => {
    setWallets(snapshotToWallets(row.data, tokenPricesRef.current));
    setSaveMessage(`Snapshot de ${new Date(row.created_at).toLocaleString("pt-BR")} carregado.`);
  };

  const snapshotCexEur = snapshotCexUsd * usdToEur;
  const snapshotDefiEur = snapshotDefiUsd * usdToEur;

  const manualCryptoTotal = useMemo(() => {
    return Object.values(cryptoHoldings).reduce((sum, holding) => {
      const value = Number(holding.buyValue ?? 0);
      return Number.isFinite(value) ? sum + value : sum;
    }, 0);
  }, [cryptoHoldings]);

  const cryptoTotal = useMemo(() => sumCrypto(wallets) + manualCryptoTotal + snapshotCexEur + snapshotDefiEur, [wallets, manualCryptoTotal, snapshotCexEur, snapshotDefiEur]);
  const stablecoinTotal = useMemo(() => {
    return stablecoinEntries.reduce((sum, e) => sum + (parseFloat(e.balance ?? "0") || 0), 0);
  }, [stablecoinEntries]);
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
    const sorted = [...snapshotTotals].reverse(); // cronológico
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

    // Retornos diários entre snapshots consecutivos
    const dailyReturns: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1].total;
      const cur = sorted[i].total;
      if (prev > 0) dailyReturns.push((cur - prev) / prev);
    }

    // Sharpe Ratio (benchmark risk-free ≈ 0)
    let sharpe: number | null = null;
    if (dailyReturns.length >= 5) {
      const mean = dailyReturns.reduce((s, r) => s + r, 0) / dailyReturns.length;
      const variance =
        dailyReturns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / dailyReturns.length;
      const stdDev = Math.sqrt(variance);
      if (stdDev > 0) sharpe = (mean / stdDev) * Math.sqrt(252);
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
      volatility = Math.sqrt(variance) * Math.sqrt(252) * 100;
    }

    return { roi, cagr, sharpe, maxDrawdown: maxDrawdown * 100, volatility, days: Math.round(days) };
  }, [snapshotTotals, portfolioTotal]);

  // ── Estado do benchmark ──
  const [benchmarkPrices, setBenchmarkPrices] = useState<Record<string, number>>({});
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);

  const cryptoAllocations = useMemo(() => {
    const manualItems = Object.entries(cryptoHoldings).map(([symbol, holding]) => ({
      label: `${symbol} Manual`,
      symbol: "Manual",
      value: Number(holding.buyValue ?? 0),
    }));
    const items = [
      ...wallets.map((wallet) => ({
        label: wallet.label,
        symbol: wallet.symbol,
        value: toNumber(wallet.balance),
      })),
      ...manualItems.filter((item) => Number.isFinite(item.value) && item.value > 0),
      { label: "Stablecoins", symbol: "USDT/USDC", value: stablecoinTotal },
      ...(snapshotCexEur > 0 ? [{ label: "CEX / Exchange", symbol: "CEX", value: snapshotCexEur }] : []),
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
    reasons.push({ label: "Diversificação", points: diversPts, max: 30, ok: diversPts >= 22 });

    const tradPct = portfolioTotal > 0 ? (traditionalTotal / portfolioTotal) * 100 : 0;
    const tradPts = tradPct > 20 ? 20 : tradPct > 10 ? 15 : tradPct > 5 ? 10 : tradPct > 0 ? 5 : 0;
    score += tradPts;
    reasons.push({ label: "Mix Cripto/Tradicional", points: tradPts, max: 20, ok: tradPts >= 10 });

    const stablePct = portfolioTotal > 0 ? (stablecoinTotal / portfolioTotal) * 100 : 0;
    const stablePts = stablePct >= 5 && stablePct <= 30 ? 10 : stablePct > 0 ? 5 : 0;
    score += stablePts;
    reasons.push({ label: "Reserva Stablecoin", points: stablePts, max: 10, ok: stablePts >= 5 });

    const roiPts = advancedMetrics ? (advancedMetrics.roi > 20 ? 20 : advancedMetrics.roi > 10 ? 15 : advancedMetrics.roi > 0 ? 10 : 0) : 0;
    score += roiPts;
    reasons.push({ label: "Performance (ROI)", points: roiPts, max: 20, ok: roiPts >= 10 });

    const riskPts = advancedMetrics
      ? (advancedMetrics.maxDrawdown > -50 ? 10 : 5) + (advancedMetrics.volatility !== null && advancedMetrics.volatility < 80 ? 10 : advancedMetrics.volatility !== null && advancedMetrics.volatility < 150 ? 5 : 0)
      : 0;
    score += riskPts;
    reasons.push({ label: "Gestão de Risco", points: riskPts, max: 20, ok: riskPts >= 12 });

    const label = score >= 80 ? "Excelente" : score >= 60 ? "Bom" : score >= 40 ? "Razoável" : "A melhorar";
    const color = score >= 80 ? "text-emerald-400" : score >= 60 ? "text-orange-300" : score >= 40 ? "text-yellow-400" : "text-rose-400";
    return { score, label, color, reasons };
  }, [portfolioTotal, cryptoAllocations, traditionalTotal, stablecoinTotal, advancedMetrics]);

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
                  € {formatValue(portfolioTotal)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">PNL posição</p>
                <p
                  className={`metric-value mt-2 text-xl font-bold ${
                    pnlTotal >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {formatSignedCurrency(pnlTotal)}
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              <div className="flex items-center justify-between text-sm text-slate-300">
                <span>{t("port_pnl_position")}</span>
                <span
                  className={pnlSummary.position >= 0 ? "text-emerald-300" : "text-rose-300"}
                >
                  {formatSignedCurrency(pnlSummary.position)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm text-slate-300">
                <span>{t("port_pnl_today")}</span>
                <span className={pnlSummary.today >= 0 ? "text-emerald-300" : "text-rose-300"}>
                  {formatSignedCurrency(pnlSummary.today)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm text-slate-300">
                <span>{t("port_pnl_30d")}</span>
                <span
                  className={pnlSummary.days30 >= 0 ? "text-emerald-300" : "text-rose-300"}
                >
                  {formatSignedCurrency(pnlSummary.days30)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm text-slate-300">
                <span>{t("port_pnl_7d")}</span>
                <span className={pnlSummary.daily7d >= 0 ? "text-emerald-300" : "text-rose-300"}>
                  {formatSignedCurrency(pnlSummary.daily7d)}
                </span>
              </div>
              {snapshotTotals.length === 0 ? (
                <div className="mt-3 rounded-xl border border-orange-500/20 bg-orange-500/5 px-4 py-3">
                  <p className="text-xs font-semibold text-orange-300">📸 Como ativar o PNL histórico</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Guarda o teu primeiro snapshot para que o sistema comece a calcular lucro/perda ao longo do tempo. Clica em <strong className="text-white">"Salvar snapshot"</strong> abaixo.
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
                    € {formatValue(cryptoTotal)} · {portfolioSplit.crypto}%
                  </p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <p className="text-sm font-semibold text-white">{t("port_traditional")}</p>
                  <p className="text-xs text-slate-500">
                    € {formatValue(traditionalTotal)} · {portfolioSplit.traditional}%
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
                  label: "Ativos conectados",
                  value: String(wallets.filter(w => Number(w.balance) > 0).length + Object.keys(cryptoHoldings).length + Object.keys(traditionalHoldings).length),
                },
                {
                  label: "Snapshots guardados",
                  value: String(snapshots.length),
                },
                {
                  label: "Última atualização",
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
          {/* Gráfico PNL histórico */}
          {(() => {
            const RANGES = [
              { label: "1D", days: 1 },
              { label: "7D", days: 7 },
              { label: "30D", days: 30 },
              { label: "90D", days: 90 },
              { label: "Tudo", days: 0 },
            ] as const;
            type RangeLabel = typeof RANGES[number]["label"];
            const [chartRange, setChartRange] = useState<RangeLabel>("Tudo");
            const now = Date.now();
            const days = RANGES.find(r => r.label === chartRange)?.days ?? 0;
            const chartData = [...snapshotTotals]
              .filter(s => days === 0 || now - new Date(s.createdAt).getTime() <= days * 86_400_000)
              .reverse()
              .map(s => ({
                data: new Date(s.createdAt).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" }),
                valor: parseFloat(s.total.toFixed(2)),
              }));
            return (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Histórico</p>
                    <h2 className="text-base font-bold text-white mt-0.5">Evolução do portfólio</h2>
                  </div>
                  <span className={`text-sm font-bold ${pnlSummary.position >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {pnlSummary.position >= 0 ? "+" : ""}€{formatValue(pnlSummary.position)}
                  </span>
                </div>
                <div className="flex gap-1 mb-3">
                  {RANGES.map(r => (
                    <button
                      key={r.label}
                      onClick={() => setChartRange(r.label)}
                      className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
                        chartRange === r.label
                          ? "bg-orange-500 text-white"
                          : "bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700"
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
                {chartData.length >= 2 ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="colorValor" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f97316" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="data" tick={{ fill: "#64748b", fontSize: 11 }} />
                      <YAxis tick={{ fill: "#64748b", fontSize: 11 }} tickFormatter={v => `€${v}`} width={60} />
                      <Tooltip
                        contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8 }}
                        labelStyle={{ color: "#94a3b8" }}
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        formatter={(v: any) => [`€ ${formatValue(typeof v === "number" ? v : 0)}`, "Valor"]}
                      />
                      <Area type="monotone" dataKey="valor" stroke="#f97316" strokeWidth={2} fill="url(#colorValor)" dot={chartData.length < 30 ? { fill: "#f97316", r: 3 } : false} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-[180px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-700">
                    <p className="text-2xl">📸</p>
                    <p className="text-sm text-slate-400 text-center">Precisas de pelo menos 2 snapshots<br/>para ver a evolução.</p>
                    <p className="text-xs text-slate-500">{snapshotTotals.length}/2 {t("port_snapshots")}</p>
                  </div>
                )}
              </div>
            );
          })()}

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
            // Group by symbol — merge multiple wallets of same coin
            const rawEntries = [
              ...wallets.filter(w => Number(w.balance) > 0).map(w => ({ name: w.symbol, value: Number(w.balance) })),
              ...Object.entries(cryptoHoldings).filter(([,h]) => Number(h.buyValue) > 0).map(([k,h]) => ({ name: k, value: Number(h.buyValue) })),
              ...(stablecoinTotal > 0 ? [{ name: "Stable", value: stablecoinTotal }] : []),
              ...(traditionalTotal > 0 ? [{ name: "Trad.", value: traditionalTotal }] : []),
              ...(snapshotCexEur > 0 ? [{ name: "CEX", value: snapshotCexEur }] : []),
              ...(snapshotDefiEur > 0 ? [{ name: "DeFi", value: snapshotDefiEur }] : []),
            ].filter(d => d.value > 0);
            const grouped: Record<string, number> = {};
            rawEntries.forEach(e => { grouped[e.name] = (grouped[e.name] ?? 0) + e.value; });
            const pieData = Object.entries(grouped)
              .map(([name, value]) => ({ name, value }))
              .sort((a, b) => b.value - a.value);
            const total = pieData.reduce((s, d) => s + d.value, 0);
            return (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
                <div className="mb-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Distribuição</p>
                  <h2 className="text-base font-bold text-white mt-0.5">Alocação por ativo</h2>
                </div>
                {pieData.length === 0 ? (
                  <div className="flex h-[200px] items-center justify-center">
                    <p className="text-sm text-slate-500">Sem ativos para mostrar.</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={90}
                          paddingAngle={2}
                          dataKey="value"
                          label={false}
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
                            return [`€ ${formatValue(val)} · ${pct}%`, ""];
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    {/* Custom legend: two-column grid */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                      {pieData.map((entry) => {
                        const pct = total > 0 ? ((entry.value / total) * 100) : 0;
                        return (
                          <div key={entry.name} className="flex items-center gap-2 min-w-0">
                            <span className="shrink-0 h-2.5 w-2.5 rounded-full" style={{ background: assetColor(entry.name) }} />
                            <span className="text-xs text-slate-300 font-medium truncate">{entry.name}</span>
                            <span className="ml-auto text-xs text-slate-500 shrink-0">{pct.toLocaleString("pt-PT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Gráfico PNL por período */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 md:col-span-2">
            <div className="mb-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Performance</p>
              <h2 className="text-base font-bold text-white mt-0.5">PNL por período</h2>
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={[
                { periodo: "Posição", pnl: parseFloat(pnlSummary.position.toFixed(2)) },
                { periodo: "Hoje", pnl: parseFloat(pnlSummary.today.toFixed(2)) },
                { periodo: "30 dias", pnl: parseFloat((pnlSummary.days30 ?? 0).toFixed(2)) },
                { periodo: "7 dias (média)", pnl: parseFloat(pnlSummary.daily7d.toFixed(2)) },
              ]} barSize={36}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="periodo" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#64748b", fontSize: 11 }} tickFormatter={v => `€${v}`} width={55} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8 }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(v: any) => { const n = typeof v === "number" ? v : 0; return [`€ ${formatValue(Math.abs(n))}`, n >= 0 ? "Lucro" : "Perda"]; }}
                />
                <Bar dataKey="pnl" radius={[6, 6, 0, 0]}>
                  {[pnlSummary.position, pnlSummary.today, pnlSummary.days30 ?? 0, pnlSummary.daily7d].map((v, i) => (
                    <Cell key={i} fill={v >= 0 ? "#10b981" : "#ef4444"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* ── SCORE + BENCHMARK ── */}
        <section className="grid gap-6 md:grid-cols-[1fr_1.6fr]">
          {/* Score do portfólio */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Avaliação</p>
            <h2 className="text-base font-bold text-white mt-0.5 mb-4">Score do portfólio</h2>
            {portfolioTotal <= 0 ? (
              <div className="flex h-32 items-center justify-center text-sm text-slate-500">Adiciona ativos para ver o score.</div>
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
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">Diversificação, risco, performance e liquidez.</p>
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

          {/* Benchmark REMOVED */}
          <div className="hidden">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Comparação</p>
            <h2 className="text-base font-bold text-white mt-0.5 mb-4">Benchmark</h2>
            {benchmarkLoading ? (
              <p className="text-xs text-slate-400 animate-pulse">{t("loading")}</p>
            ) : (
              <div className="space-y-1">
                {/* Header */}
                <div className="flex items-center gap-2 pb-2 border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-500">
                  <span className="flex-1">Ativo</span>
                  <span className="w-20 text-right">Preço</span>
                  <span className="w-16 text-right">24h</span>
                  <span className="w-16 text-right">7d</span>
                  <span className="w-16 text-right">30d</span>
                </div>
                {[
                  { label: "Bitcoin", sym: "BTC", icon: "₿", price: benchmarkPrices.btc_eur, d24: benchmarkPrices.btc_24h, d7: benchmarkPrices.btc_7d, d30: benchmarkPrices.btc_30d },
                  { label: "Ethereum", sym: "ETH", icon: "Ξ", price: benchmarkPrices.eth_eur, d24: benchmarkPrices.eth_24h, d7: benchmarkPrices.eth_7d, d30: benchmarkPrices.eth_30d },
                  { label: "Ouro", sym: "XAU", icon: "Au", price: benchmarkPrices.gold_eur, d24: benchmarkPrices.gold_24h, d7: benchmarkPrices.gold_7d, d30: benchmarkPrices.gold_30d },
                ].map(b => {
                  const fmtChg = (v?: number) => {
                    if (!v && v !== 0) return <span className="text-slate-600">—</span>;
                    const cls = v >= 0 ? "text-emerald-400" : "text-rose-400";
                    return <span className={cls}>{v >= 0 ? "+" : ""}{v.toFixed(1)}%</span>;
                  };
                  const fmtPrice = (v?: number) => v ? `€ ${v >= 1000 ? (v/1000).toFixed(1)+"K" : v.toFixed(0)}` : "—";
                  return (
                    <div key={b.sym} className="flex items-center gap-2 py-2 border-b border-slate-800/40">
                      <div className="flex items-center gap-2 flex-1">
                        <div className="h-7 w-7 rounded-full bg-orange-500/20 flex items-center justify-center text-[10px] font-bold text-orange-400">{b.icon}</div>
                        <div>
                          <p className="text-sm font-semibold text-white">{b.label}</p>
                          <p className="text-[10px] text-slate-500">{b.sym}</p>
                        </div>
                      </div>
                      <span className="w-20 text-right text-xs text-slate-300">{fmtPrice(b.price)}</span>
                      <span className="w-16 text-right text-xs">{fmtChg(b.d24)}</span>
                      <span className="w-16 text-right text-xs">{fmtChg(b.d7)}</span>
                      <span className="w-16 text-right text-xs">{fmtChg(b.d30)}</span>
                    </div>
                  );
                })}
                {/* Portfolio vs benchmark */}
                {pnlSummary.position !== 0 && portfolioTotal > 0 && (
                  <div className="flex items-center gap-2 py-2">
                    <div className="flex items-center gap-2 flex-1">
                      <div className="h-7 w-7 rounded-full bg-orange-500 flex items-center justify-center text-[10px] font-bold text-slate-950">🦉</div>
                      <div>
                        <p className="text-sm font-semibold text-white">O teu portfólio</p>
                        <p className="text-[10px] text-slate-500">ROI total</p>
                      </div>
                    </div>
                    <span className="w-20 text-right text-xs text-slate-300">€ {portfolioTotal >= 1000 ? (portfolioTotal/1000).toFixed(1)+"K" : portfolioTotal.toFixed(0)}</span>
                    <span className="w-16 text-right text-xs">
                      {pnlSummary.today !== 0 && portfolioTotal > 0 ? (
                        <span className={pnlSummary.today >= 0 ? "text-emerald-400" : "text-rose-400"}>
                          {pnlSummary.today >= 0 ? "+" : ""}{((pnlSummary.today / portfolioTotal) * 100).toFixed(1)}%
                        </span>
                      ) : <span className="text-slate-600">—</span>}
                    </span>
                    <span className="w-16 text-right text-xs">
                      {advancedMetrics ? (
                        <span className={advancedMetrics.roi >= 0 ? "text-emerald-400" : "text-rose-400"}>
                          {advancedMetrics.roi >= 0 ? "+" : ""}{advancedMetrics.roi.toFixed(1)}%
                        </span>
                      ) : <span className="text-slate-600">—</span>}
                    </span>
                    <span className="w-16 text-right text-xs">
                      {pnlSummary.days30 !== 0 && portfolioTotal > 0 ? (
                        <span className={pnlSummary.days30 >= 0 ? "text-emerald-400" : "text-rose-400"}>
                          {pnlSummary.days30 >= 0 ? "+" : ""}{((pnlSummary.days30 / portfolioTotal) * 100).toFixed(1)}%
                        </span>
                      ) : <span className="text-slate-600">—</span>}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* ── PNL AVANÇADO + PDF ── */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Análise</p>
              <h2 className="text-base font-bold text-white mt-0.5">Métricas avançadas</h2>
            </div>
            <button
              id="btn-export-pdf"
              onClick={async () => {
                const { default: jsPDF } = await import("jspdf");
                const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
                const now = new Date().toLocaleDateString("pt-PT", { day: "2-digit", month: "long", year: "numeric" });
                let y = 20;
                const line = (text: string, size = 11, bold = false) => {
                  doc.setFontSize(size);
                  doc.setFont("helvetica", bold ? "bold" : "normal");
                  doc.text(text, 15, y);
                  y += size * 0.5 + 2;
                };
                const spacer = (n = 4) => { y += n; };

                doc.setFillColor(15, 23, 42);
                doc.rect(0, 0, 210, 297, "F");
                doc.setTextColor(255, 255, 255);

                line("OWLFUND", 22, true);
                line(`Relatório de Portfólio — ${now}`, 10);
                spacer(6);
                doc.setDrawColor(249, 115, 22);
                doc.setLineWidth(0.5);
                doc.line(15, y, 195, y);
                spacer(6);

                line("Resumo", 14, true);
                spacer(2);
                line(`Total do portfólio: € ${formatValue(portfolioTotal)}`);
                line(`Cripto: € ${formatValue(cryptoTotal)} · Tradicional: € ${formatValue(traditionalTotal)}`);
                spacer(4);

                line("PNL", 14, true);
                spacer(2);
                line(`Posição: € ${formatValue(pnlSummary.position >= 0 ? pnlSummary.position : -pnlSummary.position)} ${pnlSummary.position >= 0 ? "(ganho)" : "(perda)"}`);
                line(`Hoje: € ${formatValue(Math.abs(pnlSummary.today))}`);
                line(`30 dias: € ${formatValue(Math.abs(pnlSummary.days30 ?? 0))}`);
                spacer(4);

                if (advancedMetrics) {
                  line("Métricas avançadas", 14, true);
                  spacer(2);
                  line(`ROI: ${advancedMetrics.roi.toFixed(2)}%`);
                  if (advancedMetrics.cagr !== null) line(`CAGR: ${advancedMetrics.cagr.toFixed(2)}%`);
                  if (advancedMetrics.sharpe !== null) line(`Sharpe Ratio: ${advancedMetrics.sharpe.toFixed(2)}`);
                  line(`Max Drawdown: ${advancedMetrics.maxDrawdown.toFixed(2)}%`);
                  if (advancedMetrics.volatility !== null) line(`Volatilidade: ${advancedMetrics.volatility.toFixed(2)}%`);
                  line(`Período: ${advancedMetrics.days} dias`);
                  spacer(4);
                }

                line("Distribuição", 14, true);
                spacer(2);
                cryptoAllocations.filter(a => a.value > 0).forEach(a => {
                  line(`${a.label} (${a.symbol}): € ${formatValue(a.value)} · ${a.percent}`);
                });
                spacer(6);

                doc.setFontSize(8);
                doc.setTextColor(100, 116, 139);
                doc.text(`Gerado por Owlfund em ${now}. Apenas para referência pessoal.`, 15, 287);

                doc.save(`owlfund-portfolio-${new Date().toISOString().slice(0, 10)}.pdf`);
              }}
              className="flex items-center gap-2 rounded-xl border border-orange-500/40 px-4 py-2 text-sm font-semibold text-orange-300 hover:bg-orange-500/10 transition"
            >
              ↓ Exportar PDF
            </button>
          </div>

          {!advancedMetrics ? (
            <div className="rounded-xl border border-dashed border-slate-700 p-6 text-center">
              <p className="text-sm text-slate-400">Precisas de pelo menos <strong className="text-white">2 snapshots</strong> para calcular métricas avançadas.</p>
              <p className="text-xs text-slate-500 mt-1">Guarda snapshots periodicamente na secção abaixo.</p>
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
                  hint: "Retorno anual",
                }] : []),
                ...(advancedMetrics.sharpe !== null ? [{
                  label: "Sharpe",
                  value: advancedMetrics.sharpe.toFixed(2),
                  color: advancedMetrics.sharpe >= 1 ? "text-emerald-400" : advancedMetrics.sharpe >= 0 ? "text-orange-300" : "text-rose-400",
                  hint: ">1 = bom",
                }] : []),
                {
                  label: "Max Drawdown",
                  value: `${advancedMetrics.maxDrawdown.toFixed(2)}%`,
                  color: "text-rose-400",
                  hint: "Queda máxima",
                },
                ...(advancedMetrics.volatility !== null ? [{
                  label: "Volatilidade",
                  value: `${advancedMetrics.volatility.toFixed(2)}%`,
                  color: "text-orange-300",
                  hint: "Anualizada",
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
        </section>

        <section className="grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <h2 className="text-lg font-semibold text-white">Carteiras Blockchain</h2>
            <p className="text-sm text-slate-400">
              {t("port_total_assets")}: € {formatValue(cryptoTotal)}
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
            <h2 className="text-lg font-semibold text-white">Carteiras Tradicional</h2>
            <p className="text-sm text-slate-400">
              Ativos totais: € {formatValue(traditionalTotal)}
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
                      <span>€ {formatValue(item.value)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-orange-500/20 bg-slate-900/60 p-6">
          <h2 className="text-lg font-semibold text-white">Snapshots e Plano</h2>
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
                  className="rounded-full bg-orange-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-orange-400"
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
                    {isBillingLoading ? "A iniciar..." : "✨ Ativar plano Pro"}
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
              <h2 className="text-lg font-semibold text-white">Histórico do portfólio</h2>
              <p className="text-sm text-slate-400">
                {isPremium ? "Histórico ilimitado (Plano Premium)." : isPro ? "Últimos 365 dias de snapshots (Plano Pro)." : <>Últimos 30 dias (Plano Gratuito). <a href="/pricing" className="text-orange-400 underline hover:text-orange-300">Pro = 1 ano →</a></>}
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
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Simulação</p>
            <h2 className="text-base font-bold text-white mt-0.5">Simulador de cenários</h2>
            <p className="text-xs text-slate-400 mt-0.5">Vê o impacto de variações de preço no teu portfólio em tempo real.</p>
          </div>
          {portfolioTotal <= 0 ? (
            <p className="text-sm text-slate-500">Adiciona ativos para usar o simulador.</p>
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
        <section className="rounded-2xl border border-orange-500/20 bg-orange-50 dark:bg-gradient-to-br dark:from-orange-500/10 dark:via-slate-900 dark:to-slate-950 p-6">
          <div className="mb-4">
            <p className="text-xs uppercase tracking-[0.2em] text-orange-600 dark:text-orange-300/80">Inteligência Artificial</p>
            <h2 className="mt-1 text-base font-bold text-slate-900 dark:text-white">Analisa o teu portfólio</h2>
            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
              A IA tem acesso aos teus dados reais — totais, PNL, distribuição e métricas avançadas.
            </p>
          </div>

          {/* Sugestões rápidas */}
          <div className="flex flex-wrap gap-2 mb-4">
            {[
              "Porque caiu o meu portfólio esta semana?",
              "O meu portfólio está bem diversificado?",
              "Como interpretar o meu Sharpe Ratio?",
              "Quais os principais riscos do meu portfólio?",
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
                        body: JSON.stringify({ question: aiQuestion.trim(), context }),
                      });
                      const data = (await res.json()) as { reply?: string; error?: string };
                      if (!res.ok || data.error) { setAiError(data.error ?? "Erro."); return; }
                      setAiReply(data.reply ?? "");
                    } catch (err) {
                      setAiError(err instanceof Error ? err.message : "Erro.");
                    } finally {
                      setAiLoading(false);
                    }
                  })();
                }
              }}
              placeholder="Pergunta sobre o teu portfólio… (Enter para enviar)"
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
                    body: JSON.stringify({ question: aiQuestion.trim(), context }),
                  });
                  const data = (await res.json()) as { reply?: string; error?: string };
                  if (!res.ok || data.error) { setAiError(data.error ?? "Erro."); return; }
                  setAiReply(data.reply ?? "");
                } catch (err) {
                  setAiError(err instanceof Error ? err.message : "Erro.");
                } finally {
                  setAiLoading(false);
                }
              }}
              className="rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-bold text-slate-950 hover:bg-orange-400 disabled:opacity-50 transition"
            >
              {aiLoading ? "…" : "Perguntar"}
            </button>
          </div>

          {aiLoading && (
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400 animate-pulse">A analisar o teu portfólio…</p>
          )}
          {aiError && (
            <p className="mt-3 text-xs text-rose-500 dark:text-rose-400">{aiError}</p>
          )}
          {aiReply && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/80">
              <p className="text-xs text-orange-500 dark:text-orange-300/80 font-semibold mb-2">🦉 Owl</p>
              <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">{aiReply}</p>
            </div>
          )}
        </section>

      </main>
    </div>
    </AppShell>
  );
}
