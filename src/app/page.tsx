"use client";

import { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";
import PnlSummaryCard from "@/components/PnlSummaryCard";
import { createClient } from "@/lib/supabase/client";

const TICKER_DATA = [
  { symbol: "BTC",   price: "€ 91.240", change: "+2,4%", up: true  },
  { symbol: "ETH",   price: "€ 3.180",  change: "+1,8%", up: true  },
  { symbol: "SOL",   price: "€ 148",    change: "-0,6%", up: false },
  { symbol: "ADA",   price: "€ 0,42",   change: "+3,1%", up: true  },
  { symbol: "BNB",   price: "€ 548",    change: "+0,9%", up: true  },
  { symbol: "AAPL",  price: "€ 211",    change: "+0,4%", up: true  },
  { symbol: "NVDA",  price: "€ 876",    change: "+1,2%", up: true  },
  { symbol: "S&P 500", price: "€ 5.248",change: "-0,2%", up: false },
  { symbol: "DOGE",  price: "€ 0,138",  change: "+5,2%", up: true  },
  { symbol: "LINK",  price: "€ 13,40",  change: "+1,1%", up: true  },
  { symbol: "TSLA",  price: "€ 248",    change: "-1,3%", up: false },
  { symbol: "GOLD",  price: "€ 2.890",  change: "+0,3%", up: true  },
];

const FEATURES = [
  { icon: "📊", title: "Portfolio unificado", description: "Cripto e mercado tradicional num só painel. Vê o valor total em segundos." },
  { icon: "🔗", title: "Carteiras Blockchain", description: "Conecta Bitcoin, Ethereum, Solana e Cardano. DeFi e NFTs incluídos." },
  { icon: "📈", title: "PNL em tempo real", description: "Lucro/perda da posição, do dia e dos últimos 30 dias sempre visíveis." },
  { icon: "🌍", title: "Mercado global", description: "Tabela com variações 1h, 24h, 7d e sparklines para decisões rápidas." },
  { icon: "🔒", title: "100% seguro", description: "Leitura apenas — nunca pedimos chaves privadas ou permissões de transação." },
  { icon: "🌙", title: "Interface premium", description: "Tema escuro com destaque laranja. Rápido, limpo e focado nos números." },
];

const STEPS = [
  { num: "01", title: "Cria a tua conta", desc: "Registo gratuito em 30 segundos com email ou Google." },
  { num: "02", title: "Adiciona os teus ativos", desc: "Conecta carteiras blockchain ou adiciona ativos tradicionais manualmente." },
  { num: "03", title: "Acompanha em tempo real", desc: "Dashboard, PNL, mercado e distribuição do portfólio sempre atualizados." },
];

const STATS = [
  { value: "15+", label: "Blockchains suportadas" },
  { value: "€0", label: "Custo para começar" },
  { value: "24/7", label: "Dados de mercado" },
  { value: "100%", label: "Leitura segura" },
];

export default function Home() {
  const supabase = createClient();
  const [isReady, setIsReady] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    let isMounted = true;
    supabase.auth.getSession().then(({ data }: { data: { session: unknown } }) => {
      if (!isMounted) return;
      setIsLoggedIn(!!data.session);
      setIsReady(true);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event: unknown, session: unknown) => {
      setIsLoggedIn(!!session);
      setIsReady(true);
    });
    return () => { isMounted = false; subscription.subscription.unsubscribe(); };
  }, [supabase]);

  const showAppView = isReady && isLoggedIn;

  if (showAppView) {
    return (
      <div className="relative min-h-screen bg-slate-950 text-slate-100">
        <div className="pointer-events-none absolute inset-0 opacity-70" style={{ backgroundImage: "url(/hwvtot_2f4227d5a6869b1ae946ecac3e2712c2a84b9f59.jpeg)", backgroundRepeat: "no-repeat", backgroundPosition: "center", backgroundSize: "contain" }} aria-hidden />
        <div className="pointer-events-none absolute inset-0 bg-slate-950/25" aria-hidden />
        <div className="relative z-10">
          <AppHeader variant="app" title="ChainFolioAI Portfolio" subtitle="Área do utilizador" />
          <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 pb-24 pt-4">
            <section className="grid gap-6 md:grid-cols-[1.1fr_0.9fr] md:items-start">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-300/80">Área logada</p>
                <h1 className="mt-3 text-3xl font-semibold text-white">Atalhos rápidos do ChainFolioAI</h1>
                <p className="mt-2 text-sm text-slate-400">Acede direto ao dashboard, portfolio, carteiras e mercado.</p>
                <div className="mt-6 flex flex-wrap gap-3">
                  {([["Abrir Dashboard","/dashboard","bg-orange-500 text-slate-950 hover:bg-orange-400"],["Portfolio","/portfolio","border border-orange-400/40 text-orange-200 hover:border-orange-400"],["Carteiras","/wallets","border border-slate-700 text-slate-200 hover:border-slate-500"],["Mercado","/mercado","border border-slate-700 text-slate-200 hover:border-slate-500"]] as [string,string,string][]).map(([label, href, cls]) => (
                    <a key={href} className={`rounded-full px-6 py-3 text-center text-sm font-semibold transition ${cls}`} href={href}>{label}</a>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Resumo</p>
                <div className="mt-4 space-y-3 text-sm text-slate-300">
                  <p>Continua de onde paraste: o dashboard guarda as tuas carteiras, o portfolio e o histórico.</p>
                  <p className="text-xs text-slate-500">Se precisares de ajuda, usa o chat no dashboard.</p>
                </div>
              </div>
            </section>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-slate-950 text-slate-100 overflow-x-hidden">

      {/* Background glows */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[500px] rounded-full bg-orange-500/8 blur-[120px]" />
        <div className="absolute top-1/2 -left-40 w-[400px] h-[400px] rounded-full bg-orange-600/5 blur-[100px]" />
        <div className="absolute bottom-0 right-0 w-[500px] h-[400px] rounded-full bg-slate-700/20 blur-[100px]" />
      </div>

      <div className="relative z-10">
        <AppHeader variant="public" title="ChainFolioAI Portfolio" />

        {/* Live price ticker — CSS animation, sem JS */}
        <div className="border-b border-slate-800/60 bg-slate-900/50 py-2.5 overflow-hidden select-none">
          <div className="flex animate-ticker" style={{ width: "max-content" }}>
            {[...TICKER_DATA, ...TICKER_DATA].map((t, i) => (
              <span key={i} className="inline-flex items-center gap-2 mx-8 text-xs font-mono whitespace-nowrap">
                <span className="font-bold text-slate-300 tracking-wide">{t.symbol}</span>
                <span className="text-slate-400">{t.price}</span>
                <span className={`font-semibold ${t.up ? "text-emerald-400" : "text-rose-400"}`}>{t.change}</span>
                <span className="text-slate-700">·</span>
              </span>
            ))}
          </div>
        </div>

        {/* HERO */}
        <section className="mx-auto flex w-full max-w-6xl flex-col items-center gap-12 px-6 pb-16 pt-16 md:flex-row md:pt-24">
          <div className="flex-1 space-y-7">
            <div className="animate-fade-in-up inline-flex items-center gap-2 rounded-full border border-orange-500/30 bg-orange-500/10 px-4 py-1.5 text-xs font-bold text-orange-300 uppercase tracking-widest">
              🦉 Plataforma gratuita · Beta aberto
            </div>
            <h1 className="animate-fade-in-up delay-100 text-4xl font-bold leading-tight text-white md:text-5xl lg:text-6xl">
              O teu portfólio<br />
              <span className="text-orange-400">cripto e tradicional</span><br />
              num só lugar
            </h1>
            <p className="animate-fade-in-up delay-200 max-w-lg text-lg text-slate-300">
              Conecta carteiras blockchain, acompanha ações e vê o teu PNL em tempo real. Simples, rápido e seguro.
            </p>
            <div className="animate-fade-in-up delay-300 flex flex-wrap gap-4">
              <a href="/login" className="rounded-full bg-orange-500 px-8 py-3.5 text-base font-bold text-slate-950 shadow-lg shadow-orange-500/25 transition hover:bg-orange-400 hover:scale-[1.03] hover:shadow-orange-400/30 active:scale-[0.98]">
                Começar grátis →
              </a>
              <a href="#como-funciona" className="rounded-full border border-slate-700 px-8 py-3.5 text-base font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white hover:scale-[1.02] active:scale-[0.98]">
                Como funciona
              </a>
            </div>
            <p className="animate-fade-in-up delay-400 text-xs text-slate-500">Sem cartão de crédito · Sem chaves privadas · 100% gratuito</p>
          </div>
          <div className="animate-scale-in delay-200 w-full max-w-sm flex-shrink-0">
            <PnlSummaryCard position={2150} today={120} days30={480} daily7d={-35} />
          </div>
        </section>

        {/* STATS */}
        <section className="border-y border-slate-800/50 bg-slate-900/30 py-12">
          <div className="mx-auto grid w-full max-w-4xl grid-cols-2 gap-8 px-6 md:grid-cols-4">
            {STATS.map((s, i) => (
              <div key={s.label} className={`text-center animate-fade-in-up delay-${i * 100 + 100}`}>
                <div className="metric-value text-4xl font-black text-orange-400">{s.value}</div>
                <div className="mt-1.5 text-sm text-slate-400">{s.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* FEATURES */}
        <section id="recursos" className="mx-auto w-full max-w-6xl px-6 py-20">
          <div className="mb-14 text-center animate-fade-in-up">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-300/80">Funcionalidades</p>
            <h2 className="mt-3 text-3xl font-bold text-white md:text-4xl">Tudo o que precisas para investir melhor</h2>
            <p className="mt-3 text-slate-400 max-w-xl mx-auto">Numa única plataforma, sem dispersão de informação.</p>
          </div>
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                className={`card-hover rounded-2xl border border-slate-800 bg-slate-900/60 p-6 animate-fade-in-up delay-${Math.min(i * 100, 500)}`}
              >
                <div className="mb-4 text-3xl leading-none">{f.icon}</div>
                <h3 className="text-base font-bold text-white">{f.title}</h3>
                <p className="mt-2 text-sm text-slate-400 leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="como-funciona" className="bg-slate-900/40 py-20">
          <div className="mx-auto w-full max-w-4xl px-6">
            <div className="mb-14 text-center animate-fade-in-up">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-300/80">Como funciona</p>
              <h2 className="mt-3 text-3xl font-bold text-white">Em 3 passos simples</h2>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <div key={s.num} className={`card-hover rounded-2xl border border-orange-500/20 bg-gradient-to-br from-slate-900 to-slate-950 p-7 animate-fade-in-up delay-${i * 150 + 100}`}>
                  <div className="mb-5 text-6xl font-black text-orange-500/15 leading-none">{s.num}</div>
                  <h3 className="text-base font-bold text-white">{s.title}</h3>
                  <p className="mt-2 text-sm text-slate-400 leading-relaxed">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA FINAL */}
        <section className="mx-auto w-full max-w-3xl px-6 py-24 text-center">
          <div className="animate-scale-in rounded-3xl border border-orange-500/20 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 p-10 shadow-2xl shadow-black/40 relative overflow-hidden">
            {/* glow decorativo */}
            <div className="animate-glow-pulse pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full bg-orange-500/10 blur-[80px]" aria-hidden />
            <div className="relative">
              <div className="mb-5 text-5xl">🦉</div>
              <h2 className="text-3xl font-bold text-white md:text-4xl">Pronto para ter controlo total?</h2>
              <p className="mt-4 text-slate-400 max-w-sm mx-auto">Junta-te à comunidade ChainFolioAI. Grátis para sempre no plano base.</p>
              <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                <a href="/login" className="w-full rounded-full bg-orange-500 px-10 py-4 text-base font-bold text-slate-950 shadow-lg shadow-orange-500/25 transition hover:bg-orange-400 hover:scale-[1.03] active:scale-[0.97] sm:w-auto">
                  Criar conta grátis
                </a>
                <a href="/login" className="w-full rounded-full border border-slate-700 px-10 py-4 text-base font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white sm:w-auto">
                  Já tenho conta →
                </a>
              </div>
              <p className="mt-5 text-xs text-slate-600">Sem cartão de crédito · Cancela quando quiseres</p>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="border-t border-slate-900 bg-slate-950/80 py-10">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🦉</span>
              <div>
                <p className="font-bold text-white">OWLFUND</p>
                <p className="text-xs text-slate-500">Controlo inteligente de investimentos</p>
              </div>
            </div>
            <div className="flex gap-6 text-sm text-slate-500">
              <a href="#recursos" className="transition hover:text-slate-300">Funcionalidades</a>
              <a href="#como-funciona" className="transition hover:text-slate-300">Como funciona</a>
              <a href="/login" className="transition hover:text-slate-300">Entrar</a>
            </div>
            <p className="text-xs text-slate-600">© 2025 ChainFolioAI · Todos os direitos reservados</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
