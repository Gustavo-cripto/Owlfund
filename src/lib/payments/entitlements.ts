// Concessão de acesso pago via cripto — independente do processador.
// Escreve na MESMA tabela `subscriptions` que o Stripe (com source='crypto'),
// por isso todo o gating de planos existente continua a funcionar sem alterações.
// Idempotente por `providerEventId` (o webhook pode ser reentregue sem creditar 2×).

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { emitirFaturaRecibo, faturacaoAtiva } from "@/lib/faturacao/invoicexpress";
import { cotacaoEmEur } from "@/lib/faturacao/cotacao";
import { sendTelegram, tgEsc } from "@/lib/notify/telegram";

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
    // Uma linha por conta (indice unico `subscriptions_user_id_key`). Sem isto,
    // o upsert tentava inserir e falhava para quem ja tinha subscricao — e quem
    // pagou em cripto nao recebia o plano.
  }, { onConflict: "user_id" });
  if (subErr) return { granted: false, reason: "error", message: subErr.message };

  // 4) Fatura-recibo em euros, à cotação do momento (contabilista, 20 out 2026).
  //    Nunca desfaz o acesso já creditado: se falhar, avisa o dono para a emitir à mão.
  await faturarPagamentoCripto(input, now).catch((e) => console.error("[faturacao] cripto:", e instanceof Error ? e.message : e));

  return { granted: true };
}

async function faturarPagamentoCripto(input: GrantInput, quando: Date): Promise<void> {
  const quantidade = Number(input.amount ?? 0);
  const moeda = (input.currency ?? "").toUpperCase();
  if (!(quantidade > 0) || !moeda) return;
  const admin = getSupabaseAdmin();
  const cot = await cotacaoEmEur(moeda);
  const totalEur = cot ? Math.round(quantidade * cot.eur * 100) / 100 : 0;
  // Fica registado no pagamento (colunas de supabase-crypto-eur.sql; sem elas, ignora-se).
  if (cot) {
    try { await admin.from("crypto_payments").update({ valor_eur: totalEur, cotacao_eur: cot.eur, cotacao_fonte: cot.fonte }).eq("provider_event_id", input.providerEventId); } catch { /* colunas ainda não criadas */ }
  }
  if (!faturacaoAtiva()) return;
  const { data } = await admin.auth.admin.getUserById(input.userId);
  const email = data.user?.email ?? "";
  const aviso = async (motivo: string) => {
    console.error("[faturacao] cripto", input.providerEventId, motivo);
    await sendTelegram(`⚠️ <b>Fatura NÃO emitida</b> (cripto ${tgEsc(input.providerEventId)})
${tgEsc(email || input.userId)} · ${quantidade} ${tgEsc(moeda)}${cot ? ` ≈ ${totalEur.toFixed(2)} €` : ""}
Motivo: ${tgEsc(motivo)}
▶ Emite-a à mão no InvoiceXpress.`).catch(() => false);
  };
  if (!cot) return aviso(`sem cotação de ${moeda} em euros`);
  if (!email) return aviso("conta sem email");
  const r = await emitirFaturaRecibo({
    idUnico: `cripto-${input.providerEventId}`,
    codigoCliente: input.userId,
    nome: (data.user?.user_metadata?.full_name as string | undefined) ?? email,
    email,
    descricao: `ChainFolioAI ${input.plan === "premium" ? "Premium" : "Pro"} — ${input.period === "annual" ? "anual" : "mensal"}`,
    totalEur,
    data: quando,
    observacoes: `Pago em ${quantidade} ${moeda}${input.chain ? ` (${input.chain})` : ""} à cotação de ${cot.eur.toFixed(4)} € (${cot.fonte}, ${quando.toISOString()})${input.txHash ? ` · tx ${input.txHash}` : ""}`,
  });
  if (!r.ok && !r.duplicado) await aviso(r.erro);
}
