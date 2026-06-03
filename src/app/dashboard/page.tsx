"use client";

import ChatWidget from "@/components/ChatWidget";
import AppHeader from "@/components/AppHeader";
import PnlSummaryCard from "@/components/PnlSummaryCard";
import { useRequireAuth } from "@/lib/auth/useRequireAuth";

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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <p className="text-sm text-slate-400 animate-pulse">A carregar dashboard...</p>
      </div>
    );
  }

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
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-300/80">Acesso rápido</p>
              <h1 className="mt-2 text-2xl font-bold text-white">Painel Owlfund</h1>
              <p className="mt-1 text-sm text-slate-400">O teu centro de controlo de investimentos.</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <a href="/portfolio" className="rounded-full bg-orange-500 px-5 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-orange-400">
                  💼 Portfolio
                </a>
                <a href="/wallets" className="rounded-full border border-orange-400/40 px-5 py-2.5 text-sm font-semibold text-orange-200 transition hover:border-orange-400 hover:text-white">
                  🔗 Carteiras
                </a>
                <a href="/mercado" className="rounded-full border border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white">
                  🌍 Mercado
                </a>
                <a href="/account" className="rounded-full border border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white">
                  ⚙️ Conta
                </a>
              </div>
            </div>
            <PnlSummaryCard position={2150} today={120} days30={480} daily7d={-35} />
          </section>

          {/* How it works guide */}
          <section>
            <div className="mb-6">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-300/80">Guia da plataforma</p>
              <h2 className="mt-2 text-xl font-bold text-white">Como funciona o Owlfund</h2>
              <p className="mt-1 text-sm text-slate-400">Cada secção tem um propósito claro. Clica para explorar.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {GUIDE.map((item) => {
                const content = (
                  <div className={`rounded-2xl border p-5 transition ${item.color} ${item.href ? "hover:border-orange-500/40 hover:bg-slate-900 cursor-pointer" : ""}`}>
                    <div className="flex items-start justify-between">
                      <span className="text-2xl">{item.icon}</span>
                      {item.href && <span className="text-xs text-slate-600 font-mono">{item.subtitle}</span>}
                      {!item.href && <span className="rounded-full border border-orange-500/40 px-2 py-0.5 text-xs font-semibold text-orange-400">Aqui</span>}
                    </div>
                    <h3 className="mt-3 text-base font-bold text-white">{item.title}</h3>
                    <p className="mt-1.5 text-sm text-slate-400 leading-relaxed">{item.description}</p>
                    {item.href && (
                      <span className="mt-3 inline-block text-xs font-semibold text-orange-400">Abrir →</span>
                    )}
                  </div>
                );
                return item.href ? <a key={item.title} href={item.href}>{content}</a> : <div key={item.title}>{content}</div>;
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
