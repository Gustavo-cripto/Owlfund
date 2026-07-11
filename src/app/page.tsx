"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import PnlSummaryCard from "@/components/PnlSummaryCard";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/LanguageContext";

const FEATURES = [
  { icon: "📊", t: "lp_f1_t", d: "lp_f1_d" },
  { icon: "🔗", t: "lp_f2_t", d: "lp_f2_d" },
  { icon: "📈", t: "lp_f3_t", d: "lp_f3_d" },
  { icon: "🌍", t: "lp_f4_t", d: "lp_f4_d" },
  { icon: "🔒", t: "lp_f5_t", d: "lp_f5_d" },
  { icon: "🌙", t: "lp_f6_t", d: "lp_f6_d" },
] as const;

const STEPS = [
  { num: "01", t: "lp_s1_t", d: "lp_s1_d" },
  { num: "02", t: "lp_s2_t", d: "lp_s2_d" },
  { num: "03", t: "lp_s3_t", d: "lp_s3_d" },
] as const;

const STATS = [
  { value: "15+", k: "lp_st1" },
  { value: "€0", k: "lp_st2" },
  { value: "24/7", k: "lp_st3" },
  { value: "100%", k: "lp_st4" },
] as const;

const TOOLS = [
  { icon: "📊", t: "lp_t1_t", d: "lp_t1_d" },
  { icon: "🤖", t: "lp_t2_t", d: "lp_t2_d" },
  { icon: "🧮", t: "lp_t3_t", d: "lp_t3_d" },
  { icon: "🔥", t: "lp_t4_t", d: "lp_t4_d" },
  { icon: "🐋", t: "lp_t5_t", d: "lp_t5_d" },
  { icon: "🌐", t: "lp_t6_t", d: "lp_t6_d" },
] as const;

const PLANS = [
  { name: "Free", price: "€0", paid: false, popular: false, desc: "lp_plan_free_desc", feats: ["lp_plan_free_1", "lp_plan_free_2", "lp_plan_free_3", "lp_plan_free_4"] },
  { name: "Pro", price: "€14.99", paid: true, popular: true, desc: "lp_plan_pro_desc", feats: ["lp_plan_pro_1", "lp_plan_pro_2", "lp_plan_pro_3", "lp_plan_pro_4"] },
  { name: "Premium", price: "€39", paid: true, popular: false, desc: "lp_plan_prem_desc", feats: ["lp_plan_prem_1", "lp_plan_prem_2", "lp_plan_prem_3", "lp_plan_prem_4"] },
] as const;

const ALLOC = [
  { sym: "BTC", pct: "48%", cls: "bg-orange-400" },
  { sym: "ETH", pct: "27%", cls: "bg-sky-400" },
  { sym: "SOL", pct: "15%", cls: "bg-violet-400" },
  { sym: "ADA", pct: "10%", cls: "bg-slate-500" },
] as const;

const PREVIEW_BARS = [40, 55, 48, 70, 62, 85, 78, 96] as const;
const DATA_SOURCES = ["CoinGecko", "CoinEx", "Moralis", "mempool.space", "Blockfrost", "Shyft"] as const;
const PREVIEW_METRICS = [
  { k: "ROI", v: "+38.4%", cls: "text-emerald-400" },
  { k: "CAGR", v: "+22.1%", cls: "text-emerald-400" },
  { k: "Max DD", v: "-19.6%", cls: "text-rose-400" },
  { k: "Vol.", v: "34.2%", cls: "text-slate-200" },
] as const;
const SECURITY = [
  { icon: "👁️", t: "lp_sec_1_t", d: "lp_sec_1_d" },
  { icon: "🔑", t: "lp_sec_2_t", d: "lp_sec_2_d" },
  { icon: "🛡️", t: "lp_sec_3_t", d: "lp_sec_3_d" },
] as const;

const INSTITUTIONS = [
  { icon: "🔌", t: "lp_inst_1_t", d: "lp_inst_1_d" },
  { icon: "📄", t: "lp_inst_2_t", d: "lp_inst_2_d" },
  { icon: "🧩", t: "lp_inst_3_t", d: "lp_inst_3_d" },
  { icon: "🇪🇺", t: "lp_inst_4_t", d: "lp_inst_4_d" },
] as const;

const FAQ = [
  { q: "lp_faq_1_q", a: "lp_faq_1_a" },
  { q: "lp_faq_2_q", a: "lp_faq_2_a" },
  { q: "lp_faq_6_q", a: "lp_faq_6_a" },
  { q: "lp_faq_3_q", a: "lp_faq_3_a" },
  { q: "lp_faq_4_q", a: "lp_faq_4_a" },
  { q: "lp_faq_5_q", a: "lp_faq_5_a" },
] as const;

const COMPARISON = [
  { l: "lp_cmp_r1_l", a: "lp_cmp_r1_a", b: "lp_cmp_r1_b", c: "lp_cmp_r1_c" },
  { l: "lp_cmp_r2_l", a: "lp_cmp_r2_a", b: "lp_cmp_r2_b", c: "lp_cmp_r2_c" },
  { l: "lp_cmp_r3_l", a: "lp_cmp_r3_a", b: "lp_cmp_r3_b", c: "lp_cmp_r3_c" },
  { l: "lp_cmp_r4_l", a: "lp_cmp_r4_a", b: "lp_cmp_r4_b", c: "lp_cmp_r4_c" },
  { l: "lp_cmp_r5_l", a: "lp_cmp_r5_a", b: "lp_cmp_r5_b", c: "lp_cmp_r5_c" },
  { l: "lp_cmp_r6_l", a: "lp_cmp_r6_a", b: "lp_cmp_r6_b", c: "lp_cmp_r6_c" },
] as const;

const SCREENSHOTS = [
  { src: "/screenshots/dashboard.png", t: "lp_shot_dash_t", d: "lp_shot_dash_d" },
  { src: "/screenshots/portfolio.png", t: "lp_shot_pf_t", d: "lp_shot_pf_d" },
  { src: "/screenshots/market.png", t: "lp_shot_mkt_t", d: "lp_shot_mkt_d" },
  { src: "/screenshots/wallets.png", t: "lp_shot_wal_t", d: "lp_shot_wal_d" },
] as const;

// Secção "Vê por dentro": mostra apenas os screenshots que existem em
// /public/screenshots/. Se nenhum carregar, a secção fica escondida (não
// parte o site enquanto as imagens não forem adicionadas).
function AppScreenshots() {
  const { t } = useLanguage();
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  const anyLoaded = Object.values(loaded).some(Boolean);
  return (
    <section id="ver-por-dentro" className={`mx-auto w-full max-w-6xl px-6 py-20 ${anyLoaded ? "" : "hidden"}`}>
      <div className="mb-14 text-center animate-fade-in-up">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-300/80">{t("lp_shot_tag")}</p>
        <h2 className="mt-3 text-3xl font-bold text-white md:text-4xl">{t("lp_shot_title")}</h2>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        {SCREENSHOTS.map((s) => (
          <figure
            key={s.src}
            className={`card-hover overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 ${loaded[s.src] ? "" : "hidden"}`}
          >
            <img
              src={s.src}
              alt={t(s.t)}
              loading="lazy"
              onLoad={() => setLoaded((p) => ({ ...p, [s.src]: true }))}
              onError={() => setLoaded((p) => ({ ...p, [s.src]: false }))}
              className="w-full border-b border-slate-800 object-cover"
            />
            <figcaption className="p-5">
              <h3 className="text-base font-bold text-white">{t(s.t)}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{t(s.d)}</p>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

export default function Home() {
  const { t } = useLanguage();
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
      <AppShell>
        <div className="relative min-h-full">
          <div className="pointer-events-none absolute inset-0 opacity-70" style={{ backgroundImage: "url(/hwvtot_2f4227d5a6869b1ae946ecac3e2712c2a84b9f59.jpeg)", backgroundRepeat: "no-repeat", backgroundPosition: "center", backgroundSize: "contain" }} aria-hidden />
          <div className="pointer-events-none absolute inset-0 bg-slate-950/25" aria-hidden />
          <div className="relative z-10">
            <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 pb-24 pt-8">
              <section className="grid gap-6 md:grid-cols-[1.1fr_0.9fr] md:items-start">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-300/80">{t("lp_logged_area")}</p>
                <h1 className="mt-3 text-3xl font-semibold text-white">Atalhos rápidos do ChainFolioAI</h1>
                <p className="mt-2 text-sm text-slate-400">{t("lp_logged_desc")}</p>
                <div className="mt-6 flex flex-wrap gap-3">
                  {([[t("lp_open_dashboard"),"/dashboard","bg-orange-500 text-slate-950 hover:bg-orange-400"],["Portfolio","/portfolio","border border-orange-400/40 text-orange-200 hover:border-orange-400"],["Carteiras","/wallets","border border-slate-700 text-slate-200 hover:border-slate-500"],["Mercado","/mercado","border border-slate-700 text-slate-200 hover:border-slate-500"]] as [string,string,string][]).map(([label, href, cls]) => (
                    <a key={href} className={`rounded-full px-6 py-3 text-center text-sm font-semibold transition ${cls}`} href={href}>{label}</a>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Resumo</p>
                <div className="mt-4 space-y-3 text-sm text-slate-300">
                  <p>{t("lp_continue_desc")}</p>
                  <p className="text-xs text-slate-500">{t("lp_help_desc")}</p>
                </div>
              </div>
              </section>
            </main>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
    <div className="relative min-h-screen bg-slate-950 text-slate-100 overflow-x-hidden">

      {/* Background glows */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[500px] rounded-full bg-orange-500/8 blur-[120px]" />
        <div className="absolute top-1/2 -left-40 w-[400px] h-[400px] rounded-full bg-orange-600/5 blur-[100px]" />
        <div className="absolute bottom-0 right-0 w-[500px] h-[400px] rounded-full bg-slate-700/20 blur-[100px]" />
      </div>

      <div className="relative z-10 pt-8">

        {/* HERO */}
        <section className="mx-auto flex w-full max-w-6xl flex-col items-center gap-12 px-6 pb-16 pt-16 md:flex-row md:pt-24">
          <div className="flex-1 space-y-7">
            <div className="animate-fade-in-up inline-flex items-center gap-2 rounded-full border border-orange-500/30 bg-orange-500/10 px-4 py-1.5 text-xs font-bold text-orange-300 uppercase tracking-widest">
              <img src="/chainfolioai-icon.png" alt="" className="h-4 w-4 rounded-full object-cover" /> Plataforma gratuita · Beta aberto
            </div>
            <h1 className="animate-fade-in-up delay-100 text-4xl font-bold leading-tight text-white md:text-5xl lg:text-6xl">
              O teu portfólio<br />
              <span className="text-orange-400">{t("lp_crypto_trad")}</span><br />
              num só lugar
            </h1>
            <p className="animate-fade-in-up delay-200 max-w-lg text-lg text-slate-300">
              Carteiras, exchanges e ativos manuais num só painel. PNL em tempo real, métricas avançadas (ROI, Sharpe, drawdown), fiscalidade e um assistente de IA que conhece o teu portfólio.
            </p>
            <p className="animate-fade-in-up delay-200 text-sm font-semibold text-orange-300/90">{t("lp_audience")}</p>
            <div className="animate-fade-in-up delay-300 flex flex-wrap gap-4">
              <a href="/login" className="rounded-full bg-orange-500 px-8 py-3.5 text-base font-bold text-slate-950 shadow-lg shadow-orange-500/25 transition hover:bg-orange-400 hover:scale-[1.03] hover:shadow-orange-400/30 active:scale-[0.98]">
                Começar grátis →
              </a>
              <a href="#como-funciona" className="rounded-full border border-slate-700 px-8 py-3.5 text-base font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white hover:scale-[1.02] active:scale-[0.98]">
                Como funciona
              </a>
            </div>
            <p className="animate-fade-in-up delay-400 text-xs text-slate-500">{t("lp_no_card")}</p>
          </div>
          <div className="animate-scale-in delay-200 w-full max-w-sm flex-shrink-0">
            <PnlSummaryCard position={2150} today={120} days30={480} daily7d={-35} />
          </div>
        </section>

        {/* STATS */}
        <section className="border-y border-slate-800/50 bg-slate-900/30 py-12">
          <div className="mx-auto grid w-full max-w-4xl grid-cols-2 gap-8 px-6 md:grid-cols-4">
            {STATS.map((s, i) => (
              <div key={s.k} className={`text-center animate-fade-in-up delay-${i * 100 + 100}`}>
                <div className="metric-value text-4xl font-black text-orange-400">{s.value}</div>
                <div className="mt-1.5 text-sm text-slate-400">{t(s.k)}</div>
              </div>
            ))}
          </div>
        </section>

        {/* DADOS & CONFIANÇA */}
        <section className="mx-auto w-full max-w-5xl px-6 pt-16">
          <div className="animate-fade-in-up rounded-2xl border border-slate-800 bg-slate-900/50 p-8 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-300/80">{t("lp_data_tag")}</p>
            <h2 className="mt-3 text-2xl font-bold text-white md:text-3xl">{t("lp_data_title")}</h2>
            <p className="mx-auto mt-3 max-w-2xl text-slate-400">{t("lp_data_sub")}</p>
            <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">{t("lp_data_sources")}</p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
              {DATA_SOURCES.map((s) => (
                <span key={s} className="text-sm font-semibold text-slate-400">{s}</span>
              ))}
            </div>
          </div>
        </section>

        {/* PRODUCT PREVIEW — mockup do painel */}
        <section className="mx-auto w-full max-w-5xl px-6 py-16">
          <div className="mb-10 text-center animate-fade-in-up">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-300/80">{t("lp_preview_tag")}</p>
            <h2 className="mt-3 text-3xl font-bold text-white md:text-4xl">{t("lp_preview_title")}</h2>
            <p className="mt-2 text-slate-400">{t("lp_preview_sub")}</p>
          </div>
          <div className="animate-scale-in overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70 shadow-2xl shadow-black/40">
            {/* barra de janela */}
            <div className="flex items-center gap-1.5 border-b border-slate-800 bg-slate-950/60 px-4 py-3">
              <span className="h-3 w-3 rounded-full bg-rose-500/70" />
              <span className="h-3 w-3 rounded-full bg-amber-500/70" />
              <span className="h-3 w-3 rounded-full bg-emerald-500/70" />
              <span className="ml-3 text-xs text-slate-500">chainfolioai · dashboard</span>
            </div>
            {/* tiles de métricas */}
            <div className="grid gap-4 p-5 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">{t("lp_pv_total")}</p>
                <p className="mt-1 text-2xl font-black text-white">€ 61 240</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">{t("lp_pv_pnl")}</p>
                <p className="mt-1 text-2xl font-black text-emerald-400">+ € 3 480</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Sharpe</p>
                <p className="mt-1 text-2xl font-black text-white">1.87</p>
              </div>
            </div>
            {/* métricas de análise */}
            <div className="grid grid-cols-2 gap-3 px-5 sm:grid-cols-4">
              {PREVIEW_METRICS.map((m) => (
                <div key={m.k} className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500">{m.k}</p>
                  <p className={`text-base font-bold ${m.cls}`}>{m.v}</p>
                </div>
              ))}
            </div>
            {/* gráfico + alocação */}
            <div className="grid gap-4 px-5 py-5 sm:grid-cols-[1.4fr_1fr]">
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="flex h-32 items-end gap-2">
                  {PREVIEW_BARS.map((h, i) => (
                    <div key={i} className="flex-1 rounded-t bg-gradient-to-t from-orange-500/30 to-orange-400" style={{ height: `${h}%` }} />
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <p className="mb-3 text-[11px] uppercase tracking-wide text-slate-500">{t("lp_pv_alloc")}</p>
                <div className="space-y-2.5">
                  {ALLOC.map((a) => (
                    <div key={a.sym} className="flex items-center gap-2 text-sm">
                      <span className={`h-2.5 w-2.5 rounded-full ${a.cls}`} />
                      <span className="text-slate-300">{a.sym}</span>
                      <span className="ml-auto font-semibold text-slate-400">{a.pct}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SCREENSHOTS REAIS (aparece só quando há imagens em /public/screenshots) */}
        <AppScreenshots />

        {/* FEATURES */}
        <section id="recursos" className="mx-auto w-full max-w-6xl px-6 py-20">
          <div className="mb-14 text-center animate-fade-in-up">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-300/80">{t("lp_features")}</p>
            <h2 className="mt-3 text-3xl font-bold text-white md:text-4xl">{t("lp_all_you_need")}</h2>
            <p className="mt-3 text-slate-400 max-w-xl mx-auto">{t("lp_single_platform")}</p>
          </div>
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <div
                key={f.t}
                className={`card-hover rounded-2xl border border-slate-800 bg-slate-900/60 p-6 animate-fade-in-up delay-${Math.min(i * 100, 500)}`}
              >
                <div className="mb-4 text-3xl leading-none">{f.icon}</div>
                <h3 className="text-base font-bold text-white">{t(f.t)}</h3>
                <p className="mt-2 text-sm text-slate-400 leading-relaxed">{t(f.d)}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ANÁLISE & GESTÃO — ferramentas específicas */}
        <section id="ferramentas" className="border-t border-slate-800/50 bg-slate-900/40 py-20">
          <div className="mx-auto w-full max-w-6xl px-6">
            <div className="mb-14 text-center animate-fade-in-up">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-300/80">{t("lp_tools_tag")}</p>
              <h2 className="mt-3 text-3xl font-bold text-white md:text-4xl">{t("lp_tools_title")}</h2>
              <p className="mt-3 text-slate-400 max-w-2xl mx-auto">{t("lp_tools_sub")}</p>
            </div>
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {TOOLS.map((f, i) => (
                <div
                  key={f.t}
                  className={`card-hover rounded-2xl border border-slate-800 bg-slate-950/50 p-6 animate-fade-in-up delay-${Math.min(i * 100, 500)}`}
                >
                  <div className="mb-4 text-3xl leading-none">{f.icon}</div>
                  <h3 className="text-base font-bold text-white">{t(f.t)}</h3>
                  <p className="mt-2 text-sm text-slate-400 leading-relaxed">{t(f.d)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* COMPARAÇÃO — Porquê o ChainFolioAI */}
        <section id="comparacao" className="mx-auto w-full max-w-5xl px-6 py-20">
          <div className="mb-14 text-center animate-fade-in-up">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-300/80">{t("lp_cmp_tag")}</p>
            <h2 className="mt-3 text-3xl font-bold text-white md:text-4xl">{t("lp_cmp_title")}</h2>
            <p className="mt-3 text-slate-400 max-w-2xl mx-auto">{t("lp_cmp_sub")}</p>
          </div>
          <div className="animate-scale-in overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/50">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="px-5 py-4 text-left font-semibold text-slate-400"></th>
                  <th className="px-4 py-4 text-center font-semibold text-slate-400">{t("lp_cmp_col_sheet")}</th>
                  <th className="px-4 py-4 text-center font-semibold text-slate-400">{t("lp_cmp_col_generic")}</th>
                  <th className="px-4 py-4 text-center font-bold text-orange-300">
                    <span className="inline-flex items-center gap-2">
                      <img src="/chainfolioai-icon.png" alt="" className="h-5 w-5 rounded object-cover" />
                      ChainFolioAI
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((r) => (
                  <tr key={r.l} className="border-b border-slate-800/60 last:border-0">
                    <td className="px-5 py-4 text-left font-medium text-slate-200">{t(r.l)}</td>
                    <td className="px-4 py-4 text-center text-slate-500">{t(r.a)}</td>
                    <td className="px-4 py-4 text-center text-slate-400">{t(r.b)}</td>
                    <td className="bg-orange-500/[0.06] px-4 py-4 text-center font-semibold text-orange-200">{t(r.c)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-8 text-center">
            <a href="/login" className="rounded-full bg-orange-500 px-8 py-3.5 text-base font-bold text-slate-950 shadow-lg shadow-orange-500/25 transition hover:bg-orange-400 hover:scale-[1.03] active:scale-[0.98] inline-block">
              {t("lp_plan_cta")}
            </a>
          </div>
        </section>

        {/* PLANOS */}
        <section id="planos" className="mx-auto w-full max-w-6xl px-6 py-20">
          <div className="mb-14 text-center animate-fade-in-up">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-300/80">{t("lp_plans_tag")}</p>
            <h2 className="mt-3 text-3xl font-bold text-white md:text-4xl">{t("lp_plans_title")}</h2>
            <p className="mt-3 text-slate-400 max-w-xl mx-auto">{t("lp_plans_sub")}</p>
          </div>
          <div className="grid gap-5 md:grid-cols-3 md:items-start">
            {PLANS.map((p, i) => (
              <div
                key={p.name}
                className={`card-hover relative rounded-2xl border p-7 animate-fade-in-up delay-${i * 100 + 100} ${
                  p.popular
                    ? "border-orange-500/50 bg-gradient-to-br from-slate-900 to-slate-950 md:-mt-2 md:shadow-xl md:shadow-orange-500/10"
                    : "border-slate-800 bg-slate-900/60"
                }`}
              >
                {p.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-orange-500 px-3 py-1 text-[11px] font-bold text-slate-950">
                    {t("lp_plan_popular")}
                  </span>
                )}
                <h3 className="text-lg font-bold text-white">{p.name}</h3>
                <p className="mt-1 text-sm text-slate-400">{t(p.desc)}</p>
                <p className="mt-4 flex items-baseline gap-1">
                  <span className="text-3xl font-black text-white">{p.price}</span>
                  {p.paid && <span className="text-sm text-slate-500">{t("lp_plan_mo")}</span>}
                </p>
                <ul className="mt-5 space-y-2.5">
                  {p.feats.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-slate-300">
                      <span className="mt-0.5 text-orange-400">✓</span>
                      <span>{t(f)}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href={p.paid ? "/pricing" : "/login"}
                  className={`mt-6 block rounded-full px-5 py-3 text-center text-sm font-bold transition ${
                    p.popular
                      ? "bg-orange-500 text-slate-950 hover:bg-orange-400"
                      : "border border-slate-700 text-slate-200 hover:border-slate-500 hover:text-white"
                  }`}
                >
                  {p.paid ? t("lp_plan_choose") : t("lp_plan_cta")}
                </a>
              </div>
            ))}
          </div>
          <div className="mt-8 text-center">
            <a href="/pricing" className="text-sm font-semibold text-orange-300/90 transition hover:text-orange-200">
              {t("lp_plan_see_all")} →
            </a>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="como-funciona" className="bg-slate-900/40 py-20">
          <div className="mx-auto w-full max-w-4xl px-6">
            <div className="mb-14 text-center animate-fade-in-up">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-300/80">{t("lp_how_works")}</p>
              <h2 className="mt-3 text-3xl font-bold text-white">{t("lp_3_steps")}</h2>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <div key={s.num} className={`card-hover rounded-2xl border border-orange-500/20 bg-gradient-to-br from-slate-900 to-slate-950 p-7 animate-fade-in-up delay-${i * 150 + 100}`}>
                  <div className="mb-5 text-6xl font-black text-orange-500/15 leading-none">{s.num}</div>
                  <h3 className="text-base font-bold text-white">{t(s.t)}</h3>
                  <p className="mt-2 text-sm text-slate-400 leading-relaxed">{t(s.d)}</p>
                </div>
              ))}
            </div>
            <div className="mt-10 text-center">
              <a href="/como-funciona" className="text-sm font-semibold text-orange-300/90 transition hover:text-orange-200">
                {t("lp_how_see_detail")}
              </a>
            </div>
          </div>
        </section>

        {/* SEGURANÇA */}
        <section id="seguranca" className="mx-auto w-full max-w-6xl px-6 py-20">
          <div className="mb-12 text-center animate-fade-in-up">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-300/80">{t("lp_sec_tag")}</p>
            <h2 className="mt-3 text-3xl font-bold text-white md:text-4xl">{t("lp_sec_title")}</h2>
            <p className="mt-3 text-slate-400 max-w-2xl mx-auto">{t("lp_sec_sub")}</p>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {SECURITY.map((s, i) => (
              <div
                key={s.t}
                className={`card-hover rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-6 animate-fade-in-up delay-${i * 100 + 100}`}
              >
                <div className="mb-4 text-3xl leading-none">{s.icon}</div>
                <h3 className="text-base font-bold text-white">{t(s.t)}</h3>
                <p className="mt-2 text-sm text-slate-400 leading-relaxed">{t(s.d)}</p>
              </div>
            ))}
          </div>
        </section>

        {/* PARA EQUIPAS E INSTITUIÇÕES */}
        <section id="instituicoes" className="border-t border-slate-800/50 bg-slate-900/40 py-20">
          <div className="mx-auto w-full max-w-6xl px-6">
            <div className="mb-14 text-center animate-fade-in-up">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-300/80">{t("lp_inst_tag")}</p>
              <h2 className="mt-3 text-3xl font-bold text-white md:text-4xl">{t("lp_inst_title")}</h2>
              <p className="mt-3 text-slate-400 max-w-2xl mx-auto">{t("lp_inst_sub")}</p>
            </div>
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
              {INSTITUTIONS.map((f, i) => (
                <div
                  key={f.t}
                  className={`card-hover rounded-2xl border border-slate-800 bg-slate-950/50 p-6 animate-fade-in-up delay-${Math.min(i * 100, 500)}`}
                >
                  <div className="mb-4 text-3xl leading-none">{f.icon}</div>
                  <h3 className="text-base font-bold text-white">{t(f.t)}</h3>
                  <p className="mt-2 text-sm text-slate-400 leading-relaxed">{t(f.d)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="mx-auto w-full max-w-3xl px-6 py-20">
          <div className="mb-12 text-center animate-fade-in-up">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-300/80">{t("lp_faq_tag")}</p>
            <h2 className="mt-3 text-3xl font-bold text-white md:text-4xl">{t("lp_faq_title")}</h2>
          </div>
          <div className="space-y-3">
            {FAQ.map((f, i) => (
              <details
                key={f.q}
                className={`group card-hover rounded-2xl border border-slate-800 bg-slate-900/60 p-6 animate-fade-in-up delay-${Math.min(i * 100, 500)}`}
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-bold text-white">
                  <span>{t(f.q)}</span>
                  <span className="text-orange-400 transition-transform duration-200 group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm text-slate-400 leading-relaxed">{t(f.a)}</p>
              </details>
            ))}
          </div>
        </section>

        {/* CTA FINAL */}
        <section className="mx-auto w-full max-w-3xl px-6 py-24 text-center">
          <div className="animate-scale-in rounded-3xl border border-orange-500/20 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 p-10 shadow-2xl shadow-black/40 relative overflow-hidden">
            {/* glow decorativo */}
            <div className="animate-glow-pulse pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full bg-orange-500/10 blur-[80px]" aria-hidden />
            <div className="relative">
              <img src="/chainfolioai-icon.png" alt="" className="mb-5 mx-auto h-16 w-16 rounded-2xl object-cover" />
              <h2 className="text-3xl font-bold text-white md:text-4xl">{t("lp_ready")}</h2>
              <p className="mt-4 text-slate-400 max-w-sm mx-auto">Junta-te à comunidade ChainFolioAI. Grátis para sempre no plano base.</p>
              <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                <a href="/login" className="w-full rounded-full bg-orange-500 px-10 py-4 text-base font-bold text-slate-950 shadow-lg shadow-orange-500/25 transition hover:bg-orange-400 hover:scale-[1.03] active:scale-[0.97] sm:w-auto">
                  Criar conta grátis
                </a>
                <a href="/login" className="w-full rounded-full border border-slate-700 px-10 py-4 text-base font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white sm:w-auto">
                  Já tenho conta →
                </a>
              </div>
              <p className="mt-5 text-xs text-slate-600">{t("lp_no_card2")}</p>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="keep-dark border-t border-slate-900 bg-slate-950/80 py-10">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <img src="/chainfolioai-icon.png" alt="" className="h-8 w-8 rounded-lg object-cover" />
              <div>
                <p className="font-bold text-white">ChainFolioAI</p>
                <p className="text-xs text-slate-500">{t("lp_tagline")}</p>
              </div>
            </div>
            <div className="flex gap-6 text-sm text-slate-500">
              <a href="#recursos" className="transition hover:text-slate-300">{t("lp_features")}</a>
              <a href="#ferramentas" className="transition hover:text-slate-300">{t("lp_tools_tag")}</a>
              <a href="#planos" className="transition hover:text-slate-300">{t("lp_plans_tag")}</a>
              <a href="#instituicoes" className="transition hover:text-slate-300">{t("lp_inst_tag")}</a>
              <a href="#comparacao" className="transition hover:text-slate-300">{t("lp_cmp_tag")}</a>
              <a href="/como-funciona" className="transition hover:text-slate-300">{t("dash_how_title")}</a>
              <a href="#faq" className="transition hover:text-slate-300">{t("lp_faq_tag")}</a>
              <a href="/privacidade" className="transition hover:text-slate-300">{t("legal_privacy_short")}</a>
              <a href="/termos" className="transition hover:text-slate-300">{t("legal_terms_short")}</a>
              <a href="/login" className="transition hover:text-slate-300">{t("lp_login")}</a>
            </div>
            <p className="text-xs text-slate-600">© 2025 ChainFolioAI · Todos os direitos reservados</p>
          </div>
        </footer>
      </div>
    </div>
    </AppShell>
  );
}
