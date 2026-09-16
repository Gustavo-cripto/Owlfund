import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/api/cron-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { dedupeSnapshots } from "@/lib/snapshots/dedupe";

// Limpeza de snapshots repetidos (ver src/lib/snapshots/dedupe.ts).
// GET ?apply=0 (omissao) so conta; ?apply=1 apaga. Com o CRON_SECRET.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!(await verifyCronAuth(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const apply = searchParams.get("apply") === "1";
  try {
    const r = await dedupeSnapshots(getSupabaseAdmin(), { apply });
    // Sem ids de utilizador na resposta: so contagens.
    const users = Object.values(r.byUser);
    return NextResponse.json({ ok: true, apply, scanned: r.scanned, toDelete: r.toDelete, deleted: r.deleted, users: users.length, topUsers: users.sort((a, b) => b.toDelete - a.toDelete).slice(0, 5) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}
