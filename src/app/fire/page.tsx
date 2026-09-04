"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { useRequireAuth } from "@/lib/auth/useRequireAuth";
import { createClient } from "@/lib/supabase/client";
import { jsPDF } from "jspdf";
import { AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, ReferenceLine } from "recharts";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useTheme } from "@/lib/theme/ThemeContext";

// Regra dos 4% (Trinity Study): património necessário = despesas anuais × 25.
// Lean=20× (levantamento 5%), Regular=25× (4%), Fat=33× (3%) — selecionável.

export default function FirePage() {
  const { isLoading, userId } = useRequireAuth("/login");
  const { t } = useLanguage();
  const { hideBalances } = useTheme();

  // Inputs do utilizador — persistidos localmente para a página abrir com o plano dele
  const saved = useMemo<Record<string, number | string>>(() => {
    try { return JSON.parse(localStorage.getItem("fire-plan-v1") ?? "{}"); } catch { return {}; }
  }, []);
  const n = (k: string, d: number) => (typeof saved[k] === "number" ? (saved[k] as number) : d);
  const [monthlyExpenses, setMonthlyExpenses] = useState(() => n("exp", 2000));
  const [monthlyInvestment, setMonthlyInvestment] = useState(() => n("inv", 500));
  const [annualReturn, setAnnualReturn] = useState(() => n("ret", 7)); // % ao ano
  const [inflationRate, setInflationRate] = useState(() => n("inf", 3)); // %
  const [currentAge, setCurrentAge] = useState(() => n("age", 30));

  const [portfolioOverride, setPortfolioOverride] = useState<string>(() => (typeof saved["pv"] === "string" ? (saved["pv"] as string) : ""));
  const [fireMultiple, setFireMultiple] = useState(() => n("mult", 25)); // 20 Lean · 25 Regular · 33 Fat

  useEffect(() => {
    try {
      localStorage.setItem("fire-plan-v1", JSON.stringify({
        exp: monthlyExpenses, inv: monthlyInvestment, ret: annualReturn,
        inf: inflationRate, age: currentAge, pv: portfolioOverride, mult: fireMultiple,
      }));
    } catch { /* modo privado, etc. */ }
  }, [monthlyExpenses, monthlyInvestment, annualReturn, inflationRate, currentAge, portfolioOverride, fireMultiple]);

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

  // Intervalo provável: mesmo cálculo com retorno ±2 p.p.
  const yearsAt = (annualRet: number): number | null => {
    const rr = (annualRet - inflationRate) / 100;
    if (rr <= 0) return null;
    const mr = rr / 12;
    if (portfolioValue >= fireTarget) return 0;
    if (monthlyInvestment <= 0 && portfolioValue <= 0) return null;
    const months = monthlyInvestment > 0
      ? Math.log((fireTarget * mr + monthlyInvestment) / (portfolioValue * mr + monthlyInvestment)) / Math.log(1 + mr)
      : Math.log(fireTarget / Math.max(portfolioValue, 1)) / Math.log(1 + mr);
    const y = Math.ceil(months / 12);
    return y > 99 ? null : y;
  };
  const optimisticYears = useMemo(() => yearsAt(annualReturn + 2),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [annualReturn, inflationRate, portfolioValue, monthlyInvestment, fireTarget]);
  const pessimisticYears = useMemo(() => yearsAt(annualReturn - 2),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [annualReturn, inflationRate, portfolioValue, monthlyInvestment, fireTarget]);

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

  const loadLogo = (): Promise<string | null> =>
    new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const size = 128;
          const canvas = document.createElement("canvas");
          canvas.width = size; canvas.height = size;
          const ctx = canvas.getContext("2d");
          if (!ctx) return resolve(null);
          ctx.drawImage(img, 0, 0, size, size);
          resolve(canvas.toDataURL("image/png"));
        } catch { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = "/chainfolioai-icon.png";
    });

  // PDF de 1 página com o plano — mesmo padrão visual dos exports da fiscalidade.
  const exportPlanPDF = async () => {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    const cx = W / 2;
    const M = 16;
    const eur = (v: number) => `EUR ${Math.round(v).toLocaleString("en-US")}`;

    doc.setFillColor(249, 115, 22);
    doc.rect(0, 0, W, 3, "F");
    const logo = await loadLogo();
    let y = 12;
    if (logo) { doc.addImage(logo, "PNG", cx - 9, y, 18, 18); y += 23; } else { y += 6; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(249, 115, 22);
    doc.text("ChainFolioAI", cx, y, { align: "center" });
    y += 8;
    doc.setFontSize(13); doc.setTextColor(15, 23, 42);
    doc.text(t("fire_pdf_title"), cx, y, { align: "center" });
    y += 12;

    // Resposta principal
    doc.setFillColor(255, 247, 237);
    doc.roundedRect(M, y, W - 2 * M, 30, 3, 3, "F");
    doc.setFontSize(10); doc.setTextColor(100, 116, 139); doc.setFont("helvetica", "normal");
    doc.text(t("fire_answer_lead"), cx, y + 8, { align: "center" });
    doc.setFont("helvetica", "bold"); doc.setFontSize(22); doc.setTextColor(15, 23, 42);
    const mainTxt = yearsToFire === null ? "—" : yearsToFire === 0 ? "FIRE!" : `${yearsToFire} ${t("fire_years")}`;
    doc.text(mainTxt, cx, y + 19, { align: "center" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(100, 116, 139);
    const subBits: string[] = [];
    if (fireAge !== null && yearsToFire !== null && yearsToFire > 0) subBits.push(`${t("fire_retire_at")} ${fireAge} ${t("fire_years")} (${fireYear})`);
    if (optimisticYears !== null && pessimisticYears !== null && pessimisticYears !== optimisticYears)
      subBits.push(`${t("fire_range_lead")} ${optimisticYears}-${pessimisticYears} ${t("fire_years")}`);
    if (subBits.length) doc.text(subBits.join("  ·  "), cx, y + 26, { align: "center" });
    y += 38;

    // Parâmetros + objetivo
    const line = (label: string, value: string) => {
      doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(100, 116, 139);
      doc.text(label, M, y);
      doc.setFont("helvetica", "bold"); doc.setTextColor(15, 23, 42);
      doc.text(value, W - M, y, { align: "right" });
      y += 6.5;
    };
    doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.setTextColor(249, 115, 22);
    doc.text(t("fire_params").toUpperCase(), M, y); y += 7;
    line(t("fire_monthly_expenses"), eur(monthlyExpenses));
    line(t("fire_monthly_investment"), eur(monthlyInvestment));
    line(t("fire_annual_return"), `${annualReturn}%`);
    line(t("fire_inflation"), `${inflationRate}%`);
    line(t("fire_current_age"), `${currentAge} ${t("fire_years")}`);
    if (portfolioValue > 0) line(t("fire_current_portfolio"), eur(portfolioValue));
    y += 3;
    doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.setTextColor(249, 115, 22);
    doc.text(t("fire_target").toUpperCase(), M, y); y += 7;
    line(t("fire_target"), eur(fireTarget));
    line(`${t("fire_expenses_x")} ×${fireMultiple}`, `${t("fire_swr_label")} ${swr.toFixed(1)}%`);
    if (portfolioValue > 0) {
      line(t("fire_progress_title"), `${progressPct.toFixed(1)}%`);
      line(t("fire_passive_title"), `${eur(passiveNow)}/${t("fire_month_short")}`);
      if (coastYears !== null) line(t("fire_coast_title"), coastYears === 0 ? "FIRE" : `${coastYears} ${t("fire_years")}`);
    }
    if (whatIf.length > 0) {
      y += 3;
      doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.setTextColor(249, 115, 22);
      doc.text(t("fire_whatif_pdf").toUpperCase(), M, y); y += 7;
      whatIf.forEach((w) => line(`+${eur(w.extra)}/${t("fire_month_short")}`, `${w.years} ${t("fire_years")} (−${w.saved})`));
    }

    const pageH = doc.internal.pageSize.getHeight();
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(148, 163, 184);
    doc.text(doc.splitTextToSize(t("fire_disclaimer"), W - 2 * M), M, pageH - 20);
    doc.setTextColor(249, 115, 22); doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
    doc.text("chainfolioai.com", cx, pageH - 8, { align: "center" });

    // Telemóvel: folha de partilha nativa; desktop: download (padrão da fiscalidade).
    const filename = `chainfolioai-plano-fire-${new Date().getFullYear()}.pdf`;
    const blob = doc.output("blob");
    const nav = navigator as Navigator & {
      canShare?: (d: { files: File[] }) => boolean;
      share?: (d: { files?: File[]; title?: string }) => Promise<void>;
    };
    const file = typeof File !== "undefined" ? new File([blob], filename, { type: "application/pdf" }) : null;
    if (file && nav.canShare && nav.canShare({ files: [file] }) && nav.share) {
      try { await nav.share({ files: [file], title: filename }); return; } catch { /* cancelado */ }
    }
    doc.save(filename);
  };

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
                {optimisticYears !== null && pessimisticYears !== null && pessimisticYears !== optimisticYears && (
                  <p className="mt-2 text-xs text-slate-500">
                    📐 {t("fire_range_lead")} <span className="font-semibold text-slate-300">{optimisticYears}–{pessimisticYears} {t("fire_years")}</span> · {t("fire_range_tail")}
                  </p>
                )}
              </>
            )}
            <button type="button" onClick={exportPlanPDF}
              className="mx-auto mt-5 flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-orange-400/50 hover:text-orange-200">
              ↓ {t("fire_export_pdf")}
            </button>
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
