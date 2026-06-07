"use client";

import AppShell from "@/components/AppShell";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// ── Feature lists ─────────────────────────────────────────────────────────

const FREE_FEATURES = [
  { category: "Portfolio", items: [
    { label: "Carteiras EVM (ETH, Polygon, BSC)", free: true, pro: true },
    { label: "Carteiras Solana", free: true, pro: true },
    { label: "Carteiras Bitcoin (saldo)", free: true, pro: true },
    { label: "Carteiras Cardano (ADA)", free: true, pro: true },
    { label: "CEX (Binance, Kraken, CoinEx)", free: false, pro: true },
    { label: "Hyperliquid (Spot + Perp)", free: false, pro: true },
    { label: "Hardware Wallet (Ledger/Trezor)", free: false, pro: true },
    { label: "Número de carteiras", free: "Até 3", pro: "Ilimitado" },
    { label: "Snapshots automáticos diários", free: false, pro: true },
    { label: "Histórico de valor do portfolio", free: "7 dias", pro: "1 ano+" },
  ]},
  { category: "Smart Money", items: [
    { label: "Watchlist de baleias", free: "5 endereços", pro: "Ilimitado" },
    { label: "Histórico de transações baleias", free: "Últimas 10", pro: "Últimas 100" },
    { label: "Alertas de movimentos > $100k", free: false, pro: true },
    { label: "Alertas por email", free: false, pro: true },
    { label: "Baleias conhecidas pré-carregadas", free: true, pro: true },
  ]},
  { category: "Mercado & Análise", items: [
    { label: "Preços em tempo real", free: true, pro: true },
    { label: "Blocos BTC ao vivo", free: true, pro: true },
    { label: "Gráficos de mercado", free: "Básico", pro: "Avançado" },
    { label: "Chat IA (análise de portfolio)", free: "10/mês", pro: "Ilimitado" },
    { label: "Exportação de dados (CSV)", free: false, pro: true },
  ]},
  { category: "Fiscalidade", items: [
    { label: "Calculadora de impostos (FIFO)", free: true, pro: true },
    { label: "Países suportados", free: "4 (PT/ES/FR/DE)", pro: "8+ países" },
    { label: "Guia de legislação por país", free: true, pro: true },
    { label: "Exportação relatório fiscal (PDF)", free: false, pro: true },
    { label: "Relatório anual automático", free: false, pro: true },
  ]},
  { category: "FIRE & Simulador", items: [
    { label: "Calculadora FIRE", free: true, pro: true },
    { label: "Simulador de cenários", free: "3 cenários", pro: "Ilimitado" },
    { label: "Projeções de portfolio", free: false, pro: true },
  ]},
];

// ── Components ─────────────────────────────────────────────────────────────

function Check({ yes }: { yes: boolean }) {
  return yes
    ? <span className="text-emerald-400 font-bold">✓</span>
    : <span className="text-slate-600">—</span>;
}

function FeatureValue({ value }: { value: boolean | string }) {
  if (typeof value === "boolean") return <Check yes={value} />;
  return <span className="text-xs text-slate-300">{value}</span>;
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function PricingPage() {
  const { t } = useLanguage();
  const supabase = createClient();
  const [isPro, setIsPro] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) { setLoading(false); return; }
      setUserId(user.id);
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("status")
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();
      setIsPro(!!sub);
      setLoading(false);
    };
    load();
  }, [supabase]);

  const handleUpgrade = async () => {
    if (!userId) { window.location.href = "/login"; return; }
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const data = (await res.json()) as { url?: string };
    if (data.url) window.location.href = data.url;
  };

  return (
    <AppShell>
      <div className="relative min-h-screen bg-slate-950 text-slate-100">
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-[700px] h-[350px] rounded-full bg-orange-500/6 blur-[100px]" />
        </div>

        <div className="relative z-10">
          <main className="mx-auto w-full max-w-5xl px-6 pb-24 pt-6 space-y-10">

            {/* Header */}
            <div className="text-center space-y-4">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-300/80">Owlfund</p>
              <h1 className="text-4xl font-bold text-white">{t("pricing_title")}</h1>
              <p className="text-slate-400 max-w-xl mx-auto text-sm leading-relaxed">
                O único tracker que combina carteiras on-chain, CEXs, Hyperliquid, hardware wallets,
                Smart Money e fiscalidade — num só lugar.
              </p>
              {/* Stats bar */}
              <div className="flex flex-wrap justify-center gap-6 pt-2">
                {[
                  { value: "10+", label: "Blockchains suportadas" },
                  { value: "3 CEXs", label: "Binance · Kraken · CoinEx" },
                  { value: "8 países", label: "Fiscalidade local (Pro)" },
                  { value: "€9,99/mês", label: "vs €19,99 concorrência" },
                ].map((s) => (
                  <div key={s.label} className="text-center">
                    <p className="text-lg font-bold text-orange-300">{s.value}</p>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wide">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Plan cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
              {/* Free */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{t("pricing_free_title")}</p>
                  <p className="text-3xl font-bold text-white mt-1">{t("pricing_free_price")}</p>
                  <p className="text-xs text-slate-500 mt-1">Para começar a monitorar o teu portfolio</p>
                </div>
                <div className="space-y-2 text-sm">
                  {["3 carteiras on-chain", "Preços em tempo real", "Calculadora de impostos (FIFO)", "Blocos BTC ao vivo", "Watchlist Smart Money (5 baleias)", "Chat IA (10/mês)", "Calculadora FIRE"].map((f) => (
                    <div key={f} className="flex items-center gap-2 text-slate-300">
                      <span className="text-emerald-400 text-xs">✓</span>
                      {f}
                    </div>
                  ))}
                </div>
                <a href="/dashboard"
                  className="block w-full text-center rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:border-slate-500 hover:text-white transition">
                  {t("pricing_cta_free")}
                </a>
              </div>

              {/* Pro */}
              <div className="rounded-2xl border border-orange-500/40 bg-orange-500/5 p-6 space-y-5 relative overflow-hidden">
                <div className="absolute top-3 right-3 text-[10px] bg-orange-500 text-slate-950 font-bold px-2 py-0.5 rounded-full">POPULAR</div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-400">{t("pricing_pro_title")}</p>
                  <p className="text-3xl font-bold text-white mt-1">{t("pricing_pro_price")}</p>
                  <p className="text-xs text-slate-500 mt-1">Para investidores a sério</p>
                </div>
                <div className="space-y-2 text-sm">
                  {[
                    "Carteiras ilimitadas (on-chain)",
                    "CEX: Binance, Kraken, CoinEx",
                    "Hyperliquid (Spot + Perp)",
                    "Hardware Wallet (Ledger/Trezor)",
                    "Snapshots diários automáticos",
                    "Alertas de baleias > $100k",
                    "Chat IA ilimitado",
                    "Exportação CSV + PDF fiscal",
                    "Histórico 1 ano+",
                    "8+ países fiscais",
                    "Suporte prioritário",
                  ].map((f) => (
                    <div key={f} className="flex items-center gap-2 text-slate-200">
                      <span className="text-orange-400 text-xs">✓</span>
                      {f}
                    </div>
                  ))}
                </div>
                {loading ? (
                  <div className="h-10 rounded-xl bg-slate-800 animate-pulse" />
                ) : isPro ? (
                  <div className="text-center py-2.5 text-sm text-emerald-400 font-semibold border border-emerald-500/30 rounded-xl bg-emerald-500/10">
                    ✓ {t("pricing_current")}
                  </div>
                ) : (
                  <button type="button" onClick={handleUpgrade}
                    className="w-full rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-orange-400 transition">
                    {t("pricing_cta_pro")}
                  </button>
                )}
              </div>
            </div>

            {/* Detailed comparison tables */}
            <div className="space-y-8">
              <h2 className="text-lg font-bold text-white text-center">Comparação detalhada</h2>

              {/* Table 1: Features quantitativas */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden">
                <div className="px-6 py-3 bg-slate-900 border-b border-slate-800">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Tabela 1 — Limites & Quantidades</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-800">
                        <th className="text-left px-6 py-3 text-xs font-semibold text-slate-400 w-1/2">Funcionalidade</th>
                        <th className="text-center px-4 py-3 text-xs font-semibold text-slate-400 w-1/4">{t("free")}</th>
                        <th className="text-center px-4 py-3 text-xs font-semibold text-orange-400 w-1/4">{t("pro")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ["Carteiras on-chain", "Até 3", "Ilimitado"],
                        ["CEX (Binance/Kraken/CoinEx)", "—", "✓ Ilimitado"],
                        ["Hyperliquid Spot + Perp", "—", "✓ Incluído"],
                        ["Hardware Wallet (Ledger/Trezor)", "—", "✓ WebHID"],
                        ["Watchlist Smart Money", "5 endereços", "Ilimitado"],
                        ["Histórico de transações baleias", "Últimas 10", "Últimas 100"],
                        ["Chat IA por mês", "10 mensagens", "Ilimitado"],
                        ["Histórico de valor do portfolio", "7 dias", "1 ano+"],
                        ["Cenários FIRE", "3 cenários", "Ilimitado"],
                        ["Países fiscais suportados", "4 países", "8+ países"],
                        ["Alertas de grandes movimentos", "—", "✓ > $100k"],
                        ["Exportação CSV", "—", "✓ Ilimitada"],
                        ["Relatório fiscal PDF anual", "—", "✓ Automático"],
                      ].map(([feature, freeVal, proVal]) => (
                        <tr key={feature} className="border-b border-slate-800/50 last:border-0 hover:bg-slate-800/20 transition">
                          <td className="px-6 py-3 text-slate-300">{feature}</td>
                          <td className="px-4 py-3 text-center text-slate-400">{freeVal}</td>
                          <td className="px-4 py-3 text-center text-orange-300 font-medium">{proVal}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Table 2: Features binárias por categoria */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden">
                <div className="px-6 py-3 bg-slate-900 border-b border-slate-800">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Tabela 2 — Funcionalidades por Categoria</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-800">
                        <th className="text-left px-6 py-3 text-xs font-semibold text-slate-400 w-1/2">Funcionalidade</th>
                        <th className="text-center px-4 py-3 text-xs font-semibold text-slate-400 w-1/4">{t("free")}</th>
                        <th className="text-center px-4 py-3 text-xs font-semibold text-orange-400 w-1/4">{t("pro")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {FREE_FEATURES.map((section) => (
                        <>
                          <tr key={section.category} className="bg-slate-800/40 border-b border-slate-800">
                            <td colSpan={3} className="px-6 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                              {section.category}
                            </td>
                          </tr>
                          {section.items.map((item) => (
                            <tr key={item.label} className="border-b border-slate-800/40 last:border-0 hover:bg-slate-800/20 transition">
                              <td className="px-6 py-2.5 text-slate-300 text-sm">{item.label}</td>
                              <td className="px-4 py-2.5 text-center">
                                <FeatureValue value={item.free} />
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                <FeatureValue value={item.pro} />
                              </td>
                            </tr>
                          ))}
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Why Owlfund */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 space-y-5">
              <h2 className="text-lg font-bold text-white text-center">Porque é diferente dos outros trackers?</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  {
                    icon: "🌐",
                    title: "Portfolio completo",
                    desc: "On-chain + CEX + Hyperliquid + Ledger num único dashboard. Sem saltar entre apps.",
                  },
                  {
                    icon: "🦉",
                    title: "Smart Money real",
                    desc: "Segue baleias reais com alertas de movimentos acima de $100k. Fica à frente do mercado.",
                  },
                  {
                    icon: "📊",
                    title: "Fiscalidade integrada",
                    desc: "Cálculo FIFO automático para Portugal, Espanha, França, Alemanha e mais. Relatório PDF pronto a enviar.",
                  },
                ].map((item) => (
                  <div key={item.title} className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 space-y-2">
                    <p className="text-2xl">{item.icon}</p>
                    <p className="font-semibold text-white text-sm">{item.title}</p>
                    <p className="text-xs text-slate-400 leading-relaxed">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Competitor comparison */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden">
              <div className="px-6 py-3 bg-slate-900 border-b border-slate-800">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Owlfund vs Concorrência</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-800">
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-400">Funcionalidade</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-orange-400">Owlfund Pro</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500">CoinStats</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500">Delta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["Preço/mês", "€9,99", "€19,99", "€9,99"],
                      ["CEX integração", "✓", "✓", "✓"],
                      ["Hyperliquid", "✓", "—", "—"],
                      ["Hardware Wallet", "✓ WebHID", "—", "—"],
                      ["Smart Money / Baleias", "✓", "Parcial", "—"],
                      ["Fiscalidade europeia", "✓ 8 países", "Limitado", "—"],
                      ["Chat IA portfolio", "✓", "—", "—"],
                      ["FIRE Simulator", "✓", "—", "—"],
                    ].map(([feature, owlfund, coinStats, delta]) => (
                      <tr key={feature} className="border-b border-slate-800/50 last:border-0 hover:bg-slate-800/20">
                        <td className="px-6 py-2.5 text-slate-300">{feature}</td>
                        <td className="px-4 py-2.5 text-center text-orange-300 font-semibold">{owlfund}</td>
                        <td className="px-4 py-2.5 text-center text-slate-500">{coinStats}</td>
                        <td className="px-4 py-2.5 text-center text-slate-500">{delta}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* FAQ / disclaimer */}
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
