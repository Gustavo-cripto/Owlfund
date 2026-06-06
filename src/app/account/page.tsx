"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/LanguageContext";

type SubscriptionStatus = {
  status: string;
  current_period_end: string | null;
};

export default function AccountPage() {
  const supabase = createClient();
  const { t } = useLanguage();
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [billingError, setBillingError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) { window.location.href = "/login"; return; }
      setEmail(user.email ?? null);
      setUserId(user.id);
      const { data: subData } = await supabase
        .from("subscriptions")
        .select("status, current_period_end")
        .eq("user_id", user.id)
        .order("current_period_end", { ascending: false })
        .limit(1)
        .maybeSingle();
      setSubscription(subData ?? null);
      setLoading(false);
    };
    load();
  }, [supabase]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  const handleManageBilling = async () => {
    if (!userId) return;
    setBillingError(null);
    const response = await fetch("/api/stripe/portal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const data = (await response.json()) as { url?: string };
    if (data.url) {
      window.location.href = data.url;
    } else {
      setBillingError(t("acc_billing_error"));
    }
  };

  const isPro = subscription?.status === "active" || subscription?.status === "trialing";
  const periodEnd = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString("pt-PT")
    : null;

  return (
    <AppShell>
    <div className="relative min-h-screen bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full bg-orange-500/6 blur-[100px]" />
      </div>

      <div className="relative z-10">
        <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 pb-20 pt-6">

          {/* Header */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-300/80">{t("acc_title")}</p>
            <h1 className="mt-2 text-2xl font-bold text-white">{t("acc_my_account")}</h1>
            <p className="mt-1 text-sm text-slate-400">{t("acc_subtitle")}</p>
          </div>

          {/* User info */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-6">
            <div className="space-y-2 text-sm text-slate-300">
              <div className="flex items-center gap-2">
                <span className="text-slate-500 w-20">{t("acc_email")}</span>
                <span className="font-medium text-white">{email ?? "—"}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-500 w-20">{t("acc_plan")}</span>
                {loading ? (
                  <span className="text-slate-500 animate-pulse">{t("loading")}</span>
                ) : isPro ? (
                  <span className="text-emerald-400 font-semibold">Pro ✓</span>
                ) : (
                  <span className="text-slate-300">{t("free")}</span>
                )}
              </div>
              {isPro && periodEnd && (
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 w-20">{t("acc_expires")}</span>
                  <span className="text-slate-300">{periodEnd}</span>
                </div>
              )}
            </div>

            {/* Plan comparison */}
            <div className="grid gap-3 sm:grid-cols-2">
              {/* Free */}
              <div className={`rounded-xl border p-4 ${!isPro ? "border-orange-500/30 bg-orange-500/5" : "border-slate-800 bg-slate-950/40"}`}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{t("acc_free_plan")}</p>
                  {!isPro && <span className="text-[10px] bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded-full px-2 py-0.5">{t("pricing_current")}</span>}
                </div>
                <p className="text-xs text-slate-500 mb-3">{t("acc_free_desc")}</p>
                <ul className="space-y-1.5 text-xs text-slate-400">
                  <li className="flex gap-2"><span className="text-emerald-400 shrink-0">✓</span>{t("acc_free_feature_1")}</li>
                  <li className="flex gap-2"><span className="text-emerald-400 shrink-0">✓</span>{t("acc_free_feature_2")}</li>
                  <li className="flex gap-2"><span className="text-emerald-400 shrink-0">✓</span>{t("acc_free_feature_3")}</li>
                  <li className="flex gap-2"><span className="text-slate-600 shrink-0">—</span>{t("acc_free_limitation")}</li>
                </ul>
              </div>

              {/* Pro */}
              <div className={`rounded-xl border p-4 ${isPro ? "border-orange-500/40 bg-orange-500/8" : "border-slate-700 bg-slate-900/40"}`}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-bold uppercase tracking-widest text-orange-400">{t("acc_pro_plan")}</p>
                  {isPro && <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full px-2 py-0.5">{t("acc_active_pro")}</span>}
                </div>
                <p className="text-xs text-slate-500 mb-3">{t("acc_pro_desc")}</p>
                <ul className="space-y-1.5 text-xs text-slate-300">
                  <li className="flex gap-2"><span className="text-orange-400 shrink-0">✓</span>{t("acc_pro_feature_1")}</li>
                  <li className="flex gap-2"><span className="text-orange-400 shrink-0">✓</span>{t("acc_pro_feature_2")}</li>
                  <li className="flex gap-2"><span className="text-orange-400 shrink-0">✓</span>{t("acc_pro_feature_3")}</li>
                </ul>
              </div>
            </div>

            {billingError && <p className="text-xs text-rose-400">{billingError}</p>}

            {/* Actions */}
            <div className="flex flex-col gap-3 sm:flex-row pt-2">
              {isPro ? (
                <button type="button" onClick={handleManageBilling}
                  className="rounded-full border border-orange-400/40 px-6 py-3 text-sm font-semibold text-orange-200 transition hover:border-orange-400 hover:text-white">
                  {t("acc_manage")}
                </button>
              ) : (
                <a href="/pricing"
                  className="rounded-full bg-orange-500 px-6 py-3 text-sm font-bold text-slate-950 hover:bg-orange-400 transition text-center">
                  {t("acc_upgrade")}
                </a>
              )}
              <a href="/pricing"
                className="rounded-full border border-slate-700 px-6 py-3 text-sm font-semibold text-slate-300 hover:border-slate-500 hover:text-white transition text-center">
                {t("acc_compare_plans")}
              </a>
              <button type="button" onClick={handleLogout}
                className="rounded-full border border-slate-700 px-6 py-3 text-sm font-semibold text-slate-400 hover:border-rose-500/40 hover:text-rose-400 transition">
                {t("acc_logout")}
              </button>
            </div>
          </div>

        </main>
      </div>
    </div>
    </AppShell>
  );
}
