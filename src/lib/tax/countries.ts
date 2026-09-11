// Fonte ÚNICA dos regimes fiscais por país.
//
// Serve dois consumidores muito diferentes:
//   • a calculadora em /fiscalidade (privada, precisa das taxas para calcular);
//   • os guias públicos em /guias/impostos-cripto (conteúdo indexável).
//
// Antes as taxas viviam dentro do componente da calculadora. Duplicá-las para
// os guias garantiria que, um dia, o site diria 28 % num sítio e 30 % no outro.
//
// Os TEXTOS vêm das traduções (chaves fc_<code>_*), para não haver duas versões
// da mesma frase. As TAXAS e isenções estão aqui porque são cálculo, não texto.

import { translations, type Lang } from "@/lib/i18n/translations";

export type Plan = "free" | "pro" | "premium";

export type Allowance = {
  /** Valor anual em euros (aproximado quando a moeda original não é o euro). */
  amount: number;
  /** "deduct" abate ao ganho tributável; "threshold" isenta tudo se ficar abaixo. */
  kind: "deduct" | "threshold";
  /** Rótulo nas 4 línguas da app (os guias públicos só usam pt/en). */
  label: Record<Lang, string>;
};

export type TaxRegime = {
  /** Taxa aplicada a ganhos de curto prazo (0–1). */
  short: number;
  /** Taxa aplicada depois de `longDays` (0–1). */
  long: number;
  /** Dias de detenção a partir dos quais vale `long`. 0 = sem distinção temporal. */
  longDays: number;
  /** Descrição do regime de longo prazo, nas 4 línguas da app. */
  longLabel: Record<Lang, string>;
  allowance?: Allowance;
};

export type Country = {
  code: string;
  /** Slug por idioma. PT: /guias/impostos-cripto/<slug>; EN: /guides/crypto-tax/<slug>. */
  slug: { pt: string; en: string };
  flag: string;
  /** Referência legal (lei, artigo, circular). */
  law: string;
  /** Plano mínimo para ver o país DENTRO da app (os guias públicos são livres). */
  plan: Plan;
  regime: TaxRegime;
};

// Os rótulos vivem aqui e não nas traduções porque andam sempre colados à taxa
// que está nesta mesma linha: separá-los seria convidar a que um mudasse sem o
// outro. Uma vez saíram só em português nos PDFs em EN/ES/FR — daí as 4 línguas.
const LONG_LABEL: Record<string, Record<Lang, string>> = {
  PT: { pt: "Isento (>1 ano)", en: "Exempt (>1 year)", es: "Exento (>1 año)", fr: "Exonéré (>1 an)" },
  ES: { pt: "19–30% (escala, sem distinção temporal)", en: "19–30% (progressive, no holding-period distinction)", es: "19–30% (escala, sin distinción temporal)", fr: "19–30 % (barème, sans distinction de durée)" },
  FR: { pt: "30% (flat tax / PFU)", en: "30% (flat tax / PFU)", es: "30% (flat tax / PFU)", fr: "30 % (flat tax / PFU)" },
  DE: { pt: "Isento (>1 ano)", en: "Exempt (>1 year)", es: "Exento (>1 año)", fr: "Exonéré (>1 an)" },
  GB: { pt: "18%/24% (sem distinção temporal)", en: "18%/24% (no holding-period distinction)", es: "18%/24% (sin distinción temporal)", fr: "18/24 % (sans distinction de durée)" },
  NL: { pt: "Box 3 tributa património, não mais-valias", en: "Box 3 taxes wealth, not capital gains", es: "Box 3 grava el patrimonio, no las plusvalías", fr: "Box 3 impose le patrimoine, pas les plus-values" },
  IT: { pt: "33% (flat, desde 2026)", en: "33% (flat, from 2026)", es: "33% (flat, desde 2026)", fr: "33 % (forfaitaire, depuis 2026)" },
  BR: { pt: "15% (isenção < R$35k/mês)", en: "15% (exempt below R$35k/month)", es: "15% (exención < R$35k/mes)", fr: "15 % (exonéré sous 35 000 R$/mois)" },
  BE: { pt: "10% (gestão privada; especulativo 33%)", en: "10% (private management; speculative 33%)", es: "10% (gestión privada; especulativo 33%)", fr: "10 % (gestion privée ; spéculatif 33 %)" },
  IE: { pt: "33% (CGT, sem distinção temporal)", en: "33% (CGT, no holding-period distinction)", es: "33% (CGT, sin distinción temporal)", fr: "33 % (CGT, sans distinction de durée)" },
  AT: { pt: "27,5% (flat, sem distinção temporal)", en: "27.5% (flat, no holding-period distinction)", es: "27,5% (flat, sin distinción temporal)", fr: "27,5 % (forfaitaire, sans distinction de durée)" },
  PL: { pt: "19% (flat, PIT-38)", en: "19% (flat, PIT-38)", es: "19% (flat, PIT-38)", fr: "19 % (forfaitaire, PIT-38)" },
  LU: { pt: "Isento (>6 meses)", en: "Exempt (>6 months)", es: "Exento (>6 meses)", fr: "Exonéré (>6 mois)" },
  US: { pt: "0–20% (>1 ano)", en: "0–20% (>1 year)", es: "0–20% (>1 año)", fr: "0–20 % (>1 an)" },
  CA: { pt: "~27% (50% inclusion rate)", en: "~27% (50% inclusion rate)", es: "~27% (tasa de inclusión del 50%)", fr: "~27 % (taux d'inclusion de 50 %)" },
  AU: { pt: "50% desconto (>1 ano)", en: "50% discount (>1 year)", es: "50% de descuento (>1 año)", fr: "Abattement de 50 % (>1 an)" },
  CH: { pt: "Isento (investidor privado)", en: "Exempt (private investor)", es: "Exento (inversor privado)", fr: "Exonéré (investisseur privé)" },
  AE: { pt: "0% (sem imposto sobre mais-valias)", en: "0% (no capital gains tax)", es: "0% (sin impuesto sobre plusvalías)", fr: "0 % (pas d'impôt sur les plus-values)" },
  SG: { pt: "0% (investidor privado)", en: "0% (private investor)", es: "0% (inversor privado)", fr: "0 % (investisseur privé)" },
  MX: { pt: "1,92–35% (ISR progressivo)", en: "1.92–35% (progressive ISR)", es: "1,92–35% (ISR progresivo)", fr: "1,92–35 % (ISR progressif)" },
  AR: { pt: "15% (imposto cedular, flat)", en: "15% (cedular tax, flat)", es: "15% (impuesto cedular, flat)", fr: "15 % (impôt cédulaire, forfaitaire)" },
};

// Isenções/abatimentos anuais, no formato como cada país lhes chama.
const ALLOWANCE_LABEL: Record<string, Record<Lang, string>> = {
  DE: { pt: "Freigrenze €1.000/ano", en: "Freigrenze €1,000/year", es: "Freigrenze 1.000 €/año", fr: "Freigrenze 1 000 €/an" },
  GB: { pt: "Isenção anual £3.000 (≈€3.500)", en: "Annual exemption £3,000 (≈€3,500)", es: "Exención anual £3.000 (≈3.500 €)", fr: "Abattement annuel 3 000 £ (≈3 500 €)" },
  BE: { pt: "Isenção anual €10.000 (regime 2026)", en: "Annual exemption €10,000 (2026 regime)", es: "Exención anual 10.000 € (régimen 2026)", fr: "Abattement annuel 10 000 € (régime 2026)" },
  IE: { pt: "Isenção anual €1.270", en: "Annual exemption €1,270", es: "Exención anual 1.270 €", fr: "Abattement annuel 1 270 €" },
  LU: { pt: "Isento se ganhos especulativos < €500/ano", en: "Exempt if speculative gains < €500/year", es: "Exento si las ganancias especulativas < 500 €/año", fr: "Exonéré si les gains spéculatifs < 500 €/an" },
  MX: { pt: "Isenção anual MX$60.000 (≈€3.000)", en: "Annual exemption MX$60,000 (≈€3,000)", es: "Exención anual MX$60.000 (≈3.000 €)", fr: "Abattement annuel 60 000 MX$ (≈3 000 €)" },
};

// Ordem: os 4 do plano gratuito primeiro, depois Pro, depois Premium — a mesma
// da app, para quem passa de um lado para o outro reconhecer a lista.
export const COUNTRIES: readonly Country[] = [
  { code: "PT", slug: { pt: "portugal", en: "portugal" }, flag: "🇵🇹", plan: "free",    law: "Lei n.º 24-D/2022, art. 5.º",                      regime: { short: 0.28,  long: 0.0,   longDays: 365, longLabel: LONG_LABEL.PT } },
  { code: "ES", slug: { pt: "espanha", en: "spain" }, flag: "🇪🇸", plan: "free",    law: "LIRPF art. 33–35 (2025)",                          regime: { short: 0.19,  long: 0.19,  longDays: 0,   longLabel: LONG_LABEL.ES } },
  { code: "FR", slug: { pt: "franca", en: "france" }, flag: "🇫🇷", plan: "free",    law: "CGI art. 150 VH bis",                              regime: { short: 0.30,  long: 0.30,  longDays: 0,   longLabel: LONG_LABEL.FR } },
  { code: "DE", slug: { pt: "alemanha", en: "germany" }, flag: "🇩🇪", plan: "free",    law: "EStG § 23",                                        regime: { short: 0.45,  long: 0.0,   longDays: 365, longLabel: LONG_LABEL.DE, allowance: { amount: 1000, kind: "threshold", label: ALLOWANCE_LABEL.DE } } },
  { code: "GB", slug: { pt: "reino-unido", en: "united-kingdom" }, flag: "🇬🇧", plan: "pro",     law: "TCGA 1992 / HMRC (Autumn Budget 2024)",            regime: { short: 0.24,  long: 0.24,  longDays: 0,   longLabel: LONG_LABEL.GB, allowance: { amount: 3500, kind: "deduct", label: ALLOWANCE_LABEL.GB } } },
  { code: "NL", slug: { pt: "paises-baixos", en: "netherlands" }, flag: "🇳🇱", plan: "pro",     law: "Wet IB 2001, Box 3",                               regime: { short: 0.0,   long: 0.0,   longDays: 0,   longLabel: LONG_LABEL.NL } },
  { code: "IT", slug: { pt: "italia", en: "italy" }, flag: "🇮🇹", plan: "pro",     law: "Legge 197/2022 / Legge 199/2025",                  regime: { short: 0.33,  long: 0.33,  longDays: 0,   longLabel: LONG_LABEL.IT } },
  { code: "BR", slug: { pt: "brasil", en: "brazil" }, flag: "🇧🇷", plan: "pro",     law: "IN RFB 1888/2019 / Lei 14.754/2023",               regime: { short: 0.15,  long: 0.15,  longDays: 0,   longLabel: LONG_LABEL.BR } },
  { code: "BE", slug: { pt: "belgica", en: "belgium" }, flag: "🇧🇪", plan: "pro",     law: "CIR92 art. 90 / regime mais-valias 2026",          regime: { short: 0.10,  long: 0.10,  longDays: 0,   longLabel: LONG_LABEL.BE, allowance: { amount: 10000, kind: "deduct", label: ALLOWANCE_LABEL.BE } } },
  { code: "IE", slug: { pt: "irlanda", en: "ireland" }, flag: "🇮🇪", plan: "pro",     law: "TCA 1997 / Revenue CGT",                           regime: { short: 0.33,  long: 0.33,  longDays: 0,   longLabel: LONG_LABEL.IE, allowance: { amount: 1270, kind: "deduct", label: ALLOWANCE_LABEL.IE } } },
  { code: "AT", slug: { pt: "austria", en: "austria" }, flag: "🇦🇹", plan: "pro",     law: "EStG § 27b (reforma 2022)",                        regime: { short: 0.275, long: 0.275, longDays: 0,   longLabel: LONG_LABEL.AT } },
  { code: "PL", slug: { pt: "polonia", en: "poland" }, flag: "🇵🇱", plan: "pro",     law: "Ustawa PIT art. 30b",                              regime: { short: 0.19,  long: 0.19,  longDays: 0,   longLabel: LONG_LABEL.PL } },
  { code: "LU", slug: { pt: "luxemburgo", en: "luxembourg" }, flag: "🇱🇺", plan: "pro",     law: "LIR art. 99bis",                                   regime: { short: 0.42,  long: 0.0,   longDays: 183, longLabel: LONG_LABEL.LU, allowance: { amount: 500, kind: "threshold", label: ALLOWANCE_LABEL.LU } } },
  { code: "US", slug: { pt: "estados-unidos", en: "united-states" }, flag: "🇺🇸", plan: "premium", law: "IRS Notice 2014-21 / Rev. Rul. 2023-14",           regime: { short: 0.37,  long: 0.20,  longDays: 365, longLabel: LONG_LABEL.US } },
  { code: "CA", slug: { pt: "canada", en: "canada" }, flag: "🇨🇦", plan: "premium", law: "ITA s. 38 / CRA IT-218R",                          regime: { short: 0.27,  long: 0.27,  longDays: 0,   longLabel: LONG_LABEL.CA } },
  { code: "AU", slug: { pt: "australia", en: "australia" }, flag: "🇦🇺", plan: "premium", law: "ITAA 1997 s. 108-5 / ATO (2014–2023)",             regime: { short: 0.45,  long: 0.225, longDays: 365, longLabel: LONG_LABEL.AU } },
  { code: "CH", slug: { pt: "suica", en: "switzerland" }, flag: "🇨🇭", plan: "premium", law: "DBG art. 16 / LIFD",                               regime: { short: 0.0,   long: 0.0,   longDays: 0,   longLabel: LONG_LABEL.CH } },
  { code: "AE", slug: { pt: "emirados-arabes-unidos", en: "united-arab-emirates" }, flag: "🇦🇪", plan: "premium", law: "Federal Decree-Law No. 47 of 2022",                regime: { short: 0.0,   long: 0.0,   longDays: 0,   longLabel: LONG_LABEL.AE } },
  { code: "SG", slug: { pt: "singapura", en: "singapore" }, flag: "🇸🇬", plan: "premium", law: "Payment Services Act 2019 / IRAS e-Tax Guide",    regime: { short: 0.0,   long: 0.0,   longDays: 0,   longLabel: LONG_LABEL.SG } },
  { code: "MX", slug: { pt: "mexico", en: "mexico" }, flag: "🇲🇽", plan: "premium", law: "LISR (ISR) / SAT",                                 regime: { short: 0.35,  long: 0.35,  longDays: 0,   longLabel: LONG_LABEL.MX, allowance: { amount: 3000, kind: "deduct", label: ALLOWANCE_LABEL.MX } } },
  { code: "AR", slug: { pt: "argentina", en: "argentina" }, flag: "🇦🇷", plan: "premium", law: "Ley 27.430 (imposto cedular)",                     regime: { short: 0.15,  long: 0.15,  longDays: 0,   longLabel: LONG_LABEL.AR } },
] as const;

/** Mapa código → regime, no formato que a calculadora de /fiscalidade espera. */
export const TAX_REGIMES: Record<string, TaxRegime> = Object.fromEntries(
  COUNTRIES.map((c) => [c.code, c.regime]),
);

export type GuideLang = "pt" | "en";

/** Raiz do guia em cada idioma. */
export const GUIDE_BASE: Record<GuideLang, string> = {
  pt: "/guias/impostos-cripto",
  en: "/guides/crypto-tax",
};

export const countryBySlug = (slug: string, lang: GuideLang = "pt"): Country | undefined =>
  COUNTRIES.find((c) => c.slug[lang] === slug);

/** URL do guia: da lista, do país, no idioma pedido. */
export const guideUrl = (lang: GuideLang, country?: Country): string =>
  country ? `${GUIDE_BASE[lang]}/${country.slug[lang]}` : GUIDE_BASE[lang];

/** Prefixo das chaves de tradução de cada país (fc_pt_*, fc_uk_*, …). */
const TEXT_PREFIX: Record<string, string> = {
  PT: "pt", ES: "es", FR: "fr", DE: "de", GB: "uk", NL: "nl", IT: "it", BR: "br",
  BE: "be", IE: "ie", AT: "at", PL: "pl", LU: "lu", US: "us", CA: "ca", AU: "au",
  CH: "ch", AE: "ae", SG: "sg", MX: "mx", AR: "ar",
};

export type CountryText = {
  name: string;
  taxShort: string;
  taxLong: string;
  threshold: string;
  summary: string;
  keyPoints: string[];
};

/**
 * Textos de um país no idioma pedido. Server-safe: lê o módulo de traduções
 * diretamente, sem o contexto React que só existe no cliente.
 */
export function countryText(code: string, lang: Lang = "pt"): CountryText {
  // Sem prefixo o país mostraria silenciosamente o texto de Portugal — um guia
  // inteiro com a lei errada. Antes rebentar no build (as páginas são estáticas).
  const p = TEXT_PREFIX[code];
  if (!p) throw new Error(`countryText: país sem prefixo de tradução em TEXT_PREFIX: ${code}`);
  const dict = translations[lang] as Record<string, string>;
  const get = (suffix: string) => dict[`fc_${p}_${suffix}`] ?? "";
  return {
    name: get("name"),
    taxShort: get("short"),
    taxLong: get("long"),
    threshold: get("thr"),
    summary: get("sum"),
    keyPoints: get("kp").split("\n").filter(Boolean),
  };
}

/** Data da última verificação do conteúdo — mostrada nos guias. */
export const TAX_DATA_VERIFIED: Record<GuideLang, string> = {
  pt: "setembro de 2026",
  en: "September 2026",
};
