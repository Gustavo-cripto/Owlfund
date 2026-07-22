import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/v1/wallets — carteiras e endereços ligados à conta do dono da chave.
export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return auth.response;

  const admin = getSupabaseAdmin();

  const { data } = await admin
    .from("wallet_config")
    .select("data, updated_at")
    .eq("user_id", auth.userId)
    .maybeSingle();

  return NextResponse.json({
    updatedAt: data?.updated_at ?? null,
    wallets: data?.data ?? null,
  });
}
