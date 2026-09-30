"use client";

import Link from "next/link";
import Segmentos from "@/components/ui/Segmentos";
import { useCallback, useEffect, useMemo, useState } from "react";
import { COST_METHOD_LABEL, COST_METHOD_SHORT, COUNTRIES, TAX_REGIMES, guideUrl, metodoRessalva, moedaDoRelatorio } from "@/lib/tax/countries";
import { realizar, resumoAnualPolaco, type Operacao } from "@/lib/tax/metodos";
import { loadFxTable, type FxTable } from "@/lib/fx/historical";
import { CURRENCY_SIGN } from "@/lib/currency/symbols";
import { btnPrimary } from "@/lib/ui/buttons";
import AppShell from "@/components/AppShell";
import EmptyState from "@/components/EmptyState";
import PageSkeleton from "@/components/PageSkeleton";
import { useRequireAuth } from "@/lib/auth/useRequireAuth";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useTheme, useCurrencyFormat } from "@/lib/theme/ThemeContext";
import type { TranslationKey } from "@/lib/i18n/translations";
import { createClient } from "@/lib/supabase/client";
import type { jsPDF } from "jspdf";  // so o tipo: a biblioteca (~300 kB) carrega no clique
import { downloadBlob, isStaleChunkError, loadExcelJS } from "@/lib/export/excel";
import { cleanDecimalInput, parseDecimal } from "@/lib/format/decimal";
import { ACCOUNTS_EVENT } from "@/lib/portfolios/accounts";
import { pushWalletCloud } from "@/lib/portfolios/cloudSync";
import { chronoCompare, deleteTrade, loadTrades, tradeId, upsertTrade } from "@/lib/portfolios/trades";
import { resumirImposto } from "@/lib/api/taxMath";
import { anoFiscalDe, classificarLote, comTaxaPessoal, fimDoAnoFiscal, regimeNaData, resumirPais, rotuloAnoFiscal, type TaxaPessoal } from "@/lib/tax/regras";
import { protegerTextoPdf } from "@/lib/export/pdfTexto";

const LOCALE_BY_LANG: Record<string, string> = { pt: "pt-PT", en: "en-GB", es: "es-ES", fr: "fr-FR" };
// Durante o beta os CTAs de upgrade apontam para o convite /beta.
const paymentsFrozen = process.env.NEXT_PUBLIC_PAYMENTS_ENABLED !== "true";
const upgradeHref = paymentsFrozen ? "/beta" : "/pricing";

type TradeEntry = {
  id: string;
  asset: string;
  type: "compra" | "venda" | "taxa";
  amount: number;
  price: number;
  /** Taxa em EUR (0 = sem taxa). */
  fee: number;
  /** Taxa paga em token: simbolo e quantidade (sai do FIFO desse token). */
  feeAsset?: string;
  feeQty?: number;
  date: string;
  exchange: string;
  /** Troca cripto↔cripto (as duas pernas partilham o id). */
  swapId?: string;
};

type StandaloneFee = { asset: string; date: string; amount: number; value: number };

type TaxEvent = {
  asset: string;
  buyDate: string;
  sellDate: string;
  buyPrice: number;
  sellPrice: number;
  amount: number;
  /** Parte das taxas (compra + venda) que cabe a este evento, na moeda do relatorio. */
  fees: number;
  /** Liquido de taxas. */
  gain: number;
  holding: "curto" | "longo"; // pelo prazo do pais (regras.ts: dias ou meses de calendario)
  taxRate: number; // taxa do ano da venda (regimeNaData), com a taxa pessoal se houver
  /** Valor de venda na moeda do relatorio (FR: isencao por vendas; BR: isencao mensal). */
  saleValue: number;
};

// Regras PT 2024: cripto com holding >365 dias = isento; <=365 dias = 28%
const PT_TAX_SHORT = 0.28;
const PT_TAX_LONG = 0.0; // isento

function calcDays(from: string, to: string): number {
  return Math.floor((new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24));
}

const emptyTrade = (): TradeEntry => ({
  id: tradeId(),
  asset: "BTC",
  type: "compra",
  amount: 0,
  price: 0,
  fee: 0,
  date: new Date().toISOString().slice(0, 10),
  exchange: "Binance",
});

type Country = { code: string; flag: string; name: string; taxShort: string; taxLong: string; threshold: string; color: string; badge: string; summary: string; keyPoints: string[]; law: string; plan: "free" | "pro" | "premium" };

function buildCountryLaw(t: (k: TranslationKey) => string): Country[] {
  // A lei vem de src/lib/tax/countries.ts, a mesma fonte dos guias e da
  // calculadora. Havia aqui uma copia antiga ("Lei n.º 24-D/2022", "IN RFB
  // 1888/2019" revogada, "CRA IT-218R" que e sobre imoveis) que as revisoes
  // de 30 set 2026 nao alcancavam.
  const c = (code: string, flag: string, color: string, badge: string, p: string, _leiAntiga: string, plan: "free" | "pro" | "premium" = "free"): Country => ({
    code, flag, color, badge, plan,
    law: COUNTRIES.find((x) => x.code === code)?.law ?? "",
    name: t(`fc_${p}_name` as TranslationKey),
    taxShort: t(`fc_${p}_short` as TranslationKey),
    taxLong: t(`fc_${p}_long` as TranslationKey),
    threshold: t(`fc_${p}_thr` as TranslationKey),
    summary: t(`fc_${p}_sum` as TranslationKey),
    keyPoints: t(`fc_${p}_kp` as TranslationKey).split("\n"),
  });
  return [
    c("PT", "🇵🇹", "border-green-500/30 bg-green-500/5", "text-green-400", "pt", ""),
    c("ES", "🇪🇸", "border-yellow-500/30 bg-yellow-500/5", "text-yellow-400", "es", ""),
    c("FR", "🇫🇷", "border-blue-500/30 bg-blue-500/5", "text-blue-400", "fr", ""),
    c("DE", "🇩🇪", "border-slate-500/30 bg-slate-500/5", "text-slate-400", "de", ""),
    c("GB", "🇬🇧", "border-purple-500/30 bg-purple-500/5", "text-purple-400", "uk", "", "pro"),
    c("NL", "🇳🇱", "border-orange-500/30 bg-orange-500/5", "text-orange-400", "nl", "", "pro"),
    c("IT", "🇮🇹", "border-green-600/30 bg-green-600/5", "text-green-300", "it", "", "pro"),
    c("BR", "🇧🇷", "border-emerald-500/30 bg-emerald-500/5", "text-emerald-400", "br", "", "pro"),
    c("BE", "🇧🇪", "border-yellow-400/30 bg-yellow-400/5", "text-yellow-300", "be", "", "pro"),
    c("IE", "🇮🇪", "border-emerald-400/30 bg-emerald-400/5", "text-emerald-300", "ie", "", "pro"),
    c("AT", "🇦🇹", "border-red-500/30 bg-red-500/5", "text-red-300", "at", "", "pro"),
    c("PL", "🇵🇱", "border-rose-400/30 bg-rose-400/5", "text-rose-300", "pl", "", "pro"),
    c("LU", "🇱🇺", "border-sky-400/30 bg-sky-400/5", "text-sky-300", "lu", "", "pro"),
    c("US", "🇺🇸", "border-red-500/30 bg-red-500/5", "text-red-400", "us", "", "premium"),
    c("CA", "🇨🇦", "border-rose-500/30 bg-rose-500/5", "text-rose-400", "ca", "", "premium"),
    c("AU", "🇦🇺", "border-sky-500/30 bg-sky-500/5", "text-sky-400", "au", "", "premium"),
    c("CH", "🇨🇭", "border-red-500/30 bg-red-500/5", "text-red-400", "ch", "", "premium"),
    c("AE", "🇦🇪", "border-amber-500/30 bg-amber-500/5", "text-amber-400", "ae", "", "premium"),
    c("SG", "🇸🇬", "border-red-400/30 bg-red-400/5", "text-red-300", "sg", "", "premium"),
    c("MX", "🇲🇽", "border-green-500/30 bg-green-500/5", "text-green-300", "mx", "", "premium"),
    c("AR", "🇦🇷", "border-cyan-400/30 bg-cyan-400/5", "text-cyan-300", "ar", "", "premium"),
  ];
}

// Linhas de taxa de um cartao. Sem prazo de detencao as duas taxas sao a
// mesma: uma linha so ("Taxa de imposto"), em vez de "33%" repetido.
function LinhasTaxa({ c }: { c: Country }) {
  const { t } = useLanguage();
  const igual = c.taxShort.trim().toLowerCase() === c.taxLong.trim().toLowerCase();
  const linha = (rotulo: string, valor: string, cor: string) => (
    <div className="flex justify-between gap-2 text-[11px]">
      <span className="shrink-0 text-slate-500">{rotulo}</span>
      <span className={`text-right font-medium ${cor}`}>{valor}</span>
    </div>
  );
  return (
    <div className="space-y-1">
      {igual
        ? linha(t("fisc_tax_rate"), c.taxShort, "text-rose-400")
        : (<>{linha(t("fc_short_term"), c.taxShort, "text-rose-400")}{linha(t("fc_long_term"), c.taxLong, "text-emerald-400")}</>)}
      {linha(t("fc_threshold"), c.threshold, "text-slate-400")}
    </div>
  );
}

function LegislationSection({ isPro, isPremium }: { isPro: boolean; isPremium: boolean }) {
  const { t, lang } = useLanguage();
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
        {/* Os guias publicos tem as regras dos 21 paises sem bloqueio de plano —
            util sobretudo para quem aqui ve um pais fechado. */}
        <a
          href={lang === "pt" ? "/guias/impostos-cripto" : "/guides/crypto-tax"}
          className="mt-2 inline-block text-sm font-medium text-orange-300 transition hover:text-orange-200"
        >
          {t("fc_public_guides")} →
        </a>
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
                  <p className={`text-[11px] font-medium ${c.badge}`}>{c.code}</p>
                </div>
              </div>
              <LinhasTaxa c={c} />
            </button>
          ) : (
            <a
              key={c.code}
              href={upgradeHref}
              className={`rounded-2xl border p-4 text-left transition opacity-60 hover:opacity-80 ${c.color}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">{c.flag}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-white">{c.name}</p>
                  <p className={`text-[11px] font-medium ${c.badge}`}>{c.code}</p>
                </div>
                <span className="text-[11px]">{c.plan === "premium" ? "💎" : "🔒"}</span>
              </div>
              <LinhasTaxa c={c} />
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

const FREE_COUNTRIES = [
  { code: "PT", flag: "🇵🇹" },
  { code: "ES", flag: "🇪🇸" },
  { code: "FR", flag: "🇫🇷" },
  { code: "DE", flag: "🇩🇪" },
] as const;
const PRO_COUNTRIES = [
  { code: "GB", flag: "🇬🇧", labelKey: "fc_uk_name" },
  { code: "NL", flag: "🇳🇱", labelKey: "fc_nl" },
  { code: "IT", flag: "🇮🇹", labelKey: "fc_it" },
  { code: "BR", flag: "🇧🇷", labelKey: "fc_br" },
  { code: "BE", flag: "🇧🇪", labelKey: "fc_be" },
  { code: "IE", flag: "🇮🇪", labelKey: "fc_ie" },
  { code: "AT", flag: "🇦🇹", labelKey: "fc_at" },
  { code: "PL", flag: "🇵🇱", labelKey: "fc_pl" },
  { code: "LU", flag: "🇱🇺", labelKey: "fc_lu" },
] as const;

const PREMIUM_COUNTRIES = [
  { code: "US", flag: "🇺🇸", labelKey: "fc_us_name" },
  { code: "CA", flag: "🇨🇦", labelKey: "fc_ca" },
  { code: "AU", flag: "🇦🇺", labelKey: "fc_au" },
  { code: "CH", flag: "🇨🇭", labelKey: "fc_ch_name" },
  { code: "AE", flag: "🇦🇪", labelKey: "fc_ae_name" },
  { code: "SG", flag: "🇸🇬", labelKey: "fc_sg_name" },
  { code: "MX", flag: "🇲🇽", labelKey: "fc_mx" },
  { code: "AR", flag: "🇦🇷", labelKey: "fc_ar" },
] as const;

export default function FiscalidadePage() {
  const { isLoading, userId } = useRequireAuth("/login");
  const { t, lang } = useLanguage();
  const { hideBalances } = useTheme();
  // A pessoa escreve os precos na moeda que escolheu ver o site; a app guarda
  // em euros (a unidade interna) a taxa DA DATA da transacao.
  const { currency: inputCurrency } = useCurrencyFormat();
  const inputSymbol = CURRENCY_SIGN[inputCurrency] ?? inputCurrency;
  const [addError, setAddError] = useState<string | null>(null);
  const uiLocale = LOCALE_BY_LANG[lang] ?? "pt-PT";
  const [isPro, setIsPro] = useState(false);
  // Uma exportacao que rebenta tem de o dizer — nao ficar em silencio.
  const [exportError, setExportError] = useState<string | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  // Fonte única: o Histórico (/historico) da conta ativa. O que se adiciona aqui
  // fica também lá — e vice-versa.
  const [trades, setTrades] = useState<TradeEntry[]>([]);
  const [fromHistory, setFromHistory] = useState(0);
  useEffect(() => {
    const load = () => {
      // Ordem canonica a montante: o comparador oficial desempata o mesmo dia
      // por tipo (compra -> taxa -> venda). Sem isto, uma compra e uma venda no
      // MESMO dia chegavam ao FIFO pela ordem do localStorage, que e a inversa.
      const hist = loadTrades().sort(chronoCompare);
      setTrades(hist.map(h => ({ id: h.id, asset: h.asset, type: h.type, amount: h.quantity, price: h.priceEur, fee: h.feeEur ?? 0, ...(h.feeAsset ? { feeAsset: h.feeAsset, feeQty: h.feeInput ?? 0 } : {}), date: h.date, exchange: h.exchange, ...(h.swapId ? { swapId: h.swapId } : {}) })));
      setFromHistory(hist.length);
    };
    load();
    window.addEventListener(ACCOUNTS_EVENT, load);
    return () => window.removeEventListener(ACCOUNTS_EVENT, load);
  }, []);
  const [newTrade, setNewTrade] = useState<TradeEntry>(emptyTrade());
  // O que a pessoa escreve, tal e qual (aceita virgula): os numeros derivam daqui.
  const [raw, setRaw] = useState<{ amount: string; price: string; fee: string }>({ amount: "", price: "", fee: "" });
  const setNum = (k: "amount" | "price" | "fee") => (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = cleanDecimalInput(e.target.value);
    setRaw((r) => ({ ...r, [k]: text }));
    const v = parseDecimal(text);
    setNewTrade((tr) => ({ ...tr, [k]: Number.isFinite(v) && v >= 0 ? v : 0 }));
  };
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

  // Taxas e isenções vêm de src/lib/tax/countries.ts — a MESMA fonte que os
  // guias públicos em /guias/impostos-cripto, para o site nunca dizer 28% num
  // sítio e 30% no outro.
  const taxRates = TAX_REGIMES;
  const regime = taxRates[country] ?? taxRates["PT"];

  // ── Moeda do relatorio ────────────────────────────────────────────────────
  // Declara-se na moeda do pais: um relatorio do IRS em euros nao serve para
  // declarar nos EUA. A app guarda tudo em euros, por isso cada perna da
  // operacao e convertida a taxa DA SUA data — a compra a taxa do dia da
  // compra, a venda a taxa do dia da venda. E assim que as autoridades
  // fiscais calculam, e por isso e que a taxa de hoje nao serve.
  // Ha paises cuja moeda o BCE nao publica (AED, ARS): nesses o relatorio sai
  // em euros COM AVISO, em vez de descartar tudo e mostrar zero.
  const paisDoRelatorio = COUNTRIES.find((c) => c.code === country);
  // Metodo de custo que o pais exige (verificado set 2026), aplicado pelo motor
  // em src/lib/tax/metodos.ts. A ressalva diz onde ainda se simplifica.
  const costMethod = paisDoRelatorio?.costMethod ?? "fifo";
  const metodoDoPais = COST_METHOD_LABEL[costMethod][lang];
  const metodoCurto = COST_METHOD_SHORT[costMethod];
  const ressalvaMetodo = metodoRessalva(costMethod, lang, paisDoRelatorio?.code);
  const pct = (r: number) => `${(r * 100).toLocaleString(uiLocale, { maximumFractionDigits: 2 })}%`;
  // Taxa marginal escrita pela pessoa, onde a lei a faz depender do rendimento
  // (DE, LU, US, AU, GB, CA, MX). Sem ela usa-se a maxima, com as sobretaxas.
  // Guardada por utilizador e pais, so neste browser.
  const regrasPais = paisDoRelatorio?.regras;
  const chaveTaxa = userId && regrasPais?.taxaMarginal ? `fisc-taxa-v1:${userId}:${country}` : null;
  const [taxaPessoal, setTaxaPessoal] = useState<TaxaPessoal | undefined>(undefined);
  useEffect(() => {
    if (!chaveTaxa) { setTaxaPessoal(undefined); return; }
    try { const v = JSON.parse(localStorage.getItem(chaveTaxa) ?? "null"); setTaxaPessoal(v && typeof v === "object" ? v : undefined); } catch { setTaxaPessoal(undefined); }
  }, [chaveTaxa]);
  const gravarTaxa = (campo: "curto" | "longo", texto: string) => {
    const n = parseFloat(texto.replace(",", "."));
    const novo: TaxaPessoal = { ...(taxaPessoal ?? {}) };
    if (Number.isFinite(n) && n >= 0 && n <= 60) novo[campo] = n / 100; else delete novo[campo];
    const vazio = novo.curto == null && novo.longo == null;
    setTaxaPessoal(vazio ? undefined : novo);
    if (chaveTaxa) { try { if (vazio) localStorage.removeItem(chaveTaxa); else localStorage.setItem(chaveTaxa, JSON.stringify(novo)); } catch { /* modo privado */ } }
  };
  // Onde estao as moedas (ou em que moeda se vendeu) muda o imposto em BR,
  // PT, AR e AT (RegrasPais.alternativa). false = a opcao habitual.
  const [alternativa, setAlternativa] = useState(false);
  useEffect(() => { setAlternativa(false); }, [country]);
  const altId = regrasPais?.alternativa?.id;
  const altK = (parte: "where" | "a" | "b" | "a_note" | "b_note" | "b_regime") => {
    const br = { where: "fisc_br_where", a: "fisc_br_local", b: "fisc_br_foreign", a_note: "fisc_br_local_note", b_note: "fisc_br_foreign_note", b_regime: "fisc_br_foreign_regime" } as const;
    return (altId === "br" ? br[parte] : `fisc_alt_${altId}_${parte}`) as Parameters<typeof t>[0];
  };
  const semParenteseFinal = (s: string) => s.replace(/\s*\([^()]*\)\s*$/, "");
  const { currency: reportCurrency, fallback: moedaEmFalta } =
    paisDoRelatorio ? moedaDoRelatorio(paisDoRelatorio) : { currency: "EUR", fallback: false };
  const reportSymbol = CURRENCY_SIGN[reportCurrency] ?? reportCurrency;
  const [fx, setFx] = useState<FxTable | null>(null);
  const [fxLoading, setFxLoading] = useState(false);

  useEffect(() => {
    if (reportCurrency === "EUR" || trades.length === 0) { setFx(null); return; }
    let vivo = true;
    setFxLoading(true);
    (async () => {
      const tabela = await loadFxTable(trades.map((t) => t.date), [reportCurrency]);
      if (vivo) { setFx(tabela); setFxLoading(false); }
    })();
    return () => { vivo = false; };
  }, [reportCurrency, trades]);

  /** Converte um valor em euros para a moeda do relatorio, a taxa da data. */
  const toReport = useCallback(
    (eur: number, date: string): number | null => {
      if (reportCurrency === "EUR") return eur;
      if (!fx) return null;
      return fx.convert(eur, "EUR", reportCurrency, date);
    },
    [fx, reportCurrency],
  );

  /** True quando faltou alguma taxa e os numeros nao podem ser mostrados. */
  const [fxIncomplete, setFxIncomplete] = useState(false);

  // Eventos de mais-valias pelo metodo do pais (motor em src/lib/tax/metodos.ts).
  const fifoFiscal = useMemo<{ events: TaxEvent[]; soTaxa: StandaloneFee[]; ops: Operacao[]; unmatched: Record<string, number>; feesNoPreco: number }>(() => {
    let faltou = false;
    const sorted = trades;   // ja vem em ordem canonica de loadTrades().sort(chronoCompare)
    const soTaxa: StandaloneFee[] = [];
    const ops: Operacao[] = [];
    for (const tr of sorted) {
      if (tr.type === "taxa") {
        const valor = toReport(tr.price * tr.amount, tr.date);
        if (valor == null) { faltou = true; continue; }
        soTaxa.push({ asset: tr.asset, date: tr.date, amount: tr.amount, value: valor });
        ops.push({ type: "taxa", asset: tr.asset, amount: tr.amount, price: tr.amount > 0 ? valor / tr.amount : 0, fee: 0, date: tr.date });
        continue;
      }
      // Preco e taxa convertidos a taxa da data desta transacao.
      const preco = toReport(tr.price, tr.date);
      const taxa = tr.fee > 0 ? toReport(tr.fee, tr.date) : 0;
      if (preco == null || taxa == null) { faltou = true; continue; }
      ops.push({ type: tr.type, asset: tr.asset, amount: tr.amount, price: preco, fee: taxa, date: tr.date, ...(tr.swapId ? { swapId: tr.swapId } : {}), ...(tr.feeAsset && (tr.feeQty ?? 0) > 0 ? { feeAsset: tr.feeAsset, feeQty: tr.feeQty } : {}) });
    }
    // PT com contraparte sem convencao: as trocas deixam de ser neutras.
    const r = realizar(ops, costMethod, { permutaNeutra: regrasPais?.permutaNeutra && !(alternativa && regrasPais?.alternativa?.trocasTributadas) });
    // Nos metodos de custo medio a taxa de compra ja esta no preco: `fees` do
    // lote so tem a de venda, e a parte que entrou na media vem em feesNoPreco
    // (so para o total "taxas deduzidas" nao ficar por baixo).
    // Classificacao pelo pais (regras.ts): prazo por calendario, regras do
    // ano da venda, Altbestand, taxas por ativo, taxa pessoal.
    const events: TaxEvent[] = r.lotes.map((l) => {
      const c = paisDoRelatorio ? classificarLote(paisDoRelatorio, l, taxaPessoal, alternativa) : { longo: false, taxa: regime.short };
      return {
        asset: l.asset, buyDate: l.buyDate, sellDate: l.sellDate, buyPrice: l.buyPrice, sellPrice: l.sellPrice,
        amount: l.amount, fees: l.fees + l.feesNoPreco, gain: l.gain, holding: c.longo ? "longo" : "curto", taxRate: c.taxa,
        saleValue: l.sellPrice * l.amount,
      };
    });
    if (faltou !== fxIncomplete) setFxIncomplete(faltou);
    const feesNoPreco = r.lotes.reduce((acc, l) => acc + l.feesNoPreco, 0);
    return { events, soTaxa, ops, unmatched: r.unmatched, feesNoPreco };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trades, regime, toReport, costMethod, paisDoRelatorio, taxaPessoal, alternativa]);

  const taxEvents = fifoFiscal.events;
  // Registos "so taxa" (swap falhado, gas de outra carteira): nao deduzidos
  // automaticamente — o tratamento fiscal varia; mostram-se a parte.
  const standaloneFees = fifoFiscal.soTaxa;

  // Vendas sem lote de compra correspondente (custo de aquisicao em falta):
  // vem do motor, que sabe do mesmo dia/30 dias do pool britanico. Um calculo
  // paralelo por saldo contradizia a tabela nesses casos.
  const unmatched = fifoFiscal.unmatched;

  // ── Ano fiscal ────────────────────────────────────────────────────────────
  // Nao se declara "a vida toda": declara-se um ano. E a isencao anual e, como
  // o nome diz, por ano. Sem isto, uma perda de 2024 apagava imposto de 2026 —
  // erro a favor do contribuinte, que e o lado perigoso de errar.
  //
  // O filtro e sobre os EVENTOS (pela data da venda), nunca sobre os trades: se
  // se filtrassem as transacoes, perdiam-se os lotes de compra de anos
  // anteriores e o custo de aquisicao desaparecia.
  const anosDisponiveis = useMemo(() => {
    // Polonia: um ano so com vendas sem lote continua a ter receitas na base anual.
    const doAnual = costMethod === "annual" ? resumoAnualPolaco(fifoFiscal.ops).map((a) => a.ano) : [];
    const anos = [...new Set([...taxEvents.map((e) => anoFiscalDe(paisDoRelatorio, e.sellDate)), ...doAnual])].sort((a, b) => b - a);
    return anos;
  }, [taxEvents, costMethod, fifoFiscal.ops, paisDoRelatorio]);
  const [anoFiscal, setAnoFiscal] = useState<number | null>(null);
  const anoAtivo = anoFiscal ?? anosDisponiveis[0] ?? new Date().getFullYear();
  useEffect(() => {
    // Se o ano escolhido deixar de ter eventos (mudanca de conta), volta ao mais recente.
    if (anoFiscal != null && anosDisponiveis.length > 0 && !anosDisponiveis.includes(anoFiscal)) setAnoFiscal(null);
  }, [anoFiscal, anosDisponiveis]);

  const eventosDoAno = useMemo(
    () => taxEvents.filter((e) => anoFiscalDe(paisDoRelatorio, e.sellDate) === anoAtivo),
    [taxEvents, anoAtivo, paisDoRelatorio],
  );
  const taxasDoAno = useMemo(
    () => standaloneFees.filter((f) => anoFiscalDe(paisDoRelatorio, f.date) === anoAtivo),
    [standaloneFees, anoAtivo, paisDoRelatorio],
  );

  const summary = useMemo(() => {
    // A MESMA funcao que a API e o MCP usam. Havia aqui uma copia da conta, e
    // as duas copias erravam igual: as menos-valias nunca abatiam aos ganhos.
    // Polonia (art. 30b ust. 1a PIT): a base do ano e receitas menos TODOS os
    // custos do ano (vendidos ou nao), com o excedente a transitar. Os lotes
    // FIFO ficam na tabela so para se ver de onde vem cada venda.
    const anual = costMethod === "annual" ? resumoAnualPolaco(fifoFiscal.ops).find((a) => a.ano === anoAtivo) : null;
    const r = anual
      ? resumirImposto([{ gain: anual.base > 0 ? anual.base : anual.receitas - anual.custos - anual.custosTransitados, taxRate: regime.short }], regime)
      : paisDoRelatorio
        ? resumirPais(paisDoRelatorio, eventosDoAno.map((e) => ({ gain: e.gain, taxRate: e.taxRate, longTerm: e.holding === "longo", sellDate: e.sellDate, saleValue: e.saleValue })), { alternativa, taxaPessoal })
        : resumirImposto(eventosDoAno, regime);
    // Polonia: as taxas deduzidas sao as de TODAS as compras e vendas do ano
    // (estao dentro da base anual), nao as dos lotes FIFO.
    const fees = anual ? anual.taxas : eventosDoAno.reduce((s, e) => s + e.fees, 0);
    const standalone = taxasDoAno.reduce((s, f) => s + f.value, 0);
    return { ...r, fees, standalone, anual };
  }, [eventosDoAno, taxasDoAno, regime, costMethod, fifoFiscal.ops, anoAtivo, paisDoRelatorio, alternativa, taxaPessoal]);

  // Regras do ANO escolhido (IT 26% em 2025, FR 30% ate 2024, BE sem imposto
  // antes de 2026…), com a taxa pessoal: e o que o cartao e o PDF mostram.
  const regimeAno = paisDoRelatorio
    ? comTaxaPessoal(paisDoRelatorio, regimeNaData(paisDoRelatorio, fimDoAnoFiscal(paisDoRelatorio, anoAtivo)), taxaPessoal)
    : { short: regime.short, long: regime.long, longDays: regime.longDays, allowance: regime.allowance };
  const alwAno = regimeAno.allowance && !regimeAno.allowance.disputada ? regimeAno.allowance : undefined;
  const rotuloAno = (a: number) => rotuloAnoFiscal(paisDoRelatorio, a);
  const usaTaxaMaxima = !!regrasPais?.taxaMarginal && taxaPessoal?.curto == null;
  const prazoPais = regrasPais?.prazo;
  const taxaMaxima = paisDoRelatorio ? regimeNaData(paisDoRelatorio, fimDoAnoFiscal(paisDoRelatorio, anoAtivo)) : regimeAno;
  const historicoAplicado = !!paisDoRelatorio && JSON.stringify(taxaMaxima) !== JSON.stringify(regimeNaData(paisDoRelatorio, "9999-12-31"));
  const rotuloCurto = prazoPais?.tipo === "meses" ? (prazoPais.n === 6 ? t("fc_short_6m") : t("fc_short_1y")) : t("fc_short_365");
  const escalaAno = regrasPais?.brMensal && !alternativa ? regrasPais.brMensal.escaloes : regimeAno.escaloes;
  const taxaCartao = regimeAno.semImposto
    ? "0%"
    : regrasPais?.brMensal && alternativa
      ? pct(regrasPais.brMensal.taxaExterior)
      : alternativa && regrasPais?.alternativa?.taxa != null
        ? pct(regrasPais.alternativa.taxa)
      : escalaAno
        ? `${pct(escalaAno[0][1]).replace("%", "")}–${pct(escalaAno[escalaAno.length - 1][1])}`
        : `${usaTaxaMaxima ? `${t("fisc_up_to")} ` : ""}${pct(regimeAno.short)}`;
  // Sem prazo de detencao, o cartao ja mostra a taxa a esquerda: a direita
  // fica so o regime ("isencao se vendas ≤ R$35k/mes", "flat tax / PFU"),
  // sem repetir a taxa. So se tira quando o que vem antes do parentese e
  // mesmo uma taxa ("15–22,5%", "até ~27%"); "15% cedular (…)" fica inteiro.
  const regimeSemTaxa = (() => {
    const m = regime.longLabel[lang].match(/^([^()]*)\(([^()]*)\)\s*$/);
    if (!m || !/^[\s~≈\d.,–%/-]*(até|up to|hasta|jusqu'à)?[\s~≈\d.,–%/-]*$/i.test(m[1])) return regime.longLabel[lang];
    return `${m[2].charAt(0).toUpperCase()}${m[2].slice(1)}`;
  })();
  const semImpostoNoPais = regime.short === 0 && regime.long === 0;
  const rotuloIsentas = semImpostoNoPais ? t("fisc_exempt_no_tax") : regime.longDays > 0 || regrasPais?.altbestand ? t("fc_exempt_long") : t("fisc_exempt_generic");

  // Falha de export: se for um chunk antigo (pagina aberta antes de um deploy),
  // diz-se ao utilizador e recarrega-se — e o unico remedio; senao mostra-se o erro.
  const falhaExport = (rotulo: string, e: unknown) => {
    console.error(`[export] ${rotulo} da fiscalidade:`, e);
    if (isStaleChunkError(e)) {
      setExportError(t("export_stale"));
      setTimeout(() => window.location.reload(), 2500);
      return;
    }
    setExportError(`${rotulo}: ${e instanceof Error ? e.message : String(e)}`);
  };

  // O que o cartao do regime mostra, e o que o PDF e o Excel repetem.
  const regimeDoCartao = historicoAplicado
    ? t("fisc_rules_of_year").replace("{y}", rotuloAno(anoAtivo))
    : alternativa && altId ? t(altK("b_regime")) : regime.longDays > 0 ? regime.longLabel[lang] : regimeSemTaxa;
  // Ano fiscal no titulo e no nome do ficheiro: "2025/26" no Reino Unido e na
  // Australia (o "/" nao pode ir para o nome do ficheiro).
  const anoRotulo = rotuloAno(anoAtivo);
  const anoFicheiro = anoRotulo.replace("/", "-");
  // Escolhas que mudam o imposto: vao para o PDF e para o Excel, para quem
  // receber o ficheiro (um contabilista) saber com que pressupostos foi feito.
  const escolhasDoCalculo = (): [string, string][] => {
    const linhas: [string, string][] = [[t("fisc_pdf_fiscal_year"), anoRotulo]];
    if (regrasPais?.taxaMarginal && !regimeAno.semImposto) {
      const taxas = regimeAno.longDays > 0 && regimeAno.long !== regimeAno.short && regimeAno.long > 0
        ? `${pct(regimeAno.short)} / ${pct(regimeAno.long)}` : pct(regimeAno.short);
      linhas.push([t("fisc_pdf_rate_used"), `${taxas} (${usaTaxaMaxima ? t("fisc_pdf_rate_max") : t("fisc_pdf_rate_own")})`]);
    }
    if (altId) linhas.push([t(altK("where")), alternativa ? t(altK("b")) : t(altK("a"))]);
    if (ressalvaMetodo) linhas.push([t("fisc_pdf_method_caveat"), ressalvaMetodo]);
    return linhas;
  };

  // Excel (.xlsx) formatado com logótipo — mesmo formato dos exports do portefólio.
  const exportXLSX = async () => {
    setExportError(null);
    try {
    const ExcelJS = await loadExcelJS();
    const wb = new ExcelJS.Workbook();
    wb.creator = "ChainFolioAI";
    wb.created = new Date();
    const ws = wb.addWorksheet(t("nav_fiscalidade"));

    const logoUrl = await loadLogo();
    const logoImgId = logoUrl ? wb.addImage({ base64: logoUrl.split(",")[1], extension: "png" }) : null;

    const NCOL = 11;
    [10, 12, 12, 12, 14, 14, 14, 12, 8, 14, 12].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    const money = `#,##0.00 "${reportSymbol}"`;  // moeda do pais onde se declara
    const pctFmt = '0"%"';
    const BRAND = "FFF97316";
    const DARK = "FF0F172A";

    const bandRow = (label: string, argb: string, size = 12) => {
      const r = ws.addRow([label]);
      ws.mergeCells(r.number, 1, r.number, NCOL);
      const c = r.getCell(1);
      c.font = { bold: true, size, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
      c.alignment = { vertical: "middle" };
      r.height = 20;
      return r;
    };
    const boldRow = (r: import("exceljs").Row) => { r.eachCell((c) => { c.font = { bold: true }; }); return r; };

    const titleRow = bandRow(`ChainFolioAI — ${t("fisc_pdf_title")} ${anoRotulo}`, DARK, 14);
    if (logoImgId != null) {
      titleRow.height = 46;
      titleRow.getCell(1).alignment = { vertical: "middle", indent: 8 };
      ws.addImage(logoImgId, { tl: { col: 0.15, row: 0.15 }, ext: { width: 46, height: 46 } });
    } else {
      titleRow.height = 24;
    }
    ([
      [t("fisc_pdf_country"), `${country} (${taxaCartao} / ${regimeDoCartao})`],
      [t("hx_date"), new Date().toLocaleString(uiLocale, { dateStyle: "short", timeStyle: "short" })],
      [t("fisc_pdf_method_label"), `${metodoCurto} / ${reportCurrency}`],
      ...escolhasDoCalculo(),
    ] as [string, string][]).forEach(([k, v]) => {
      const r = ws.addRow([k, v]);
      r.getCell(1).font = { bold: true, color: { argb: "FF64748B" } };
      if (v.length > 60) { ws.mergeCells(r.number, 2, r.number, NCOL); r.getCell(2).alignment = { wrapText: true, vertical: "top" }; r.height = 15 * Math.ceil(v.length / 110); }
    });
    ws.addRow([]);

    bandRow(t("fisc_pdf_summary").toUpperCase(), BRAND);
    boldRow(ws.addRow([t("pfx_metric"), t("pfx_value")]));
    const metric = (label: string, value: number, fmt?: string) => {
      const r = ws.addRow([label, value]);
      if (fmt) r.getCell(2).numFmt = fmt;
    };
    metric(t("fc_total_gains"), summary.totalGain, money);
    if (summary.fees > 0) metric(t("fisc_fees_deducted"), summary.fees, money);
    metric(t("fisc_x_taxable"), summary.taxable, money);
    metric(rotuloIsentas, summary.exempt, money);
    metric(t("fc_realized_losses"), summary.losses, money);
    if (summary.allowanceUsed > 0 && (alwAno || regimeAno.isencaoVendas != null)) metric(`${t("fisc_x_allowance")} (${alwAno ? alwAno.label[lang] : t("fisc_fr_305")})`, -summary.allowanceUsed, money);
    metric(t("fc_estimated_tax"), summary.tax, money);
    metric(t("fisc_pdf_num_events"), eventosDoAno.length, "0");
    ws.addRow([]);

    bandRow(t("fisc_pdf_events").toUpperCase(), BRAND);
    boldRow(ws.addRow([t("fc_col_asset"), t("fc_col_buy"), t("fc_col_sell"), t("fc_col_qtd"), `${t("fc_col_buyp")} (${reportSymbol})`, `${t("fc_col_sellp")} (${reportSymbol})`, `${t("fc_col_gain")} (${reportSymbol})`, t("fc_col_type"), t("fc_col_rate"), `${t("fc_col_tax")} (${reportSymbol})`, `${t("fc_col_fees")} (${reportSymbol})`]));
    if (eventosDoAno.length === 0) {
      const r = ws.addRow([t("fisc_x_no_events")]);
      r.getCell(1).font = { italic: true, color: { argb: "FF94A3B8" } };
    } else {
      eventosDoAno.forEach((e) => {
        const r = ws.addRow([
          e.asset, e.buyDate, e.sellDate, e.amount,
          e.buyPrice, e.sellPrice, e.gain,
          e.holding === "longo" ? t("fc_long_term") : t("fc_short_term"),
          e.taxRate * 100,
          e.gain > 0 && e.taxRate > 0 ? e.gain * e.taxRate : 0,
          e.fees,
        ]);
        r.getCell(4).numFmt = "#,##0.00000000";
        r.getCell(5).numFmt = money;
        r.getCell(6).numFmt = money;
        r.getCell(7).numFmt = money;
        r.getCell(9).numFmt = pctFmt;
        r.getCell(10).numFmt = money;
        r.getCell(11).numFmt = money;
      });
    }

    if (standaloneFees.length > 0) {
      ws.addRow([]);
      bandRow(t("fisc_standalone_title").toUpperCase(), DARK);
      const note = ws.addRow([t("fisc_standalone_note")]);
      ws.mergeCells(note.number, 1, note.number, NCOL);
      note.getCell(1).font = { italic: true, color: { argb: "FF64748B" } };
      boldRow(ws.addRow([t("fc_col_asset"), t("hx_date"), t("fc_col_qtd"), `${t("pfx_value")} (${reportSymbol})`]));
      standaloneFees.forEach((f) => {
        const r = ws.addRow([f.asset, f.date, f.amount, f.value]);
        r.getCell(3).numFmt = "#,##0.00000000";
        r.getCell(4).numFmt = money;
      });
      const tot = ws.addRow([t("fisc_standalone_total"), "", "", summary.standalone]);
      tot.getCell(1).font = { bold: true };
      tot.getCell(4).numFmt = money;
    }

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    await downloadBlob(blob, `chainfolioai-tax-report-${country}-${anoFicheiro}.xlsx`);
    } catch (e) {
      falhaExport("Excel", e);
    }
  };

  const loadLogo = (): Promise<string | null> =>
    new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const size = 128; // downscale to keep the PDF small
          const canvas = document.createElement("canvas");
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext("2d");
          if (!ctx) return resolve(null);
          ctx.drawImage(img, 0, 0, size, size);
          resolve(canvas.toDataURL("image/png"));
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = "/chainfolioai-icon.png";
    });

  const exportPDF = async () => {
    setExportError(null);
    try {
    // Carregar so quando se exporta: em import estatico, o jsPDF entrava no
    // bundle inicial da pagina para toda a gente, incluindo quem nunca exporta.
    // Dentro do try: se o chunk ja nao existir (deploy entretanto), o erro
    // chega ao utilizador em vez de morrer numa promessa sem ninguem a ouvir.
    const { jsPDF: JsPDF } = await import("jspdf");
    const eur = (v: number) => `${reportCurrency} ${Math.abs(v).toLocaleString(uiLocale, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    const eurN = (v: number) => Math.abs(v).toLocaleString(uiLocale, { maximumFractionDigits: 0 });
    const doc = new JsPDF({ unit: "mm", format: "a4" });
    protegerTextoPdf(doc);  // ≥, ≈ e o espaço fino dos milhares em francês estragavam linhas
    const W = doc.internal.pageSize.getWidth();
    const cx = W / 2;
    const M = 14;

    // Header — top accent bar + centered brand (large logo + name)
    doc.setFillColor(249, 115, 22);
    doc.rect(0, 0, W, 3, "F");
    const logo = await loadLogo();
    const logoSize = 20;
    // Keep logo/name at the top; distribute leftover space between sections to fill the page.
    const pageH = doc.internal.pageSize.getHeight();
    const estHeight = 151 + eventosDoAno.length * 9; // header + summary + table + breakdown + notes
    const usableBottom = pageH - 18;
    const leftover = usableBottom - (12 + estHeight);
    const gap = leftover > 0 ? Math.min(38, leftover / 3) : 0; // spread across 3 boundaries
    let y = 12;
    if (logo) {
      doc.addImage(logo, "PNG", cx - logoSize / 2, y, logoSize, logoSize);
      y += logoSize + 5;
    } else {
      y += 6;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.setTextColor(249, 115, 22);
    doc.text("ChainFolioAI", cx, y, { align: "center" });
    y += 7;
    doc.setFontSize(13);
    doc.setTextColor(17, 24, 39);
    doc.text(`${t("fisc_pdf_title")} ${anoRotulo}`, cx, y, { align: "center" });
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(107, 114, 128);
    doc.text(`${t("fisc_pdf_generated")}: ${new Date().toLocaleDateString(uiLocale, { day: "numeric", month: "long", year: "numeric" })}  ·  ${t("fisc_pdf_country")}: ${country} (${taxaCartao} / ${regimeDoCartao})`, cx, y, { align: "center", maxWidth: W - 28 });
    y += 8;

    // Summary box (compact)
    doc.setDrawColor(229, 231, 235);
    doc.setFillColor(249, 250, 251);
    const sumH = 18;
    doc.roundedRect(M, y, W - M * 2, sumH, 2, 2, "FD");
    const cards: Array<[string, string, [number, number, number]]> = [
      [t("fc_total_gains"), eur(summary.totalGain), summary.totalGain >= 0 ? [16, 185, 129] : [239, 68, 68]],
      [rotuloIsentas, eur(summary.exempt), [16, 185, 129]],
      [t("fc_realized_losses"), eur(summary.losses), [239, 68, 68]],
      [t("fc_estimated_tax"), eur(summary.tax), [249, 115, 22]],
    ];
    const colW = (W - M * 2) / 4;
    cards.forEach((c, i) => {
      const cx = M + colW * i + colW / 2;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...c[2]);
      doc.text(c[1], cx, y + 8, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(107, 114, 128);
      doc.text(c[0], cx, y + 13.5, { align: "center" });
    });
    y += sumH + 7 + gap;

    // Events table
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(17, 24, 39);
    doc.text(`${t("fisc_pdf_events")} (${eventosDoAno.length})`, cx, y, { align: "center" });
    y += 5;

    const headers = [t("fc_col_asset"), t("fc_col_buy"), t("fc_col_sell"), t("fc_col_qtd"), t("fc_col_buyp"), t("fc_col_sellp"), t("fc_col_gain"), t("fc_col_type"), t("fc_col_rate"), t("fc_col_tax")];
    const colsX = [M, M + 16, M + 38, M + 60, M + 80, M + 100, M + 120, M + 143, M + 159, M + 172];
    const rowH = 9;
    const drawHead = () => {
      doc.setFillColor(243, 244, 246);
      doc.rect(M, y - 4, W - M * 2, 6, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(75, 85, 99);
      headers.forEach((h, i) => doc.text(h, colsX[i], y));
      y += 6;
    };
    drawHead();

    eventosDoAno.forEach((e, idx) => {
      if (y > 268) { doc.addPage(); y = 16; drawHead(); }
      if (idx % 2 === 1) {
        doc.setFillColor(249, 250, 251);
        doc.rect(M, y - 4, W - M * 2, rowH, "F");
      }
      const taxVal = e.gain > 0 && e.taxRate > 0 ? eur(e.gain * e.taxRate) : t("fc_exempt");
      const cells = [
        e.asset, e.buyDate, e.sellDate, e.amount.toFixed(4),
        eurN(e.buyPrice), eurN(e.sellPrice),
        `${e.gain >= 0 ? "+" : "-"}${eurN(e.gain)}`,
        e.holding === "longo" ? t("fc_long") : t("fc_short"),
        pct(e.taxRate), taxVal,
      ];
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      cells.forEach((c, i) => {
        if (i === 6) doc.setTextColor(...(e.gain >= 0 ? [16, 185, 129] : [239, 68, 68]) as [number, number, number]);
        else if (i === 9) doc.setTextColor(249, 115, 22);
        else doc.setTextColor(55, 65, 81);
        doc.text(String(c), colsX[i], y);
      });
      // Euro value below the quantity
      doc.setFontSize(6);
      doc.setTextColor(148, 163, 184);
      doc.text(`${reportCurrency} ${eurN(e.amount * e.sellPrice)}`, colsX[3], y + 3.2);
      // Ganho ja liquido de taxas: diz-se quanto foi deduzido, por baixo.
      if (e.fees > 0) doc.text(`${t("fc_col_fees")} -${eurN(e.fees)}`, colsX[6], y + 3.2);
      y += rowH;
    });

    // Net taxable total
    y += 1;
    doc.setDrawColor(229, 231, 235);
    doc.line(M, y, W - M, y);
    y += 5.5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(17, 24, 39);
    doc.text(`${t("fisc_pdf_net_taxable")}:`, M, y);
    doc.setTextColor(249, 115, 22);
    doc.text(eur(summary.tax), W - M, y, { align: "right" });
    y += 10 + gap;

    if (y > 250) { doc.addPage(); y = 18; }

    // Breakdown — fill remaining space with extra detail
    const invested = eventosDoAno.reduce((s, e) => s + e.amount * e.buyPrice, 0);
    const proceeds = eventosDoAno.reduce((s, e) => s + e.amount * e.sellPrice, 0);
    const positiveGains = eventosDoAno.filter(e => e.gain > 0).reduce((s, e) => s + e.gain, 0);
    const effRate = positiveGains > 0 ? (summary.tax / positiveGains) * 100 : 0;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(17, 24, 39);
    doc.text(t("fisc_pdf_breakdown"), cx, y, { align: "center" });
    y += 5;

    const stats: Array<[string, string]> = [
      [t("fisc_pdf_invested"), eur(invested)],
      [t("fisc_pdf_proceeds"), eur(proceeds)],
      [t("fisc_pdf_net_gain"), `${summary.totalGain >= 0 ? "+" : "-"}${eur(summary.totalGain)}`],
      ...(summary.fees > 0 ? [[t("fisc_fees_deducted"), eur(summary.fees)] as [string, string]] : []),
      ...(summary.standalone > 0 ? [[t("fisc_standalone_total"), eur(summary.standalone)] as [string, string]] : []),
      [t("fisc_pdf_eff_rate"), `${effRate.toFixed(1)}%`],
      [t("fisc_pdf_num_events"), String(eventosDoAno.length)],
      [t("fisc_pdf_method_label"), `${metodoCurto} / ${reportCurrency}`],
    ];
    const bx = M, bw = W - M * 2;
    const rowsN = Math.ceil(stats.length / 2);
    const bh = rowsN * 8 + 4;
    doc.setDrawColor(229, 231, 235);
    doc.setFillColor(249, 250, 251);
    doc.roundedRect(bx, y, bw, bh, 2, 2, "FD");
    stats.forEach((s, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const sx = bx + 6 + col * (bw / 2);
      const sy = y + 7 + row * 8;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(107, 114, 128);
      doc.text(s[0], sx, sy);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(55, 65, 81);
      doc.text(s[1], bx + (col + 1) * (bw / 2) - 6, sy, { align: "right" });
    });
    y += bh + 7 + gap;

    // Notes
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(17, 24, 39);
    doc.text(t("fisc_pdf_notes"), M, y);
    y += 4.5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(107, 114, 128);
    doc.text(t("fisc_pdf_notes_text"), M, y, { maxWidth: W - M * 2, lineHeightFactor: 1.4 });
    y += doc.splitTextToSize(t("fisc_pdf_notes_text"), W - M * 2).length * 8 * 0.3528 * 1.4 + 3;
    // Escolhas usadas (taxa, onde estao as moedas, limitacao do metodo).
    const pe = doc.internal.pageSize.getHeight() - 16;
    for (const [k, v] of escolhasDoCalculo()) {
      const linhas = doc.splitTextToSize(`${k}: ${v}`, W - M * 2) as string[];
      const alt = linhas.length * 8 * 0.3528 * 1.4;
      if (y + alt > pe) { doc.addPage(); y = 16; }
      doc.text(linhas, M, y, { lineHeightFactor: 1.4 });
      y += alt + 1.5;
    }

    // Footer
    const fy = doc.internal.pageSize.getHeight() - 10;
    doc.setDrawColor(229, 231, 235);
    doc.line(M, fy - 4, W - M, fy - 4);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(156, 163, 175);
    doc.text(t("fisc_pdf_footer"), W / 2, fy, { align: "center", maxWidth: W - M * 2 });

    const pdfBlob = doc.output("blob");
    await downloadBlob(pdfBlob, `chainfolioai-report-${country}-${anoFicheiro}.pdf`);
    } catch (e) {
      falhaExport("PDF", e);
    }
  };

  if (isLoading) return <AppShell><PageSkeleton /></AppShell>;

  const fmtEur = (v: number) => `${reportSymbol} ${Math.abs(v).toLocaleString(uiLocale, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  return (
    <AppShell>
    <div className="relative min-h-screen bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full bg-orange-500/6 blur-[100px]" />
      </div>
      <div className="relative z-10">
        <div className="mx-auto w-full max-w-5xl px-6 pb-24 pt-6 space-y-8">

          {/* Header */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-300/80">{t("nav_fiscalidade")}</p>
              <h1 className="mt-2 text-2xl font-bold text-white">{t("fisc_title")}</h1>
              <p className="mt-1 text-sm text-slate-400">{t("fisc_subtitle")}</p>
            </div>
            {/* País: os disponiveis no controlo segmentado; os bloqueados ficam
                ao lado como ligacoes de upgrade, com o cadeado do plano. */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-400">{t("fisc_country")}:</span>
              <Segmentos
                tamanho="sm"
                wrap
                valor={country}
                aoMudar={setCountry}
                label={t("fisc_country")}
                opcoes={[
                  ...FREE_COUNTRIES.map((c) => ({ id: c.code as string, label: `${c.flag} ${c.code}` })),
                  ...(isPro ? PRO_COUNTRIES.map((c) => ({ id: c.code, label: `${c.flag} ${c.code}`, title: `${c.flag} ${t(c.labelKey)}` })) : []),
                  ...(isPremium ? PREMIUM_COUNTRIES.map((c) => ({ id: c.code, label: `${c.flag} ${c.code}`, title: `${c.flag} ${t(c.labelKey)}` })) : []),
                ]}
              />
              {!isPro && PRO_COUNTRIES.map(c => (
                <a key={c.code} href={upgradeHref}
                  title={`${c.flag} ${t(c.labelKey)} — ${t("fc_plan_pro")}`}
                  className="rounded-xl px-3 py-1.5 text-xs font-semibold border border-orange-500/25 text-orange-300/70 hover:border-orange-500/50 hover:text-orange-200 transition flex items-center gap-1">
                  {c.flag} {c.code} 🔒
                </a>
              ))}
              {!isPremium && PREMIUM_COUNTRIES.map(c => (
                <a key={c.code} href={upgradeHref}
                  title={`${c.flag} ${t(c.labelKey)} — ${t("fc_plan_premium")}`}
                  className="rounded-xl px-3 py-1.5 text-xs font-semibold border border-violet-500/25 text-violet-300/70 hover:border-violet-500/50 hover:text-violet-200 transition flex items-center gap-1">
                  {c.flag} {c.code} 💎
                </a>
              ))}
            </div>
          </div>

          {/* Regras do país */}
          <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              // Sem prazo de detencao (FR, IE, IT…) nao ha "curto" nem "longo":
              // uma taxa e o regime. 31,4% nao pode aparecer como 31%.
              { label: regime.longDays > 0 ? rotuloCurto : t("fc_rate_flat"), value: taxaCartao, color: "text-rose-400" },
              { label: regime.longDays > 0 ? t("fc_long_term") : t("fc_regime"), value: regimeDoCartao, color: regime.longDays > 0 ? "text-emerald-400" : "text-slate-200" },
              { label: t("fc_method"), value: ressalvaMetodo ? `${metodoCurto} ≈` : metodoCurto, color: ressalvaMetodo ? "text-amber-300" : "text-orange-300" },
              { label: t("fc_base_currency"), value: reportCurrency, color: "text-slate-300" },
            ].map(item => (
              <div key={item.label} className="text-center">
                <p className={`text-lg font-bold ${item.color}`}>{item.value}</p>
                <p className="text-xs text-slate-500 mt-0.5">{item.label}</p>
              </div>
            ))}
          </div>
          {regrasPais?.taxaMarginal && (
            // A taxa depende do rendimento: por omissao usa-se a maxima (com
            // sobretaxas), e a pessoa pode escrever a sua.
            <div key={chaveTaxa ?? "sem-sessao"} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-xs text-slate-300">
              <label className="flex items-center gap-2">
                <span>{regrasPais.taxaMarginal.longo === "separado" ? t("fisc_my_rate_short") : t("fisc_my_rate")}</span>
                <input type="text" inputMode="decimal" aria-label={t("fisc_my_rate")} placeholder={pct(taxaMaxima.short).replace("%", "")}
                  defaultValue={taxaPessoal?.curto != null ? String(Math.round(taxaPessoal.curto * 10000) / 100) : ""}
                  onBlur={(e) => gravarTaxa("curto", e.target.value)}
                  className="w-20 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-right text-slate-100" />
                <span>%</span>
              </label>
              {regrasPais.taxaMarginal.longo === "separado" && (
                <label className="flex items-center gap-2">
                  <span>{t("fisc_my_rate_long")}</span>
                  <input type="text" inputMode="decimal" aria-label={t("fisc_my_rate_long")} placeholder={pct(taxaMaxima.long).replace("%", "")}
                    defaultValue={taxaPessoal?.longo != null ? String(Math.round(taxaPessoal.longo * 10000) / 100) : ""}
                    onBlur={(e) => gravarTaxa("longo", e.target.value)}
                    className="w-20 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-right text-slate-100" />
                  <span>%</span>
                </label>
              )}
              <span className="basis-full text-[11px] text-slate-500">{usaTaxaMaxima ? t("fisc_rate_max_note") : t("fisc_rate_own_note")}</span>
            </div>
          )}
          {altId && (
            // Onde estao as moedas (ou em que moeda se vendeu) muda o imposto.
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-xs text-slate-300">
              <span className="basis-full text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500">{t(altK("where"))}</span>
              <Segmentos tamanho="sm" wrap valor={alternativa ? "b" : "a"} aoMudar={(v) => setAlternativa(v === "b")} label={t(altK("where"))}
                opcoes={[{ id: "a", label: t(altK("a")) }, { id: "b", label: t(altK("b")) }]} />
              <span className="basis-full text-[11px] leading-relaxed text-slate-500">{alternativa ? t(altK("b_note")) : t(altK("a_note"))}</span>
            </div>
          )}
          {regrasPais?.notaExterior && (
            <p className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-[11px] leading-relaxed text-slate-400">🌍 {t(`fisc_ext_${country.toLowerCase()}` as Parameters<typeof t>[0])}</p>
          )}
          {regime.allowance?.disputada && (
            <p className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs leading-relaxed text-amber-100/80">{t("fisc_alw_disputed").replace("{a}", regime.allowance.label[lang])}</p>
          )}

          {(ressalvaMetodo || summary.anual) && (
            <p className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs leading-relaxed text-amber-100/80">
              {ressalvaMetodo ? t("fisc_method_note").replace("{m}", semParenteseFinal(metodoDoPais)).replace("{c}", ressalvaMetodo) : null}
              {summary.anual ? ` ${t("fisc_annual_note").replace("{r}", fmtEur(summary.anual.receitas)).replace("{c}", fmtEur(summary.anual.custos + summary.anual.custosTransitados)).replace("{t}", fmtEur(summary.anual.transita))}` : null}
            </p>
          )}

          {/* Adicionar transação */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400 mb-1">{t("fisc_add_trade")}</p>
            <p className="text-xs text-slate-500 mb-4">{t("fisc_form_hint")}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
              <select value={newTrade.type} onChange={e => setNewTrade(tr => ({ ...tr, type: e.target.value as "compra" | "venda" | "taxa" }))}
                className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500">
                <option value="compra">{t("fisc_type_buy")}</option>
                <option value="venda">{t("fisc_type_sell")}</option>
              </select>
              <input placeholder={t("fisc_asset")} value={newTrade.asset}
                onChange={e => setNewTrade(t => ({ ...t, asset: e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 10) }))}
                className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-orange-500" />
              {/* Texto + inputMode="decimal": no iPhone o teclado escreve virgula e o
                  <input type="number> rejeitava "0,01" — nao se conseguia registar 0,0100 BTC. */}
              <input type="text" inputMode="decimal" autoComplete="off" placeholder={`${t("fisc_amount")} (${newTrade.asset || "BTC"})`} aria-label={`${t("fisc_amount")} ${newTrade.asset}`} value={raw.amount}
                onChange={setNum("amount")}
                className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-orange-500" />
              <input type="text" inputMode="decimal" autoComplete="off" placeholder={`${t("fisc_price")} (${inputSymbol})`} aria-label={t("fisc_price")} value={raw.price}
                onChange={setNum("price")}
                className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-orange-500" />
              <div className="relative">
                <input type="text" inputMode="decimal" autoComplete="off" placeholder={`${t("fisc_fee_ph")} (${inputSymbol})`} aria-label={t("hx_fee")} title={t("hx_fee_help")} value={raw.fee}
                  onChange={setNum("fee")}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-orange-500" />
              </div>
              <input type="date" value={newTrade.date}
                onChange={e => setNewTrade(tr => ({ ...tr, date: e.target.value }))}
                className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500" />
              <button onClick={async () => {
                if (!newTrade.asset || newTrade.amount <= 0 || newTrade.price <= 0) return;
                setAddError(null);
                try {
                // Converter para euros a taxa do dia da transacao. Se nao houver
                // taxa, nao gravamos nada a meio: um preco errado no historico
                // contamina o FIFO e o imposto de todos os anos seguintes.
                let precoEur = newTrade.price;
                let taxaEur = newTrade.fee;
                if (inputCurrency !== "EUR") {
                  const tabela = await loadFxTable([newTrade.date], [inputCurrency]);
                  const convertido = tabela.convert(newTrade.price, inputCurrency, "EUR", newTrade.date);
                  if (convertido == null) { setAddError(t("fisc_fx_missing")); return; }
                  precoEur = convertido;
                  if (newTrade.fee > 0) {
                    const taxaConv = tabela.convert(newTrade.fee, inputCurrency, "EUR", newTrade.date);
                    if (taxaConv == null) { setAddError(t("fisc_fx_missing")); return; }
                    taxaEur = taxaConv;
                  }
                }
                const entry = { ...newTrade, id: tradeId(), asset: newTrade.asset.toUpperCase(), price: precoEur, fee: taxaEur };
                setTrades(prev => [...prev, entry].sort((x, y) => new Date(x.date).getTime() - new Date(y.date).getTime()));   // mantem a ordem; o desempate fino vem de loadTrades()
                upsertTrade({ id: entry.id, type: entry.type, asset: entry.asset, assetName: entry.asset, quantity: entry.amount, priceEur: entry.price, totalEur: entry.amount * entry.price, date: entry.date, exchange: entry.exchange, notes: "", currency: inputCurrency, priceInput: newTrade.price, ...(newTrade.fee > 0 ? { feeEur: taxaEur, feeInput: newTrade.fee } : {}) });
                pushWalletCloud();
                setNewTrade(emptyTrade());
                setRaw({ amount: "", price: "", fee: "" });
                } catch (e) {
                  console.error("[fiscalidade] adicionar transacao:", e);
                  setAddError(e instanceof Error ? e.message : String(e));
                }
              }} className={`${btnPrimary} px-4 py-2 text-sm`}>
                + {t("add")}
              </button>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
              <span className="text-slate-400">{t("fisc_fee_ph")}:</span> {t("fisc_fee_explain")}
            </p>
            {addError && (
              <p className="mt-2 rounded-xl border border-rose-500/40 bg-rose-500/[0.08] px-4 py-2.5 text-xs text-rose-200">{addError}</p>
            )}
            {newTrade.amount > 0 && newTrade.price > 0 && (
              <p className="mt-3 text-xs text-slate-400">
                {newTrade.amount} {newTrade.asset || "—"} × {inputSymbol} {newTrade.price.toLocaleString(uiLocale)} =
                <span className="ml-1 font-semibold text-orange-300">
                  {inputSymbol} {(newTrade.amount * newTrade.price).toLocaleString(uiLocale, { maximumFractionDigits: 2 })}
                </span>
                {newTrade.fee > 0 && (
                  <span className="ml-2 text-slate-500">
                    {newTrade.type === "compra" ? "+" : "−"} {t("hx_fee_short")} {inputSymbol} {newTrade.fee.toLocaleString(uiLocale, { maximumFractionDigits: 2 })}
                  </span>
                )}
              </p>
            )}
          </div>

          {/* Transações */}
          {trades.length > 0 && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400 mb-1">{t("fisc_transactions")} ({trades.length})</p>
              <p className="text-[11px] text-slate-500 mb-4">
                🔗 {t("fc_from_history").replace("{n}", String(fromHistory))} <Link href="/historico" className="text-orange-300 underline decoration-dotted">{t("nav_historico")} →</Link>
              </p>
              <div className="space-y-2">
                {[...trades].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(trade => (
                  <div key={trade.id} className="flex items-center gap-3 rounded-xl border border-slate-800 px-4 py-2.5">
                    <span className={`text-xs font-bold rounded-full px-2 py-0.5 ${trade.type === "compra" ? "bg-emerald-500/20 text-emerald-400" : trade.type === "taxa" ? "bg-amber-500/20 text-amber-300" : "bg-rose-500/20 text-rose-400"}`}>
                      {trade.type === "compra" ? t("fisc_type_buy") : trade.type === "taxa" ? t("hx_fee_one") : t("fisc_type_sell")}
                    </span>
                    <span className="text-sm font-semibold text-white w-12">{trade.asset}</span>
                    <span className="text-sm text-slate-300 flex-1">{trade.amount} × € {trade.price.toLocaleString(uiLocale)}</span>
                    <span className="text-sm font-semibold text-slate-300">€ {(trade.amount * trade.price).toLocaleString(uiLocale, { maximumFractionDigits: 0 })}</span>
                    <span className="text-xs text-slate-500">{trade.date}</span>
                    <button aria-label={t("hx_delete")} onClick={() => { setTrades(prev => prev.filter(x => x.id !== trade.id)); deleteTrade(trade.id); pushWalletCloud(); }}
                      className="text-slate-600 hover:text-rose-400 transition text-sm px-1">✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Moeda do relatorio: dizer sempre como e feita a conversao, e avisar
              quando faltou alguma taxa — um numero errado numa declaracao e pior
              do que numero nenhum. */}
          {reportCurrency !== "EUR" && (
            <p className="rounded-xl border border-sky-500/30 bg-sky-500/[0.06] px-4 py-2.5 text-xs leading-relaxed text-sky-200">
              💱 {t("fisc_fx_note")}{fxLoading ? ` · ${t("loading")}` : ""}
            </p>
          )}
          {moedaEmFalta && (
            <p className="rounded-xl border border-amber-500/40 bg-amber-500/[0.08] px-4 py-2.5 text-xs leading-relaxed text-amber-200">
              ⚠️ {t("fisc_fx_no_currency").replace("{m}", paisDoRelatorio?.currency ?? "")}
            </p>
          )}
          {fxIncomplete && (
            <p className="rounded-xl border border-amber-500/40 bg-amber-500/[0.08] px-4 py-2.5 text-xs leading-relaxed text-amber-200">
              ⚠️ {t("fisc_fx_incomplete")}
            </p>
          )}

          {/* Resultados */}
          {Object.keys(unmatched).length > 0 && (
            <p className="rounded-xl border border-amber-500/40 bg-amber-500/[0.08] px-4 py-2.5 text-xs leading-relaxed text-amber-200">
              ⚠️ {t("fisc_unmatched_warn")}{" "}
              {Object.entries(unmatched).map(([a, q]) => `${q.toLocaleString(uiLocale)} ${a}`).join(", ")}.{" "}
              {t("fisc_unmatched_hint")}
            </p>
          )}
          {/* Ano fiscal — declara-se um ano, nao a vida toda. So aparece quando
              ha mais do que um ano com vendas. */}
          {anosDisponiveis.length > 1 && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{t("fisc_year")}</span>
              <Segmentos tamanho="sm" wrap valor={String(anoAtivo)} aoMudar={(a) => setAnoFiscal(Number(a))} opcoes={anosDisponiveis.map((a) => ({ id: String(a), label: rotuloAno(a) }))} />
              <span className="ml-auto text-[11px] text-slate-500">{t(regrasPais?.perdasTransitam ? "fisc_year_hint_carry" : "fisc_year_hint")}{regrasPais?.anoFiscalInicio ? ` ${t("fisc_year_starts").replace("{d}", regrasPais.anoFiscalInicio.split("-").reverse().join("/"))}` : ""}</span>
            </div>
          )}
          {eventosDoAno.length > 0 && (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { icon: "📈", label: t("fc_total_gains"), value: summary.totalGain, color: summary.totalGain >= 0 ? "text-emerald-400" : "text-rose-400", highlight: false },
                  { icon: "✅", label: rotuloIsentas, value: summary.exempt, color: "text-emerald-300", highlight: false },
                  { icon: "📉", label: t("fc_realized_losses"), value: summary.losses, color: "text-rose-400", highlight: false },
                  { icon: "🧾", label: altId === "at" && alternativa ? t("fisc_tax_withheld") : t("fc_estimated_tax"), value: summary.tax, color: "text-orange-400", highlight: true },
                ].map(c => (
                  <div key={c.label} className={`rounded-2xl border p-4 text-center ${c.highlight ? "border-orange-500/40 bg-orange-500/10" : "border-slate-800 bg-slate-900/60"}`}>
                    <p className="text-base mb-1">{c.icon}</p>
                    <p className={`text-xl font-bold ${c.color}`}>{hideBalances ? "••••" : fmtEur(c.value)}</p>
                    <p className="text-xs text-slate-500 mt-1">{c.label}</p>
                  </div>
                ))}
              </div>
              {/* Mostrar a compensacao: e a diferenca entre o que se paga e o
                  que se pagaria sobre os ganhos brutos. Antes nao acontecia. */}
              {summary.lossesApplied > 0 && (
                <p className="rounded-xl border border-sky-500/20 bg-sky-500/[0.06] px-4 py-2.5 text-xs text-sky-200">
                  ➖ −{fmtEur(summary.lossesApplied)} {t("fisc_losses_applied")}
                </p>
              )}
              {summary.allowanceUsed > 0 && !alwAno && regimeAno.isencaoVendas != null && (
                <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-2.5 text-xs text-emerald-300">✂️ {t("fisc_fr_305_applied")}</p>
              )}
              {summary.allowanceUsed > 0 && alwAno && (
                // A faixa dizia quanto foi abatido, mas nao o que e uma isencao
                // anual — e as duas especies comportam-se ao contrario uma da
                // outra: a "deduct" tira uma fatia, a "threshold" e tudo-ou-nada.
                // Quem le "-455 abatidos" sem isto nao sabe o que assinar.
                <details className="group rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-2.5 text-xs text-emerald-300">
                  <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
                    <span className="flex-1">
                      ✂️ {alwAno.label[lang]}: −{fmtEur(summary.allowanceUsed)} {t("fisc_allowance_applied")}
                    </span>
                    <span className="shrink-0 rounded-full border border-emerald-500/30 px-2 py-0.5 text-[11px] font-semibold text-emerald-200/80 group-open:hidden">
                      {t("fisc_alw_what")}
                    </span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                      className="shrink-0 transition-transform duration-200 group-open:rotate-180" aria-hidden="true">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </summary>
                  <div className="faq-a mt-3 space-y-2 border-t border-emerald-500/15 pt-3 leading-relaxed text-emerald-100/80">
                    <p>{t(alwAno.kind === "threshold" ? "fisc_alw_threshold" : "fisc_alw_deduct")}</p>
                    <p>{t("fisc_alw_applied_long").replace("{v}", fmtEur(summary.allowanceUsed))}</p>
                    <p className="text-emerald-100/60">{t("fisc_alw_shared")}</p>
                    <Link href={guideUrl(lang === "pt" ? "pt" : "en", COUNTRIES.find((c) => c.code === country))}
                      className="inline-block font-semibold text-emerald-300 underline underline-offset-2 hover:text-emerald-200">
                      {t("fisc_alw_guide")} →
                    </Link>
                  </div>
                </details>
              )}

              {summary.standalone > 0 && (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-4 text-xs text-amber-100/90">
                  <p className="font-semibold text-amber-200">{t("fisc_standalone_title")}: {reportSymbol} {summary.standalone.toLocaleString(uiLocale, { maximumFractionDigits: 2 })} ({standaloneFees.length})</p>
                  <p className="mt-1 text-amber-100/70">{t("fisc_standalone_note")}</p>
                </div>
              )}

              {/* Tabela de eventos */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{t("fisc_tax_events")} ({eventosDoAno.length})</p>
                  <div className="flex items-center gap-2">
                    {isPro ? (
                      <button onClick={exportXLSX}
                        className="flex items-center gap-2 rounded-xl border border-orange-500/40 px-3 py-1.5 text-xs font-semibold text-orange-300 hover:bg-orange-500/10 transition">
                        ↓ {t("fisc_export_csv")}
                      </button>
                    ) : (
                      <a href={upgradeHref}
                        className="flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:border-orange-400/40 hover:text-orange-300 transition">
                        🔒 {t("fisc_export_csv_pro")}
                      </a>
                    )}
                    {isPro ? (
                      <button onClick={exportPDF}
                        className="flex items-center gap-2 rounded-xl border border-violet-500/40 bg-violet-500/5 px-3 py-1.5 text-xs font-semibold text-violet-300 hover:bg-violet-500/10 transition">
                        ↓ {t("fisc_export_pdf")}
                      </button>
                    ) : (
                      <a href={upgradeHref}
                        className="flex items-center gap-2 rounded-xl border border-violet-500/20 px-3 py-1.5 text-xs font-semibold text-violet-400/50 hover:border-violet-500/40 hover:text-violet-300 transition">
                        🔒 {t("fisc_export_pdf_premium")}
                      </a>
                    )}
                  </div>
                </div>
                {exportError ? (
                  <p className="mb-3 rounded-xl border border-rose-500/40 bg-rose-500/[0.08] px-4 py-2.5 text-xs text-rose-200">
                    {t("pfu_export_failed")} {exportError}
                  </p>
                ) : null}
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
                      {eventosDoAno.map((e, i) => (
                        <tr key={i} className="border-b border-slate-800/40 hover:bg-slate-800/20">
                          <td className="py-2 pr-4 font-semibold text-white">{e.asset}</td>
                          <td className="py-2 pr-4 text-slate-400">{e.buyDate}</td>
                          <td className="py-2 pr-4 text-slate-400">{e.sellDate}</td>
                          <td className="py-2 pr-4 text-slate-300">{e.amount.toFixed(4)}</td>
                          <td className="py-2 pr-4 text-slate-300">{reportSymbol} {e.buyPrice.toFixed(0)}</td>
                          <td className="py-2 pr-4 text-slate-300">{reportSymbol} {e.sellPrice.toFixed(0)}</td>
                          <td className={`py-2 pr-4 font-semibold ${e.gain >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                            {e.gain >= 0 ? "+" : ""}{reportSymbol} {e.gain.toLocaleString(uiLocale, { maximumFractionDigits: 0 })}
                            {e.fees > 0 && <span className="block text-[11px] font-normal text-slate-500">{t("hx_fee_short")} −{reportSymbol} {e.fees.toLocaleString(uiLocale, { maximumFractionDigits: 2 })}</span>}
                          </td>
                          <td className="py-2 pr-4">
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${e.holding === "longo" ? "bg-emerald-500/20 text-emerald-400" : "bg-orange-500/20 text-orange-400"}`}>
                              {e.holding === "longo" ? t("fc_long") : t("fc_short")}
                            </span>
                          </td>
                          <td className="py-2 pr-4 text-slate-400">{pct(e.taxRate)}</td>
                          <td className={`py-2 font-semibold ${e.gain > 0 && e.taxRate > 0 ? "text-orange-400" : "text-emerald-400"}`}>
                            {e.gain > 0 && e.taxRate > 0 ? `${reportSymbol} ${(e.gain * e.taxRate).toLocaleString(uiLocale, { maximumFractionDigits: 0 })}` : t("fc_exempt")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-3 text-[11px] leading-relaxed text-slate-500">{t("fisc_col_tax_note")}</p>
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
            <EmptyState icon="🧮" title={t("fisc_no_trades")} description={t("fisc_no_trades_desc")}>
              <Link href="/historico" className="rounded-xl bg-orange-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-orange-400 transition">{t("fisc_no_trades_cta")}</Link>
            </EmptyState>
          )}

          {/* Legislação por país */}
          <LegislationSection isPro={isPro} isPremium={isPremium} />

        </div>
      </div>
    </div>
    </AppShell>
  );
}
