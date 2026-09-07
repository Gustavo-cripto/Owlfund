// IDs de preço que dão direitos PREMIUM — um só sítio para todo o servidor.
//
// Antes, nove rotas comparavam `price_id === STRIPE_PREMIUM_PRICE_ID` (só o
// Premium mensal): quem pagasse o Premium ANUAL ou o Premium de FUNDADOR ficava
// com direitos de Pro. Aqui entram os quatro, mais o marcador dos testers
// manuais quando a env do Stripe ainda não está definida.
//
// Não importar em componentes de cliente: lê env vars de servidor (o cliente
// deve confiar no plano devolvido por /api/subscription).

const env = (key: string): string => (process.env[key] ?? "").trim();

export const PREMIUM_PRICE_IDS: ReadonlySet<string> = new Set(
  [
    env("STRIPE_PREMIUM_PRICE_ID") || env("NEXT_PUBLIC_STRIPE_PREMIUM_PRICE_ID"),
    env("STRIPE_PREMIUM_PRICE_ID_ANNUAL"),
    env("STRIPE_FOUNDER_PREMIUM_PRICE_ID"),
    env("STRIPE_FOUNDER_PREMIUM_PRICE_ID_ANNUAL"),
    "manual_premium", // src/lib/beta/grant.ts quando STRIPE_PREMIUM_PRICE_ID falta
  ].filter(Boolean),
);

/** True se o price_id da subscrição corresponde a um plano Premium. */
export const isPremiumPriceId = (priceId: unknown): boolean =>
  typeof priceId === "string" && PREMIUM_PRICE_IDS.has(priceId);

/** Etiqueta legível do preço (para estatísticas/admin). */
export function priceLabel(priceId: string | null | undefined): string {
  if (!priceId) return "desconhecido";
  const map: Record<string, string> = {
    [env("STRIPE_PRICE_ID") || "_pm"]: "pro_mensal",
    [env("STRIPE_PRICE_ID_ANNUAL") || "_pa"]: "pro_anual",
    [env("STRIPE_PREMIUM_PRICE_ID") || "_prm"]: "premium_mensal",
    [env("STRIPE_PREMIUM_PRICE_ID_ANNUAL") || "_pra"]: "premium_anual",
    [env("STRIPE_FOUNDER_PRO_PRICE_ID") || "_fpm"]: "fundador_pro_mensal",
    [env("STRIPE_FOUNDER_PRO_PRICE_ID_ANNUAL") || "_fpa"]: "fundador_pro_anual",
    [env("STRIPE_FOUNDER_PREMIUM_PRICE_ID") || "_fprm"]: "fundador_premium_mensal",
    [env("STRIPE_FOUNDER_PREMIUM_PRICE_ID_ANNUAL") || "_fpra"]: "fundador_premium_anual",
    manual_pro: "beta_pro",
    manual_premium: "beta_premium",
  };
  return map[priceId] ?? "outro";
}

/**
 * Prontidão para o lançamento: quais as env vars definidas (só sim/não, nunca
 * valores). Usado pelo endpoint admin de estatísticas e pelo scripts/launch-check.sh.
 */
export function launchReadiness() {
  const has = (key: string) => env(key).length > 0;
  const live = env("STRIPE_SECRET_KEY").startsWith("sk_live_");
  return {
    paymentsEnabled: env("NEXT_PUBLIC_PAYMENTS_ENABLED") === "true",
    stripe: {
      secretKey: has("STRIPE_SECRET_KEY"),
      secretKeyIsLive: live,
      webhookSecret: has("STRIPE_WEBHOOK_SECRET"),
      publishableKey: has("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"),
      prices: {
        proMonthly: has("STRIPE_PRICE_ID"),
        proAnnual: has("STRIPE_PRICE_ID_ANNUAL"),
        premiumMonthly: has("STRIPE_PREMIUM_PRICE_ID"),
        premiumAnnual: has("STRIPE_PREMIUM_PRICE_ID_ANNUAL"),
        premiumPublicMirror: has("NEXT_PUBLIC_STRIPE_PREMIUM_PRICE_ID"),
      },
      founderPrices: {
        proMonthly: has("STRIPE_FOUNDER_PRO_PRICE_ID"),
        proAnnual: has("STRIPE_FOUNDER_PRO_PRICE_ID_ANNUAL"),
        premiumMonthly: has("STRIPE_FOUNDER_PREMIUM_PRICE_ID"),
        premiumAnnual: has("STRIPE_FOUNDER_PREMIUM_PRICE_ID_ANNUAL"),
      },
    },
    providers: {
      resend: has("RESEND_API_KEY"),
      twelveData: has("TWELVEDATA_API_KEY"),
      moralis: has("MORALIS_API_KEY"),
      helius: has("HELIUS_API_KEY"),
      etherscan: has("ETHERSCAN_API_KEY"), // V2 exige chave; sem ela não há histórico ETH no Smart Money
      ai: has("GROQ_API_KEY") || has("OPENAI_API_KEY") || has("XAI_API_KEY"),
    },
    crypto: {
      enabled: env("NEXT_PUBLIC_CRYPTO_PAYMENTS_ENABLED") === "true",
      helioConfigured: has("HELIO_API_KEY") && has("HELIO_PUBLIC_KEY") && has("HELIO_WEBHOOK_TOKEN"),
    },
    ops: {
      cronSecret: has("CRON_SECRET"),
      adminEmails: has("ADMIN_EMAILS"),
      telegram: has("TELEGRAM_BOT_TOKEN") && has("TELEGRAM_CHAT_ID"),
      betaCutoff: env("NEXT_PUBLIC_BETA_CUTOFF") || null,
    },
  };
}
