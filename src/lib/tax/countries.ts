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
  label: string;
};

export type TaxRegime = {
  /** Taxa aplicada a ganhos de curto prazo (0–1). */
  short: number;
  /** Taxa aplicada depois de `longDays` (0–1). */
  long: number;
  /** Dias de detenção a partir dos quais vale `long`. 0 = sem distinção temporal. */
  longDays: number;
  longLabel: string;
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

// Ordem: os 4 do plano gratuito primeiro, depois Pro, depois Premium — a mesma
// da app, para quem passa de um lado para o outro reconhecer a lista.
export const COUNTRIES: readonly Country[] = [
  { code: "PT", slug: { pt: "portugal", en: "portugal" }, flag: "🇵🇹", plan: "free",    law: "Lei n.º 24-D/2022, art. 5.º",                      regime: { short: 0.28,  long: 0.0,   longDays: 365, longLabel: "Isento (>1 ano)" } },
  { code: "ES", slug: { pt: "espanha", en: "spain" }, flag: "🇪🇸", plan: "free",    law: "LIRPF art. 33–35 (2025)",                          regime: { short: 0.19,  long: 0.19,  longDays: 0,   longLabel: "19–30% (escala, sem distinção temporal)" } },
  { code: "FR", slug: { pt: "franca", en: "france" }, flag: "🇫🇷", plan: "free",    law: "CGI art. 150 VH bis",                              regime: { short: 0.30,  long: 0.30,  longDays: 0,   longLabel: "30% (flat tax / PFU)" } },
  { code: "DE", slug: { pt: "alemanha", en: "germany" }, flag: "🇩🇪", plan: "free",    law: "EStG § 23",                                        regime: { short: 0.45,  long: 0.0,   longDays: 365, longLabel: "Isento (>1 ano)", allowance: { amount: 1000, kind: "threshold", label: "Freigrenze €1.000/ano" } } },
  { code: "GB", slug: { pt: "reino-unido", en: "united-kingdom" }, flag: "🇬🇧", plan: "pro",     law: "TCGA 1992 / HMRC (Autumn Budget 2024)",            regime: { short: 0.24,  long: 0.24,  longDays: 0,   longLabel: "18%/24% (sem distinção temporal)", allowance: { amount: 3500, kind: "deduct", label: "Isenção anual £3.000 (≈€3.500)" } } },
  { code: "NL", slug: { pt: "paises-baixos", en: "netherlands" }, flag: "🇳🇱", plan: "pro",     law: "Wet IB 2001, Box 3",                               regime: { short: 0.0,   long: 0.0,   longDays: 0,   longLabel: "Box 3 tributa património, não mais-valias" } },
  { code: "IT", slug: { pt: "italia", en: "italy" }, flag: "🇮🇹", plan: "pro",     law: "Legge 197/2022 / Legge 199/2025",                  regime: { short: 0.33,  long: 0.33,  longDays: 0,   longLabel: "33% (flat, desde 2026)" } },
  { code: "BR", slug: { pt: "brasil", en: "brazil" }, flag: "🇧🇷", plan: "pro",     law: "IN RFB 1888/2019 / Lei 14.754/2023",               regime: { short: 0.15,  long: 0.15,  longDays: 0,   longLabel: "15% (isenção < R$35k/mês)" } },
  { code: "BE", slug: { pt: "belgica", en: "belgium" }, flag: "🇧🇪", plan: "pro",     law: "CIR92 art. 90 / regime mais-valias 2026",          regime: { short: 0.10,  long: 0.10,  longDays: 0,   longLabel: "10% (gestão privada; especulativo 33%)", allowance: { amount: 10000, kind: "deduct", label: "Isenção anual €10.000 (regime 2026)" } } },
  { code: "IE", slug: { pt: "irlanda", en: "ireland" }, flag: "🇮🇪", plan: "pro",     law: "TCA 1997 / Revenue CGT",                           regime: { short: 0.33,  long: 0.33,  longDays: 0,   longLabel: "33% (CGT, sem distinção temporal)", allowance: { amount: 1270, kind: "deduct", label: "Isenção anual €1.270" } } },
  { code: "AT", slug: { pt: "austria", en: "austria" }, flag: "🇦🇹", plan: "pro",     law: "EStG § 27b (reforma 2022)",                        regime: { short: 0.275, long: 0.275, longDays: 0,   longLabel: "27,5% (flat, sem distinção temporal)" } },
  { code: "PL", slug: { pt: "polonia", en: "poland" }, flag: "🇵🇱", plan: "pro",     law: "Ustawa PIT art. 30b",                              regime: { short: 0.19,  long: 0.19,  longDays: 0,   longLabel: "19% (flat, PIT-38)" } },
  { code: "LU", slug: { pt: "luxemburgo", en: "luxembourg" }, flag: "🇱🇺", plan: "pro",     law: "LIR art. 99bis",                                   regime: { short: 0.42,  long: 0.0,   longDays: 183, longLabel: "Isento (>6 meses)", allowance: { amount: 500, kind: "threshold", label: "Isento se ganhos especulativos < €500/ano" } } },
  { code: "US", slug: { pt: "estados-unidos", en: "united-states" }, flag: "🇺🇸", plan: "premium", law: "IRS Notice 2014-21 / Rev. Rul. 2023-14",           regime: { short: 0.37,  long: 0.20,  longDays: 365, longLabel: "0–20% (>1 ano)" } },
  { code: "CA", slug: { pt: "canada", en: "canada" }, flag: "🇨🇦", plan: "premium", law: "ITA s. 38 / CRA IT-218R",                          regime: { short: 0.27,  long: 0.27,  longDays: 0,   longLabel: "~27% (50% inclusion rate)" } },
  { code: "AU", slug: { pt: "australia", en: "australia" }, flag: "🇦🇺", plan: "premium", law: "ITAA 1997 s. 108-5 / ATO (2014–2023)",             regime: { short: 0.45,  long: 0.225, longDays: 365, longLabel: "50% desconto (>1 ano)" } },
  { code: "CH", slug: { pt: "suica", en: "switzerland" }, flag: "🇨🇭", plan: "premium", law: "DBG art. 16 / LIFD",                               regime: { short: 0.0,   long: 0.0,   longDays: 0,   longLabel: "Isento (investidor privado)" } },
  { code: "AE", slug: { pt: "emirados-arabes-unidos", en: "united-arab-emirates" }, flag: "🇦🇪", plan: "premium", law: "Federal Decree-Law No. 47 of 2022",                regime: { short: 0.0,   long: 0.0,   longDays: 0,   longLabel: "0% (sem imposto sobre mais-valias)" } },
  { code: "SG", slug: { pt: "singapura", en: "singapore" }, flag: "🇸🇬", plan: "premium", law: "Payment Services Act 2019 / IRAS e-Tax Guide",    regime: { short: 0.0,   long: 0.0,   longDays: 0,   longLabel: "0% (investidor privado)" } },
  { code: "MX", slug: { pt: "mexico", en: "mexico" }, flag: "🇲🇽", plan: "premium", law: "LISR (ISR) / SAT",                                 regime: { short: 0.35,  long: 0.35,  longDays: 0,   longLabel: "1,92–35% (ISR progressivo)", allowance: { amount: 3000, kind: "deduct", label: "Isenção anual MX$60.000 (≈€3.000)" } } },
  { code: "AR", slug: { pt: "argentina", en: "argentina" }, flag: "🇦🇷", plan: "premium", law: "Ley 27.430 (imposto cedular)",                     regime: { short: 0.15,  long: 0.15,  longDays: 0,   longLabel: "15% (imposto cedular, flat)" } },
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
  const p = TEXT_PREFIX[code] ?? "pt";
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
export const TAX_DATA_VERIFIED = "setembro de 2026";
