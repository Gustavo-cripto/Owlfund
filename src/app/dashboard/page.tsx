"use client";

import ChatWidget from "@/components/ChatWidget";
import AppHeader from "@/components/AppHeader";
import { useRequireAuth } from "@/lib/auth/useRequireAuth";

export default function DashboardPage() {
  const { isLoading } = useRequireAuth("/login");

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 pb-20 pt-12">
          <p className="text-sm text-slate-400">A carregar dashboard...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <AppHeader variant="app" subtitle="Dashboard do utilizador" />

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 pb-24 pt-2">
        <section className="grid gap-6 md:grid-cols-[1.1fr_0.9fr] md:items-start">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-300/80">
              Acesso rápido
            </p>
            <h1 className="mt-3 text-3xl font-semibold text-white">
              Painel Owlfund
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              Portfolio, carteiras e mercado ficam disponíveis só para contas logadas.
            </p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <a
                className="rounded-full bg-orange-500 px-6 py-3 text-center text-sm font-semibold text-slate-950 transition hover:bg-orange-400"
                href="/portfolio"
              >
                Abrir Portfolio
              </a>
              <a
                className="rounded-full border border-orange-400/40 px-6 py-3 text-center text-sm font-semibold text-orange-200 transition hover:border-orange-400 hover:text-white"
                href="/wallets"
              >
                Abrir Carteiras
              </a>
              <a
                className="rounded-full border border-slate-700 px-6 py-3 text-center text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
                href="/mercado"
              >
                Ver Mercado
              </a>
            </div>
          </div>

          <div className="space-y-3">
            <div className="space-y-2 text-sm text-slate-300">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-300/80">
                Chat Mercado
              </p>
              <p>
                Pergunta sobre BTC, altcoins e macro. A IA responde em PT-BR.
              </p>
            </div>
            <ChatWidget />
          </div>
        </section>
      </main>
    </div>
  );
}

