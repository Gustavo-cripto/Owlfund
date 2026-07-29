// Fonte única de verdade dos preços dos planos + desconto para pagamento em cripto.
// Os preços FIAT (cartão/Stripe) mantêm-se. Cripto = mesmo preço com desconto,
// fixado em EURC (euro-stablecoin) para ficar igual ao euro. Fácil de alterar.

export type Plan = "pro" | "premium";
export type Period = "monthly" | "annual";

// Preços fiat (cartão) — não mexer aqui muda também a base do preço cripto.
export const FIAT_PRICES: Record<Plan, Record<Period, number>> = {
  pro: { monthly: 14.99, annual: 149 },
  premium: { monthly: 39, annual: 390 },
};

// Desconto (%) para quem paga em cripto — motiva a escolha e poupa a taxa do cartão.
// Alterar aqui, ou definir NEXT_PUBLIC_CRYPTO_DISCOUNT_PCT nas env vars (tem prioridade).
const DEFAULT_CRYPTO_DISCOUNT_PCT = 15;
export const CRYPTO_DISCOUNT_PCT = (() => {
  const env = Number(process.env.NEXT_PUBLIC_CRYPTO_DISCOUNT_PCT);
  return Number.isFinite(env) && env >= 0 && env <= 90 ? env : DEFAULT_CRYPTO_DISCOUNT_PCT;
})();

// Moeda em que o preço cripto é fixado (euro-stablecoin) e stablecoins aceites.
export const CRYPTO_PRICE_CURRENCY = "EURC";
export const CRYPTO_ACCEPTED_CURRENCIES = ["EURC", "USDC"] as const;

// Preço em cripto (EURC) = preço fiat com o desconto aplicado, arredondado a cêntimo.
export function cryptoPrice(plan: Plan, period: Period): number {
  const base = FIAT_PRICES[plan][period];
  return Math.round(base * (1 - CRYPTO_DISCOUNT_PCT / 100) * 100) / 100;
}

// Quanto se poupa (em €) ao pagar em cripto, para mostrar na UI.
export function cryptoSavings(plan: Plan, period: Period): number {
  return Math.round((FIAT_PRICES[plan][period] - cryptoPrice(plan, period)) * 100) / 100;
}
