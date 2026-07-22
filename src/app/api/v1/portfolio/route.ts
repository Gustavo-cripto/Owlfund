import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/v1/portfolio — último snapshot do portefólio do dono da chave.
export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return auth.response;

  const admin = getSupabaseAdmin();

  const [{ data: snaps }, { count }] = await Promise.all([
    admin
      .from("portfolio_snapshots")
      .select("created_at, data")
      .eq("user_id", auth.userId)
      .order("created_at", { ascending: false })
      .limit(1),
    admin
      .from("portfolio_snapshots")
      .select("id", { count: "exact", head: true })
      .eq("user_id", auth.userId),
  ]);

  const latest = snaps?.[0] ?? null;

  return NextResponse.json({
    updatedAt: latest?.created_at ?? null,
    snapshotCount: count ?? 0,
    portfolio: latest?.data ?? null,
  });
}
