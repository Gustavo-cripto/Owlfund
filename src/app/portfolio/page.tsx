"use client";

import { useEffect, useMemo, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";

import AppHeader from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/client";
import { loadWalletSnapshot } from "@/lib/wallets/storage";
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

type WalletSnapshot = {
  eth?: { address?: string; balance?: string };
  sol?: { address?: string; balance?: string };
  btc?: { address?: string; balance?: string };
  ada?: { address?: string; balance?: string };
};

type SnapshotRow = {
  id: number;
  created_at: string;
  data: WalletSnapshot;
};

const snapshotToWallets = (snapshot: WalletSnapshot): WalletBalance[] => [
  {
    label: "Ethereum",
    symbol: "ETH",
    balance: snapshot.eth?.balance,
    address: snapshot.eth?.address,
  },
  {
    label: "Solana",
    symbol: "SOL",
    balance: snapshot.sol?.balance,
    address: snapshot.sol?.address,
  },
  {
    label: "Bitcoin",
    symbol: "BTC",
    balance: snapshot.btc?.balance,
    address: snapshot.btc?.address,
  },
  {
    label: "Cardano",
    symbol: "ADA",
    balance: snapshot.ada?.balance,
    address: snapshot.ada?.address,
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
        // Se existir algo salvo na nuvem, mostramos isso (é sempre privado do user).
        setWallets(snapshotToWallets(latest.data));
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
            <h2 className="text-lg font-semibold text-white">Cripto</h2>
            <p className="text-sm text-slate-400">Saldos das carteiras conectadas</p>
            <div className="mt-6 space-y-4">
              {wallets.map((wallet) => (
                <div
                  key={wallet.symbol}
                  className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-950/60 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-semibold text-white">{wallet.label}</p>
                    <p className="text-xs text-slate-500">{formatAddress(wallet.address)}</p>
                  </div>
                  <div className="text-sm font-semibold text-orange-200">
                    {wallet.balance ?? "—"} {wallet.symbol}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <h2 className="text-lg font-semibold text-white">Resumo</h2>
            <div className="mt-6 space-y-4">
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                  Total cripto
                </p>
                <p className="mt-2 text-2xl font-semibold text-white">
                  {cryptoTotal.toFixed(4)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                  Tradicional
                </p>
                <p className="mt-2 text-sm text-slate-400">
                  Em breve: ações, ETFs e renda fixa.
                </p>
              </div>
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
