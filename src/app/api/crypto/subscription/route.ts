import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/api/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { CRYPTO_PAYMENTS_ENABLED } from "@/lib/payments/config";

// Detalhes da subscrição paga em cripto do utilizador autenticado, para a /account.
// A tabela `crypto_payments` tem RLS só-service-role, por isso a leitura da rede/
// tx_hash tem de ser feita aqui (admin), nunca pelo cliente. Gated pela feature flag.
// Devolve { crypto: null } quando não há subscrição cripto (ou a migração SQL ainda
// não foi aplicada) — nunca 500, para não partir a página de conta.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!CRYPTO_PAYMENTS_ENABLED) return NextResponse.json({ crypto: null });

  const { user } = await getSessionUser();
  if (!user) return NextResponse.json({ crypto: null });

  try {
    const admin = getSupabaseAdmin();

    // Linha da subscrição (source + validade). Uma linha por user_id.
    const { data: sub } = await admin
      .from("subscriptions")
      .select("status, source, current_period_end, price_id")
      .eq("user_id", user.id)
      .eq("source", "crypto")
      .maybeSingle();
    if (!sub) return NextResponse.json({ crypto: null });

    // Último pagamento confirmado → rede, moeda, tx_hash para mostrar/linkar.
    const { data: pay } = await admin
      .from("crypto_payments")
      .select("chain, currency, amount, tx_hash, plan, period, provider, confirmed_at")
      .eq("user_id", user.id)
      .eq("status", "confirmed")
      .order("confirmed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({
      crypto: {
        status: sub.status,
        currentPeriodEnd: sub.current_period_end,
        chain: pay?.chain || null,
        currency: pay?.currency || null,
        amount: pay?.amount ?? null,
        txHash: pay?.tx_hash || null,
        plan: pay?.plan || null,
        period: pay?.period || null,
        provider: pay?.provider || "helio",
        lastPaymentAt: pay?.confirmed_at || null,
      },
    });
  } catch {
    // Migração ainda não aplicada, ou coluna `source` inexistente → sem cripto.
    return NextResponse.json({ crypto: null });
  }
}
