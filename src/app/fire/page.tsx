"use client";

import { useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { useRequireAuth } from "@/lib/auth/useRequireAuth";
import { loadWalletSnapshot } from "@/lib/wallets/storage";
import { AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";

// Regra dos 4% (Trinity Study): patrimônio necessário = despesas anuais × 25
const FIRE_MULTIPLE = 25;

export default function FirePage() {
  const { isLoading } = useRequireAuth("/login");

  // Inputs do utilizador
  const [monthlyExpenses, setMonthlyExpenses] = useState(2000);
  const [monthlyInvestment, setMonthlyInvestment] = useState(500);
  const [annualReturn, setAnnualReturn] = useState(7); // % ao ano
  const [inflationRate, setInflationRate] = useState(3); // %
  const [currentAge, setCurrentAge] = useState(30);
  const [retirementAge, setRetirementAge] = useState(45);

  // Portfólio atual do utilizador (localStorage)
  const currentPortfolio = useMemo(() => {
    if (typeof window === "undefined") return 0;
    const snapshot = loadWalletSnapshot();
    const sum = (entries?: typeof snapshot.eth) => (entries ?? []).reduce((s, e) => s + (Number(e.balance ?? 0) || 0), 0);
    // Retorna o total de tokens (sem preço) — usamos como aproximação
    // Em produção, multiplicar pelos preços EUR
    return (sum(snapshot.eth) + sum(snapshot.sol) + sum(snapshot.btc) + sum(snapshot.ada));
  }, []);

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

  // Planeamento patrimonial — categorias
  const patrimonialPlan = useMemo(() => {
    const total = portfolioValue || fireTarget;
    return [
      { label: "Fundo de emergência", rec: "3–6 meses de despesas", value: monthlyExpenses * 6, pct: ((monthlyExpenses * 6) / total * 100).toFixed(0) },
      { label: "Cripto (alta volatilidade)", rec: "Máx. 20–30% do portfólio", value: total * 0.25, pct: "25" },
      { label: "Ações / ETFs (mercado)", rec: "40–60% do portfólio", value: total * 0.50, pct: "50" },
      { label: "Obrigações / Imóveis", rec: "10–20% estabilidade", value: total * 0.15, pct: "15" },
      { label: "Cash / Stablecoins", rec: "5–10% liquidez", value: total * 0.10, pct: "10" },
    ];
  }, [portfolioValue, fireTarget, monthlyExpenses]);

  if (isLoading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><p className="text-slate-400 animate-pulse">A carregar...</p></div>;

  const fmt = (v: number) => v >= 1_000_000 ? `€ ${(v / 1_000_000).toFixed(2)}M` : v >= 1_000 ? `€ ${(v / 1_000).toFixed(1)}K` : `€ ${Math.round(v)}`;

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
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-300/80">Independência Financeira</p>
            <h1 className="mt-2 text-2xl font-bold text-white">FIRE Calculator</h1>
            <p className="mt-1 text-sm text-slate-400">
              <strong className="text-slate-300">F</strong>inancial <strong className="text-slate-300">I</strong>ndependence, <strong className="text-slate-300">R</strong>etire <strong className="text-slate-300">E</strong>arly — calcula quando podes ser financeiramente livre.
            </p>
          </div>

          {/* Inputs */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400 mb-5">Parâmetros</p>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { label: "Despesas mensais (€)", key: "monthlyExpenses", value: monthlyExpenses, set: setMonthlyExpenses, min: 500, max: 20000, step: 100 },
                { label: "Investimento mensal (€)", key: "monthlyInvestment", value: monthlyInvestment, set: setMonthlyInvestment, min: 0, max: 10000, step: 50 },
                { label: "Retorno anual esperado (%)", key: "annualReturn", value: annualReturn, set: setAnnualReturn, min: 1, max: 20, step: 0.5 },
                { label: "Inflação anual (%)", key: "inflationRate", value: inflationRate, set: setInflationRate, min: 0, max: 10, step: 0.5 },
                { label: "Idade atual", key: "currentAge", value: currentAge, set: setCurrentAge, min: 18, max: 70, step: 1 },
              ].map(f => (
                <div key={f.key}>
                  <div className="flex justify-between mb-1.5">
                    <label className="text-xs text-slate-400">{f.label}</label>
                    <span className="text-xs font-bold text-orange-300">{f.key.includes("Return") || f.key.includes("inflation") || f.key.includes("Rate") ? `${f.value}%` : f.key === "currentAge" ? `${f.value} anos` : `€ ${f.value.toLocaleString()}`}</span>
                  </div>
                  <input type="range" min={f.min} max={f.max} step={f.step} value={f.value}
                    onChange={e => f.set(Number(e.target.value))}
                    className="w-full accent-orange-500 h-1.5 cursor-pointer" />
                  <div className="flex justify-between text-[9px] text-slate-600 mt-0.5">
                    <span>{f.min}</span><span>{f.max}</span>
                  </div>
                </div>
              ))}
              <div>
                <label className="text-xs text-slate-400 block mb-1.5">Portfólio atual (€) <span className="text-slate-600">— opcional</span></label>
                <input type="number" placeholder="Ex: 50000" value={portfolioOverride}
                  onChange={e => setPortfolioOverride(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-orange-500" />
              </div>
            </div>
          </div>

          {/* Resultado FIRE */}
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { label: "Objetivo FIRE", value: fmt(fireTarget), sub: "Regra dos 4% (25× despesas anuais)", color: "text-orange-300" },
              { label: yearsToFire === 0 ? "Já és FIRE! 🎉" : yearsToFire !== null ? `${yearsToFire} anos` : "Sem retorno", value: fireYear ? `${fireYear}` : "—", sub: fireAge ? `Idade: ${fireAge} anos` : "Ajusta os parâmetros", color: yearsToFire === 0 ? "text-emerald-400" : "text-white" },
              { label: "Retorno real anual", value: `${realReturn > 0 ? "+" : ""}${(realReturn * 100).toFixed(1)}%`, sub: `${annualReturn}% retorno − ${inflationRate}% inflação`, color: realReturn > 0 ? "text-emerald-400" : "text-rose-400" },
            ].map(c => (
              <div key={c.label} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 text-center">
                <p className="text-xs text-slate-500 mb-1">{c.label}</p>
                <p className={`text-2xl font-black ${c.color}`}>{c.value}</p>
                <p className="text-[11px] text-slate-500 mt-1">{c.sub}</p>
              </div>
            ))}
          </div>

          {/* Gráfico de projeção */}
          {projection.length > 1 && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-1">Projeção</p>
              <h2 className="text-base font-bold text-white mb-4">Crescimento do patrimônio</h2>
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
                  <YAxis tick={{ fill: "#64748b", fontSize: 11 }} tickFormatter={v => v >= 1000000 ? `€${(v/1000000).toFixed(1)}M` : `€${(v/1000).toFixed(0)}K`} width={70} />
                  <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8 }} labelStyle={{ color: "#94a3b8" }}
                    formatter={(v: number, name: string) => [fmt(v), name === "patrimonio" ? "Patrimônio" : "Objetivo FIRE"]} />
                  <Area type="monotone" dataKey="target" stroke="#22c55e" strokeWidth={1.5} strokeDasharray="4 4" fill="url(#gTarget)" dot={false} name="target" />
                  <Area type="monotone" dataKey="patrimonio" stroke="#f97316" strokeWidth={2} fill="url(#gPat)" dot={false} name="patrimonio" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Planeamento patrimonial */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-1">Estratégia</p>
            <h2 className="text-base font-bold text-white mb-4">Planeamento patrimonial recomendado</h2>
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
            <p className="text-[11px] text-slate-600 mt-4">
              Estes pesos são indicativos para um perfil moderado. Ajusta conforme tolerância ao risco e horizonte temporal.
            </p>
          </div>

          {/* FIRE types */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-4">Variantes FIRE</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { type: "Lean FIRE", multiplier: 20, desc: "Estilo de vida minimalista. Retiro com 20× as despesas anuais.", target: monthlyExpenses * 12 * 20 },
                { type: "Regular FIRE", multiplier: 25, desc: "Regra dos 4%. O mais comum e testado historicamente.", target: monthlyExpenses * 12 * 25 },
                { type: "Fat FIRE", multiplier: 33, desc: "Estilo de vida confortável. Retiro com 33× (taxa 3%).", target: monthlyExpenses * 12 * 33 },
              ].map(f => (
                <div key={f.type} className={`rounded-xl border p-4 ${f.multiplier === 25 ? "border-orange-500/40 bg-orange-500/5" : "border-slate-700 bg-slate-900/40"}`}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-bold text-white">{f.type}</p>
                    {f.multiplier === 25 && <span className="text-[10px] rounded-full border border-orange-500/40 px-2 py-0.5 text-orange-400">Em uso</span>}
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
