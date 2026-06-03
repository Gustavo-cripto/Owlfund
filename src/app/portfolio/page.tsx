"use client";

import { useEffect, useMemo, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";

import AppHeader from "@/components/AppHeader";
import PnlSummaryCard from "@/components/PnlSummaryCard";
import { createClient } from "@/lib/supabase/client";
import { loadWalletSnapshot, type StoredWalletEntry, type WalletSnapshot } from "@/lib/wallets/storage";
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

type TokenPrices = Record<string, number>; // symbol → EUR price

async function fetchTokenPricesEur(): Promise<TokenPrices> {
  try {
    const ids = Object.values(COINGECKO_IDS).join(",");
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=eur`,
      { cache: "no-store" }
    );
    if (!res.ok) return {};
    const data = await res.json();
    const prices: TokenPrices = {};
    for (const [symbol, id] of Object.entries(COINGECKO_IDS)) {
      prices[symbol] = data[id]?.eur ?? 0;
    }
    return prices;
  } catch {
    return {};
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
  {
    label: "Ethereum",
    symbol: "ETH",
    balance: (sumEntries(snapshot.eth) * (prices.ETH ?? 0)).toFixed(2),
    address: snapshot.eth?.[0]?.address,
  },
  {
    label: "Solana",
    symbol: "SOL",
    balance: (sumEntries(snapshot.sol) * (prices.SOL ?? 0)).toFixed(2),
    address: snapshot.sol?.[0]?.address,
  },
  {
    label: "Bitcoin",
    symbol: "BTC",
    balance: (sumEntries(snapshot.btc) * (prices.BTC ?? 0)).toFixed(2),
    address: snapshot.btc?.[0]?.address,
  },
  {
    label: "Cardano",
    symbol: "ADA",
    balance: (sumEntries(snapshot.ada) * (prices.ADA ?? 0)).toFixed(2),
    address: snapshot.ada?.[0]?.address,
  },
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

const getPercent = (value: number, total: number) => {
  if (!total || total <= 0) return 0;
  return Math.round((value / total) * 100);
};

export default function PortfolioPage() {
  const supabase = createClient();
  useRequireAuth("/login");
  const [wallets, setWallets] = useState<WalletBalance[]>([]);
  const [tokenPrices, setTokenPrices] = useState<TokenPrices>({});
  const [traditionalHoldings, setTraditionalHoldings] = useState<TraditionalHoldings>({});
  const [cryptoHoldings, setCryptoHoldings] = useState<CryptoHoldings>({});
  const [stablecoinEntries, setStablecoinEntries] = useState<StablecoinEntry[]>([]);
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([]);
  const [isSnapshotsLoading, setIsSnapshotsLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isPro, setIsPro] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isBillingLoading, setIsBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Buscar preços EUR ao carregar
  useEffect(() => {
    fetchTokenPricesEur().then((prices) => {
      setTokenPrices(prices);
      const snapshot = loadWalletSnapshot();
      setWallets(snapshotToWallets(snapshot as WalletSnapshot, prices));
    });
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
        .select("status, current_period_end")
        .eq("user_id", user.id)
        .order("current_period_end", { ascending: false })
        .limit(1)
        .maybeSingle<SubscriptionStatus>();

      const isActive =
        subscription?.status === "active" || subscription?.status === "trialing";
      const periodEnd = subscription?.current_period_end
        ? new Date(subscription.current_period_end).getTime()
        : null;

      const pro = isActive && (!periodEnd || periodEnd > Date.now());
      setIsPro(pro);

      setIsSnapshotsLoading(true);

      const { data: snapshotRows } = await supabase
        .from("portfolio_snapshots")
        .select("id, created_at, data")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10);

      const rows = (snapshotRows ?? []) as SnapshotRow[];
      setSnapshots(rows);

      const latest = rows[0];
      if (latest?.data) {
        const localSnapshot = loadWalletSnapshot();
        const latestTotal = snapshotTotal(latest.data);
        const localTotal = snapshotTotal(localSnapshot);
        if (latestTotal > 0 || localTotal === 0) {
          setWallets(snapshotToWallets(latest.data, tokenPrices));
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

  const handleSaveSnapshot = async () => {
    if (!userId) return;
    setSaveMessage(null);

    const snapshot = loadWalletSnapshot();
    const { error } = await supabase
      .from("portfolio_snapshots")
      .insert({ user_id: userId, data: snapshot });

    if (error) {
      setSaveMessage("Não foi possível salvar o portfólio.");
      return;
    }

    setSaveMessage("Portfólio salvo com sucesso.");

    const { data: snapshotRows } = await supabase
      .from("portfolio_snapshots")
      .select("id, created_at, data")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);

    setSnapshots((snapshotRows ?? []) as SnapshotRow[]);
  };

  const handleRestoreSnapshot = (row: SnapshotRow) => {
    setWallets(snapshotToWallets(row.data));
    setSaveMessage(`Snapshot de ${new Date(row.created_at).toLocaleString("pt-BR")} carregado.`);
  };

  const manualCryptoTotal = useMemo(() => {
    return Object.values(cryptoHoldings).reduce((sum, holding) => {
      const value = Number(holding.buyValue ?? 0);
      return Number.isFinite(value) ? sum + value : sum;
    }, 0);
  }, [cryptoHoldings]);

  const cryptoTotal = useMemo(() => sumCrypto(wallets) + manualCryptoTotal, [wallets, manualCryptoTotal]);
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
      .map((row) => ({
        id: row.id,
        createdAt: new Date(row.created_at).getTime(),
        total: snapshotTotal(row.data, tokenPrices) + manualTotals,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [snapshots, manualTotals, tokenPrices]);

  const pnlSummary = useMemo(() => {
    if (snapshotTotals.length === 0) {
      return { position: 0, today: 0, days30: 0, daily7d: 0 };
    }

    const now = Date.now();
    const currentTotal = portfolioTotal;
    const oldest = snapshotTotals[snapshotTotals.length - 1];
    const baseTotal = oldest?.total ?? currentTotal;

    const dayMs = 24 * 60 * 60 * 1000;
    const snapshotToday = snapshotTotals.find((row) => row.createdAt <= now - dayMs);
    const snapshot30d = snapshotTotals.find((row) => row.createdAt <= now - 30 * dayMs);
    const snapshot7d = snapshotTotals.find((row) => row.createdAt <= now - 7 * dayMs);

    const position = currentTotal - baseTotal;
    const today = snapshotToday ? currentTotal - snapshotToday.total : 0;
    const days30 = snapshot30d ? currentTotal - snapshot30d.total : 0;
    const daily7d = snapshot7d ? (currentTotal - snapshot7d.total) / 7 : 0;

    return { position, today, days30, daily7d };
  }, [snapshotTotals, portfolioTotal]);

  const pnlTotal = pnlSummary.position;

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
    ];
    const total = items.reduce((sum, item) => sum + item.value, 0);
    return items.map((item) => ({
      ...item,
      percent: getPercent(item.value, total),
    }));
  }, [wallets, stablecoinTotal, cryptoHoldings]);

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

  const portfolioSplit = useMemo(() => {
    const total = cryptoTotal + traditionalTotal;
    return {
      crypto: getPercent(cryptoTotal, total),
      traditional: getPercent(traditionalTotal, total),
    };
  }, [cryptoTotal, traditionalTotal]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <AppHeader variant="app" subtitle="Portfolio" />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 pb-20 pt-2">
        <div className="flex flex-col gap-4">
          <h1 className="text-3xl font-semibold text-white">Portfolio</h1>
          <p className="max-w-2xl text-sm text-slate-400">
            Visão consolidada de cripto e tradicional. Os saldos de cripto são
            sincronizados a partir da página de carteiras.
          </p>
        </div>

        <section className="grid gap-6 md:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-orange-300/80">
              Visão geral
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-white">Total do portfólio</h2>
            <div className="mt-4 flex flex-wrap items-end gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                  Valor total
                </p>
                <p className="mt-2 text-3xl font-semibold text-white">
                  € {formatValue(portfolioTotal)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">PNL</p>
                <p
                  className={`mt-2 text-lg font-semibold ${
                    pnlTotal >= 0 ? "text-emerald-300" : "text-rose-300"
                  }`}
                >
                  {formatSignedCurrency(pnlTotal)}
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              <div className="flex items-center justify-between text-sm text-slate-300">
                <span>PNL da posição</span>
                <span
                  className={pnlSummary.position >= 0 ? "text-emerald-300" : "text-rose-300"}
                >
                  {formatSignedCurrency(pnlSummary.position)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm text-slate-300">
                <span>PNL de hoje</span>
                <span className={pnlSummary.today >= 0 ? "text-emerald-300" : "text-rose-300"}>
                  {formatSignedCurrency(pnlSummary.today)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm text-slate-300">
                <span>PNL 30 dias</span>
                <span
                  className={pnlSummary.days30 >= 0 ? "text-emerald-300" : "text-rose-300"}
                >
                  {formatSignedCurrency(pnlSummary.days30)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm text-slate-300">
                <span>PNL diário (7 dias)</span>
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
                  <span>Carteiras Blockchain</span>
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
                  <span>Carteiras Tradicional</span>
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
                  <p className="text-sm font-semibold text-white">Carteiras Blockchain</p>
                  <p className="text-xs text-slate-500">
                    € {formatValue(cryptoTotal)} · {portfolioSplit.crypto}%
                  </p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <p className="text-sm font-semibold text-white">Carteiras Tradicional</p>
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

        <section className="grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <h2 className="text-lg font-semibold text-white">Carteiras Blockchain</h2>
            <p className="text-sm text-slate-400">
              Ativos totais: € {formatValue(cryptoTotal)}
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
          <h2 className="text-lg font-semibold text-white">Plano Owlfund</h2>
          {isLoadingAuth ? (
            <p className="mt-2 text-sm text-slate-400">A carregar acesso...</p>
          ) : userId ? (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-slate-300">
                {isPro
                  ? "Plano ativo. Pode salvar e consultar o portfólio na nuvem."
                  : "Plano Free. Assina para desbloquear portfólio cloud e alertas."}
              </p>
              {billingError ? (
                <p className="text-sm text-rose-300">{billingError}</p>
              ) : null}
              <div className="flex flex-col gap-3 sm:flex-row">
                {isPro ? (
                  <button
                    className="rounded-full border border-orange-400/40 px-6 py-3 text-sm font-semibold text-orange-200 transition hover:border-orange-400 hover:text-white"
                    onClick={handleSaveSnapshot}
                    type="button"
                  >
                    Salvar portfólio na nuvem
                  </button>
                ) : (
                  <button
                    className="rounded-full bg-orange-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-70"
                    onClick={handleCheckout}
                    type="button"
                    disabled={isBillingLoading}
                  >
                    {isBillingLoading ? "A iniciar..." : "Ativar plano Pro"}
                  </button>
                )}
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
                Últimos snapshots salvos na nuvem (por utilizador).
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
            <p className="mt-4 text-sm text-slate-400">A carregar histórico...</p>
          ) : snapshots.length === 0 ? (
            <p className="mt-4 text-sm text-slate-400">
              Ainda não tens snapshots salvos. Salva um para aparecer aqui.
            </p>
          ) : (
            <div className="mt-6 space-y-3">
              {snapshots.map((row) => (
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
                    onClick={() => handleRestoreSnapshot(row)}
                    className="rounded-full border border-orange-400/40 px-4 py-2 text-xs font-semibold text-orange-200 transition hover:border-orange-400 hover:text-white"
                  >
                    Restaurar
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
