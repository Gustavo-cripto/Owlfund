// Símbolo de cada moeda, num sítio só.
//
// Inclui moedas que não estão no seletor de apresentação (AED, ARS): são as
// moedas em que se declara nos Emirados e na Argentina, e o relatório fiscal
// precisa do símbolo mesmo quando não conseguimos ir buscar a cotação.
export const CURRENCY_SIGN: Record<string, string> = {
  EUR: "€", USD: "$", GBP: "£", CHF: "CHF", CAD: "CA$", AUD: "A$",
  BRL: "R$", PLN: "zł", MXN: "MX$", SGD: "S$", BTC: "₿",
  AED: "AED", ARS: "ARS",
};

export const currencySign = (code: string): string => CURRENCY_SIGN[code] ?? code;
