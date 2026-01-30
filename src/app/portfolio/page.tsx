"use client";

import { useEffect, useMemo, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";

import AppHeader from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/client";
import { loadWalletSnapshot, type StoredWalletEntry, type WalletSnapshot } from "@/lib/wallets/storage";
import { useRequireAuth } from "@/lib/auth/useRequireAuth";

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

const sumEntries = (entries?: StoredWalletEntry[]) =>
  (entries ?? []).reduce((sum, entry) => {
    const value = Number(entry.balance ?? 0);
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);

const snapshotTotal = (snapshot: WalletSnapshot) =>
  sumEntries(snapshot.eth) +
  sumEntries(snapshot.sol) +
  sumEntries(snapshot.btc) +
  sumEntries(snapshot.ada);

const snapshotToWallets = (snapshot: WalletSnapshot): WalletBalance[] => [
  {
    label: "Ethereum",
    symbol: "ETH",
    balance: sumEntries(snapshot.eth).toFixed(4),
    address: snapshot.eth?.[0]?.address,
  },
  {
    label: "Solana",
    symbol: "SOL",
    balance: sumEntries(snapshot.sol).toFixed(4),
    address: snapshot.sol?.[0]?.address,
  },
  {
    label: "Bitcoin",
    symbol: "BTC",
    balance: sumEntries(snapshot.btc).toFixed(4),
    address: snapshot.btc?.[0]?.address,
  },
  {
    label: "Cardano",
    symbol: "ADA",
    balance: sumEntries(snapshot.ada).toFixed(4),
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

const getPercent = (value: number, total: number) => {
  if (!total || total <= 0) return 0;
  return Math.round((value / total) * 100);
};

export default function PortfolioPage() {
  const supabase = createClient();
  useRequireAuth("/login");
  const [wallets, setWallets] = useState<WalletBalance[]>([]);
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([]);
  const [isSnapshotsLoading, setIsSnapshotsLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isPro, setIsPro] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isBillingLoading, setIsBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    const snapshot = loadWalletSnapshot();
    setWallets(snapshotToWallets(snapshot as WalletSnapshot));
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
          // Se existir algo salvo na nuvem, mostramos isso (é sempre privado do user).
          setWallets(snapshotToWallets(latest.data));
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

  const cryptoTotal = useMemo(() => sumCrypto(wallets), [wallets]);
  const stablecoinTotal = 0;
  const traditionalTotal = 0;
  const portfolioTotal = cryptoTotal + stablecoinTotal + traditionalTotal;
  const pnlTotal = 0;

  const cryptoAllocations = useMemo(() => {
    const items = [
      ...wallets.map((wallet) => ({
        label: wallet.label,
        symbol: wallet.symbol,
        value: toNumber(wallet.balance),
      })),
      { label: "Stablecoins", symbol: "USDT/USDC", value: stablecoinTotal },
    ];
    const total = items.reduce((sum, item) => sum + item.value, 0);
    return items.map((item) => ({
      ...item,
      percent: getPercent(item.value, total),
    }));
  }, [wallets, stablecoinTotal]);

  const traditionalAllocations = useMemo(() => {
    const items = [
      { label: "Ações EUA", value: 0 },
      { label: "Ações Europa", value: 0 },
      { label: "Ações Emergentes", value: 0 },
      { label: "ETFs", value: 0 },
      { label: "Renda fixa", value: 0 },
      { label: "Imobiliário", value: 0 },
      { label: "Commodities", value: 0 },
      { label: "Ouro", value: 0 },
      { label: "Prata", value: 0 },
      { label: "Energia", value: 0 },
      { label: "Caixa", value: 0 },
      { label: "Outros", value: 0 },
    ];
    const total = items.reduce((sum, item) => sum + item.value, 0);
    return items.map((item) => ({
      ...item,
      percent: getPercent(item.value, total),
    }));
  }, []);

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
                  {pnlTotal >= 0 ? "+" : "-"} € {formatValue(Math.abs(pnlTotal))}
                </p>
              </div>
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
                    className="h-full rounded-full bg-slate-400"
                    style={{ width: `${portfolioSplit.traditional}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

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
              {traditionalAllocations.map((item) => (
                <div key={item.label} className="space-y-2">
                  <div className="flex items-center justify-between text-sm text-slate-300">
                    <span>{item.label}</span>
                    <span>{item.percent}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-slate-400"
                      style={{ width: `${item.percent}%` }}
                    />
                  </div>
                </div>
              ))}
              <p className="text-xs text-slate-500">
                Em breve: ações, ETFs, renda fixa e outros ativos tradicionais.
              </p>
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
