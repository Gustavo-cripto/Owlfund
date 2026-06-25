"use client";

import { useState, useMemo, useEffect } from "react";
import AppShell from "@/components/AppShell";
import { useRequireAuth } from "@/lib/auth/useRequireAuth";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { createClient } from "@/lib/supabase/client";

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

const COUNTRY_LAW = [
  {
    code: "PT", flag: "🇵🇹", name: "Portugal",
    taxShort: "28%", taxLong: "Isento",
    threshold: "> 365 dias",
    color: "border-green-500/30 bg-green-500/5",
    badge: "text-green-400",
    summary: "Mais-valias cripto com detenção superior a 365 dias são isentas de imposto (desde 2023). Abaixo disso, aplica-se uma taxa de 28% sobre o lucro. Obrigatório declarar no IRS (Anexo G).",
    keyPoints: [
      "Taxa 0% para holding > 365 dias",
      "28% sobre ganhos de curto prazo",
      "Declarar em Anexo G do IRS",
      "FIFO obrigatório por defeito",
      "Lei n.º 24-D/2022, art. 5.º",
    ],
    law: "Lei n.º 24-D/2022",
  },
  {
    code: "ES", flag: "🇪🇸", name: "Espanha",
    taxShort: "19–30%", taxLong: "19–30%",
    threshold: "Escalonado por ganho",
    color: "border-yellow-500/30 bg-yellow-500/5",
    badge: "text-yellow-400",
    summary: "A Espanha trata as criptomoedas como ativos patrimoniais. As mais-valias são tributadas de forma escalonada: 19% até €6k, 21% de €6k–€50k, 23% de €50k–€200k, 27% de €200k–€300k e 30% acima de €300k (desde 2025). Sem distinção entre curto e longo prazo.",
    keyPoints: [
      "19% até €6.000 de ganho",
      "21% entre €6k e €50k",
      "23% entre €50k e €200k",
      "27% entre €200k e €300k",
      "30% acima de €300k (novo escalão 2025)",
      "Declarar na IRPF (Renda)",
    ],
    law: "LIRPF art. 33–35 (actualizado 2025)",
  },
  {
    code: "FR", flag: "🇫🇷", name: "França",
    taxShort: "30%", taxLong: "30%",
    threshold: "Flat tax (PFU)",
    color: "border-blue-500/30 bg-blue-500/5",
    badge: "text-blue-400",
    summary: "A França aplica um 'Prélèvement Forfaitaire Unique' (PFU) de 30% sobre todas as mais-valias cripto, independentemente do período de detenção. Inclui 12,8% de imposto e 17,2% de contribuições sociais.",
    keyPoints: [
      "Flat tax de 30% sobre todos os ganhos",
      "12,8% IR + 17,2% contribuições sociais",
      "Sem benefício por tempo de detenção",
      "Declarar na déclaration 2086",
      "Isenção se ganhos totais < €305/ano",
    ],
    law: "CGI art. 150 VH bis",
  },
  {
    code: "DE", flag: "🇩🇪", name: "Alemanha",
    taxShort: "Taxa marginal (até 45%)", taxLong: "Isento",
    threshold: "> 365 dias",
    color: "border-slate-500/30 bg-slate-500/5",
    badge: "text-slate-400",
    summary: "A Alemanha é dos países mais favoráveis: ganhos de ativos detidos mais de 1 ano são totalmente isentos. Para detenção inferior, aplica-se a taxa marginal de IRS pessoal (até 45%). Isenção também abaixo de €600 de ganho.",
    keyPoints: [
      "Taxa 0% para holding > 1 ano",
      "Taxa marginal pessoal para < 1 ano",
      "Isenção se ganhos anuais < €600",
      "Declarar na Anlage SO do Einkommensteuererklärung",
      "Regra especial para staking: < 10 anos",
    ],
    law: "EStG § 23",
  },
  {
    code: "UK", flag: "🇬🇧", name: "Reino Unido",
    taxShort: "18–24%", taxLong: "18–24%",
    threshold: "Por escalão de rendimento",
    color: "border-purple-500/30 bg-purple-500/5",
    badge: "text-purple-400",
    summary: "O HMRC trata cripto como ativos de capital. Após o Autumn Budget de Out 2024, as taxas subiram: 18% para contribuintes de base e 24% para contribuintes superiores. Isenção anual de £3.000 (Annual Exempt Amount 2024/25). Sem distinção temporal.",
    keyPoints: [
      "18% para contribuintes básicos (era 10% até Out 2024)",
      "24% para contribuintes de taxa superior (era 20% até Out 2024)",
      "Isenção anual de £3.000",
      "Regras Section 104 pooling (custo médio)",
      "Declarar via Self Assessment",
    ],
    law: "TCGA 1992 / HMRC CG Guidelines (Autumn Budget 2024)",
  },
  {
    code: "US", flag: "🇺🇸", name: "EUA",
    taxShort: "10–37%", taxLong: "0–20%",
    threshold: "> 365 dias",
    color: "border-red-500/30 bg-red-500/5",
    badge: "text-red-400",
    summary: "O IRS classifica cripto como 'property'. Ganhos de curto prazo (< 1 ano) são tributados à taxa marginal de rendimento ordinário (até 37%). Longo prazo: 0%, 15% ou 20% dependendo do rendimento. Obrigação adicional de reporte FBAR/FinCEN.",
    keyPoints: [
      "0–20% para longo prazo (>1 ano)",
      "10–37% para curto prazo",
      "Cada troca de cripto por cripto é evento tributável",
      "Declarar via Form 8949 + Schedule D",
      "Staking/mining = rendimento ordinário",
    ],
    law: "IRS Notice 2014-21 / Revenue Ruling 2023-14",
  },
  {
    code: "CH", flag: "🇨🇭", name: "Suíça",
    taxShort: "Isento (private)", taxLong: "Isento",
    threshold: "Investidores privados",
    color: "border-red-500/30 bg-red-500/5",
    badge: "text-red-400",
    summary: "A Suíça é considerada um paraíso cripto. Para investidores privados, os ganhos de capital são geralmente isentos de imposto federal. Trading frequente pode ser considerado atividade profissional (tributado). O imposto sobre riqueza aplica-se ao valor detido.",
    keyPoints: [
      "Ganhos de capital isentos para privados",
      "Trading profissional = tributado como rendimento",
      "Imposto sobre a fortuna (0,3–1%) sobre o valor",
      "Declarar na declaração de impostos cantonal",
      "Cada cantão tem regras ligeiramente diferentes",
    ],
    law: "DBG art. 16 / LIFD",
  },
  {
    code: "AE", flag: "🇦🇪", name: "Dubai / EAU",
    taxShort: "0%", taxLong: "0%",
    threshold: "Sem imposto sobre ganhos",
    color: "border-amber-500/30 bg-amber-500/5",
    badge: "text-amber-400",
    summary: "Os Emirados Árabes Unidos não têm imposto sobre o rendimento pessoal nem sobre mais-valias para pessoas singulares. Dubai é uma das jurisdições mais favoráveis do mundo para cripto, com regulação avançada via VARA.",
    keyPoints: [
      "0% de imposto sobre ganhos cripto",
      "0% de imposto sobre rendimento pessoal",
      "VARA regula exchanges e projetos cripto",
      "Necessário residência fiscal nos EAU",
      "Empresas: 9% imposto sobre lucros > AED 375k",
    ],
    law: "Federal Decree-Law No. 47 of 2022",
  },
];

function LegislationSection() {
  const [selected, setSelected] = useState<string | null>(null);
  const selectedCountry = COUNTRY_LAW.find((c) => c.code === selected);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-300/80">Guia</p>
        <h2 className="mt-1 text-xl font-bold text-white">Legislação por País</h2>
        <p className="mt-1 text-sm text-slate-400">
          Resumo do tratamento fiscal de criptomoedas nos principais países. Clica para ver detalhes.
        </p>
      </div>

      {/* Country grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {COUNTRY_LAW.map((c) => (
          <button
            key={c.code}
            type="button"
            onClick={() => setSelected(selected === c.code ? null : c.code)}
            className={`rounded-2xl border p-4 text-left transition hover:brightness-110 ${c.color} ${selected === c.code ? "ring-2 ring-orange-500/40" : ""}`}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">{c.flag}</span>
              <div>
                <p className="text-xs font-bold text-white">{c.name}</p>
                <p className={`text-[10px] font-medium ${c.badge}`}>{c.code}</p>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-[10px]">
                <span className="text-slate-500">Curto prazo</span>
                <span className="text-rose-400 font-medium">{c.taxShort}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-slate-500">Longo prazo</span>
                <span className="text-emerald-400 font-medium">{c.taxLong}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-slate-500">Limiar</span>
                <span className="text-slate-400 font-medium text-right">{c.threshold}</span>
              </div>
            </div>
          </button>
        ))}
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
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Pontos-chave</p>
            <ul className="space-y-1.5">
              {selectedCountry.keyPoints.map((point) => (
                <li key={point} className="flex items-start gap-2 text-sm text-slate-300">
                  <span className={`mt-0.5 shrink-0 text-xs ${selectedCountry.badge}`}>•</span>
                  {point}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-slate-600">⚠️ Informação de caráter geral. Consulta sempre um especialista fiscal.</p>
        </div>
      )}
    </div>
  );
}

const FREE_COUNTRIES = ["PT", "ES", "FR", "DE"] as const;
const PRO_COUNTRIES = [
  { code: "GB", flag: "🇬🇧", label: "Reino Unido" },
  { code: "NL", flag: "🇳🇱", label: "Países Baixos" },
  { code: "IT", flag: "🇮🇹", label: "Itália" },
  { code: "BR", flag: "🇧🇷", label: "Brasil" },
] as const;

const PREMIUM_COUNTRIES = [
  { code: "US", flag: "🇺🇸", label: "EUA" },
  { code: "CA", flag: "🇨🇦", label: "Canadá" },
  { code: "AU", flag: "🇦🇺", label: "Austrália" },
  { code: "CH", flag: "🇨🇭", label: "Suíça" },
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
      ["Ativo", "Data compra", "Data venda", "Preço compra", "Preço venda", "Quantidade", "Mais-valia", "Tipo", "Taxa", "Imposto"],
      ...taxEvents.map(e => [
        e.asset, e.buyDate, e.sellDate,
        e.buyPrice.toFixed(2), e.sellPrice.toFixed(2),
        e.amount.toFixed(8), e.gain.toFixed(2),
        e.holding === "longo" ? "Longo prazo" : "Curto prazo",
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

  if (isLoading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><p className="text-slate-400 animate-pulse">{t("loading")}</p></div>;

  const fmtEur = (v: number) => `€ ${Math.abs(v).toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
                    title={`${c.flag} ${c.label}`}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${country === c.code ? "bg-orange-500 text-slate-950" : "border border-slate-700 text-slate-400 hover:border-orange-400/40 hover:text-orange-200"}`}>
                    {c.flag} {c.code}
                  </button>
                ) : (
                  <a key={c.code} href="/pricing"
                    title={`${c.flag} ${c.label} — Plano Pro`}
                    className="rounded-lg px-3 py-1.5 text-xs font-bold border border-orange-500/20 text-orange-400/60 hover:border-orange-500/40 transition flex items-center gap-1">
                    {c.flag} {c.code} 🔒
                  </a>
                )
              ))}
              {PREMIUM_COUNTRIES.map(c => (
                isPremium ? (
                  <button key={c.code} onClick={() => setCountry(c.code)}
                    title={`${c.flag} ${c.label}`}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${country === c.code ? "bg-violet-500 text-white" : "border border-slate-700 text-slate-400 hover:border-violet-400/40 hover:text-violet-200"}`}>
                    {c.flag} {c.code}
                  </button>
                ) : (
                  <a key={c.code} href="/pricing"
                    title={`${c.flag} ${c.label} — Plano Premium`}
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
              { label: "Curto prazo (<1 ano)", value: `${(regime.short * 100).toFixed(0)}%`, color: "text-rose-400" },
              { label: "Longo prazo", value: regime.longLabel, color: "text-emerald-400" },
              { label: "Método", value: "FIFO", color: "text-orange-300" },
              { label: "Moeda base", value: "EUR", color: "text-slate-300" },
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
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400 mb-4">Transações ({trades.length})</p>
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
                  { label: "Mais-valias totais", value: summary.totalGain, color: summary.totalGain >= 0 ? "text-emerald-400" : "text-rose-400" },
                  { label: "Isentas (longo prazo)", value: summary.exempt, color: "text-emerald-300" },
                  { label: "Perdas realizadas", value: summary.losses, color: "text-rose-400" },
                  { label: "Imposto estimado", value: summary.tax, color: "text-orange-400" },
                ].map(c => (
                  <div key={c.label} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-center">
                    <p className={`text-xl font-bold ${c.color}`}>{fmtEur(c.value)}</p>
                    <p className="text-xs text-slate-500 mt-1">{c.label}</p>
                  </div>
                ))}
              </div>

              {/* Tabela de eventos */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Eventos fiscais ({taxEvents.length})</p>
                  <div className="flex items-center gap-2">
                    {isPro ? (
                      <button onClick={exportCSV}
                        className="flex items-center gap-2 rounded-xl border border-orange-500/40 px-3 py-1.5 text-xs font-semibold text-orange-300 hover:bg-orange-500/10 transition">
                        ↓ Exportar CSV (IRS)
                      </button>
                    ) : (
                      <a href="/pricing"
                        className="flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:border-orange-400/40 hover:text-orange-300 transition">
                        🔒 Exportar CSV (Pro)
                      </a>
                    )}
                    {isPremium ? (
                      <button onClick={() => alert("Exportação PDF em desenvolvimento. Disponível em breve!")}
                        className="flex items-center gap-2 rounded-xl border border-violet-500/40 bg-violet-500/5 px-3 py-1.5 text-xs font-semibold text-violet-300 hover:bg-violet-500/10 transition">
                        ↓ Exportar PDF (AT)
                      </button>
                    ) : (
                      <a href="/pricing"
                        className="flex items-center gap-2 rounded-xl border border-violet-500/20 px-3 py-1.5 text-xs font-semibold text-violet-400/50 hover:border-violet-500/40 hover:text-violet-300 transition">
                        💎 PDF Avançado (Premium)
                      </a>
                    )}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-500 text-left">
                        {["Ativo", "Compra", "Venda", "Qtd", "P.Compra", "P.Venda", "Mais-valia", "Tipo", "Taxa", "Imposto"].map(h => (
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
                            {e.gain >= 0 ? "+" : ""}€ {e.gain.toFixed(2)}
                          </td>
                          <td className="py-2 pr-4">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${e.holding === "longo" ? "bg-emerald-500/20 text-emerald-400" : "bg-orange-500/20 text-orange-400"}`}>
                              {e.holding === "longo" ? "Longo" : "Curto"}
                            </span>
                          </td>
                          <td className="py-2 pr-4 text-slate-400">{(e.taxRate * 100).toFixed(0)}%</td>
                          <td className={`py-2 font-semibold ${e.gain > 0 && e.taxRate > 0 ? "text-orange-400" : "text-emerald-400"}`}>
                            {e.gain > 0 && e.taxRate > 0 ? `€ ${(e.gain * e.taxRate).toFixed(2)}` : "Isento"}
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
                  ⚠️ <strong className="text-slate-400">Aviso legal:</strong> Este cálculo é meramente indicativo com base nas regras gerais de cada país.
                  Consulta sempre um contabilista ou advogado fiscal para a tua declaração oficial.
                  Regras PT: Lei n.º 24-D/2022, art. 5.º — mais-valias cripto com detenção &gt;365 dias isentas desde 2023.
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
          <LegislationSection />

        </main>
      </div>
    </div>
    </AppShell>
  );
}
