import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/api/session";
import { CRYPTO_PAYMENTS_ENABLED } from "@/lib/payments/config";
import { createHelioCharge } from "@/lib/payments/helio";

// Cria uma cobrança cripto (Helio) e devolve a URL de checkout hospedada.
// Gated pela feature flag — enquanto desligada, responde 404.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!CRYPTO_PAYMENTS_ENABLED) {
    return NextResponse.json({ error: "Pagamentos cripto desativados." }, { status: 404 });
  }

  const { user } = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  let body: { plan?: string; period?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const plan = body.plan === "premium" ? "premium" : body.plan === "pro" ? "pro" : null;
  const period = body.period === "annual" ? "annual" : body.period === "monthly" ? "monthly" : null;
  if (!plan || !period) {
    return NextResponse.json({ error: "Plano ou período inválido." }, { status: 400 });
  }

  const result = await createHelioCharge({
    plan,
    period,
    userId: user.id,
    email: user.email ?? undefined,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 503 });

  return NextResponse.json({ url: result.url });
}
