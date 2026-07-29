"use client";

import { useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { useRequireAuth } from "@/lib/auth/useRequireAuth";
import { AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useTheme } from "@/lib/theme/ThemeContext";

// Regra dos 4% (Trinity Study): património necessário = despesas anuais × 25
const FIRE_MULTIPLE = 25;

export default function FirePage() {
  const { isLoading } = useRequireAuth("/login");
  const { t } = useLanguage();
  const { hideBalances } = useTheme();

  // Inputs do utilizador
  const [monthlyExpenses, setMonthlyExpenses] = useState(2000);
  const [monthlyInvestment, setMonthlyInvestment] = useState(500);
  const [annualReturn, setAnnualReturn] = useState(7); // % ao ano
  const [inflationRate, setInflationRate] = useState(3); // %
  const [currentAge, setCurrentAge] = useState(30);

  const [portfolioOverride, setPortfolioOverride] = useState<string>("");

  const portfolioValue = portfolioOverride !== "" ? Number(portfolioOverride) || 0 : 0;

  const fireTarget = monthlyExpenses * 12 * FIRE_MULTIPLE;
  const realReturn = (annualReturn - inflationRate) / 100;
  const monthlyReal = realReturn / 12;

  // Anos para FIRE partindo do portfólio atual
  const yearsToFire = useMemo(() => {
    if (realReturn <= 0) return null;
    if (portfolioValue >= fireTarget) return 0;
    const months = monthlyInvestment > 0
      ? Math.log((fireTarget * monthlyReal + monthlyInvestment) / (portfolioValue * monthlyReal + monthlyInvestment)) / Math.log(1 + monthlyReal)
      : Math.log(fireTarget / Math.max(portfolioValue, 1)) / Math.log(1 + monthlyReal);
    return Math.ceil(months / 12);
  }, [portfolioValue, monthlyInvestment, fireTarget, monthlyReal, realReturn]);

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

          {/* Detalhes de apoio */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 text-center">
              <p className="text-xs text-slate-500 mb-1">{t("fire_target")}</p>
              <p className="text-2xl font-black text-orange-300">{fmt(fireTarget)}</p>
              <p className="text-[11px] text-slate-500 mt-1">{t("fire_target_rule")}</p>
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
                <div key={f.type} className={`rounded-xl border p-4 ${f.multiplier === 25 ? "border-orange-500/40 bg-orange-500/5" : "border-slate-700 bg-slate-900/40"}`}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-bold text-white">{f.type}</p>
                    {f.multiplier === 25 && <span className="text-[10px] rounded-full border border-orange-500/40 px-2 py-0.5 text-orange-400">{t("fire_in_use")}</span>}
                  </div>
                  <p className="text-lg font-black text-orange-300">{fmt(f.target)}</p>
                  <p className="text-xs text-slate-400 mt-1">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>

        </main>
      </div>
    </div>
    </AppShell>
  );
}
