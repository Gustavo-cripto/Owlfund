"use client";

import { useEffect, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import PnlSummaryCard from "@/components/PnlSummaryCard";
import { useRequireAuth } from "@/lib/auth/useRequireAuth";
import { loadWalletSnapshot, type WalletSnapshot } from "@/lib/wallets/storage";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/LanguageContext";

type TokenPrices = Record<string, number>;
type SnapshotRow = { id: number; created_at: string; data: WalletSnapshot };
type Plan = "free" | "pro" | "premium";

async function fetchPrices(): Promise<TokenPrices> {
  try {
    const res = await fetch("/api/prices", { cache: "no-store" });
    if (!res.ok) return {};
    const data = (await res.json()) as { prices?: TokenPrices };
    return data.prices ?? {};
  } catch { return {}; }
}

const sumEntries = (entries?: WalletSnapshot["eth"]) =>
  (entries ?? []).reduce((s, e) => s + (Number(e.balance ?? 0) || 0), 0);

const calcTotal = (snapshot: WalletSnapshot, prices: TokenPrices) =>
  sumEntries(snapshot.eth) * (prices.ETH ?? 0) +
  sumEntries(snapshot.sol) * (prices.SOL ?? 0) +
  sumEntries(snapshot.btc) * (prices.BTC ?? 0) +
  sumEntries(snapshot.ada) * (prices.ADA ?? 0);

function PlanBadge({ plan, size = "sm" }: { plan: "free" | "pro" | "premium" | "all"; size?: "sm" | "xs" }) {
  const cfg = {
    free:    { label: "Grátis",  cls: "bg-slate-700/60 text-slate-300 border-slate-600/40" },
    pro:     { label: "Pro",     cls: "bg-orange-500/20 text-orange-300 border-orange-500/30" },
    premium: { label: "Premium", cls: "bg-violet-500/20 text-violet-300 border-violet-500/30" },
    all:     { label: "Todos",   cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
  }[plan];
  const px = size === "xs" ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]";
  return <span className={`rounded-full border font-bold ${px} ${cfg.cls}`}>{cfg.label}</span>;
}

function LockIcon() {
  return (
    <svg className="text-slate-600" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

export default function DashboardPage() {
  const { isLoading } = useRequireAuth("/login");
  const supabase = createClient();
  const { t } = useLanguage();

  const [pnlPosition, setPnlPosition] = useState(0);
  const [pnlToday, setPnlToday] = useState(0);
  const [pnl30d, setPnl30d] = useState(0);
  const [pnlDaily7d, setPnlDaily7d] = useState(0);
  const [hasWallets, setHasWallets] = useState(false);
  const [currentTotal, setCurrentTotal] = useState(0);
  const [isPnlLoading, setIsPnlLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan>("free");
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }: { data: { user: { id?: string; email?: string } | null } }) => {
      if (!mountedRef.current) return;
      setUserEmail(data.user?.email ?? null);
      if (data.user?.id) {
        const { data: profile } = await supabase
          .from("profiles").select("avatar_url").eq("id", data.user.id).maybeSingle();
        if (mountedRef.current && profile?.avatar_url) setAvatarUrl(profile.avatar_url);
      }
    });
  }, [supabase]);

  useEffect(() => {
    fetch("/api/subscription").then(r => r.ok ? r.json() : null).then(j => {
      if (j?.plan && mountedRef.current) setPlan(j.plan as Plan);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const loadPnl = async () => {
      setIsPnlLoading(true);
      try {
        const snapshot = loadWalletSnapshot();
        const hasAny =
          (snapshot.eth?.length ?? 0) + (snapshot.sol?.length ?? 0) +
          (snapshot.btc?.length ?? 0) + (snapshot.ada?.length ?? 0) > 0;
        if (mountedRef.current) setHasWallets(hasAny);
        if (!hasAny) { if (mountedRef.current) setIsPnlLoading(false); return; }

        const prices = await fetchPrices();
        const total = calcTotal(snapshot, prices);
        if (mountedRef.current) setCurrentTotal(total);

        const { data: authData } = await supabase.auth.getUser();
        const userId = authData.user?.id;
        if (!userId) { if (mountedRef.current) setIsPnlLoading(false); return; }

        try {
          const histRes = await fetch("/api/historical-prices", { cache: "no-store" });
          if (histRes.ok) {
            const hist = (await histRes.json()) as Record<string, Record<string, number>>;
            const totalAt = (p: Record<string, number>) =>
              sumEntries(snapshot.eth) * (p.ETH ?? 0) +
              sumEntries(snapshot.sol) * (p.SOL ?? 0) +
              sumEntries(snapshot.btc) * (p.BTC ?? 0) +
              sumEntries(snapshot.ada) * (p.ADA ?? 0);
            const t1d = totalAt(hist["1d"] ?? {});
            const t7d = totalAt(hist["7d"] ?? {});
            const t30d = totalAt(hist["30d"] ?? {});
            if (mountedRef.current) {
              if (t1d > 0) setPnlToday(total - t1d);
              if (t7d > 0) setPnlDaily7d((total - t7d) / 7);
              if (t30d > 0) setPnl30d(total - t30d);
            }
          }
        } catch { /* ignore */ }

        const { data: rows } = await supabase
          .from("portfolio_snapshots")
          .select("id, created_at, data")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(5);
        const snapshots = (rows ?? []) as SnapshotRow[];
        const oldest = snapshots[snapshots.length - 1];
        if (oldest && mountedRef.current) {
          const storedTotal = (oldest.data as WalletSnapshot & { _totalEur?: number })._totalEur;
          const baseTotal = storedTotal ?? calcTotal(oldest.data, prices);
          setPnlPosition(total - baseTotal);
        }
      } catch { /* silencioso */ }
      finally { if (mountedRef.current) setIsPnlLoading(false); }
    };
    loadPnl();
  }, [supabase]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <p className="text-sm text-slate-400 animate-pulse">{t("loading")}</p>
      </div>
    );
  }

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return t("dash_greeting_morning");
    if (h < 19) return t("dash_greeting_afternoon");
    return t("dash_greeting_evening");
  };

  const firstName = userEmail?.split("@")[0] ?? "Investor";
  const isPro = plan === "pro" || plan === "premium";
  const isPremium = plan === "premium";

  // ── Feature definitions ────────────────────────────────────────────────────
  const FEATURES = [
    {
      href: "/wallets", icon: "🔗", label: t("df_wallets_l"),
      color: "from-blue-500/15 to-blue-600/5", border: "border-blue-500/20", iconBg: "bg-blue-500/10",
      minPlan: "free" as Plan, summary: t("df_wallets_s"),
      tiers: [
        { plan: "free" as const,    text: t("df_wallets_0") },
        { plan: "pro" as const,     text: t("df_wallets_1") },
        { plan: "premium" as const, text: t("df_wallets_2") },
      ],
    },
    {
      href: "/portfolio", icon: "📊", label: t("df_portfolio_l"),
      color: "from-orange-500/15 to-orange-600/5", border: "border-orange-500/20", iconBg: "bg-orange-500/10",
      minPlan: "free" as Plan, summary: t("df_portfolio_s"),
      tiers: [
        { plan: "free" as const,    text: t("df_portfolio_0") },
        { plan: "pro" as const,     text: t("df_portfolio_1") },
        { plan: "premium" as const, text: t("df_portfolio_2") },
      ],
    },
    {
      href: "/smart-money", icon: "🐋", label: t("df_smart_l"),
      color: "from-purple-500/15 to-purple-600/5", border: "border-purple-500/20", iconBg: "bg-purple-500/10",
      minPlan: "free" as Plan, summary: t("df_smart_s"),
      tiers: [
        { plan: "free" as const,    text: t("df_smart_0") },
        { plan: "pro" as const,     text: t("df_smart_1") },
        { plan: "premium" as const, text: t("df_smart_2") },
      ],
    },
    {
      href: "/mercado", icon: "📈", label: t("df_market_l"),
      color: "from-emerald-500/15 to-emerald-600/5", border: "border-emerald-500/20", iconBg: "bg-emerald-500/10",
      minPlan: "free" as Plan, summary: t("df_market_s"),
      tiers: [
        { plan: "free" as const,    text: t("df_market_0") },
        { plan: "pro" as const,     text: t("df_market_1") },
        { plan: "premium" as const, text: t("df_market_2") },
      ],
    },
    {
      href: "/fiscalidade", icon: "🧾", label: t("df_fisc_l"),
      color: "from-yellow-500/15 to-yellow-600/5", border: "border-yellow-500/20", iconBg: "bg-yellow-500/10",
      minPlan: "free" as Plan, summary: t("df_fisc_s"),
      tiers: [
        { plan: "free" as const,    text: t("df_fisc_0") },
        { plan: "pro" as const,     text: t("df_fisc_1") },
        { plan: "premium" as const, text: t("df_fisc_2") },
      ],
    },
    {
      href: "/fire", icon: "🔥", label: t("df_fire_l"),
      color: "from-rose-500/15 to-rose-600/5", border: "border-rose-500/20", iconBg: "bg-rose-500/10",
      minPlan: "free" as Plan, summary: t("df_fire_s"),
      tiers: [
        { plan: "free" as const,    text: t("df_fire_0") },
        { plan: "pro" as const,     text: t("df_fire_1") },
        { plan: "premium" as const, text: t("df_fire_2") },
      ],
    },
    {
      href: "/gestor", icon: "🤖", label: t("df_gestor_l"),
      color: "from-violet-500/15 to-violet-600/5", border: "border-violet-500/20", iconBg: "bg-violet-500/10",
      minPlan: "premium" as Plan, summary: t("df_gestor_s"),
      tiers: [
        { plan: "premium" as const, text: t("df_gestor_0") },
      ],
    },
    {
      href: "/account", icon: "⚙️", label: t("df_api_l"),
      color: "from-slate-500/15 to-slate-600/5", border: "border-slate-500/20", iconBg: "bg-slate-500/10",
      minPlan: "premium" as Plan, summary: t("df_api_s"),
      tiers: [
        { plan: "premium" as const, text: t("df_api_0") },
      ],
    },
  ];

  const planMeta: Record<Plan, { label: string; color: string; border: string; bg: string; badge: string }> = {
    free:    { label: t("free"),   color: "text-slate-300",  border: "border-slate-600", bg: "bg-slate-800/60",   badge: "bg-slate-700 text-slate-300" },
    pro:     { label: "Pro",       color: "text-orange-300", border: "border-orange-500/40", bg: "bg-orange-500/10", badge: "bg-orange-500 text-slate-950" },
    premium: { label: "Premium",   color: "text-violet-300", border: "border-violet-500/40", bg: "bg-violet-500/10", badge: "bg-violet-500 text-white" },
  };

  const tierOrder: Plan[] = ["free", "pro", "premium"];
  const canAccess = (minPlan: Plan) => tierOrder.indexOf(plan) >= tierOrder.indexOf(minPlan);

  return (
    <AppShell>
    <div className="relative min-h-screen bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -top-32 left-1/3 w-[700px] h-[400px] rounded-full bg-orange-500/6 blur-[120px]" />
        <div className="absolute top-1/2 right-0 w-[400px] h-[400px] rounded-full bg-blue-500/4 blur-[100px]" />
      </div>

      <div className="relative z-10">
        <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 pb-24 pt-8">

          {/* ── Hero ── */}
          <section className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="flex items-center gap-4">
              <a href="/account" title="Editar perfil">
                <div className="relative w-14 h-14 rounded-full overflow-hidden border-2 border-slate-700 hover:border-orange-500/60 transition-all shrink-0">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-slate-800 flex items-center justify-center">
                      <span className="text-xl font-bold text-slate-400">
                        {userEmail ? userEmail[0].toUpperCase() : "?"}
                      </span>
                    </div>
                  )}
                </div>
              </a>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-300/70 mb-1">{greeting()}</p>
                <h1 className="text-3xl font-black text-white leading-tight">{firstName} 👋</h1>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${planMeta[plan].badge}`}>
                    {planMeta[plan].label}
                  </span>
                  {plan !== "premium" && (
                    <a href="/pricing" className="text-xs text-orange-400 hover:text-orange-300 transition">
                      {t("dash_see_plans")} →
                    </a>
                  )}
                </div>
              </div>
            </div>

            <div className="md:w-[340px] shrink-0">
              {isPnlLoading ? (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 flex items-center justify-center min-h-[120px]">
                  <p className="text-sm text-slate-500 animate-pulse">{t("dash_pnl_loading")}</p>
                </div>
              ) : !hasWallets ? (
                <div className="rounded-2xl border border-dashed border-orange-500/30 bg-orange-500/5 p-5 flex flex-col items-center gap-3 text-center">
                  <span className="text-2xl">🔗</span>
                  <div>
                    <p className="text-sm font-semibold text-white">{t("dash_no_wallets")}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{t("dash_no_wallets_desc")}</p>
                  </div>
                  <a href="/wallets" className="rounded-full bg-orange-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-orange-400 transition">
                    {t("dash_connect_wallets")}
                  </a>
                </div>
              ) : (
                <PnlSummaryCard
                  position={pnlPosition}
                  today={pnlToday}
                  days30={pnl30d}
                  daily7d={pnlDaily7d}
                  metrics={[
                    { label: t("total"), value: `€ ${currentTotal.toLocaleString("pt-PT", { maximumFractionDigits: 0 })}` },
                    { label: t("nav_wallets"), value: "✓" },
                    { label: "Live", value: "↻" },
                  ]}
                />
              )}
            </div>
          </section>

          {/* ── Plan status bar ── */}
          <section className={`rounded-2xl border p-4 ${planMeta[plan].border} ${planMeta[plan].bg}`}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{plan === "premium" ? "💎" : plan === "pro" ? "⭐" : "🌱"}</span>
                <div>
                  <p className={`text-sm font-bold ${planMeta[plan].color}`}>
                    {plan === "premium" ? t("dash_plan_premium_title") : plan === "pro" ? t("dash_plan_pro_title") : t("dash_plan_free_title")}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {plan === "premium" ? t("dash_plan_premium_desc") : plan === "pro" ? t("dash_plan_pro_desc") : t("dash_plan_free_desc")}
                  </p>
                </div>
              </div>
              {plan !== "premium" && (
                <a href="/pricing"
                  className={`shrink-0 rounded-xl px-4 py-2 text-xs font-bold transition ${plan === "pro" ? "bg-violet-500 text-white hover:bg-violet-400" : "bg-orange-500 text-slate-950 hover:bg-orange-400"}`}>
                  {plan === "pro" ? `${t("dash_upgrade_premium")} →` : `${t("dash_upgrade_pro")} →`}
                </a>
              )}
            </div>
          </section>

          {/* ── Feature grid ── */}
          <section>
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-300/70">{t("dash_platform")}</p>
              <h2 className="mt-1.5 text-xl font-bold text-white">{t("dash_all_features")}</h2>
              <p className="text-xs text-slate-500 mt-1">{t("dash_what_each_plan")}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {FEATURES.map((f) => {
                const accessible = canAccess(f.minPlan);
                return (
                  <a key={f.href} href={accessible ? f.href : "/pricing"}
                    className={`group relative rounded-2xl border p-5 bg-gradient-to-br flex flex-col gap-3 transition-all duration-200
                      ${accessible
                        ? `${f.color} ${f.border} hover:scale-[1.02] hover:shadow-xl hover:shadow-black/30 cursor-pointer`
                        : "from-slate-900/40 to-slate-900/20 border-slate-800 opacity-70 hover:opacity-90 cursor-pointer"}`}
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div className={`w-10 h-10 rounded-xl ${accessible ? f.iconBg : "bg-slate-800"} flex items-center justify-center text-xl`}>
                        {accessible ? f.icon : <LockIcon />}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {f.minPlan === "free"
                          ? <PlanBadge plan="all" size="xs" />
                          : <PlanBadge plan={f.minPlan} size="xs" />}
                        <svg className={`transition ${accessible ? "text-slate-500 group-hover:text-slate-300" : "text-slate-700"}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M7 17L17 7M7 7h10v10" />
                        </svg>
                      </div>
                    </div>

                    {/* Title + summary */}
                    <div>
                      <h3 className={`text-sm font-bold ${accessible ? "text-white" : "text-slate-500"}`}>{f.label}</h3>
                      <p className={`text-xs mt-1 leading-relaxed ${accessible ? "text-slate-400" : "text-slate-600"}`}>{f.summary}</p>
                    </div>

                    {/* Tier breakdown */}
                    <div className="space-y-1.5 pt-1 border-t border-white/5">
                      {f.tiers.map(tier => {
                        const active = tierOrder.indexOf(plan) >= tierOrder.indexOf(tier.plan);
                        return (
                          <div key={tier.plan} className="flex items-start gap-2">
                            <span className={`mt-0.5 text-[10px] font-bold shrink-0 ${active ? "opacity-100" : "opacity-30"}`}>
                              {active ? "✓" : "○"}
                            </span>
                            <div className="flex items-start gap-1.5 min-w-0">
                              <PlanBadge plan={tier.plan} size="xs" />
                              <span className={`text-[11px] leading-relaxed ${active ? "text-slate-300" : "text-slate-600"}`}>{tier.text}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Lock notice for inaccessible features */}
                    {!accessible && (
                      <div className={`rounded-lg px-3 py-2 text-center text-[10px] font-semibold
                        ${f.minPlan === "premium" ? "bg-violet-500/10 text-violet-400 border border-violet-500/20" : "bg-orange-500/10 text-orange-400 border border-orange-500/20"}`}>
                        {t("dash_requires_plan")} {f.minPlan === "premium" ? "Premium" : "Pro"} — {t("dash_click_prices")}
                      </div>
                    )}
                  </a>
                );
              })}
            </div>
          </section>

          {/* ── Quick stats ── */}
          <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { value: "15+", label: t("dash_stat_networks"), icon: "🔗" },
              { value: "100%", label: t("dash_stat_readonly"), icon: "🔒" },
              { value: "24/7", label: t("dash_stat_realtime"), icon: "📡" },
              { value: isPremium ? "€39" : isPro ? "€14,99" : "€0", label: isPremium ? t("dash_stat_plan_premium") : isPro ? t("dash_stat_plan_pro") : t("dash_stat_plan_free"), icon: isPremium ? "💎" : isPro ? "⭐" : "✨" },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl border border-slate-800 bg-slate-900/40 px-5 py-4 flex flex-col gap-1 hover:border-orange-500/30 hover:bg-slate-900/70 transition">
                <span className="text-2xl">{s.icon}</span>
                <p className="text-2xl font-black text-white mt-1">{s.value}</p>
                <p className="text-xs text-slate-500">{s.label}</p>
              </div>
            ))}
          </section>

          {/* ── Upgrade CTA (non-premium) ── */}
          {!isPremium && (
            <section className={`rounded-2xl border p-6 ${isPro ? "border-violet-500/30 bg-violet-500/5" : "border-orange-500/30 bg-orange-500/5"}`}>
              <div className="flex flex-col sm:flex-row sm:items-center gap-5">
                <div className="flex-1">
                  <p className={`text-xs font-semibold uppercase tracking-widest mb-2 ${isPro ? "text-violet-400" : "text-orange-400"}`}>
                    {isPro ? t("dash_cta_premium_eyebrow") : t("dash_cta_pro_eyebrow")}
                  </p>
                  <h3 className="text-lg font-bold text-white mb-1">
                    {isPro ? t("dash_cta_premium_title") : t("dash_cta_pro_title")}
                  </h3>
                  <p className="text-sm text-slate-400">
                    {isPro ? t("dash_cta_premium_desc") : t("dash_cta_pro_desc")}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {(isPro
                      ? ["🤖 Gestor IA personalizado", "📡 Smart Money RT", "🔑 API + MCP", "💎 Todos os países fiscais"]
                      : ["🔓 Carteiras ilimitadas", "📊 Histórico 1 ano+", "🐋 Alertas de baleias", "📤 Exportação CSV/PDF"]
                    ).map(f => (
                      <span key={f} className="text-xs bg-slate-800/60 border border-slate-700/60 rounded-full px-2.5 py-1 text-slate-300">{f}</span>
                    ))}
                  </div>
                </div>
                <div className="shrink-0 text-center">
                  <p className={`text-3xl font-black mb-1 ${isPro ? "text-violet-300" : "text-orange-300"}`}>
                    {isPro ? "€39" : "€14,99"}<span className="text-sm font-normal text-slate-500">{t("dash_per_month")}</span>
                  </p>
                  <a href="/pricing"
                    className={`block w-full rounded-xl px-6 py-3 text-sm font-bold transition ${isPro ? "bg-violet-500 text-white hover:bg-violet-400" : "bg-orange-500 text-slate-950 hover:bg-orange-400"}`}>
                    {isPro ? t("dash_upgrade_premium") : t("dash_upgrade_pro")}
                  </a>
                  <p className="text-[10px] text-slate-600 mt-1.5">{t("dash_cancel_anytime")}</p>
                </div>
              </div>
            </section>
          )}

          {/* ── Como Funciona ── */}
          <section>
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-300/70">{t("dash_how_title")}</p>
              <h2 className="mt-1.5 text-xl font-bold text-white">{t("dash_how_subtitle")}</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                { icon: "🦉", title: t("dash_how_1_title"), desc: t("dash_how_1_desc") },
                { icon: "🔗", title: t("dash_how_2_title"), desc: t("dash_how_2_desc") },
                { icon: "📡", title: t("dash_how_3_title"), desc: t("dash_how_3_desc") },
                { icon: "🤖", title: t("dash_how_4_title"), desc: t("dash_how_4_desc") },
                { icon: "🔒", title: t("dash_how_5_title"), desc: t("dash_how_5_desc") },
                { icon: "💎", title: t("dash_how_6_title"), desc: t("dash_how_6_desc") },
              ].map((item) => (
                <div key={item.title} className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 flex flex-col gap-2">
                  <span className="text-2xl">{item.icon}</span>
                  <h3 className="text-sm font-bold text-white">{item.title}</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ── Tips ── */}
          <section className="rounded-2xl border border-slate-800 bg-slate-900/40 px-6 py-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">{t("dash_quick_tips")}</p>
            <div className="flex flex-wrap gap-5">
              {[
                { icon: "🔒", text: t("dash_tip_1") },
                { icon: "📸", text: t("dash_tip_2") },
                { icon: "💬", text: t("dash_tip_3") },
                { icon: "🌍", text: t("dash_tip_4") },
              ].map((tip) => (
                <div key={tip.icon} className="flex items-center gap-2.5 min-w-0">
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
