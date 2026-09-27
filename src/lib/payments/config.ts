// Configuração de pagamentos em cripto.
// Feature flag: enquanto false, a UI de pagamento cripto fica escondida e as
// rotas de checkout/webbook respondem 404/disabled — permite ligar só quando o
// processador estiver configurado (env vars + supabase-crypto-payments.sql).
//
// Ao ligar a flag, atualizar tambem public/llms.txt (linha "Pricing"): diz que
// os pagamentos em stablecoins estao "planned and not yet enabled".

export const CRYPTO_PAYMENTS_ENABLED =
  (process.env.NEXT_PUBLIC_CRYPTO_PAYMENTS_ENABLED ?? "").toLowerCase() === "true";

export type CryptoProvider = "helio" | "sphere" | "btcpay";

export const CRYPTO_PROVIDER = (process.env.CRYPTO_PROVIDER ?? "") as CryptoProvider | "";
