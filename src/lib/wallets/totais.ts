// Contas puras dos totais da pagina de carteiras. Extraidas de
// src/app/(pt)/wallets/page.tsx sem alteracoes; testes em scripts/testes/totaisCarteiras.test.ts.

/** Total geral mostrado no topo da secao cripto, na moeda do utilizador:
 *  o que vem em USD e convertido de uma vez; manual e stablecoins ja vem na moeda.
 *  A ordem das somas e a de sempre (mudar a ordem muda arredondamentos). */
export const totalGeralEur = (v: {
  walletsTotalUsd: number;
  totalDefiUsd: number;
  cexHlTotalUsd: number;
  coldTokensExtraUsd: number;
  usdToEurRate: number;
  cryptoManualTotal: number;
  stablecoinTotalEur: number;
}) => (v.walletsTotalUsd + v.totalDefiUsd + v.cexHlTotalUsd + v.coldTokensExtraUsd) * v.usdToEurRate + v.cryptoManualTotal + v.stablecoinTotalEur;

/** Preco de uma cotacao tradicional em EUR, pela moeda que a cotacao indica.
 *  `fxRates` = unidades de cada moeda por 1 EUR. undefined quando nao ha cotacao
 *  ou nao se sabe converter (o valor do ativo continua a ser o investido). */
export const quotePriceEurFrom = (
  quote: { price: number | null; currency?: string | null } | undefined,
  fxRates: Record<string, number>,
): number | undefined => {
  if (!quote || quote.price == null || !Number.isFinite(quote.price)) return undefined;
  const cur = (quote.currency ?? "USD").toUpperCase();  // sem moeda, as bolsas do plano gratuito sao americanas
  if (cur === "EUR") return quote.price;
  const perEur = fxRates[cur];
  if (!perEur || perEur <= 0) return undefined;
  return quote.price / perEur;
};

/** Valor de mercado e PNL de um ativo cripto registado a mao.
 *  Sem quantidade ou sem preco nao ha valor de mercado; sem investido nao ha PNL. */
export const pnlAtivoManual = (
  quantity: number | undefined,
  buyValue: number | undefined,
  priceUsd: number | undefined,
  usdToEurRate: number,
) => {
  const priceEur = priceUsd ? priceUsd * usdToEurRate : undefined;
  const qty = Number(quantity ?? 0);
  const marketValueEur = qty > 0 && priceEur ? qty * priceEur : undefined;
  const investedEur = Number(buyValue ?? 0);
  const pnlEur =
    marketValueEur != null && investedEur > 0 ? marketValueEur - investedEur : undefined;
  const pnlPct =
    pnlEur != null && investedEur > 0 ? (pnlEur / investedEur) * 100 : undefined;
  return { marketValueEur, pnlEur, pnlPct };
};
