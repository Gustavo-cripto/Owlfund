"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { useRequireAuth } from "@/lib/auth/useRequireAuth";
import { createClient } from "@/lib/supabase/client";
import { AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, ReferenceLine } from "recharts";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useTheme } from "@/lib/theme/ThemeContext";

// Regra dos 4% (Trinity Study): património necessário = despesas anuais × 25.
// Lean=20× (levantamento 5%), Regular=25× (4%), Fat=33× (3%) — selecionável.

export default function FirePage() {
  const { isLoading, userId } = useRequireAuth("/login");
  const { t } = useLanguage();
  const { hideBalances } = useTheme();

  // Inputs do utilizador
  const [monthlyExpenses, setMonthlyExpenses] = useState(2000);
  const [monthlyInvestment, setMonthlyInvestment] = useState(500);
  const [annualReturn, setAnnualReturn] = useState(7); // % ao ano
  const [inflationRate, setInflationRate] = useState(3); // %
  const [currentAge, setCurrentAge] = useState(30);

  const [portfolioOverride, setPortfolioOverride] = useState<string>("");
  const [fireMultiple, setFireMultiple] = useState(25); // 20 Lean · 25 Regular · 33 Fat

  // Último snapshot do portefólio (para pré-preencher com 1 clique)
  const [livePortfolio, setLivePortfolio] = useState<number | null>(null);
  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    (async () => {
      try {
        const { data } = await supabase
          .from("portfolio_snapshots")
          .select("data")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1);
        const tot = (data?.[0]?.data as { _totalEur?: number } | undefined)?._totalEur;
        if (typeof tot === "number" && tot > 0) setLivePortfolio(tot);
      } catch { /* ignore */ }
    })();
  }, [userId]);

  const portfolioValue = portfolioOverride !== "" ? Number(portfolioOverride) || 0 : 0;

  const fireTarget = monthlyExpenses * 12 * fireMultiple;
  const swr = 100 / fireMultiple; // taxa de levantamento anual (%)
  const realReturn = (annualReturn - inflationRate) / 100;
  const monthlyReal = realReturn / 12;

  // Anos até um objetivo, dado o património inicial e o investimento mensal
  const calcYears = (pv: number, inv: number, target: number): number | null => {
    if (realReturn <= 0) return null;
    if (pv >= target) return 0;
    if (inv <= 0 && pv <= 0) return null;
    const months = inv > 0
      ? Math.log((target * monthlyReal + inv) / (pv * monthlyReal + inv)) / Math.log(1 + monthlyReal)
      : Math.log(target / Math.max(pv, 1)) / Math.log(1 + monthlyReal);
    const years = Math.ceil(months / 12);
    return years > 99 ? null : years;
  };

  // Anos para FIRE partindo do portefólio atual
  const yearsToFire = useMemo(
    () => calcYears(portfolioValue, monthlyInvestment, fireTarget),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [portfolioValue, monthlyInvestment, fireTarget, monthlyReal, realReturn],
  );

  // Coast FIRE: e se parasses de investir hoje?
  const coastYears = useMemo(
    () => (portfolioValue > 0 ? calcYears(portfolioValue, 0, fireTarget) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [portfolioValue, fireTarget, monthlyReal, realReturn],
  );

  // E se investisses mais por mês?
  const whatIf = useMemo(() => {
    if (yearsToFire === null || yearsToFire === 0) return [];
    return [100, 250, 500].map((extra) => {
      const y = calcYears(portfolioValue, monthlyInvestment + extra, fireTarget);
      return { extra, years: y, saved: y !== null ? yearsToFire - y : null };
    }).filter((w) => w.years !== null && (w.saved ?? 0) > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearsToFire, portfolioValue, monthlyInvestment, fireTarget, monthlyReal, realReturn]);

  const progressPct = fireTarget > 0 ? Math.min(100, (portfolioValue / fireTarget) * 100) : 0;
  const passiveNow = portfolioValue * (swr / 100) / 12; // €/mês que o património atual já geraria

  const fireYear = yearsToFire !== null ? new Date().getFullYear() + yearsToFire : null;
  const fireAge = yearsToFire !== null ? currentAge + yearsToFire : null;

  // Projeção ano a ano
  const projection = useMemo(() => {
    const data: Array<{ year: number; idade: number; patrimonio: number; target: number }> = [];
    let p = portfolioValue;
    const years = Math.min(yearsToFire ? yearsToFire + 5 : 40, 50);
    for (let i = 0; i <= years; i++) {
      data.push({ year: new Date().getFullYear() + i, idade: currentAge + i, patrimonio: Math.round(p), target: fireTarget });
      p = p * (1 + realReturn) + monthlyInvestment * 12;
    }
    return data;
  }, [portfolioValue, monthlyInvestment, realReturn, fireTarget, yearsToFire, currentAge]);

  // Planeamento patrimonial — categorias (uses t() via closure, recalculates on lang change)
  const patrimonialPlan = useMemo(() => {
    const total = portfolioValue || fireTarget;
    return [
      { label: t("fire_emergency"), rec: t("fire_emergency_desc"), value: monthlyExpenses * 6, pct: ((monthlyExpenses * 6) / total * 100).toFixed(0) },
      { label: t("fire_crypto"), rec: t("fire_crypto_desc"), value: total * 0.25, pct: "25" },
      { label: t("fire_stocks"), rec: t("fire_stocks_desc"), value: total * 0.50, pct: "50" },
      { label: t("fire_bonds"), rec: t("fire_bonds_desc"), value: total * 0.15, pct: "15" },
      { label: t("fire_cash"), rec: t("fire_cash_desc"), value: total * 0.10, pct: "10" },
    ];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolioValue, fireTarget, monthlyExpenses, t]);

  if (isLoading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><p className="text-slate-400 animate-pulse">{t("loading")}</p></div>;

  const trim = (v: number) => Number.isInteger(v) ? v.toFixed(0) : v.toFixed(1);
  const fmt = (v: number) => hideBalances ? "••••" : v >= 1_000_000 ? `€ ${trim(v / 1_000_000)}M` : v >= 1_000 ? `€ ${trim(v / 1_000)}K` : `€ ${Math.round(v)}`;

  return (
    <AppShell>
    <div className="relative min-h-screen bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-[700px] h-[300px] rounded-full bg-orange-500/6 blur-[100px]" />
      </div>
      <div className="relative z-10">
        <main className="mx-auto w-full max-w-5xl px-6 pb-24 pt-6 space-y-8">

          {/* Header */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-300/80">{t("fire_eyebrow")}</p>
            <h1 className="mt-2 text-2xl font-bold text-white">{t("fire_title")}</h1>
            <p className="mt-1 text-sm text-slate-400">{t("fire_subtitle")}</p>
          </div>

          {/* Explicação */}
          <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-6">
            <h2 className="text-sm font-bold text-white mb-3">{t("fire_intro_title")}</h2>
            <div className="space-y-2.5 text-sm text-slate-300 leading-relaxed">
              <p>{t("fire_intro_1")}</p>
              <p>{t("fire_intro_2")}</p>
              <p>{t("fire_intro_3")}</p>
            </div>
          </div>

          {/* Inputs */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400 mb-5">{t("fire_params")}</p>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { label: t("fire_monthly_expenses"), key: "monthlyExpenses", value: monthlyExpenses, set: setMonthlyExpenses, min: 500, max: 20000, step: 100, hint: t("fire_hint_expenses") },
                { label: t("fire_monthly_investment"), key: "monthlyInvestment", value: monthlyInvestment, set: setMonthlyInvestment, min: 0, max: 10000, step: 50, hint: t("fire_hint_investment") },
                { label: t("fire_annual_return"), key: "annualReturn", value: annualReturn, set: setAnnualReturn, min: 1, max: 20, step: 0.5, hint: t("fire_hint_return") },
                { label: t("fire_inflation"), key: "inflationRate", value: inflationRate, set: setInflationRate, min: 0, max: 10, step: 0.5, hint: t("fire_hint_inflation") },
                { label: t("fire_current_age"), key: "currentAge", value: currentAge, set: setCurrentAge, min: 18, max: 70, step: 1, hint: t("fire_hint_age") },
              ].map(f => (
                <div key={f.key}>
                  <div className="flex justify-between mb-1.5">
                    <label className="text-xs text-slate-400">{f.label}</label>
                    <span className="text-xs font-bold text-orange-300">{f.key.includes("Return") || f.key.includes("inflation") || f.key.includes("Rate") ? `${f.value}%` : f.key === "currentAge" ? `${f.value} ${t("fire_years")}` : hideBalances ? "••••" : `€ ${f.value.toLocaleString()}`}</span>
                  </div>
                  <input type="range" min={f.min} max={f.max} step={f.step} value={f.value}
                    onChange={e => f.set(Number(e.target.value))}
                    className="w-full accent-orange-500 h-1.5 cursor-pointer" />
                  <div className="flex justify-between text-[9px] text-slate-600 mt-0.5">
                    <span>{f.min}</span><span>{f.max}</span>
                  </div>
                  <p className="text-[10px] leading-snug text-slate-500 mt-1.5">{f.hint}</p>
                </div>
              ))}
              <div>
                <label className="text-xs text-slate-400 block mb-1.5">{t("fire_current_portfolio")}</label>
                <input type="number" placeholder="Ex: 50000" value={portfolioOverride}
                  onChange={e => setPortfolioOverride(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-orange-500" />
                {livePortfolio !== null && Number(portfolioOverride) !== Math.round(livePortfolio) && (
                  <button type="button" onClick={() => setPortfolioOverride(String(Math.round(livePortfolio)))}
                    className="mt-1.5 rounded-lg border border-orange-500/40 bg-orange-500/10 px-2.5 py-1 text-[11px] font-semibold text-orange-300 transition hover:bg-orange-500/20">
                    📊 {t("fire_use_live")} {hideBalances ? "••••" : fmt(livePortfolio)}
                  </button>
                )}
                <p className="text-[10px] leading-snug text-slate-500 mt-1.5">{t("fire_hint_portfolio")}</p>
              </div>
            </div>
          </div>

          {/* Resultado — resposta clara em destaque */}
          <div className="fire-hero rounded-2xl border border-orange-500/30 bg-gradient-to-br from-orange-500/10 via-slate-900/60 to-slate-900/60 p-7 text-center">
            {realReturn <= 0 ? (
              <p className="mx-auto max-w-md text-sm text-rose-300">{t("fire_impossible")}</p>
            ) : yearsToFire === 0 ? (
              <p className="text-3xl font-black text-emerald-400">{t("fire_already_fire")}</p>
            ) : (
              <>
                <p className="text-sm text-slate-300">{t("fire_answer_lead")}</p>
                <p className="mt-2 text-5xl font-black leading-none text-white sm:text-6xl">
                  {yearsToFire}
                  <span className="ml-2 text-2xl font-bold text-orange-300 sm:text-3xl">{t("fire_years")}</span>
                </p>
                <p className="mt-3 text-sm text-slate-400">
                  {t("fire_retire_at")} <span className="font-semibold text-slate-200">{fireAge} {t("fire_years")}</span>
                  {" · "}{fireYear}
                </p>
              </>
            )}
          </div>

          {/* Progresso até ao objetivo (só com portefólio preenchido) */}
          {portfolioValue > 0 && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{t("fire_progress_title")}</p>
                <p className="text-sm font-black text-orange-300">{progressPct.toFixed(1)}%</p>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-800">
                <div className="h-full rounded-full bg-gradient-to-r from-orange-500 to-emerald-400 transition-all" style={{ width: `${progressPct}%` }} />
              </div>
              <div className="mt-1.5 flex justify-between text-[10px] text-slate-500">
                <span>{hideBalances ? "••••" : fmt(portfolioValue)}</span>
                <span>{hideBalances ? "••••" : fmt(fireTarget)}</span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-3 text-center">
                  <p className="text-lg font-black text-emerald-300">{hideBalances ? "••••" : `${fmt(passiveNow)}/${t("fire_month_short")}`}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">{t("fire_passive_title")}</p>
                  <p className="text-[10px] text-slate-600">{t("fire_passive_sub")} {swr.toFixed(1)}%</p>
                </div>
                <div className="rounded-xl border border-sky-500/20 bg-sky-500/[0.05] p-3 text-center">
                  <p className="text-lg font-black text-sky-300">{coastYears === null ? "—" : coastYears === 0 ? "🔥" : `${coastYears} ${t("fire_years")}`}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">{t("fire_coast_title")}</p>
                  <p className="text-[10px] text-slate-600">{t("fire_coast_sub")}</p>
                </div>
              </div>
            </div>
          )}

          {/* E se investisses mais? */}
          {whatIf.length > 0 && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">💡 {t("fire_whatif_title")}</p>
              <div className="flex flex-wrap gap-2">
                {whatIf.map((w) => (
                  <button key={w.extra} type="button" onClick={() => setMonthlyInvestment(monthlyInvestment + w.extra)}
                    title={t("fire_whatif_apply")}
                    className="rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-slate-300 transition hover:border-orange-400/50 hover:text-orange-200">
                    +€{w.extra}/{t("fire_month_short")} → <b className="text-white">{w.years} {t("fire_years")}</b>{" "}
                    <span className="font-semibold text-emerald-400">(−{w.saved})</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Detalhes de apoio */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 text-center">
              <p className="text-xs text-slate-500 mb-1">{t("fire_target")}</p>
              <p className="text-2xl font-black text-orange-300">{fmt(fireTarget)}</p>
              <p className="text-[11px] text-slate-500 mt-1">{t("fire_expenses_x")} ×{fireMultiple} · {t("fire_swr_label")} {swr.toFixed(1)}%</p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 text-center">
              <p className="text-xs text-slate-500 mb-1">{t("fire_real_return")}</p>
              <p className={`text-2xl font-black ${realReturn > 0 ? "text-emerald-400" : "text-rose-400"}`}>{realReturn > 0 ? "+" : ""}{(realReturn * 100).toFixed(1)}%</p>
              <p className="text-[11px] text-slate-500 mt-1">{t("fire_real_return_sub")}</p>
            </div>
          </div>

          {/* Gráfico de projeção */}
          {projection.length > 1 && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-1">{t("fire_projection")}</p>
              <h2 className="text-base font-bold text-white mb-4">{t("fire_wealth_growth")}</h2>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={projection}>
                  <defs>
                    <linearGradient id="gPat" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gTarget" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.1} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="idade" tick={{ fill: "#64748b", fontSize: 11 }} tickFormatter={v => `${v}a`} />
                  <YAxis tick={{ fill: "#64748b", fontSize: 11 }} tickFormatter={v => hideBalances ? "" : v >= 1000000 ? `€${(v/1000000).toFixed(1)}M` : `€${(v/1000).toFixed(0)}K`} width={70} />
                  <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8 }} labelStyle={{ color: "#94a3b8" }}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(v: any, name: any) => [fmt(typeof v === "number" ? v : 0), name === "patrimonio" ? t("fire_patrimony") : t("fire_goal")]} />
                  <Area type="monotone" dataKey="target" stroke="#22c55e" strokeWidth={1.5} strokeDasharray="4 4" fill="url(#gTarget)" dot={false} name="target" />
                  <Area type="monotone" dataKey="patrimonio" stroke="#f97316" strokeWidth={2} fill="url(#gPat)" dot={false} name="patrimonio" />
                  {fireAge !== null && yearsToFire !== null && yearsToFire > 0 && (
                    <ReferenceLine x={fireAge} stroke="#22c55e" strokeDasharray="4 4"
                      label={{ value: `🔥 ${fireAge}`, fill: "#22c55e", fontSize: 11, position: "insideTopRight" }} />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Planeamento patrimonial */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-1">{t("fire_strategy")}</p>
            <h2 className="text-base font-bold text-white mb-4">{t("fire_plan_title")}</h2>
            <div className="space-y-3">
              {patrimonialPlan.map(item => (
                <div key={item.label} className="flex items-center gap-4">
                  <div className="w-28 flex-shrink-0">
                    <p className="text-sm font-semibold text-white">{item.pct}%</p>
                    <p className="text-[10px] text-slate-500">{fmt(item.value)}</p>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-slate-300">{item.label}</span>
                      <span className="text-[10px] text-slate-500">{item.rec}</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-orange-500 to-orange-400 rounded-full transition-all" style={{ width: `${item.pct}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-600 mt-4">{t("fire_disclaimer")}</p>
          </div>

          {/* FIRE types */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-4">{t("fire_variants")}</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { type: t("fire_lean"), multiplier: 20, desc: t("fire_lean_desc"), target: monthlyExpenses * 12 * 20 },
                { type: t("fire_regular"), multiplier: 25, desc: t("fire_regular_desc"), target: monthlyExpenses * 12 * 25 },
                { type: t("fire_fat"), multiplier: 33, desc: t("fire_fat_desc"), target: monthlyExpenses * 12 * 33 },
              ].map(f => (
                <button key={f.type} type="button" onClick={() => setFireMultiple(f.multiplier)}
                  className={`rounded-xl border p-4 text-left transition hover:brightness-110 ${f.multiplier === fireMultiple ? "border-orange-500/40 bg-orange-500/5 ring-1 ring-orange-500/30" : "border-slate-700 bg-slate-900/40 hover:border-slate-600"}`}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-bold text-white">{f.type}</p>
                    {f.multiplier === fireMultiple && <span className="text-[10px] rounded-full border border-orange-500/40 px-2 py-0.5 text-orange-400">{t("fire_in_use")}</span>}
                  </div>
                  <p className="text-lg font-black text-orange-300">{fmt(f.target)}</p>
                  <p className="text-xs text-slate-400 mt-1">{f.desc}</p>
                  <p className="mt-1.5 text-[10px] text-slate-500">×{f.multiplier} · {t("fire_swr_label")} {(100 / f.multiplier).toFixed(1)}% · {t("fire_variant_tap")}</p>
                </button>
              ))}
            </div>
          </div>

        </main>
      </div>
    </div>
    </AppShell>
  );
}
