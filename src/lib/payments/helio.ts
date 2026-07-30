// Adaptador Helio / MoonPay Commerce.
// - Verificação de webhook: Bearer sharedToken + X-Signature (HMAC-SHA256 hex do
//   corpo cru, assinado com o sharedToken). Ambos têm de bater.
// - Criação de cobrança: POST https://api.hel.io/v1/charge/create (paylink + meta).
//
// NOTA: os caminhos de campos do payload do webhook (event, transactionObject.id,
// meta.*) estão isolados em parseHelioWebhook() e DEVEM ser confirmados contra o
// primeiro webhook real em modo de teste antes de ir para produção.

import crypto from "crypto";
import type { Plan, Period } from "./pricing";

const HELIO_API_BASE = "https://api.hel.io/v1";

function timingSafeStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// True se o webhook é autêntico (Bearer + assinatura HMAC batem).
export function verifyHelioWebhook(rawBody: string, headers: Headers): boolean {
  const sharedToken = process.env.HELIO_WEBHOOK_TOKEN ?? "";
  if (!sharedToken) return false;
  const bearer = (headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const signature = headers.get("x-signature") ?? "";
  const expected = crypto.createHmac("sha256", sharedToken).update(rawBody).digest("hex");
  return timingSafeStr(bearer, sharedToken) && timingSafeStr(signature, expected);
}

export type HelioParsed = {
  action: "grant" | "end" | "ignore";
  eventId: string;         // id único da transação → idempotência
  userId?: string;
  plan?: Plan;
  period?: Period;
  chain?: string;
  currency?: string;
  amount?: number;
  txHash?: string | null;
};

// Traduz o payload do Helio para uma ação interna. CAMPOS PROVISÓRIOS — confirmar
// contra um webhook real de teste (o Helio documenta event + transactionObject).
export function parseHelioWebhook(payload: unknown): HelioParsed {
  const p = (payload ?? {}) as Record<string, unknown>;
  const event = String(p.event ?? "").toUpperCase();
  const tx = (p.transactionObject ?? {}) as Record<string, unknown>;
  const meta = (p.meta ?? tx.meta ?? {}) as Record<string, unknown>;

  const eventId = String(tx.id ?? p.id ?? "");
  const userId = meta.userId ? String(meta.userId) : undefined;
  const plan = (meta.plan === "premium" ? "premium" : meta.plan === "pro" ? "pro" : undefined) as Plan | undefined;
  const period = (meta.period === "annual" ? "annual" : meta.period === "monthly" ? "monthly" : undefined) as Period | undefined;

  // STARTED (subscrição inicia) e RENEWED (renova) creditam; ENDED termina.
  const action: HelioParsed["action"] =
    event === "STARTED" || event === "RENEWED" ? "grant" : event === "ENDED" ? "end" : "ignore";

  return {
    action,
    eventId,
    userId,
    plan,
    period,
    chain: tx.chain ? String(tx.chain) : undefined,
    currency: tx.currency ? String(tx.currency) : undefined,
    amount: tx.amount != null ? Number(tx.amount) : undefined,
    txHash: tx.transactionSignature ? String(tx.transactionSignature) : null,
  };
}

// ── Criação de cobrança (checkout) ──────────────────────────────────────────
// Cada combinação plano×período tem um Pay Link criado no dashboard do Helio
// (com o preço em EURC já com desconto e o endereço de recebimento). Guardamos
// os IDs em env vars. O `meta` leva o user_id para o webhook identificar quem pagou.

export function helioPaylinkId(plan: Plan, period: Period): string {
  const key = `HELIO_PAYLINK_${plan.toUpperCase()}_${period.toUpperCase()}`;
  return process.env[key] ?? "";
}

export type CreateChargeResult = { ok: true; url: string } | { ok: false; error: string };

// Cria uma cobrança no Helio e devolve a URL de checkout hospedada.
export async function createHelioCharge(input: {
  plan: Plan;
  period: Period;
  userId: string;
  email?: string;
}): Promise<CreateChargeResult> {
  const secret = process.env.HELIO_API_KEY ?? "";
  const publicKey = process.env.HELIO_PUBLIC_KEY ?? "";
  const paylinkId = helioPaylinkId(input.plan, input.period);
  if (!secret || !publicKey || !paylinkId) return { ok: false, error: "Helio não configurado." };

  // Para onde o Helio reencaminha o utilizador após pagar (página de confirmação
  // com polling). O nome do campo é PROVISÓRIO — confirmar contra a API/Pay Link
  // real; em alternativa, definir a redirect URL no próprio Pay Link do dashboard.
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://chainfolioai.vercel.app").replace(/\/$/, "");
  const redirectUrl = `${siteUrl}/crypto/confirm`;

  try {
    const res = await fetch(`${HELIO_API_BASE}/charge/create?publicKey=${encodeURIComponent(publicKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify({
        paylinkId,
        customerDetails: input.email ? { email: input.email } : undefined,
        meta: { userId: input.userId, plan: input.plan, period: input.period },
        redirectUrl, // PROVISÓRIO — confirmar nome do campo (redirectUrl/successUrl).
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { ok: false, error: `Helio ${res.status}` };
    const data = (await res.json()) as Record<string, unknown>;
    // Campo da URL PROVISÓRIO — confirmar no retorno real (pageUrl/url/paymentUrl).
    const url = String(data.pageUrl ?? data.url ?? data.paymentUrl ?? "");
    if (!url) return { ok: false, error: "Sem URL de checkout na resposta." };
    return { ok: true, url };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro ao criar cobrança." };
  }
}
