import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { verifyCronAuth } from "@/lib/api/cron-auth";

// Vercel Cron Job — expira acessos pagos em cripto cujo período terminou.
// Configurado em vercel.json. CRON_SECRET obrigatório nas env vars da Vercel.
// Só toca em linhas source='crypto' (as do Stripe são geridas pelos webhooks).
//
// Nota: cripto não tem débito automático em todas as redes (ex.: BTC). Este cron
// é a rede de segurança que devolve o utilizador ao plano Free quando o período
// pago expira. Recorrência (ETH/SOL via processador) reentra por webhook.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!(await verifyCronAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const nowIso = new Date().toISOString();

  const { data, error } = await admin
    .from("subscriptions")
    .update({ status: "canceled" })
    .eq("source", "crypto")
    .eq("status", "active")
    .lt("current_period_end", nowIso)
    .select("user_id");

  if (error) {
    console.error("[cron/crypto-expiry]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ expired: data?.length ?? 0, at: nowIso });
}
