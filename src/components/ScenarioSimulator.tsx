"use client";

import { useMemo, useState } from "react";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useCurrencyFormat } from "@/lib/theme/ThemeContext";
import type { TranslationKey } from "@/lib/i18n/translations";

type Allocation = { label: string; symbol: string; value: number; percent: string };

type Props = {
  portfolioTotal: number;
  allocations: Allocation[];
  traditionalTotal: number;
  stablecoinTotal: number;
};

const PRESETS: Array<{ labelKey: TranslationKey; changes: Record<string, number> }> = [
  { labelKey: "ss_p_bull", changes: { crypto: 100 } },
  { labelKey: "ss_p_bear", changes: { crypto: -50 } },
  { labelKey: "ss_p_crash", changes: { crypto: -80 } },
  { labelKey: "ss_p_corr", changes: { crypto: -30 } },
  { labelKey: "ss_p_btc", changes: { BTC: 50 } },
  { labelKey: "ss_p_eth", changes: { ETH: -40 } },
  { labelKey: "ss_p_trad", changes: { traditional: -20 } },
  { labelKey: "ss_p_mix", changes: { traditional: 30, crypto: -10 } },
];

export default function ScenarioSimulator({ portfolioTotal, allocations, traditionalTotal, stablecoinTotal }: Props) {
  const { t, lang } = useLanguage();
  const { format: fmt, formatSigned: fmtSigned } = useCurrencyFormat();
  const [sliders, setSliders] = useState<Record<string, number>>({});
  const locale = ({ pt: "pt-PT", en: "en-GB", es: "es-ES", fr: "fr-FR" } as Record<string, string>)[lang] ?? "pt-PT";

  const cryptoAllocations = useMemo(() => allocations.filter(a => a.symbol !== "Stable" && a.symbol !== "Trad." && a.value > 0), [allocations]);

  const simulated = useMemo(() => {
    let total = stablecoinTotal; // stablecoins não mudam
    for (const alloc of cryptoAllocations) {
      const pct = sliders[alloc.symbol] ?? 0;
      total += alloc.value * (1 + pct / 100);
    }
    const tradPct = sliders["traditional"] ?? 0;
    total += traditionalTotal * (1 + tradPct / 100);
    return total;
  }, [sliders, cryptoAllocations, traditionalTotal, stablecoinTotal]);

  const diff = simulated - portfolioTotal;
  const diffPct = portfolioTotal > 0 ? (diff / portfolioTotal) * 100 : 0;

  const applyPreset = (changes: Record<string, number>) => {
    const next: Record<string, number> = {};
    for (const alloc of cryptoAllocations) {
      if (changes.crypto !== undefined) next[alloc.symbol] = changes.crypto;
      if (changes[alloc.symbol] !== undefined) next[alloc.symbol] = changes[alloc.symbol];
    }
    if (changes.traditional !== undefined) next["traditional"] = changes.traditional;
    setSliders(next);
  };

  return (
    <div className="space-y-5">
      {/* Presets */}
      <div>
        <p className="text-xs text-slate-500 mb-2">{t("ss_presets")}</p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map(p => (
            <button
              key={p.labelKey}
              type="button"
              onClick={() => applyPreset(p.changes)}
              className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:border-orange-400/40 hover:text-orange-200 transition"
            >
              {t(p.labelKey)}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSliders({})}
            className="rounded-full border border-rose-500/30 px-3 py-1 text-xs text-rose-400 hover:border-rose-400 transition"
          >
            ↺ {t("ss_reset")}
          </button>
        </div>
      </div>

      {/* Sliders por ativo */}
      <div className="grid gap-3 sm:grid-cols-2">
        {cryptoAllocations.map(alloc => {
          const val = sliders[alloc.symbol] ?? 0;
          const newVal = alloc.value * (1 + val / 100);
          return (
            <div key={alloc.symbol} className="rounded-xl border border-slate-700 bg-slate-900/80 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-white">{alloc.symbol}</span>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold ${val > 0 ? "text-emerald-400" : val < 0 ? "text-rose-400" : "text-slate-400"}`}>
                    {val > 0 ? "+" : ""}{val}%
                  </span>
                  <span className="text-xs text-slate-500">→ {fmt(newVal, { decimals: 0 })}</span>
                </div>
              </div>
              <input
                type="range"
                aria-label={alloc.symbol}
                min={-90} max={200} step={5}
                value={val}
                onChange={e => setSliders(prev => ({ ...prev, [alloc.symbol]: Number(e.target.value) }))}
                className="w-full accent-orange-500 h-1.5 cursor-pointer"
              />
              <div className="flex justify-between text-[9px] text-slate-600 mt-0.5">
                <span>-90%</span><span>0</span><span>+200%</span>
              </div>
            </div>
          );
        })}

        {/* Tradicional */}
        {traditionalTotal > 0 && (() => {
          const val = sliders["traditional"] ?? 0;
          const newVal = traditionalTotal * (1 + val / 100);
          return (
            <div className="rounded-xl border border-slate-700 bg-slate-900/80 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-white">{t("ss_traditional")}</span>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold ${val > 0 ? "text-emerald-400" : val < 0 ? "text-rose-400" : "text-slate-400"}`}>
                    {val > 0 ? "+" : ""}{val}%
                  </span>
                  <span className="text-xs text-slate-500">→ {fmt(newVal, { decimals: 0 })}</span>
                </div>
              </div>
              <input
                type="range" min={-90} max={100} step={5}
                aria-label={t("ss_traditional")}
                value={val}
                onChange={e => setSliders(prev => ({ ...prev, traditional: Number(e.target.value) }))}
                className="w-full accent-orange-500 h-1.5 cursor-pointer"
              />
              <div className="flex justify-between text-[9px] text-slate-600 mt-0.5">
                <span>-90%</span><span>0</span><span>+100%</span>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Resultado */}
      <div className={`rounded-xl border p-4 flex items-center justify-between ${diff >= 0 ? "border-emerald-500/30 bg-emerald-500/5" : "border-rose-500/30 bg-rose-500/5"}`}>
        <div>
          <p className="text-xs text-slate-400">{t("ss_simulated")}</p>
          <p className="text-2xl font-black text-white mt-0.5">{fmt(simulated, { decimals: 0 })}</p>
        </div>
        <div className="text-right">
          <p className={`text-xl font-bold ${diff >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            {fmtSigned(diff, { decimals: 0 })}
          </p>
          <p className={`text-sm font-semibold ${diff >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
            {diffPct >= 0 ? "+" : ""}{diffPct.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
          </p>
        </div>
      </div>
    </div>
  );
}
