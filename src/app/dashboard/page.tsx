"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import PnlSummaryCard from "@/components/PnlSummaryCard";
import { useRequireAuth } from "@/lib/auth/useRequireAuth";
import { loadWalletSnapshot, type WalletSnapshot } from "@/lib/wallets/storage";
import { createClient } from "@/lib/supabase/client";

const COINGECKO_IDS: Record<string, string> = {
  ETH: "ethereum", SOL: "solana", BTC: "bitcoin", ADA: "cardano",
};

type TokenPrices = Record<string, number>;

async function fetchPrices(): Promise<TokenPrices> {
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
  } catch { return {}; }
}

const sumEntries = (entries?: WalletSnapshot["eth"]) =>
  (entries ?? []).reduce((s, e) => s + (Number(e.balance ?? 0) || 0), 0);

const calcTotal = (snapshot: WalletSnapshot, prices: TokenPrices) =>
  sumEntries(snapshot.eth) * (prices.ETH ?? 0) +
  sumEntries(snapshot.sol) * (prices.SOL ?? 0) +
  sumEntries(snapshot.btc) * (prices.BTC ?? 0) +
  sumEntries(snapshot.ada) * (prices.ADA ?? 0);

type SnapshotRow = { id: number; created_at: string; data: WalletSnapshot };

const FEATURES = [
  {
    href: "/portfolio",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2v20M2 12h20" /><circle cx="12" cy="12" r="10" />
      </svg>
    ),
    label: "Portfolio",
    desc: "Visão total dos teus ativos cripto e tradicionais com PNL em tempo real.",
    color: "from-orange-500/20 to-orange-600/5",
    border: "border-orange-500/20",
    iconColor: "text-orange-400",
  },
  {
    href: "/wallets",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" /><path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
        <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
      </svg>
    ),
    label: "Carteiras",
    desc: "Conecta ETH, BTC, SOL, ADA. 15+ redes EVM, DeFi e NFTs incluídos.",
    color: "from-blue-500/20 to-blue-600/5",
    border: "border-blue-500/20",
    iconColor: "text-blue-400",
  },
  {
    href: "/smart-money",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
      </svg>
    ),
    label: "Smart Money",
    desc: "Segue carteiras de baleias e traders profissionais em tempo real.",
    color: "from-purple-500/20 to-purple-600/5",
    border: "border-purple-500/20",
    iconColor: "text-purple-400",
  },
  {
    href: "/mercado",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" />
      </svg>
    ),
    label: "Mercado",
    desc: "Preços ao vivo, variações 1h/24h/7d, volume e sparklines de 500+ ativos.",
    color: "from-emerald-500/20 to-emerald-600/5",
    border: "border-emerald-500/20",
    iconColor: "text-emerald-400",
  },
  {
    href: "/fiscalidade",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
    label: "Impostos",
    desc: "Calcula mais-valias FIFO para PT, ES, FR, DE. Exporta para o IRS.",
    color: "from-yellow-500/20 to-yellow-600/5",
    border: "border-yellow-500/20",
    iconColor: "text-yellow-400",
  },
  {
    href: "/fire",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8.5 14.5A2.5 2.5 0 0 0 11 17c1.4 0 2.5-1.1 2.5-2.5 0-1.8-2.5-5-2.5-5s-2.5 3.2-2.5 5Z" />
        <path d="M12 22c-4.4 0-8-3.6-8-8 0-5 4-10 8-12 4 2 8 7 8 12 0 4.4-3.6 8-8 8Z" />
      </svg>
    ),
    label: "FIRE",
    desc: "Calcula a tua independência financeira. Regra dos 4% e projeção patrimonial.",
    color: "from-rose-500/20 to-rose-600/5",
    border: "border-rose-500/20",
    iconColor: "text-rose-400",
  },
];

const STATS_CONFIG = [
  { label: "Blockchains", value: "15+", sub: "redes suportadas", icon: "🔗" },
  { label: "Segurança", value: "100%", sub: "só leitura", icon: "🔒" },
  { label: "Mercados", value: "24/7", sub: "dados ao vivo", icon: "📡" },
  { label: "Custo", value: "€ 0", sub: "plano gratuito", icon: "✨" },
];

export default function DashboardPage() {
  const { isLoading } = useRequireAuth("/login");
  const supabase = createClient();

  const [pnlPosition, setPnlPosition] = useState(0);
  const [pnlToday, setPnlToday] = useState(0);
  const [pnl30d, setPnl30d] = useState(0);
  const [pnlDaily7d, setPnlDaily7d] = useState(0);
  const [hasWallets, setHasWallets] = useState(false);
  const [currentTotal, setCurrentTotal] = useState(0);
  const [isPnlLoading, setIsPnlLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }: { data: { user: { email?: string } | null } }) => {
      setUserEmail(data.user?.email ?? null);
    });
  }, [supabase]);

  useEffect(() => {
    const loadPnl = async () => {
      setIsPnlLoading(true);
      try {
        const snapshot = loadWalletSnapshot();
        const hasAny =
          (snapshot.eth?.length ?? 0) + (snapshot.sol?.length ?? 0) +
          (snapshot.btc?.length ?? 0) + (snapshot.ada?.length ?? 0) > 0;
        setHasWallets(hasAny);
        if (!hasAny) { setIsPnlLoading(false); return; }

        const prices = await fetchPrices();
        const total = calcTotal(snapshot, prices);
        setCurrentTotal(total);

        const { data: authData } = await supabase.auth.getUser();
        const userId = authData.user?.id;
        if (!userId) { setIsPnlLoading(false); return; }

        const { data: rows } = await supabase
          .from("portfolio_snapshots")
          .select("id, created_at, data")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(30);

        const snapshots = (rows ?? []) as SnapshotRow[];
        const now = Date.now();

        const snap24h = snapshots.find(s => now - new Date(s.created_at).getTime() >= 20 * 3600 * 1000);
        if (snap24h) setPnlToday(total - calcTotal(snap24h.data, prices));

        const snap30d = snapshots.find(s => now - new Date(s.created_at).getTime() >= 28 * 24 * 3600 * 1000);
        if (snap30d) setPnl30d(total - calcTotal(snap30d.data, prices));

        const snap7d = snapshots.find(s => now - new Date(s.created_at).getTime() >= 6 * 24 * 3600 * 1000);
        if (snap7d) setPnlDaily7d((total - calcTotal(snap7d.data, prices)) / 7);

        const oldest = snapshots[snapshots.length - 1];
        if (oldest) setPnlPosition(total - calcTotal(oldest.data, prices));
      } catch { /* silencioso */ }
      finally { setIsPnlLoading(false); }
    };
    loadPnl();
  }, [supabase]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <p className="text-sm text-slate-400 animate-pulse">A carregar dashboard...</p>
      </div>
    );
  }

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Bom dia";
    if (h < 19) return "Boa tarde";
    return "Boa noite";
  };

  const firstName = userEmail?.split("@")[0] ?? "Investidor";

  return (
    <AppShell>
    <div className="relative min-h-screen bg-slate-950 text-slate-100">

      {/* Background glows */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -top-32 left-1/3 w-[700px] h-[400px] rounded-full bg-orange-500/6 blur-[120px]" />
        <div className="absolute top-1/2 right-0 w-[400px] h-[400px] rounded-full bg-blue-500/4 blur-[100px]" />
      </div>

      <div className="relative z-10">
        <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 pb-24 pt-8">

          {/* ── Hero ── */}
          <section className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-300/70 mb-1">
                {greeting()}
              </p>
              <h1 className="text-3xl font-black text-white leading-tight">
                {firstName} 👋
              </h1>
              <p className="mt-1 text-sm text-slate-400">
                O teu centro de controlo de investimentos — cripto e tradicional.
              </p>
            </div>

            {/* PNL card */}
            <div className="md:w-[340px] shrink-0">
              {isPnlLoading ? (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 flex items-center justify-center min-h-[120px]">
                  <p className="text-sm text-slate-500 animate-pulse">A calcular PNL...</p>
                </div>
              ) : !hasWallets ? (
                <div className="rounded-2xl border border-dashed border-orange-500/30 bg-orange-500/5 p-5 flex flex-col items-center gap-3 text-center">
                  <span className="text-2xl">🔗</span>
                  <div>
                    <p className="text-sm font-semibold text-white">Sem carteiras ligadas</p>
                    <p className="text-xs text-slate-400 mt-0.5">Adiciona para ver o teu PNL em tempo real</p>
                  </div>
                  <a href="/wallets" className="rounded-full bg-orange-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-orange-400 transition">
                    Ligar carteiras →
                  </a>
                </div>
              ) : (
                <PnlSummaryCard
                  position={pnlPosition}
                  today={pnlToday}
                  days30={pnl30d}
                  daily7d={pnlDaily7d}
                  metrics={[
                    { label: "Total", value: `€ ${currentTotal.toLocaleString("pt-PT", { maximumFractionDigits: 0 })}` },
                    { label: "Carteiras", value: "✓ ligadas" },
                    { label: "Live", value: "↻ ao vivo" },
                  ]}
                />
              )}
            </div>
          </section>

          {/* ── Stats ── */}
          <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {STATS_CONFIG.map((s) => (
              <div key={s.label} className="rounded-2xl border border-slate-800 bg-slate-900/40 px-5 py-4 flex flex-col gap-1 hover:border-orange-500/30 hover:bg-slate-900/70 transition group">
                <span className="text-2xl">{s.icon}</span>
                <p className="text-2xl font-black text-white mt-1">{s.value}</p>
                <p className="text-xs text-slate-500">{s.sub}</p>
              </div>
            ))}
          </section>

          {/* ── Feature grid ── */}
          <section>
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-300/70">Plataforma</p>
              <h2 className="mt-1.5 text-xl font-bold text-white">Explora todas as secções</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {FEATURES.map((f) => (
                <a
                  key={f.href}
                  href={f.href}
                  className={`group relative rounded-2xl border p-5 bg-gradient-to-br ${f.color} ${f.border} hover:scale-[1.02] hover:shadow-xl hover:shadow-black/30 transition-all duration-200 cursor-pointer`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <span className={`${f.iconColor} transition-transform group-hover:scale-110 duration-200`}>
                      {f.icon}
                    </span>
                    <svg className="text-slate-600 group-hover:text-slate-400 transition" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M7 17L17 7M7 7h10v10" />
                    </svg>
                  </div>
                  <h3 className="text-base font-bold text-white">{f.label}</h3>
                  <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">{f.desc}</p>
                </a>
              ))}
            </div>
          </section>

          {/* ── Security & tips strip ── */}
          <section className="rounded-2xl border border-slate-800 bg-slate-900/40 px-6 py-5">
            <div className="flex flex-wrap gap-6 items-center">
              {[
                { icon: "🔒", text: "Nunca pedimos chaves privadas — só leitura" },
                { icon: "📸", text: "Guarda um snapshot para ver PNL histórico" },
                { icon: "💬", text: "Usa o Chat (ícone no canto) para perguntas de mercado" },
                { icon: "🌍", text: "Valores em EUR por defeito — muda na Conta" },
              ].map((tip) => (
                <div key={tip.text} className="flex items-center gap-2.5 min-w-0">
                  <span className="text-base shrink-0">{tip.icon}</span>
                  <p className="text-xs text-slate-400">{tip.text}</p>
                </div>
              ))}
            </div>
          </section>

        </main>
      </div>
    </div>
    </AppShell>
  );
}
