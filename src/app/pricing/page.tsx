"use client";

import Link from "next/link";
import AppShell from "@/components/AppShell";
import { btnPrimary } from "@/lib/ui/buttons";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CRYPTO_PAYMENTS_ENABLED } from "@/lib/payments/config";
import { cryptoPrice, CRYPTO_DISCOUNT_PCT , FIAT_PRICES } from "@/lib/payments/pricing";

// ── Feature comparison table data ─────────────────────────────────────────

function Cell({ value }: { value: boolean | string }) {
  if (value === true) return <span className="text-emerald-400 font-bold">✓</span>;
  if (value === false) return <span className="text-slate-700">—</span>;
  return <span className="text-xs text-slate-300">{value}</span>;
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function PricingPage() {
  const { t, lang } = useLanguage();
  const supabase = createClient();

  const COMPARISON = [
    { category: t("pc_cat_wallets"), rows: [
      { label: t("pc_r_wallets_onchain"), free: t("pc_up_to_3"), pro: t("pc_unlimited"), premium: t("pc_unlimited") },
      { label: t("pc_r_cex"), free: false, pro: true, premium: true },
      { label: t("pc_r_hyperliquid"), free: false, pro: true, premium: true },
      { label: t("pc_r_cold"), free: true, pro: true, premium: true },
    ]},
    { category: t("pc_cat_portfolio"), rows: [
      { label: t("pc_r_snapshots"), free: true, pro: true, premium: true },
      { label: t("pc_r_history"), free: t("pc_30_days"), pro: t("pc_1_year"), premium: t("pc_unlimited") },
      { label: t("pc_r_csv"), free: true, pro: true, premium: true },
      { label: t("pc_r_pdf_auto"), free: true, pro: true, premium: true },
    ]},
    { category: t("pc_cat_smart"), rows: [
      { label: t("pc_r_watchlist"), free: t("pc_3_addr"), pro: t("pc_unlimited"), premium: t("pc_unlimited") },
      { label: t("pc_r_whale_history"), free: t("pc_last_100"), pro: t("pc_last_100"), premium: t("pc_last_100") },
      { label: t("pc_r_alerts_100k"), free: false, pro: true, premium: true },
      { label: t("pc_r_sm_rt"), free: false, pro: false, premium: true },
    ]},
    { category: t("pc_cat_ai"), rows: [
      { label: t("pc_r_prices_rt"), free: true, pro: true, premium: true },
      { label: t("pc_r_btc_blocks"), free: true, pro: true, premium: true },
      { label: t("pc_r_news_rss"), free: true, pro: true, premium: true },
      { label: t("pc_r_ai_news"), free: false, pro: true, premium: true },
      { label: t("pc_r_ai_briefing"), free: false, pro: true, premium: true },
      { label: t("pc_r_ai_portfolio"), free: t("pc_1_month"), pro: t("pc_unlimited"), premium: t("pc_unlimited") },
      { label: t("pc_r_ai_chat"), free: false, pro: true, premium: true },
    ]},
    { category: t("pc_cat_tax"), rows: [
      { label: t("pc_r_tax_calc"), free: t("pc_30_days"), pro: t("pc_unlimited"), premium: t("pc_unlimited") },
      { label: t("pc_r_countries"), free: t("pc_4_countries"), pro: t("pc_8_countries"), premium: t("pc_all") },
      { label: t("pc_r_tax_guide"), free: true, pro: true, premium: true },
      { label: t("pc_r_tax_pdf"), free: false, pro: true, premium: true },
    ]},
    { category: t("pc_cat_fire"), rows: [
      { label: t("pc_r_fire_calc"), free: true, pro: true, premium: true },
      { label: t("pc_r_fire_scen"), free: t("pc_unlimited"), pro: t("pc_unlimited"), premium: t("pc_unlimited") },
      { label: t("pc_r_fire_proj"), free: true, pro: true, premium: true },
    ]},
    { category: t("pc_cat_api"), rows: [
      { label: t("pc_r_api_rest"), free: false, pro: false, premium: true },
      { label: t("pc_r_mcp"), free: false, pro: false, premium: true },
      { label: t("pc_r_webhooks"), free: false, pro: false, premium: true },
    ]},
    { category: t("pc_cat_support"), rows: [
      { label: t("pc_r_support_email"), free: true, pro: true, premium: true },
      { label: t("pc_r_support_priority"), free: false, pro: true, premium: true },
      { label: t("pc_r_early_access"), free: false, pro: false, premium: true },
    ]},
  ];
  const [isPro, setIsPro] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [founder, setFounder] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [billingInterval, setBillingInterval] = useState<"month" | "year">("month");
  const [payMethod, setPayMethod] = useState<"fiat" | "crypto">("fiat");
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) return;
      setUserId(user.id);
      try {
        const res = await fetch("/api/subscription");
        if (res.ok) {
          const json = await res.json() as { plan: string };
          if (json.plan === "premium") setIsPremium(true);
          else if (json.plan === "pro") setIsPro(true);
        }
      } catch { /* ignore */ }
      try {
        const rf = await fetch("/api/founder-status");
        if (rf.ok) {
          const jf = await rf.json() as { founder?: boolean };
          if (jf.founder) setFounder(true);
        }
      } catch { /* ignore */ }
      } catch { /* sessão corrompida → mostra como visitante */ }
      finally { setLoading(false); }
    };
    load();
  }, [supabase]);

  const handleSyncPlan = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/sync-subscription", { method: "POST" });
      const json = await res.json() as { synced?: boolean; price_id?: string; error?: string };
      if (json.synced) window.location.reload();
      else setNotice(t("pc_sync_none"));
    } catch {
      setNotice(t("pc_sync_error"));
    }
    setSyncing(false);
  };

  const handleUpgrade = async (plan: "pro" | "premium") => {
    if (!userId) { window.location.href = "/login?next=%2Fpricing"; return; }
    try {
      // getSession() pode rebentar se a sessão local estiver corrompida — nesse
      // caso mostramos mensagem em vez de falhar em silêncio (botão "não faz nada").
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token ?? "";
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${accessToken}` },
        body: JSON.stringify({ userId, plan, interval: billingInterval }),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (data.url) { window.location.href = data.url; return; }
      setNotice(data.error ?? t("pc_checkout_error"));
    } catch {
      setNotice(t("pc_checkout_error"));
    }
  };

  const handleCryptoUpgrade = async (plan: "pro" | "premium") => {
    if (!userId) { window.location.href = "/login?next=%2Fpricing"; return; }
    try {
      const res = await fetch("/api/crypto/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, period: billingInterval === "year" ? "annual" : "monthly" }),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (data.url) { window.location.href = data.url; return; }
      setNotice(data.error ?? t("pc_checkout_error"));
    } catch {
      setNotice(t("pc_checkout_error"));
    }
  };

  const upgrade = (plan: "pro" | "premium") =>
    payMethod === "crypto" ? handleCryptoUpgrade(plan) : handleUpgrade(plan);

  // Pagamentos congelados durante o beta — no lançamento define
  // NEXT_PUBLIC_PAYMENTS_ENABLED=true na Vercel (o checkout também valida no servidor).
  const paymentsFrozen = process.env.NEXT_PUBLIC_PAYMENTS_ENABLED !== "true";

  const currentPlan = isPremium ? "premium" : isPro ? "pro" : "free";
  const annual = billingInterval === "year";
  // Preços por plano/intervalo. Anual ≈ 2 meses grátis face ao mensal.
  // Em modo cripto, mostra o preço com desconto em EURC.
  const locale = ({ pt: "pt-PT", en: "en-GB", es: "es-ES", fr: "fr-FR" } as Record<string, string>)[lang] ?? "pt-PT";
  const fmtEur = (n: number) => new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }).format(n);
  const fmtEurc = (n: number) => `${n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EURC`;
  // Preços a partir da fonte única (src/lib/payments/pricing.ts).
  const priceLabel = (plan: "free" | "pro" | "premium") => {
    if (plan === "free") return fmtEur(0);
    if (payMethod === "crypto") return fmtEurc(cryptoPrice(plan, annual ? "annual" : "monthly"));
    return fmtEur(FIAT_PRICES[plan][annual ? "annual" : "monthly"]);
  };
  // Poupança anual vs 12× mensal, calculada (não fixa).
  const annualSaving = (plan: "pro" | "premium") =>
    Math.round(FIAT_PRICES[plan].monthly * 12 - FIAT_PRICES[plan].annual);

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
                {t("pc_subtitle")}
              </p>
            </div>

            {/* Intro — como escolher */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 max-w-3xl mx-auto">
              <h2 className="text-sm font-bold text-white mb-3">{t("pc_intro_title")}</h2>
              <div className="space-y-2.5 text-sm text-slate-300 leading-relaxed">
                <p>{t("pc_intro_1")}</p>
                <p>{t(paymentsFrozen ? "pc_intro_2_beta" : "pc_intro_2")}</p>
              </div>
            </div>

            {/* Stats bar */}
            <div className="flex flex-wrap justify-center gap-6 text-center">
              {[
                { value: "10+", label: t("pc_stat_chains") },
                { value: "6 CEX 🇪🇺", label: t("pc_stat_cex") },
                { value: `21 ${t("pc_countries_word")}`, label: t("pc_stat_tax") },
                { value: "API/MCP", label: t("pc_stat_api") },
              ].map((s) => (
                <div key={s.label} className="text-center">
                  <p className="text-lg font-bold text-orange-400">{s.value}</p>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wide">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Trust bar */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { icon: "🔒", label: t("pc_trust_readonly") },
                { icon: "↩️", label: t("pc_trust_cancel") },
                { icon: "💳", label: t("pc_trust_nocard") },
                { icon: "🔐", label: t(paymentsFrozen ? "pc_trust_stripe_beta" : "pc_trust_stripe") },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-2.5 rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-2.5">
                  <span className="text-lg shrink-0">{item.icon}</span>
                  <span className="text-[11px] leading-snug text-slate-400">{item.label}</span>
                </div>
              ))}
            </div>

            {/* Monthly / Annual toggle */}
            <div className="flex justify-center">
              <div className="inline-flex items-center gap-1 rounded-full border border-slate-800 bg-slate-900/60 p-1">
                <button type="button" onClick={() => setBillingInterval("month")}
                  className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${billingInterval === "month" ? "bg-orange-500 text-slate-950" : "text-slate-400 hover:text-white"}`}>
                  {t("pc_monthly")}
                </button>
                <button type="button" onClick={() => setBillingInterval("year")}
                  className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold transition ${billingInterval === "year" ? "bg-orange-500 text-slate-950" : "text-slate-400 hover:text-white"}`}>
                  {t("pc_annual")}
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${billingInterval === "year" ? "bg-slate-950/20 text-slate-950" : "bg-emerald-500/20 text-emerald-300"}`}>{t("pc_save_2months")}</span>
                </button>
              </div>
            </div>

            {/* Payment method toggle (Cartão / Cripto) — só quando ativado */}
            {CRYPTO_PAYMENTS_ENABLED && (
              <div className="flex flex-col items-center gap-2 -mt-6">
                <div className="inline-flex items-center gap-1 rounded-full border border-slate-800 bg-slate-900/60 p-1">
                  <button type="button" onClick={() => setPayMethod("fiat")}
                    className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${payMethod === "fiat" ? "bg-orange-500 text-slate-950" : "text-slate-400 hover:text-white"}`}>
                    💳 {t("pc_pay_card")}
                  </button>
                  <button type="button" onClick={() => setPayMethod("crypto")}
                    className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold transition ${payMethod === "crypto" ? "bg-orange-500 text-slate-950" : "text-slate-400 hover:text-white"}`}>
                    ₿ {t("pc_pay_crypto")}
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${payMethod === "crypto" ? "bg-slate-950/20 text-slate-950" : "bg-emerald-500/20 text-emerald-300"}`}>−{CRYPTO_DISCOUNT_PCT}%</span>
                  </button>
                </div>
                {payMethod === "crypto" && (
                  <p className="text-[11px] text-slate-500 max-w-xs text-center">{t("pc_crypto_pay_note")}</p>
                )}
              </div>
            )}

            {/* Reserva de fundador (beta testers confirmados) */}
            {founder && (
              <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/[0.08] px-5 py-4">
                <span className="text-2xl">🏆</span>
                <div>
                  <p className="text-sm font-bold text-amber-300">{t("pc_founder_title")}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-slate-300">{t("pc_founder_body")}</p>
                </div>
              </div>
            )}

            {/* 3 Plan Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

              {/* Free */}
              <div className={`rounded-2xl border p-6 space-y-5 ${currentPlan === "free" ? "border-slate-500 bg-slate-800/60" : "border-slate-800 bg-slate-900/60"}`}>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{t("free")}</p>
                  <p className="text-3xl font-bold text-white mt-1">{priceLabel("free")} <span className="text-sm font-normal text-slate-500">{annual ? t("pc_per_year") : t("pc_per_month")}</span></p>
                  <p className="text-xs text-slate-500 mt-1">{t("pc_free_tag")}</p>
                  <p className="mt-3 text-xs leading-relaxed text-slate-400"><span className="font-semibold text-slate-300">{t("pc_for_label")}:</span> {t("pc_for_free")}</p>
                </div>
                <div className="space-y-2 text-sm">
                  {[
                    t("pcc_f_wallets"),
                    t("pc_r_prices_rt"),
                    t("pc_r_btc_blocks"),
                    t("pc_r_news_rss"),
                    t("pc_r_cold"),
                    t("pcc_f_watchlist"),
                    t("pcc_f_ai"),
                    t("pcc_f_history"),
                    t("pcc_f_fifo"),
                    t("pcc_f_fire"),
                    t("pcc_f_export"),
                    t("pcc_f_countries"),
                  ].map((f) => (
                    <div key={f} className="flex items-center gap-2 text-slate-400">
                      <span className="text-emerald-500 text-xs">✓</span>{f}
                    </div>
                  ))}
                </div>
                <a href="/dashboard" className="block w-full text-center rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:border-slate-500 hover:text-white transition">
                  {currentPlan === "free" ? t("pc_current_plan") : t("pc_start_free")}
                </a>
              </div>

              {/* Pro */}
              <div className={`rounded-2xl border p-6 space-y-5 relative overflow-hidden ${currentPlan === "pro" ? "border-orange-400 bg-orange-500/10" : "border-orange-500/40 bg-orange-500/5"}`}>
                <div className={`${btnPrimary} absolute top-3 right-3 text-[10px] px-2 py-0.5`}>{t("pc_badge_popular")}</div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-400">Pro</p>
                  <p className="text-3xl font-bold text-white mt-1">{priceLabel("pro")} <span className="text-sm font-normal text-slate-500">{annual ? t("pc_per_year") : t("pc_per_month")}</span></p>
                  {annual && (
                    <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">
                      💸 {t("pc_save_2months")} · {t("pc_you_save")} €{annualSaving("pro")} {t("pc_per_year_short")}
                    </p>
                  )}
                  <p className="text-xs text-slate-500 mt-1">{t("pc_pro_tag")}</p>
                  <p className="mt-3 text-xs leading-relaxed text-slate-300"><span className="font-semibold text-orange-300">{t("pc_for_label")}:</span> {t("pc_for_pro")}</p>
                </div>
                <div className="space-y-2 text-sm">
                  {[
                    t("pc_all_free"),
                    t("pcc_p_wallets"),
                    t("pcc_p_cex"),
                    t("pcc_p_hl"),
                    t("pcc_p_nft"),
                    t("pcc_p_alerts"),
                    t("pcc_p_ainews"),
                    t("pc_r_ai_briefing"),
                    t("pcc_p_aiport"),
                    t("pcc_p_export"),
                    t("pcc_p_history"),
                    t("pcc_p_countries"),
                    t("pc_r_support_priority"),
                  ].map((f, i) => (
                    <div key={f} className={`flex items-center gap-2 text-sm ${i === 0 ? "text-orange-300 font-semibold" : "text-slate-200"}`}>
                      <span className="text-orange-400 text-xs">{i === 0 ? "" : "✓"}</span>{f}
                    </div>
                  ))}
                </div>
                {loading ? (
                  <div className="h-10 rounded-xl bg-slate-800 animate-pulse" />
                ) : currentPlan === "pro" ? (
                  <div className="text-center py-2.5 text-sm text-emerald-400 font-semibold border border-emerald-500/30 rounded-xl bg-emerald-500/10">{t("pc_current_plan")}</div>
                ) : currentPlan === "premium" ? (
                  <div className="text-center py-2.5 text-sm text-slate-500 border border-slate-700 rounded-xl">{t("pc_included_premium")}</div>
                ) : paymentsFrozen ? (
                  <Link href="/beta" className="block rounded-xl border border-orange-500/40 bg-orange-500/10 px-4 py-2.5 text-center transition hover:border-orange-400/60">
                    <span className="block text-sm font-semibold text-orange-300">{t("pc_frozen_cta")}</span>
                    <span className="mt-0.5 block text-[11px] text-slate-400">{t("pc_frozen_sub")}</span>
                  </Link>
                ) : (
                  <button type="button" onClick={() => upgrade("pro")}
                    className={`${btnPrimary} w-full px-4 py-2.5 text-sm`}>
                    {t("pc_btn_upgrade_pro")}
                  </button>
                )}
              </div>

              {/* Premium */}
              <div className={`rounded-2xl border p-6 space-y-5 relative overflow-hidden ${currentPlan === "premium" ? "border-violet-400 bg-violet-500/10" : "border-violet-500/40 bg-violet-500/5"}`}>
                <div className="absolute top-3 right-3 text-[10px] bg-violet-500 text-white font-bold px-2 py-0.5 rounded-full">{t("pc_badge_pro")}</div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">Premium</p>
                  <p className="text-3xl font-bold text-white mt-1">{priceLabel("premium")} <span className="text-sm font-normal text-slate-500">{annual ? t("pc_per_year") : t("pc_per_month")}</span></p>
                  {annual && (
                    <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">
                      💸 {t("pc_save_2months")} · {t("pc_you_save")} €{annualSaving("premium")} {t("pc_per_year_short")}
                    </p>
                  )}
                  <p className="text-xs text-slate-500 mt-1">{t("pc_premium_tag")}</p>
                  <p className="mt-3 text-xs leading-relaxed text-slate-300"><span className="font-semibold text-violet-300">{t("pc_for_label")}:</span> {t("pc_for_premium")}</p>
                </div>
                <div className="space-y-2 text-sm">
                  {[
                    t("pc_all_pro"),
                    t("pc_r_sm_rt"),
                    t("pcc_pr_history"),
                    t("pcc_pr_countries"),
                    t("pc_r_api_rest"),
                    t("pc_r_mcp"),
                    t("pc_r_webhooks"),
                    t("pcc_pr_gestor"),
                    t("pcc_pr_early"),
                  ].map((f, i) => (
                    <div key={f} className={`flex items-center gap-2 text-sm ${i === 0 ? "text-violet-300 font-semibold" : "text-slate-200"}`}>
                      <span className="text-violet-400 text-xs">{i === 0 ? "" : "✓"}</span>{f}
                    </div>
                  ))}
                </div>
                {loading ? (
                  <div className="h-10 rounded-xl bg-slate-800 animate-pulse" />
                ) : currentPlan === "premium" ? (
                  <div className="text-center py-2.5 text-sm text-emerald-400 font-semibold border border-emerald-500/30 rounded-xl bg-emerald-500/10">{t("pc_current_plan")}</div>
                ) : paymentsFrozen ? (
                  <Link href="/beta" className="block rounded-xl border border-violet-500/40 bg-violet-500/10 px-4 py-2.5 text-center transition hover:border-violet-400/60">
                    <span className="block text-sm font-semibold text-violet-300">{t("pc_frozen_cta")}</span>
                    <span className="mt-0.5 block text-[11px] text-slate-400">{t("pc_frozen_sub")}</span>
                  </Link>
                ) : (
                  <button type="button" onClick={() => upgrade("premium")}
                    className="w-full rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-violet-400 transition">
                    {t("pc_btn_upgrade_premium")}
                  </button>
                )}
              </div>
            </div>

            {/* Detailed comparison table */}
            <div className="space-y-6">
              <h2 className="text-lg font-bold text-white text-center">{t("pc_compare_title")}</h2>

              {COMPARISON.map((section) => (
                <div key={section.category} className="rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden">
                  <div className="px-6 py-3 bg-slate-900 border-b border-slate-800">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{section.category}</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-800">
                          <th className="text-left px-6 py-3 text-xs font-semibold text-slate-400 w-1/2">{t("pc_feature_col")}</th>
                          <th className="text-center px-4 py-3 text-xs font-semibold text-slate-400 w-[16%]">{t("free")}</th>
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
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{t("pc_vs_title")}</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-800">
                      <th className="text-left px-6 py-3 text-xs text-slate-400">{t("pc_feature_col")}</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-orange-400">ChainFolioAI Pro</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-violet-400">ChainFolioAI Premium</th>
                      <th className="text-center px-4 py-3 text-xs text-slate-500">CoinStats</th>
                      <th className="text-center px-4 py-3 text-xs text-slate-500">Delta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      [t("pc_vs_price"), "€14,99", "€39", "€19,99", "€14,99"],
                      [t("pc_vs_wallets"), "✓", "✓", "✓", "—"],
                      [t("pc_vs_cex"), "✓", "✓", t("pc_partial"), "—"],
                      [t("pc_vs_sm"), "✓", t("pc_adv_check"), t("pc_partial"), "—"],
                      [t("pc_vs_api"), "—", "✓", "—", "—"],
                      [t("pc_vs_tax"), t("pc_8c"), t("pc_all"), t("pc_limited"), "—"],
                      [t("pc_vs_aichat"), "✓", "✓", "—", "—"],
                    ].map(([feature, chainfolioPro, chainfolioPremium, coinStats, delta]) => (
                      <tr key={feature} className="border-b border-slate-800/50 last:border-0 hover:bg-slate-800/20">
                        <td className="px-6 py-2.5 text-slate-300">{feature}</td>
                        <td className="px-4 py-2.5 text-center text-orange-300 font-semibold">{chainfolioPro}</td>
                        <td className="px-4 py-2.5 text-center text-violet-300 font-semibold">{chainfolioPremium}</td>
                        <td className="px-4 py-2.5 text-center text-slate-500">{coinStats}</td>
                        <td className="px-4 py-2.5 text-center text-slate-500">{delta}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {notice && (
              <p role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3 text-center text-sm text-amber-200">
                {notice} <button type="button" onClick={() => setNotice(null)} className="ml-2 underline">OK</button>
              </p>
            )}

            {/* Sync plan — não faz sentido com pagamentos congelados */}
            {userId && currentPlan !== "premium" && !paymentsFrozen && (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 text-center space-y-3">
                <p className="text-sm font-semibold text-white">{t("pc_sync_q")}</p>
                <p className="text-xs text-slate-400">{t("pc_sync_desc")}</p>
                <button
                  type="button"
                  onClick={handleSyncPlan}
                  disabled={syncing}
                  className="rounded-xl border border-orange-500/40 px-6 py-2.5 text-sm font-semibold text-orange-400 hover:bg-orange-500/10 disabled:opacity-50 transition"
                >
                  {syncing ? t("pc_syncing") : t("pc_sync_btn")}
                </button>
              </div>
            )}

            {/* FAQ */}
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-white text-center">{t("pc_faq_title")}</h2>
              <div className="grid gap-3 md:grid-cols-2">
                {[
                  { q: t("pc_faq_q1"), a: t("pc_faq_a1") },
                  { q: t("pc_faq_q2"), a: t("pc_faq_a2") },
                  { q: t("pc_faq_q3"), a: t("pc_faq_a3") },
                  { q: t("pc_faq_q4"), a: t("pc_faq_a4") },
                  { q: t("pc_faq_q5"), a: t("pc_faq_a5") },
                  { q: t("pc_faq_q6"), a: t("pc_faq_a6") },
                  ...(CRYPTO_PAYMENTS_ENABLED ? [{ q: t("pc_faq_q_crypto"), a: t("pc_faq_a_crypto") }] : []),
                ].map((item) => (
                  <div key={item.q} className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
                    <p className="text-sm font-semibold text-white">{item.q}</p>
                    <p className="mt-2 text-xs leading-relaxed text-slate-400">{item.a}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer note */}
            <div className="text-center space-y-2">
              <p className="text-xs text-slate-600">
                {t(paymentsFrozen ? "pc_footer_beta" : "pc_footer")}
              </p>
            </div>

          </main>
        </div>
      </div>
    </AppShell>
  );
}
