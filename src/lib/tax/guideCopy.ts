// Textos de INTERFACE dos guias fiscais públicos (títulos, rótulos, CTA, aviso).
// Ficam aqui e não no translations.ts geral porque só existem nestas páginas e
// porque os guias são server components — não passam pelo contexto de idioma do
// cliente, o idioma vem do URL (/guias/… = pt, /guides/… = en).
//
// Os textos do CONTEÚDO (regras de cada país) continuam em translations.ts,
// chaves fc_<code>_*, partilhados com a calculadora.

import type { GuideLang } from "./countries";

type Copy = {
  locale: string;
  breadcrumbHome: string;
  breadcrumbGuides: string;
  indexTitle: string;
  indexMetaTitle: string;
  indexMetaDescription: string;
  indexIntro: (verified: string) => string;
  colCountry: string;
  colShort: string;
  colLong: string;
  colThreshold: string;
  colAllowance: string;
  none: string;
  howToTitle: string;
  howToBody: string;
  ctaBeta: string;
  ctaHow: string;
  ctaCompare: string;
  verifiedOn: (v: string) => string;
  factShort: string;
  factLong: string;
  factThreshold: string;
  factAllowance: string;
  factLaw: string;
  notApplicable: string;
  summaryTitle: string;
  keyPointsTitle: string;
  calcTitle: string;
  calcBody: string;
  otherCountries: string;
  disclaimerIndex: string;
  disclaimerCountry: string;
  countryTitle: (name: string) => string;
  countryMetaTitle: (name: string, short: string, long: string) => string;
  faqHowMuch: (name: string) => string;
  faqAllowance: (name: string) => string;
  faqAllowanceYes: (label: string) => string;
  faqAllowanceNo: (name: string) => string;
  faqMethod: string;
  faqMethodAnswer: string;
};

export const GUIDE_COPY: Record<GuideLang, Copy> = {
  pt: {
    locale: "pt-PT",
    breadcrumbHome: "Início",
    breadcrumbGuides: "Guias",
    indexTitle: "Impostos sobre cripto em 21 países",
    indexMetaTitle: "Impostos sobre cripto em 21 países (2026) — taxas, prazos e leis",
    indexMetaDescription:
      "Quanto se paga de imposto sobre mais-valias de criptomoedas em Portugal, Espanha, Alemanha, Brasil e mais 17 países: taxas, prazos de detenção, isenções anuais e a lei aplicável. Atualizado a 2026.",
    indexIntro: (v) =>
      `Quanto se paga sobre mais-valias de criptomoedas, país a país: a taxa de curto prazo, o que acontece se mantiveres o ativo mais tempo, as isenções anuais e a lei que se aplica. Cada país tem uma página própria com o detalhe. Regras verificadas em ${v}.`,
    colCountry: "País",
    colShort: "Curto prazo",
    colLong: "Longo prazo",
    colThreshold: "Limiar",
    colAllowance: "Isenção anual",
    none: "—",
    howToTitle: "Como calcular o que deves",
    howToBody:
      "Saber a taxa é a parte fácil. O trabalho está em emparelhar cada venda com a compra correspondente pelo método FIFO, converter tudo para a tua moeda à data de cada operação e separar o que caiu no curto prazo do que já passou o limiar. O ChainFolioAI faz esse cálculo a partir do teu histórico e exporta o resultado em PDF ou Excel para levares ao contabilista.",
    ctaBeta: "Entrar no beta — Premium grátis 60 dias",
    ctaHow: "Ver como funciona",
    ctaCompare: "Comparar os 21 países",
    verifiedOn: (v) => `Regras verificadas em ${v}.`,
    factShort: "Curto prazo",
    factLong: "Longo prazo",
    factThreshold: "Limiar de detenção",
    factAllowance: "Isenção anual",
    factLaw: "Legislação",
    notApplicable: "Não aplicável",
    summaryTitle: "Em resumo",
    keyPointsTitle: "Pontos a reter",
    calcTitle: "Calcular sobre o teu histórico",
    calcBody:
      "A taxa é só metade do problema. Para declarar, precisas de emparelhar cada venda com a compra certa por FIFO, converter para euros à data de cada operação e separar o curto do longo prazo. O ChainFolioAI faz isso a partir das tuas transações — ligas as carteiras em modo só-leitura ou importas um CSV da exchange — e exporta em PDF ou Excel.",
    otherCountries: "Outros países",
    disclaimerIndex:
      "⚠️ Este guia é informativo e não constitui aconselhamento fiscal. As regras mudam e a tua situação concreta pode ter particularidades — confirma sempre com um contabilista ou com a autoridade fiscal do teu país antes de declarar.",
    disclaimerCountry:
      "⚠️ Informação geral, não aconselhamento fiscal. As regras mudam e a tua situação pode ter particularidades (residência, atividade profissional, staking, mineração). Confirma com um contabilista ou com a autoridade fiscal antes de declarar.",
    countryTitle: (n) => `Impostos sobre cripto em ${n}`,
    countryMetaTitle: (n, s, l) => `Impostos sobre cripto em ${n} (2026): ${s} e ${l.toLowerCase()}`,
    faqHowMuch: (n) => `Quanto se paga de imposto sobre cripto em ${n}?`,
    faqAllowance: (n) => `Há isenção anual sobre mais-valias de cripto em ${n}?`,
    faqAllowanceYes: (l) => `Sim: ${l}.`,
    faqAllowanceNo: (n) => `Não existe uma isenção anual específica para mais-valias de criptomoedas em ${n}.`,
    faqMethod: "Que método de cálculo se usa para emparelhar compras e vendas?",
    faqMethodAnswer:
      "FIFO (first in, first out) é o método por defeito na generalidade das jurisdições: a primeira unidade comprada é a primeira a ser considerada vendida. O ChainFolioAI aplica FIFO ao teu histórico e exporta o resultado.",
  },
  en: {
    locale: "en-GB",
    breadcrumbHome: "Home",
    breadcrumbGuides: "Guides",
    indexTitle: "Crypto tax in 21 countries",
    indexMetaTitle: "Crypto tax in 21 countries (2026) — rates, holding periods and laws",
    indexMetaDescription:
      "How much tax you pay on crypto capital gains in Portugal, Spain, Germany, the UK, the US and 16 other countries: rates, holding periods, annual allowances and the law that applies. Updated for 2026.",
    indexIntro: (v) =>
      `What you pay on crypto capital gains, country by country: the short-term rate, what changes if you hold longer, the annual allowances and the law that applies. Each country has its own page with the detail. Rules verified in ${v}.`,
    colCountry: "Country",
    colShort: "Short term",
    colLong: "Long term",
    colThreshold: "Holding period",
    colAllowance: "Annual allowance",
    none: "—",
    howToTitle: "How to work out what you owe",
    howToBody:
      "Knowing the rate is the easy part. The work is matching each disposal to the right acquisition under FIFO, converting everything to your currency at the date of each transaction, and separating short-term gains from those past the holding threshold. ChainFolioAI does that from your transaction history and exports the result as PDF or Excel for your accountant.",
    ctaBeta: "Join the beta — Premium free for 60 days",
    ctaHow: "See how it works",
    ctaCompare: "Compare all 21 countries",
    verifiedOn: (v) => `Rules verified in ${v}.`,
    factShort: "Short term",
    factLong: "Long term",
    factThreshold: "Holding period",
    factAllowance: "Annual allowance",
    factLaw: "Legislation",
    notApplicable: "Not applicable",
    summaryTitle: "In short",
    keyPointsTitle: "Key points",
    calcTitle: "Calculate on your own history",
    calcBody:
      "The rate is only half the problem. To file, you need to match each disposal to the right acquisition under FIFO, convert to your currency at the date of each transaction, and separate short-term from long-term. ChainFolioAI does this from your transactions — connect wallets read-only or import a CSV from your exchange — and exports to PDF or Excel.",
    otherCountries: "Other countries",
    disclaimerIndex:
      "⚠️ This guide is informational and is not tax advice. Rules change and your situation may have specifics — always confirm with an accountant or your national tax authority before filing.",
    disclaimerCountry:
      "⚠️ General information, not tax advice. Rules change and your situation may have specifics (residency, professional activity, staking, mining). Confirm with an accountant or your tax authority before filing.",
    countryTitle: (n) => `Crypto tax in ${n}`,
    countryMetaTitle: (n, s, l) => `Crypto tax in ${n} (2026): ${s} and ${l.toLowerCase()}`,
    faqHowMuch: (n) => `How much tax do you pay on crypto in ${n}?`,
    faqAllowance: (n) => `Is there an annual allowance on crypto gains in ${n}?`,
    faqAllowanceYes: (l) => `Yes: ${l}.`,
    faqAllowanceNo: (n) => `There is no crypto-specific annual allowance on capital gains in ${n}.`,
    faqMethod: "Which method is used to match buys and sells?",
    faqMethodAnswer:
      "FIFO (first in, first out) is the default in most jurisdictions: the first unit bought is the first treated as sold. ChainFolioAI applies FIFO to your history and exports the result.",
  },
};
