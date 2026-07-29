// Concessão de acesso pago via cripto — independente do processador.
// Escreve na MESMA tabela `subscriptions` que o Stripe (com source='crypto'),
// por isso todo o gating de planos existente continua a funcionar sem alterações.
// Idempotente por `providerEventId` (o webhook pode ser reentregue sem creditar 2×).

import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type CryptoPlan = "pro" | "premium";
export type BillingPeriod = "monthly" | "annual";

// Reutiliza os mesmos price IDs do Stripe, para o resolver de plano
// (isPremium = price_id === PREMIUM_PRICE_ID) tratar cripto e cartão igual.
const PRO_PRICE_ID = process.env.STRIPE_PRICE_ID ?? "";
const PREMIUM_PRICE_ID =
  process.env.STRIPE_PREMIUM_PRICE_ID ??
  process.env.NEXT_PUBLIC_STRIPE_PREMIUM_PRICE_ID ??
  "";

export function priceIdForPlan(plan: CryptoPlan): string {
  return plan === "premium" ? PREMIUM_PRICE_ID : PRO_PRICE_ID;
}

// Fim do período a partir de uma data base (1 mês ou 1 ano).
export function periodEnd(from: Date, period: BillingPeriod): Date {
  const d = new Date(from);
  if (period === "annual") d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

export type GrantInput = {
  userId: string;
  plan: CryptoPlan;
  period: BillingPeriod;
  provider: string;          // 'helio' | 'btcpay' | 'sphere' | ...
  providerEventId: string;   // idempotência (id único do evento do processador)
  chain?: string;            // 'BTC' | 'ETH' | 'SOL' | ...
  currency?: string;         // 'USDC' | 'BTC' | 'ETH'
  amount?: number;
  txHash?: string | null;
};

export type GrantResult = { granted: boolean; reason?: "duplicate" | "error"; message?: string };

// Credita (ou estende) o acesso pago. Chamar a partir do webhook do processador,
// depois de este ter validado a assinatura e a confirmação on-chain.
export async function grantCryptoEntitlement(input: GrantInput): Promise<GrantResult> {
  const admin = getSupabaseAdmin();
  const now = new Date();

  // 1) Idempotência: regista o evento. Se já existir (unique violation), sai sem creditar.
  const { error: insErr } = await admin.from("crypto_payments").insert({
    user_id: input.userId,
    provider: input.provider,
    provider_event_id: input.providerEventId,
    plan: input.plan,
    period: input.period,
    chain: input.chain ?? "",
    currency: input.currency ?? "",
    amount: input.amount ?? 0,
    tx_hash: input.txHash ?? null,
    status: "confirmed",
    confirmed_at: now.toISOString(),
  });
  if (insErr) {
    if ((insErr as { code?: string }).code === "23505") return { granted: false, reason: "duplicate" };
    return { granted: false, reason: "error", message: insErr.message };
  }

  // 2) Base para estender: se já houver acesso cripto ativo no futuro, empilha o
  //    novo período por cima (renovações somam); senão, conta a partir de agora.
  const { data: existing } = await admin
    .from("subscriptions")
    .select("current_period_end, status, source")
    .eq("user_id", input.userId)
    .maybeSingle();

  const currentEnd = existing?.current_period_end ? new Date(existing.current_period_end) : null;
  const stackable =
    existing?.status === "active" && existing?.source === "crypto" && currentEnd && currentEnd > now;
  const base = stackable ? currentEnd! : now;
  const end = periodEnd(base, input.period);

  // 3) Atualiza o plano (mesmo shape do webhook do Stripe, + source='crypto').
  const { error: subErr } = await admin.from("subscriptions").upsert({
    user_id: input.userId,
    status: "active",
    price_id: priceIdForPlan(input.plan),
    current_period_end: end.toISOString(),
    cancel_at_period_end: false,
    source: "crypto",
  });
  if (subErr) return { granted: false, reason: "error", message: subErr.message };

  return { granted: true };
}
