"use client";

import { useState, useMemo, useEffect } from "react";
import AppShell from "@/components/AppShell";
import { useRequireAuth } from "@/lib/auth/useRequireAuth";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import type { TranslationKey } from "@/lib/i18n/translations";
import { createClient } from "@/lib/supabase/client";
import { jsPDF } from "jspdf";

type TradeEntry = {
  id: string;
  asset: string;
  type: "compra" | "venda";
  amount: number;
  price: number;
  date: string;
  exchange: string;
};

type TaxEvent = {
  asset: string;
  buyDate: string;
  sellDate: string;
  buyPrice: number;
  sellPrice: number;
  amount: number;
  gain: number;
  holding: "curto" | "longo"; // <365 dias = curto; >=365 = longo
  taxRate: number; // PT: 28% curto, 0% longo (>365 dias, desde 2023 lei PT)
};

// Regras PT 2024: cripto com holding >365 dias = isento; <=365 dias = 28%
const PT_TAX_SHORT = 0.28;
const PT_TAX_LONG = 0.0; // isento

function calcDays(from: string, to: string): number {
  return Math.floor((new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24));
}

const emptyTrade = (): TradeEntry => ({
  id: crypto.randomUUID(),
  asset: "BTC",
  type: "compra",
  amount: 0,
  price: 0,
  date: new Date().toISOString().slice(0, 10),
  exchange: "Binance",
});

type Country = { code: string; flag: string; name: string; taxShort: string; taxLong: string; threshold: string; color: string; badge: string; summary: string; keyPoints: string[]; law: string; plan: "free" | "pro" | "premium" };

function buildCountryLaw(t: (k: TranslationKey) => string): Country[] {
  const c = (code: string, flag: string, color: string, badge: string, p: string, law: string, plan: "free" | "pro" | "premium" = "free"): Country => ({
    code, flag, color, badge, law, plan,
    name: t(`fc_${p}_name` as TranslationKey),
    taxShort: t(`fc_${p}_short` as TranslationKey),
    taxLong: t(`fc_${p}_long` as TranslationKey),
    threshold: t(`fc_${p}_thr` as TranslationKey),
    summary: t(`fc_${p}_sum` as TranslationKey),
    keyPoints: t(`fc_${p}_kp` as TranslationKey).split("\n"),
  });
  return [
    c("PT", "🇵🇹", "border-green-500/30 bg-green-500/5", "text-green-400", "pt", "Lei n.º 24-D/2022"),
    c("ES", "🇪🇸", "border-yellow-500/30 bg-yellow-500/5", "text-yellow-400", "es", "LIRPF art. 33–35 (2025)"),
    c("FR", "🇫🇷", "border-blue-500/30 bg-blue-500/5", "text-blue-400", "fr", "CGI art. 150 VH bis"),
    c("DE", "🇩🇪", "border-slate-500/30 bg-slate-500/5", "text-slate-400", "de", "EStG § 23"),
    c("GB", "🇬🇧", "border-purple-500/30 bg-purple-500/5", "text-purple-400", "uk", "TCGA 1992 / HMRC (Autumn Budget 2024)", "pro"),
    c("NL", "🇳🇱", "border-orange-500/30 bg-orange-500/5", "text-orange-400", "nl", "Wet IB 2001, Box 3", "pro"),
    c("IT", "🇮🇹", "border-green-600/30 bg-green-600/5", "text-green-300", "it", "D.Lgs. 461/1997 / Legge 197/2022", "pro"),
    c("BR", "🇧🇷", "border-emerald-500/30 bg-emerald-500/5", "text-emerald-400", "br", "IN RFB 1888/2019 / Lei 14.754/2023", "pro"),
    c("US", "🇺🇸", "border-red-500/30 bg-red-500/5", "text-red-400", "us", "IRS Notice 2014-21 / Rev. Ruling 2023-14", "premium"),
    c("CA", "🇨🇦", "border-rose-500/30 bg-rose-500/5", "text-rose-400", "ca", "ITA s. 38 / CRA IT-218R", "premium"),
    c("AU", "🇦🇺", "border-sky-500/30 bg-sky-500/5", "text-sky-400", "au", "ITAA 1997 s. 108-5 / ATO (2014–2023)", "premium"),
    c("CH", "🇨🇭", "border-red-500/30 bg-red-500/5", "text-red-400", "ch", "DBG art. 16 / LIFD", "premium"),
    c("AE", "🇦🇪", "border-amber-500/30 bg-amber-500/5", "text-amber-400", "ae", "Federal Decree-Law No. 47 of 2022", "premium"),
    c("SG", "🇸🇬", "border-red-400/30 bg-red-400/5", "text-red-300", "sg", "Payment Services Act 2019 / IRAS e-Tax Guide", "premium"),
  ];
}

function LegislationSection({ isPro, isPremium }: { isPro: boolean; isPremium: boolean }) {
  const { t } = useLanguage();
  const [selected, setSelected] = useState<string | null>(null);
  const COUNTRY_LAW = buildCountryLaw(t);
  const selectedCountry = COUNTRY_LAW.find((c) => c.code === selected);
  const canView = (plan: "free" | "pro" | "premium") =>
    plan === "free" || (plan === "pro" && isPro) || (plan === "premium" && isPremium);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-300/80">{t("fc_guide")}</p>
        <h2 className="mt-1 text-xl font-bold text-white">{t("fc_law_by_country")}</h2>
        <p className="mt-1 text-sm text-slate-400">
          {t("fc_law_subtitle")}
        </p>
      </div>

      {/* Country grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {COUNTRY_LAW.map((c) => {
          const unlocked = canView(c.plan);
          return unlocked ? (
            <button
              key={c.code}
              type="button"
              onClick={() => setSelected(selected === c.code ? null : c.code)}
              className={`rounded-2xl border p-4 text-left transition hover:brightness-110 ${c.color} ${selected === c.code ? "ring-2 ring-orange-500/40" : ""}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">{c.flag}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-white">{c.name}</p>
                  <p className={`text-[10px] font-medium ${c.badge}`}>{c.code}</p>
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-[10px]">
                  <span className="text-slate-500">{t("fc_short_term")}</span>
                  <span className="text-rose-400 font-medium">{c.taxShort}</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-slate-500">{t("fc_long_term")}</span>
                  <span className="text-emerald-400 font-medium">{c.taxLong}</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-slate-500">{t("fc_threshold")}</span>
                  <span className="text-slate-400 font-medium text-right">{c.threshold}</span>
                </div>
              </div>
            </button>
          ) : (
            <a
              key={c.code}
              href="/pricing"
              className={`rounded-2xl border p-4 text-left transition opacity-60 hover:opacity-80 ${c.color}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">{c.flag}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-white">{c.name}</p>
                  <p className={`text-[10px] font-medium ${c.badge}`}>{c.code}</p>
                </div>
                <span className="text-[10px]">{c.plan === "premium" ? "💎" : "🔒"}</span>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-[10px]">
                  <span className="text-slate-500">{t("fc_short_term")}</span>
                  <span className="text-rose-400 font-medium">{c.taxShort}</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-slate-500">{t("fc_long_term")}</span>
                  <span className="text-emerald-400 font-medium">{c.taxLong}</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-slate-500">{t("fc_threshold")}</span>
                  <span className="text-slate-400 font-medium text-right">{c.threshold}</span>
                </div>
              </div>
            </a>
          );
        })}
      </div>

      {/* Detail panel */}
      {selectedCountry && (
        <div className={`rounded-2xl border p-6 space-y-4 ${selectedCountry.color}`}>
          <div className="flex items-center gap-3">
            <span className="text-4xl">{selectedCountry.flag}</span>
            <div>
              <h3 className="text-lg font-bold text-white">{selectedCountry.name}</h3>
              <p className={`text-xs font-medium ${selectedCountry.badge}`}>{selectedCountry.law}</p>
            </div>
          </div>
          <p className="text-sm text-slate-300 leading-relaxed">{selectedCountry.summary}</p>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{t("fc_keypoints")}</p>
            <ul className="space-y-1.5">
              {selectedCountry.keyPoints.map((point) => (
                <li key={point} className="flex items-start gap-2 text-sm text-slate-300">
                  <span className={`mt-0.5 shrink-0 text-xs ${selectedCountry.badge}`}>•</span>
                  {point}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-slate-600">{t("fc_general_info")}</p>
        </div>
      )}
    </div>
  );
}

const FREE_COUNTRIES = ["PT", "ES", "FR", "DE"] as const;
const PRO_COUNTRIES = [
  { code: "GB", flag: "🇬🇧", labelKey: "fc_uk_name" },
  { code: "NL", flag: "🇳🇱", labelKey: "fc_nl" },
  { code: "IT", flag: "🇮🇹", labelKey: "fc_it" },
  { code: "BR", flag: "🇧🇷", labelKey: "fc_br" },
] as const;

const PREMIUM_COUNTRIES = [
  { code: "US", flag: "🇺🇸", labelKey: "fc_us_name" },
  { code: "CA", flag: "🇨🇦", labelKey: "fc_ca" },
  { code: "AU", flag: "🇦🇺", labelKey: "fc_au" },
  { code: "CH", flag: "🇨🇭", labelKey: "fc_ch_name" },
  { code: "AE", flag: "🇦🇪", labelKey: "fc_ae_name" },
  { code: "SG", flag: "🇸🇬", labelKey: "fc_sg_name" },
] as const;

export default function FiscalidadePage() {
  const { isLoading, userId } = useRequireAuth("/login");
  const { t } = useLanguage();
  const [isPro, setIsPro] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [trades, setTrades] = useState<TradeEntry[]>([]);
  const [newTrade, setNewTrade] = useState<TradeEntry>(emptyTrade());
  const [country, setCountry] = useState<string>("PT");

  useEffect(() => {
    if (!userId) return;
    const check = async () => {
      try {
        const res = await fetch("/api/subscription");
        if (res.ok) {
          const json = await res.json() as { plan: string };
          setIsPremium(json.plan === "premium");
          setIsPro(json.plan === "pro" || json.plan === "premium");
        }
      } catch { /* ignore */ }
    };
    check();
  }, [userId]);

  const taxRates: Record<string, { short: number; long: number; longDays: number; longLabel: string }> = {
    PT: { short: 0.28, long: 0.0,  longDays: 365, longLabel: "Isento (>1 ano)" },
    ES: { short: 0.19, long: 0.23, longDays: 365, longLabel: "23% (>1 ano)" },
    FR: { short: 0.30, long: 0.30, longDays: 0,   longLabel: "30% (flat tax)" },
    DE: { short: 0.25, long: 0.0,  longDays: 365, longLabel: "Isento (>1 ano)" },
    // Pro countries
    GB: { short: 0.20, long: 0.20, longDays: 0,   longLabel: "20% (sem isenção temporal)" },
    NL: { short: 0.31, long: 0.31, longDays: 0,   longLabel: "31% (rendimento fictício)" },
    IT: { short: 0.26, long: 0.26, longDays: 0,   longLabel: "26% (flat rate)" },
    BR: { short: 0.15, long: 0.15, longDays: 0,   longLabel: "15% (isenção < R$35k/mês)" },
    // Premium countries
    US: { short: 0.37, long: 0.20, longDays: 365, longLabel: "0–20% (>1 ano)" },
    CA: { short: 0.27, long: 0.27, longDays: 0,   longLabel: "27% (50% inclusion rate)" },
    AU: { short: 0.45, long: 0.225,longDays: 365, longLabel: "50% desconto (>1 ano)" },
    CH: { short: 0.0,  long: 0.0,  longDays: 0,   longLabel: "Isento (investidor privado)" },
    AE: { short: 0.0,  long: 0.0,  longDays: 0,   longLabel: "0% (sem imposto)" },
    SG: { short: 0.0,  long: 0.0,  longDays: 0,   longLabel: "0% (investidor privado)" },
  };
  const regime = taxRates[country] ?? taxRates["PT"];

  // FIFO: calcular eventos de mais-valias
  const taxEvents = useMemo<TaxEvent[]>(() => {
    const events: TaxEvent[] = [];
    const pool: Record<string, Array<{ amount: number; price: number; date: string }>> = {};

    const sorted = [...trades].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    for (const tr of sorted) {
      if (tr.type === "compra") {
        if (!pool[tr.asset]) pool[tr.asset] = [];
        pool[tr.asset].push({ amount: tr.amount, price: tr.price, date: tr.date });
      } else {
        // venda — FIFO
        let remaining = tr.amount;
        while (remaining > 0 && pool[tr.asset]?.length) {
          const lot = pool[tr.asset][0];
          const used = Math.min(lot.amount, remaining);
          const days = calcDays(lot.date, tr.date);
          const isLong = days >= regime.longDays && regime.longDays > 0;
          const rate = isLong ? regime.long : regime.short;
          const gain = (tr.price - lot.price) * used;
          events.push({
            asset: tr.asset,
            buyDate: lot.date,
            sellDate: tr.date,
            buyPrice: lot.price,
            sellPrice: tr.price,
            amount: used,
            gain,
            holding: isLong ? "longo" : "curto",
            taxRate: rate,
          });
          lot.amount -= used;
          remaining -= used;
          if (lot.amount <= 0) pool[tr.asset].shift();
        }
      }
    }
    return events;
  }, [trades, regime]);

  const summary = useMemo(() => {
    const totalGain = taxEvents.reduce((s, e) => s + e.gain, 0);
    const taxable = taxEvents.filter(e => e.gain > 0 && e.taxRate > 0).reduce((s, e) => s + e.gain, 0);
    const exempt = taxEvents.filter(e => e.taxRate === 0 && e.gain > 0).reduce((s, e) => s + e.gain, 0);
    const losses = taxEvents.filter(e => e.gain < 0).reduce((s, e) => s + e.gain, 0);
    const tax = taxEvents.filter(e => e.gain > 0).reduce((s, e) => s + e.gain * e.taxRate, 0);
    return { totalGain, taxable, exempt, losses, tax };
  }, [taxEvents]);

  const exportCSV = () => {
    const rows = [
      [t("fc_col_asset"), t("fc_col_buydate"), t("fc_col_selldate"), t("fc_col_buyprice"), t("fc_col_sellprice"), t("fc_col_qty"), t("fc_col_gain"), t("fc_col_type"), t("fc_col_rate"), t("fc_col_tax")],
      ...taxEvents.map(e => [
        e.asset, e.buyDate, e.sellDate,
        e.buyPrice.toFixed(2), e.sellPrice.toFixed(2),
        e.amount.toFixed(8), e.gain.toFixed(2),
        e.holding === "longo" ? t("fc_long_term") : t("fc_short_term"),
        `${(e.taxRate * 100).toFixed(0)}%`,
        (Math.max(0, e.gain) * e.taxRate).toFixed(2),
      ]),
    ];
    const csv = rows.map(r => r.join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `chainfolioai-fiscalidade-${country}-${new Date().getFullYear()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    const eur = (v: number) => `EUR ${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    const M = 14;
    let y = 18;

    // Header
    doc.setFillColor(249, 115, 22);
    doc.rect(0, 0, W, 4, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(17, 24, 39);
    doc.text(t("fisc_pdf_title"), M, y);
    y += 7;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(107, 114, 128);
    doc.text(`${t("fisc_pdf_generated")}: ${new Date().toLocaleDateString()}`, M, y);
    doc.text(`${t("fisc_pdf_country")}: ${country} (${(regime.short * 100).toFixed(0)}% / ${regime.longLabel})`, W - M, y, { align: "right" });
    y += 9;

    // Summary box
    doc.setDrawColor(229, 231, 235);
    doc.setFillColor(249, 250, 251);
    doc.roundedRect(M, y, W - M * 2, 26, 2, 2, "FD");
    const cards: Array<[string, string, [number, number, number]]> = [
      [t("fc_total_gains"), eur(summary.totalGain), summary.totalGain >= 0 ? [16, 185, 129] : [239, 68, 68]],
      [t("fc_exempt_long"), eur(summary.exempt), [16, 185, 129]],
      [t("fc_realized_losses"), eur(summary.losses), [239, 68, 68]],
      [t("fc_estimated_tax"), eur(summary.tax), [249, 115, 22]],
    ];
    const colW = (W - M * 2) / 4;
    cards.forEach((c, i) => {
      const cx = M + colW * i + colW / 2;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(...c[2]);
      doc.text(c[1], cx, y + 11, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(107, 114, 128);
      doc.text(c[0], cx, y + 18, { align: "center" });
    });
    y += 34;

    // Events table
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(17, 24, 39);
    doc.text(`${t("fisc_pdf_events")} (${taxEvents.length})`, M, y);
    y += 6;

    const headers = [t("fc_col_asset"), t("fc_col_buy"), t("fc_col_sell"), t("fc_col_qtd"), t("fc_col_buyp"), t("fc_col_sellp"), t("fc_col_gain"), t("fc_col_type"), t("fc_col_rate"), t("fc_col_tax")];
    const colsX = [M, M + 16, M + 38, M + 60, M + 78, M + 98, M + 118, M + 142, M + 158, M + 172];
    doc.setFillColor(243, 244, 246);
    doc.rect(M, y - 4, W - M * 2, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(75, 85, 99);
    headers.forEach((h, i) => doc.text(h, colsX[i], y));
    y += 6;

    doc.setFont("helvetica", "normal");
    taxEvents.forEach((e, idx) => {
      if (y > 270) { doc.addPage(); y = 20; }
      if (idx % 2 === 1) {
        doc.setFillColor(249, 250, 251);
        doc.rect(M, y - 4, W - M * 2, 6, "F");
      }
      const taxVal = e.gain > 0 && e.taxRate > 0 ? eur(e.gain * e.taxRate) : t("fc_exempt");
      const cells = [
        e.asset, e.buyDate, e.sellDate, e.amount.toFixed(4),
        e.buyPrice.toFixed(0), e.sellPrice.toFixed(0),
        `${e.gain >= 0 ? "+" : "-"}${eur(e.gain).replace("EUR ", "")}`,
        e.holding === "longo" ? t("fc_long") : t("fc_short"),
        `${(e.taxRate * 100).toFixed(0)}%`, taxVal,
      ];
      cells.forEach((c, i) => {
        if (i === 6) doc.setTextColor(...(e.gain >= 0 ? [16, 185, 129] : [239, 68, 68]) as [number, number, number]);
        else if (i === 9) doc.setTextColor(249, 115, 22);
        else doc.setTextColor(55, 65, 81);
        doc.text(String(c), colsX[i], y);
      });
      y += 6;
    });

    // Net taxable total
    y += 2;
    doc.setDrawColor(229, 231, 235);
    doc.line(M, y, W - M, y);
    y += 6;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(17, 24, 39);
    doc.text(`${t("fisc_pdf_net_taxable")}:`, M, y);
    doc.setTextColor(249, 115, 22);
    doc.text(eur(summary.tax), W - M, y, { align: "right" });

    // Footer
    const fy = doc.internal.pageSize.getHeight() - 12;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(156, 163, 175);
    doc.text(t("fisc_pdf_footer"), W / 2, fy, { align: "center", maxWidth: W - M * 2 });

    doc.save(`chainfolioai-report-${country}-${new Date().getFullYear()}.pdf`);
  };

  if (isLoading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><p className="text-slate-400 animate-pulse">{t("loading")}</p></div>;

  const fmtEur = (v: number) => `€ ${Math.abs(v).toLocaleString("pt-PT", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  return (
    <AppShell>
    <div className="relative min-h-screen bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full bg-orange-500/6 blur-[100px]" />
      </div>
      <div className="relative z-10">
        <main className="mx-auto w-full max-w-5xl px-6 pb-24 pt-6 space-y-8">

          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-300/80">{t("nav_fiscalidade")}</p>
              <h1 className="mt-2 text-2xl font-bold text-white">{t("fisc_title")}</h1>
              <p className="mt-1 text-sm text-slate-400">{t("fisc_subtitle")}</p>
            </div>
            {/* País */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-400">{t("fisc_country")}:</span>
              {FREE_COUNTRIES.map(c => (
                <button key={c} onClick={() => setCountry(c)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${country === c ? "bg-orange-500 text-slate-950" : "border border-slate-700 text-slate-400 hover:border-orange-400/40 hover:text-orange-200"}`}>
                  {c}
                </button>
              ))}
              {PRO_COUNTRIES.map(c => (
                isPro ? (
                  <button key={c.code} onClick={() => setCountry(c.code)}
                    title={`${c.flag} ${t(c.labelKey)}`}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${country === c.code ? "bg-orange-500 text-slate-950" : "border border-slate-700 text-slate-400 hover:border-orange-400/40 hover:text-orange-200"}`}>
                    {c.flag} {c.code}
                  </button>
                ) : (
                  <a key={c.code} href="/pricing"
                    title={`${c.flag} ${t(c.labelKey)} — ${t("fc_plan_pro")}`}
                    className="rounded-lg px-3 py-1.5 text-xs font-bold border border-orange-500/20 text-orange-400/60 hover:border-orange-500/40 transition flex items-center gap-1">
                    {c.flag} {c.code} 🔒
                  </a>
                )
              ))}
              {PREMIUM_COUNTRIES.map(c => (
                isPremium ? (
                  <button key={c.code} onClick={() => setCountry(c.code)}
                    title={`${c.flag} ${t(c.labelKey)}`}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${country === c.code ? "bg-violet-500 text-white" : "border border-slate-700 text-slate-400 hover:border-violet-400/40 hover:text-violet-200"}`}>
                    {c.flag} {c.code}
                  </button>
                ) : (
                  <a key={c.code} href="/pricing"
                    title={`${c.flag} ${t(c.labelKey)} — ${t("fc_plan_premium")}`}
                    className="rounded-lg px-3 py-1.5 text-xs font-bold border border-violet-500/20 text-violet-400/60 hover:border-violet-500/40 transition flex items-center gap-1">
                    {c.flag} {c.code} 💎
                  </a>
                )
              ))}
            </div>
          </div>

          {/* Regras do país */}
          <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: t("fc_short_1y"), value: `${(regime.short * 100).toFixed(0)}%`, color: "text-rose-400" },
              { label: t("fc_long_term"), value: regime.longLabel, color: "text-emerald-400" },
              { label: t("fc_method"), value: "FIFO", color: "text-orange-300" },
              { label: t("fc_base_currency"), value: "EUR", color: "text-slate-300" },
            ].map(item => (
              <div key={item.label} className="text-center">
                <p className={`text-lg font-bold ${item.color}`}>{item.value}</p>
                <p className="text-xs text-slate-500 mt-0.5">{item.label}</p>
              </div>
            ))}
          </div>

          {/* Adicionar transação */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400 mb-4">{t("fisc_add_trade")}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <select value={newTrade.type} onChange={e => setNewTrade(tr => ({ ...tr, type: e.target.value as "compra" | "venda" }))}
                className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500">
                <option value="compra">{t("fisc_type_buy")}</option>
                <option value="venda">{t("fisc_type_sell")}</option>
              </select>
              <input placeholder={t("fisc_asset")} value={newTrade.asset}
                onChange={e => setNewTrade(t => ({ ...t, asset: e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 10) }))}
                className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-orange-500" />
              <input type="number" placeholder={t("fisc_amount")} value={newTrade.amount || ""} min="0" max="999999999" step="any"
                onChange={e => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= 0) setNewTrade(tr => ({ ...tr, amount: v })); }}
                className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-orange-500" />
              <input type="number" placeholder={t("fisc_price")} value={newTrade.price || ""} min="0" max="999999999" step="any"
                onChange={e => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= 0) setNewTrade(tr => ({ ...tr, price: v })); }}
                className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-orange-500" />
              <input type="date" value={newTrade.date}
                onChange={e => setNewTrade(tr => ({ ...tr, date: e.target.value }))}
                className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500" />
              <button onClick={() => {
                if (!newTrade.asset || newTrade.amount <= 0 || newTrade.price <= 0) return;
                setTrades(prev => [...prev, { ...newTrade, id: crypto.randomUUID() }]);
                setNewTrade(emptyTrade());
              }} className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-orange-400 transition">
                + {t("add")}
              </button>
            </div>
          </div>

          {/* Transações */}
          {trades.length > 0 && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400 mb-4">{t("fisc_transactions")} ({trades.length})</p>
              <div className="space-y-2">
                {[...trades].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(trade => (
                  <div key={trade.id} className="flex items-center gap-3 rounded-xl border border-slate-800 px-4 py-2.5">
                    <span className={`text-xs font-bold rounded-full px-2 py-0.5 ${trade.type === "compra" ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"}`}>
                      {trade.type === "compra" ? t("fisc_type_buy") : t("fisc_type_sell")}
                    </span>
                    <span className="text-sm font-semibold text-white w-12">{trade.asset}</span>
                    <span className="text-sm text-slate-300 flex-1">{trade.amount} × € {trade.price.toLocaleString("pt-PT")}</span>
                    <span className="text-sm font-semibold text-slate-300">€ {(trade.amount * trade.price).toLocaleString("pt-PT", { maximumFractionDigits: 0 })}</span>
                    <span className="text-xs text-slate-500">{trade.date}</span>
                    <button onClick={() => setTrades(prev => prev.filter(x => x.id !== trade.id))}
                      className="text-slate-600 hover:text-rose-400 transition text-sm px-1">✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Resultados */}
          {taxEvents.length > 0 && (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { icon: "📈", label: t("fc_total_gains"), value: summary.totalGain, color: summary.totalGain >= 0 ? "text-emerald-400" : "text-rose-400", highlight: false },
                  { icon: "✅", label: t("fc_exempt_long"), value: summary.exempt, color: "text-emerald-300", highlight: false },
                  { icon: "📉", label: t("fc_realized_losses"), value: summary.losses, color: "text-rose-400", highlight: false },
                  { icon: "🧾", label: t("fc_estimated_tax"), value: summary.tax, color: "text-orange-400", highlight: true },
                ].map(c => (
                  <div key={c.label} className={`rounded-2xl border p-4 text-center ${c.highlight ? "border-orange-500/40 bg-orange-500/10" : "border-slate-800 bg-slate-900/60"}`}>
                    <p className="text-base mb-1">{c.icon}</p>
                    <p className={`text-xl font-bold ${c.color}`}>{fmtEur(c.value)}</p>
                    <p className="text-xs text-slate-500 mt-1">{c.label}</p>
                  </div>
                ))}
              </div>

              {/* Tabela de eventos */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{t("fisc_tax_events")} ({taxEvents.length})</p>
                  <div className="flex items-center gap-2">
                    {isPro ? (
                      <button onClick={exportCSV}
                        className="flex items-center gap-2 rounded-xl border border-orange-500/40 px-3 py-1.5 text-xs font-semibold text-orange-300 hover:bg-orange-500/10 transition">
                        ↓ {t("fisc_export_csv")}
                      </button>
                    ) : (
                      <a href="/pricing"
                        className="flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:border-orange-400/40 hover:text-orange-300 transition">
                        🔒 {t("fisc_export_csv_pro")}
                      </a>
                    )}
                    {isPremium ? (
                      <button onClick={exportPDF}
                        className="flex items-center gap-2 rounded-xl border border-violet-500/40 bg-violet-500/5 px-3 py-1.5 text-xs font-semibold text-violet-300 hover:bg-violet-500/10 transition">
                        ↓ {t("fisc_export_pdf")}
                      </button>
                    ) : (
                      <a href="/pricing"
                        className="flex items-center gap-2 rounded-xl border border-violet-500/20 px-3 py-1.5 text-xs font-semibold text-violet-400/50 hover:border-violet-500/40 hover:text-violet-300 transition">
                        💎 {t("fisc_export_pdf_premium")}
                      </a>
                    )}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-500 text-left">
                        {[t("fc_col_asset"), t("fc_col_buy"), t("fc_col_sell"), t("fc_col_qtd"), t("fc_col_buyp"), t("fc_col_sellp"), t("fc_col_gain"), t("fc_col_type"), t("fc_col_rate"), t("fc_col_tax")].map(h => (
                          <th key={h} className="pb-2 pr-4 font-semibold">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {taxEvents.map((e, i) => (
                        <tr key={i} className="border-b border-slate-800/40 hover:bg-slate-800/20">
                          <td className="py-2 pr-4 font-semibold text-white">{e.asset}</td>
                          <td className="py-2 pr-4 text-slate-400">{e.buyDate}</td>
                          <td className="py-2 pr-4 text-slate-400">{e.sellDate}</td>
                          <td className="py-2 pr-4 text-slate-300">{e.amount.toFixed(4)}</td>
                          <td className="py-2 pr-4 text-slate-300">€ {e.buyPrice.toFixed(0)}</td>
                          <td className="py-2 pr-4 text-slate-300">€ {e.sellPrice.toFixed(0)}</td>
                          <td className={`py-2 pr-4 font-semibold ${e.gain >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                            {e.gain >= 0 ? "+" : ""}€ {e.gain.toLocaleString("pt-PT", { maximumFractionDigits: 0 })}
                          </td>
                          <td className="py-2 pr-4">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${e.holding === "longo" ? "bg-emerald-500/20 text-emerald-400" : "bg-orange-500/20 text-orange-400"}`}>
                              {e.holding === "longo" ? t("fc_long") : t("fc_short")}
                            </span>
                          </td>
                          <td className="py-2 pr-4 text-slate-400">{(e.taxRate * 100).toFixed(0)}%</td>
                          <td className={`py-2 font-semibold ${e.gain > 0 && e.taxRate > 0 ? "text-orange-400" : "text-emerald-400"}`}>
                            {e.gain > 0 && e.taxRate > 0 ? `€ ${(e.gain * e.taxRate).toLocaleString("pt-PT", { maximumFractionDigits: 0 })}` : t("fc_exempt")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Disclaimer */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                <p className="text-xs text-slate-500 leading-relaxed">
                  ⚠️ <strong className="text-slate-400">{t("fc_legal_notice")}</strong> {t("fc_disclaimer_text")}
                </p>
              </div>
            </>
          )}

          {trades.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-700 p-12 text-center">
              <p className="text-3xl mb-3">📋</p>
              <p className="text-sm font-semibold text-white">{t("fisc_no_trades")}</p>
              <p className="text-xs text-slate-400 mt-1">{t("fisc_no_trades_desc")}</p>
            </div>
          )}

          {/* Legislação por país */}
          <LegislationSection isPro={isPro} isPremium={isPremium} />

        </main>
      </div>
    </div>
    </AppShell>
  );
}
