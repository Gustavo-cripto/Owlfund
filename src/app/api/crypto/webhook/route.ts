import { NextResponse } from "next/server";
import { CRYPTO_PAYMENTS_ENABLED } from "@/lib/payments/config";
import { verifyHelioWebhook, parseHelioWebhook } from "@/lib/payments/helio";
import { grantCryptoEntitlement } from "@/lib/payments/entitlements";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Webhook do Helio: confirma assinatura (Bearer + HMAC), credita/renova ou termina
// o acesso. Idempotente (grantCryptoEntitlement usa o id do evento). Gated pela flag.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!CRYPTO_PAYMENTS_ENABLED) {
    return NextResponse.json({ error: "disabled" }, { status: 404 });
  }

  const rawBody = await request.text();
  if (!verifyHelioWebhook(rawBody, request.headers)) {
    return NextResponse.json({ error: "Assinatura inválida." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const ev = parseHelioWebhook(payload);
  if (ev.action === "ignore") {
    return NextResponse.json({ received: true, ignored: true });
  }
  if (!ev.eventId || !ev.userId || !ev.plan || !ev.period) {
    return NextResponse.json({ error: "Payload incompleto." }, { status: 400 });
  }

  // Fim de subscrição → volta ao Free.
  if (ev.action === "end") {
    const admin = getSupabaseAdmin();
    await admin
      .from("subscriptions")
      .update({ status: "canceled" })
      .eq("user_id", ev.userId)
      .eq("source", "crypto");
    return NextResponse.json({ received: true, ended: true });
  }

  // Início/renovação → credita (idempotente).
  const res = await grantCryptoEntitlement({
    userId: ev.userId,
    plan: ev.plan,
    period: ev.period,
    provider: "helio",
    providerEventId: ev.eventId,
    chain: ev.chain,
    currency: ev.currency,
    amount: ev.amount,
    txHash: ev.txHash,
  });

  // 200 mesmo em duplicado (reason='duplicate') para o Helio não reenviar em loop.
  return NextResponse.json({ received: true, granted: res.granted, reason: res.reason });
}
