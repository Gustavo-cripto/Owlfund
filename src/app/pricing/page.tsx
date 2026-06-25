"use client";

import AppShell from "@/components/AppShell";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// ── Feature comparison table data ─────────────────────────────────────────

const COMPARISON = [
  {
    category: "📦 Carteiras & Integração",
    rows: [
      { label: "Carteiras on-chain (EVM, SOL, BTC, ADA)", free: "Até 3", pro: "Ilimitado", premium: "Ilimitado" },
      { label: "CEX (Binance, Kraken, CoinEx)", free: false, pro: true, premium: true },
      { label: "Hyperliquid Spot + Perp", free: false, pro: true, premium: true },
      { label: "Hardware Wallet (Ledger / Trezor)", free: false, pro: true, premium: true },
    ],
  },
  {
    category: "📊 Portfolio & Histórico",
    rows: [
      { label: "Snapshots automáticos diários", free: false, pro: true, premium: true },
      { label: "Histórico de valor do portfolio", free: "30 dias", pro: "1 ano+", premium: "Ilimitado" },
      { label: "Exportação CSV", free: false, pro: true, premium: true },
      { label: "Relatório PDF automático", free: false, pro: true, premium: "Avançado" },
    ],
  },
  {
    category: "🐋 Smart Money & On-chain",
    rows: [
      { label: "Watchlist de baleias", free: "5 endereços", pro: "Ilimitado", premium: "Ilimitado" },
      { label: "Histórico de transações baleias", free: "Últimas 10", pro: "Últimas 100", premium: "Ilimitado" },
      { label: "Alertas de movimentos > $100k", free: false, pro: true, premium: true },
      { label: "Análise on-chain avançada", free: false, pro: false, premium: true },
      { label: "Smart Money tracking em tempo real", free: false, pro: false, premium: true },
      { label: "Alertas WebSocket em tempo real", free: false, pro: false, premium: true },
    ],
  },
  {
    category: "🤖 IA & Mercado",
    rows: [
      { label: "Preços em tempo real", free: true, pro: true, premium: true },
      { label: "Blocos BTC ao vivo", free: true, pro: true, premium: true },
      { label: "Chat IA (análise de portfolio)", free: "5/mês", pro: "Ilimitado", premium: "Ilimitado" },
      { label: "Briefing IA diário por email", free: false, pro: true, premium: true },
      { label: "Chat sobre análise IA (mercado)", free: true, pro: true, premium: true },
      { label: "Análise preditiva IA on-chain", free: false, pro: false, premium: true },
    ],
  },
  {
    category: "🧾 Fiscalidade",
    rows: [
      { label: "Calculadora de impostos (FIFO)", free: true, pro: true, premium: true },
      { label: "Países suportados", free: "4 (PT/ES/FR/DE)", pro: "8+ países", premium: "Todos" },
      { label: "Guia de legislação por país", free: true, pro: true, premium: true },
      { label: "Exportação relatório fiscal PDF", free: false, pro: true, premium: "Multi-formato" },
      { label: "Relatório fiscal anual automático", free: false, pro: true, premium: true },
    ],
  },
  {
    category: "📐 Planeamento FIRE",
    rows: [
      { label: "Calculadora FIRE", free: true, pro: true, premium: true },
      { label: "Cenários de simulação", free: "3 cenários", pro: "Ilimitado", premium: "Ilimitado" },
      { label: "Projeções de portfolio", free: false, pro: true, premium: true },
    ],
  },
  {
    category: "⚙️ API & Integrações",
    rows: [
      { label: "API REST pública", free: false, pro: false, premium: true },
      { label: "Integração MCP (Claude, Cursor…)", free: false, pro: false, premium: true },
      { label: "Webhooks de alertas", free: false, pro: false, premium: true },
    ],
  },
  {
    category: "🎧 Suporte",
    rows: [
      { label: "Suporte por email", free: true, pro: true, premium: true },
      { label: "Suporte prioritário", free: false, pro: true, premium: true },
      { label: "Gestor de conta dedicado", free: false, pro: false, premium: true },
      { label: "Acesso antecipado a novas features", free: false, pro: false, premium: true },
    ],
  },
];

function Cell({ value }: { value: boolean | string }) {
  if (value === true) return <span className="text-emerald-400 font-bold">✓</span>;
  if (value === false) return <span className="text-slate-700">—</span>;
  return <span className="text-xs text-slate-300">{value}</span>;
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function PricingPage() {
  const { t } = useLanguage();
  const supabase = createClient();
  const [isPro, setIsPro] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) { setLoading(false); return; }
      setUserId(user.id);
      try {
        const res = await fetch("/api/subscription");
        if (res.ok) {
          const json = await res.json() as { plan: string };
          if (json.plan === "premium") setIsPremium(true);
          else if (json.plan === "pro") setIsPro(true);
        }
      } catch { /* ignore */ }
      setLoading(false);
    };
    load();
  }, [supabase]);

  const handleSyncPlan = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/sync-subscription", { method: "POST" });
      const json = await res.json() as { synced?: boolean; price_id?: string; error?: string };
      if (json.synced) window.location.reload();
      else alert(json.error ?? "Nenhuma subscrição ativa encontrada no Stripe.");
    } catch {
      alert("Erro ao sincronizar. Tenta novamente.");
    }
    setSyncing(false);
  };

  const handleUpgrade = async (plan: "pro" | "premium") => {
    if (!userId) { window.location.href = "/login"; return; }
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token ?? "";
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${accessToken}` },
      body: JSON.stringify({ userId, plan }),
    });
    const data = (await res.json()) as { url?: string };
    if (data.url) window.location.href = data.url;
  };

  const currentPlan = isPremium ? "premium" : isPro ? "pro" : "free";

  return (
    <AppShell>
      <div className="relative min-h-screen bg-slate-950 text-slate-100">
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-[700px] h-[350px] rounded-full bg-orange-500/6 blur-[100px]" />
        </div>

        <div className="relative z-10">
          <main className="mx-auto w-full max-w-6xl px-6 pb-24 pt-6 space-y-12">

            {/* Header */}
            <div className="text-center space-y-4">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-300/80">ChainFolioAI</p>
              <h1 className="text-4xl font-bold text-white">{t("pricing_title")}</h1>
              <p className="text-slate-400 max-w-xl mx-auto text-sm leading-relaxed">
                Do investidor casual ao profissional — escolhe o plano certo para o teu nível.
              </p>
            </div>

            {/* Stats bar */}
            <div className="flex flex-wrap justify-center gap-6 text-center">
              {[
                { value: "10+", label: "Blockchains suportadas" },
                { value: "3 CEXs", label: "Binance · Kraken · CoinEx" },
                { value: "8+ países", label: "Fiscalidade local" },
                { value: "API/MCP", label: "Para programadores (Premium)" },
              ].map((s) => (
                <div key={s.label} className="text-center">
                  <p className="text-lg font-bold text-orange-400">{s.value}</p>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wide">{s.label}</p>
                </div>
              ))}
            </div>

            {/* 3 Plan Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

              {/* Free */}
              <div className={`rounded-2xl border p-6 space-y-5 ${currentPlan === "free" ? "border-slate-500 bg-slate-800/60" : "border-slate-800 bg-slate-900/60"}`}>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Gratuito</p>
                  <p className="text-3xl font-bold text-white mt-1">€0 <span className="text-sm font-normal text-slate-500">/ mês</span></p>
                  <p className="text-xs text-slate-500 mt-1">Para começar a monitorar</p>
                </div>
                <div className="space-y-2 text-sm">
                  {[
                    "3 carteiras on-chain",
                    "Preços em tempo real",
                    "Blocos BTC ao vivo",
                    "Watchlist (5 baleias)",
                    "Chat IA (5/mês)",
                    "Histórico 30 dias",
                    "Calculadora FIFO",
                    "Calculadora FIRE básica",
                    "4 países fiscais",
                  ].map((f) => (
                    <div key={f} className="flex items-center gap-2 text-slate-400">
                      <span className="text-emerald-500 text-xs">✓</span>{f}
                    </div>
                  ))}
                </div>
                <a href="/dashboard" className="block w-full text-center rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:border-slate-500 hover:text-white transition">
                  {currentPlan === "free" ? "✓ Plano atual" : "Começar grátis"}
                </a>
              </div>

              {/* Pro */}
              <div className={`rounded-2xl border p-6 space-y-5 relative overflow-hidden ${currentPlan === "pro" ? "border-orange-400 bg-orange-500/10" : "border-orange-500/40 bg-orange-500/5"}`}>
                <div className="absolute top-3 right-3 text-[10px] bg-orange-500 text-slate-950 font-bold px-2 py-0.5 rounded-full">POPULAR</div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-400">Pro</p>
                  <p className="text-3xl font-bold text-white mt-1">€9,99 <span className="text-sm font-normal text-slate-500">/ mês</span></p>
                  <p className="text-xs text-slate-500 mt-1">Para investidores activos</p>
                </div>
                <div className="space-y-2 text-sm">
                  {[
                    "Tudo do Gratuito +",
                    "Carteiras ilimitadas on-chain",
                    "CEX: Binance, Kraken, CoinEx",
                    "Hyperliquid (Spot + Perp)",
                    "Hardware Wallet (Ledger/Trezor)",
                    "Snapshots diários automáticos",
                    "Alertas baleias > $100k + email",
                    "Chat IA ilimitado",
                    "Briefing IA diário por email",
                    "Exportação CSV + PDF fiscal",
                    "Histórico 1 ano+",
                    "8+ países fiscais",
                    "Suporte prioritário",
                  ].map((f) => (
                    <div key={f} className={`flex items-center gap-2 text-sm ${f.startsWith("Tudo") ? "text-orange-300 font-semibold" : "text-slate-200"}`}>
                      <span className="text-orange-400 text-xs">{f.startsWith("Tudo") ? "" : "✓"}</span>{f}
                    </div>
                  ))}
                </div>
                {loading ? (
                  <div className="h-10 rounded-xl bg-slate-800 animate-pulse" />
                ) : currentPlan === "pro" ? (
                  <div className="text-center py-2.5 text-sm text-emerald-400 font-semibold border border-emerald-500/30 rounded-xl bg-emerald-500/10">✓ Plano atual</div>
                ) : currentPlan === "premium" ? (
                  <div className="text-center py-2.5 text-sm text-slate-500 border border-slate-700 rounded-xl">Incluído no Premium</div>
                ) : (
                  <button type="button" onClick={() => handleUpgrade("pro")}
                    className="w-full rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-orange-400 transition">
                    Upgrade para Pro
                  </button>
                )}
              </div>

              {/* Premium */}
              <div className={`rounded-2xl border p-6 space-y-5 relative overflow-hidden ${currentPlan === "premium" ? "border-violet-400 bg-violet-500/10" : "border-violet-500/40 bg-violet-500/5"}`}>
                <div className="absolute top-3 right-3 text-[10px] bg-violet-500 text-white font-bold px-2 py-0.5 rounded-full">PROFISSIONAL</div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">Premium</p>
                  <p className="text-3xl font-bold text-white mt-1">€39 <span className="text-sm font-normal text-slate-500">/ mês</span></p>
                  <p className="text-xs text-slate-500 mt-1">Para traders e profissionais</p>
                </div>
                <div className="space-y-2 text-sm">
                  {[
                    "Tudo do Pro +",
                    "Smart Money tracking em tempo real",
                    "Análise on-chain avançada",
                    "Alertas WebSocket instantâneos",
                    "Histórico ilimitado",
                    "Todos os países fiscais",
                    "Análise preditiva IA on-chain",
                    "API REST pública",
                    "Integração MCP (Claude, Cursor…)",
                    "Webhooks de alertas",
                    "Gestor Dedicado IA (chat com os teus dados)",
                    "Acesso antecipado a features",
                  ].map((f) => (
                    <div key={f} className={`flex items-center gap-2 text-sm ${f.startsWith("Tudo") ? "text-violet-300 font-semibold" : "text-slate-200"}`}>
                      <span className="text-violet-400 text-xs">{f.startsWith("Tudo") ? "" : "✓"}</span>{f}
                    </div>
                  ))}
                </div>
                {loading ? (
                  <div className="h-10 rounded-xl bg-slate-800 animate-pulse" />
                ) : currentPlan === "premium" ? (
                  <div className="text-center py-2.5 text-sm text-emerald-400 font-semibold border border-emerald-500/30 rounded-xl bg-emerald-500/10">✓ Plano atual</div>
                ) : (
                  <button type="button" onClick={() => handleUpgrade("premium")}
                    className="w-full rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-violet-400 transition">
                    Upgrade para Premium
                  </button>
                )}
              </div>
            </div>

            {/* Detailed comparison table */}
            <div className="space-y-6">
              <h2 className="text-lg font-bold text-white text-center">Comparação completa de funcionalidades</h2>

              {COMPARISON.map((section) => (
                <div key={section.category} className="rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden">
                  <div className="px-6 py-3 bg-slate-900 border-b border-slate-800">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{section.category}</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-800">
                          <th className="text-left px-6 py-3 text-xs font-semibold text-slate-400 w-1/2">Funcionalidade</th>
                          <th className="text-center px-4 py-3 text-xs font-semibold text-slate-400 w-[16%]">Gratuito</th>
                          <th className="text-center px-4 py-3 text-xs font-semibold text-orange-400 w-[16%]">Pro</th>
                          <th className="text-center px-4 py-3 text-xs font-semibold text-violet-400 w-[16%]">Premium</th>
                        </tr>
                      </thead>
                      <tbody>
                        {section.rows.map((row) => (
                          <tr key={row.label} className="border-b border-slate-800/40 last:border-0 hover:bg-slate-800/20 transition">
                            <td className="px-6 py-2.5 text-slate-300">{row.label}</td>
                            <td className="px-4 py-2.5 text-center"><Cell value={row.free} /></td>
                            <td className="px-4 py-2.5 text-center"><Cell value={row.pro} /></td>
                            <td className="px-4 py-2.5 text-center"><Cell value={row.premium} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>

            {/* vs Competitors */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden">
              <div className="px-6 py-3 bg-slate-900 border-b border-slate-800">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">ChainFolioAI vs Concorrência</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-800">
                      <th className="text-left px-6 py-3 text-xs text-slate-400">Funcionalidade</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-orange-400">ChainFolioAI Pro</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-violet-400">ChainFolioAI Premium</th>
                      <th className="text-center px-4 py-3 text-xs text-slate-500">CoinStats</th>
                      <th className="text-center px-4 py-3 text-xs text-slate-500">Delta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["Preço/mês", "€9,99", "€39", "€19,99", "€9,99"],
                      ["Carteiras on-chain ilimitadas", "✓", "✓", "✓", "—"],
                      ["CEX integrado", "✓", "✓", "Parcial", "—"],
                      ["Smart Money / Baleias", "✓", "✓ Avançado", "Parcial", "—"],
                      ["Análise on-chain", "—", "✓", "—", "—"],
                      ["API / MCP", "—", "✓", "—", "—"],
                      ["Fiscalidade europeia", "8 países", "Todos", "Limitado", "—"],
                      ["Chat IA portfolio", "✓", "✓", "—", "—"],
                    ].map(([feature, owlfundPro, owlfundPremium, coinStats, delta]) => (
                      <tr key={feature} className="border-b border-slate-800/50 last:border-0 hover:bg-slate-800/20">
                        <td className="px-6 py-2.5 text-slate-300">{feature}</td>
                        <td className="px-4 py-2.5 text-center text-orange-300 font-semibold">{owlfundPro}</td>
                        <td className="px-4 py-2.5 text-center text-violet-300 font-semibold">{owlfundPremium}</td>
                        <td className="px-4 py-2.5 text-center text-slate-500">{coinStats}</td>
                        <td className="px-4 py-2.5 text-center text-slate-500">{delta}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footer note */}
            <div className="text-center space-y-2">
              <p className="text-xs text-slate-600">
                Pagamento seguro via Stripe · Cancela a qualquer momento · Sem compromisso
              </p>
            </div>

          </main>
        </div>
      </div>
    </AppShell>
  );
}
