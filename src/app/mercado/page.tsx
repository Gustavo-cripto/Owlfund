"use client";

import { useMemo } from "react";

const markets = [
  { name: "Bitcoin", symbol: "BTC", trend: "Alta moderada", change: "+2.4%" },
  { name: "Ethereum", symbol: "ETH", trend: "Consolidação", change: "+0.6%" },
  { name: "Solana", symbol: "SOL", trend: "Volatilidade", change: "-1.1%" },
  { name: "Cardano", symbol: "ADA", trend: "Recuperação", change: "+1.3%" },
];

export default function MercadoPage() {
  const today = useMemo(() => {
    const now = new Date();
    return now.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 pb-20 pt-12">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <a
              className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500 transition hover:text-slate-200"
              href="/"
            >
              Voltar para início
            </a>
            <div className="flex flex-wrap gap-2">
              <a
                className="rounded-full border border-orange-400/40 px-4 py-2 text-xs font-semibold text-orange-200 transition hover:border-orange-400 hover:text-white"
                href="/wallets"
              >
                Carteiras
              </a>
              <a
                className="rounded-full border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
                href="/portfolio"
              >
                Portfolio
              </a>
            </div>
          </div>
          <h1 className="text-3xl font-semibold text-white">Mercado</h1>
          <p className="max-w-2xl text-sm text-slate-400">
            Acompanhe o panorama diário e insights gerados por IA para orientar
            decisões estratégicas.
          </p>
        </div>

        <section className="grid gap-6 md:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Visão diária</h2>
                <p className="text-sm text-slate-400">
                  Atualizado em {today}
                </p>
              </div>
              <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300">
                IA ativa
              </span>
            </div>
            <div className="mt-6 space-y-4 text-sm text-slate-300">
              <p>
                Momentum positivo em BTC e ADA, com fluxo comprador consistente.
                ETH mantém consolidação e indica zona neutra.
              </p>
              <p>
                Volatilidade em SOL sugere reduzir exposição intradiária. Diversificação
                entre cripto e tradicional ajuda a suavizar riscos.
              </p>
              <p className="text-xs text-slate-500">
                Observação: análise diária é um resumo automático. Ajuste de risco
                recomendado conforme perfil do portfólio.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <h2 className="text-lg font-semibold text-white">Alertas rápidos</h2>
            <div className="mt-6 space-y-3 text-sm text-slate-300">
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                  Risco
                </p>
                <p className="mt-2">Volatilidade acima do normal em SOL.</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                  Oportunidade
                </p>
                <p className="mt-2">BTC com força relativa frente ao mercado.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <h2 className="text-lg font-semibold text-white">Mercados em destaque</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {markets.map((market) => (
              <div
                key={market.symbol}
                className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-4"
              >
                <div>
                  <p className="text-sm font-semibold text-white">
                    {market.name} <span className="text-slate-500">· {market.symbol}</span>
                  </p>
                  <p className="text-xs text-slate-500">{market.trend}</p>
                </div>
                <span className="text-sm font-semibold text-emerald-300">
                  {market.change}
                </span>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
