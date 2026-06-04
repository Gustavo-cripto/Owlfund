"use client";

import { useEffect, useState } from "react";
import ChatWidget from "@/components/ChatWidget";
import AppHeader from "@/components/AppHeader";
import PnlSummaryCard from "@/components/PnlSummaryCard";
import { useRequireAuth } from "@/lib/auth/useRequireAuth";
import { loadWalletSnapshot, type WalletSnapshot } from "@/lib/wallets/storage";
import { createClient } from "@/lib/supabase/client";

// CoinGecko IDs para preços EUR
const COINGECKO_IDS: Record<string, string> = {
  ETH: "ethereum",
  SOL: "solana",
  BTC: "bitcoin",
  ADA: "cardano",
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
  } catch {
    return {};
  }
}

const sumEntries = (entries?: WalletSnapshot["eth"]) =>
  (entries ?? []).reduce((s, e) => s + (Number(e.balance ?? 0) || 0), 0);

const calcTotal = (snapshot: WalletSnapshot, prices: TokenPrices) =>
  sumEntries(snapshot.eth) * (prices.ETH ?? 0) +
  sumEntries(snapshot.sol) * (prices.SOL ?? 0) +
  sumEntries(snapshot.btc) * (prices.BTC ?? 0) +
  sumEntries(snapshot.ada) * (prices.ADA ?? 0);

type SnapshotRow = { id: number; created_at: string; data: WalletSnapshot };

const GUIDE = [
  {
    icon: "📊",
    title: "Dashboard",
    subtitle: "Estás aqui",
    description: "O teu centro de controlo. Acessa rapidamente todas as secções, vê o resumo do PNL e fala com o assistente de mercado.",
    href: null,
    color: "border-orange-500/40 bg-orange-500/5",
  },
  {
    icon: "💼",
    title: "Portfolio",
    subtitle: "/portfolio",
    description: "Visão consolidada de todos os teus ativos — cripto e tradicional. Vê o total investido, PNL da posição, distribuição e evolução histórica.",
    href: "/portfolio",
    color: "border-slate-700 bg-slate-900/60",
  },
  {
    icon: "🔗",
    title: "Carteiras Blockchain",
    subtitle: "/wallets",
    description: "Conecta as tuas carteiras Bitcoin, Ethereum, Solana e Cardano. Vê saldos, tokens, posições DeFi e NFTs — tudo sem nunca partilhar chaves privadas.",
    href: "/wallets",
    color: "border-slate-700 bg-slate-900/60",
  },
  {
    icon: "🌍",
    title: "Mercado",
    subtitle: "/mercado",
    description: "Tabela em tempo real com preços, variações 1h/24h/7d, volume e sparklines. Acompanha as tendências e toma decisões informadas.",
    href: "/mercado",
    color: "border-slate-700 bg-slate-900/60",
  },
  {
    icon: "🕵️",
    title: "Smart Money",
    subtitle: "/smart-money",
    description: "Acompanha carteiras de baleias e traders profissionais. Vê os seus holdings, movimentos recentes e estratégias em tempo real.",
    href: "/smart-money",
    color: "border-slate-700 bg-slate-900/60",
  },
  {
    icon: "📋",
    title: "Fiscalidade",
    subtitle: "/fiscalidade",
    description: "Calcula mais-valias cripto por FIFO com regras fiscais de PT, ES, FR e DE. Exporta CSV para o IRS com um clique.",
    href: "/fiscalidade",
    color: "border-slate-700 bg-slate-900/60",
  },
  {
    icon: "🔥",
    title: "FIRE Calculator",
    subtitle: "/fire",
    description: "Calcula quando podes ser financeiramente livre. Projeção de patrimônio, regra dos 4%, planeamento patrimonial por categorias.",
    href: "/fire",
    color: "border-slate-700 bg-slate-900/60",
  },
  {
    icon: "⚙️",
    title: "Conta",
    subtitle: "/account",
    description: "Gere o teu perfil, preferências de moeda e plano de subscrição. Ativa o plano Pro para sincronização entre dispositivos.",
    href: "/account",
    color: "border-slate-700 bg-slate-900/60",
  },
];

const TIPS = [
  { emoji: "🔑", text: "Nunca precisas de dar chaves privadas — as carteiras são conectadas apenas em modo leitura." },
  { emoji: "📸", text: "Guarda um snapshot no Portfolio para começar a acompanhar o PNL histórico ao longo do tempo." },
  { emoji: "💱", text: "Todos os valores são apresentados em EUR por defeito. Podes alterar na página Conta." },
  { emoji: "🤖", text: "Usa o Chat de Mercado aqui no Dashboard para perguntar sobre cripto, macro e tendências." },
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

  useEffect(() => {
    const loadPnl = async () => {
      setIsPnlLoading(true);
      try {
        const snapshot = loadWalletSnapshot();
        const hasAny =
          (snapshot.eth?.length ?? 0) +
          (snapshot.sol?.length ?? 0) +
          (snapshot.btc?.length ?? 0) +
          (snapshot.ada?.length ?? 0) > 0;
        setHasWallets(hasAny);
        if (!hasAny) { setIsPnlLoading(false); return; }

        const prices = await fetchPrices();
        const total = calcTotal(snapshot, prices);
        setCurrentTotal(total);

        // Buscar snapshots históricos do Supabase
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

        // PNL de hoje: snapshot mais próximo de 24h atrás
        const snap24h = snapshots.find(
          (s) => now - new Date(s.created_at).getTime() >= 20 * 3600 * 1000
        );
        if (snap24h) {
          const prev = calcTotal(snap24h.data, prices);
          setPnlToday(total - prev);
        }

        // PNL 30 dias: snapshot mais próximo de 30 dias atrás
        const snap30d = snapshots.find(
          (s) => now - new Date(s.created_at).getTime() >= 28 * 24 * 3600 * 1000
        );
        if (snap30d) {
          const prev = calcTotal(snap30d.data, prices);
          setPnl30d(total - prev);
        }

        // PNL 7 dias: diferença média diária
        const snap7d = snapshots.find(
          (s) => now - new Date(s.created_at).getTime() >= 6 * 24 * 3600 * 1000
        );
        if (snap7d) {
          const prev = calcTotal(snap7d.data, prices);
          setPnlDaily7d((total - prev) / 7);
        }

        // PNL posição: vs snapshot mais antigo disponível
        const oldest = snapshots[snapshots.length - 1];
        if (oldest) {
          const prev = calcTotal(oldest.data, prices);
          setPnlPosition(total - prev);
        }
      } catch {
        // silencioso
      } finally {
        setIsPnlLoading(false);
      }
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

  const pnlMetrics = hasWallets
    ? [
        { label: "Total portfólio", value: `€ ${currentTotal.toLocaleString("pt-PT", { maximumFractionDigits: 0 })}` },
        { label: "Carteiras ligadas", value: "✓" },
        { label: "Atualização", value: "ao vivo" },
      ]
    : undefined;

  return (
    <div className="relative min-h-screen bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full bg-orange-500/6 blur-[100px]" />
      </div>

      <div className="relative z-10">
        <AppHeader variant="app" subtitle="Dashboard" />

        <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 pb-24 pt-6">

          {/* Quick nav + PNL */}
          <section className="grid gap-6 md:grid-cols-[1.2fr_0.8fr] md:items-start">
            <div className="animate-fade-in-up rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-300/80">Acesso rápido</p>
              <h1 className="mt-2 text-2xl font-bold text-white">Painel Owlfund</h1>
              <p className="mt-1 text-sm text-slate-400">O teu centro de controlo de investimentos.</p>
              <div className="mt-5 flex flex-wrap gap-2.5">
                <a href="/portfolio" className="rounded-full bg-orange-500 px-5 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-orange-400 hover:scale-[1.04] active:scale-[0.97]">
                  💼 Portfolio
                </a>
                <a href="/wallets" className="rounded-full border border-orange-400/40 px-5 py-2.5 text-sm font-semibold text-orange-200 transition hover:border-orange-400 hover:text-white hover:scale-[1.03]">
                  🔗 Carteiras
                </a>
                <a href="/smart-money" className="rounded-full border border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-orange-400/40 hover:text-orange-200 hover:scale-[1.03]">
                  🕵️ Smart Money
                </a>
                <a href="/mercado" className="rounded-full border border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white hover:scale-[1.03]">
                  🌍 Mercado
                </a>
                <a href="/fiscalidade" className="rounded-full border border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-orange-400/40 hover:text-orange-200 hover:scale-[1.03]">
                  📋 Impostos
                </a>
                <a href="/fire" className="rounded-full border border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-orange-400/40 hover:text-orange-200 hover:scale-[1.03]">
                  🔥 FIRE
                </a>
                <a href="/account" className="rounded-full border border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white hover:scale-[1.03]">
                  ⚙️ Conta
                </a>
              </div>
            </div>

            {isPnlLoading ? (
              <div className="rounded-3xl border border-orange-500/20 bg-gradient-to-br from-orange-500/20 via-slate-900 to-slate-950 p-6 flex items-center justify-center min-h-[200px]">
                <p className="text-sm text-slate-400 animate-pulse">A calcular PNL...</p>
              </div>
            ) : !hasWallets ? (
              <div className="rounded-3xl border border-slate-700 bg-slate-900/60 p-6 flex flex-col items-center justify-center gap-3 min-h-[200px] text-center">
                <span className="text-3xl">🔗</span>
                <p className="text-sm font-semibold text-white">Adiciona carteiras para ver o PNL</p>
                <p className="text-xs text-slate-400">Vai a Carteiras e adiciona os teus endereços blockchain.</p>
                <a href="/wallets" className="mt-2 rounded-full bg-orange-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-orange-400">
                  Adicionar carteiras →
                </a>
              </div>
            ) : (
              <PnlSummaryCard
                position={pnlPosition}
                today={pnlToday}
                days30={pnl30d}
                daily7d={pnlDaily7d}
                metrics={pnlMetrics}
              />
            )}
          </section>

          {/* How it works guide */}
          <section>
            <div className="mb-6">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-300/80">Guia da plataforma</p>
              <h2 className="mt-2 text-xl font-bold text-white">Como funciona o Owlfund</h2>
              <p className="mt-1 text-sm text-slate-400">Cada secção tem um propósito claro. Clica para explorar.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {GUIDE.map((item, i) => {
                const content = (
                  <div className={`card-hover rounded-2xl border p-5 animate-fade-in-up delay-${Math.min(i * 100, 500)} ${item.color} ${item.href ? "cursor-pointer" : ""}`}>
                    <div className="flex items-start justify-between">
                      <span className="text-2xl">{item.icon}</span>
                      {item.href && <span className="text-[10px] text-slate-600 font-mono tracking-wider">{item.subtitle}</span>}
                      {!item.href && <span className="rounded-full border border-orange-500/40 px-2 py-0.5 text-[10px] font-bold text-orange-400 uppercase tracking-wider">Aqui</span>}
                    </div>
                    <h3 className="mt-3 text-sm font-bold text-white">{item.title}</h3>
                    <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">{item.description}</p>
                    {item.href && (
                      <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-orange-400 group-hover:gap-2 transition-all">Abrir <span>→</span></span>
                    )}
                  </div>
                );
                return item.href ? <a key={item.title} href={item.href} className="group">{content}</a> : <div key={item.title}>{content}</div>;
              })}
            </div>
          </section>

          {/* Tips + Chat */}
          <section className="grid gap-6 md:grid-cols-[1fr_1.1fr] md:items-start">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-300/80 mb-4">Dicas importantes</p>
              <div className="space-y-4">
                {TIPS.map((tip) => (
                  <div key={tip.text} className="flex gap-3">
                    <span className="text-lg flex-shrink-0">{tip.emoji}</span>
                    <p className="text-sm text-slate-300 leading-relaxed">{tip.text}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-300/80">Chat de mercado</p>
              <p className="text-sm text-slate-400">Pergunta sobre cripto, ações, macro ou tendências. A IA responde em tempo real.</p>
              <ChatWidget />
            </div>
          </section>

        </main>
      </div>
    </div>
  );
}
