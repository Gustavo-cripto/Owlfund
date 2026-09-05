import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSessionUser, isUserPremium } from "@/lib/api/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHAINS = new Set(["eth", "btc", "sol"]);
const ADDRESS_RE = /^[a-zA-Z0-9]{10,120}$/;

type Entry = { address: string; chain: string; label: string };

// POST — substitui a watchlist do utilizador no servidor (para o cron de
// webhooks a poder varrer com o browser fechado). Corpo: array de
// { address, chain, label }.
export async function POST(req: NextRequest) {
  const { supabase, user } = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!(await isUserPremium(supabase, user.id))) return NextResponse.json({ error: "Requer Premium." }, { status: 403 });

  const body = await req.json().catch(() => null) as { watchlist?: unknown } | null;
  const raw = Array.isArray(body?.watchlist) ? body!.watchlist : [];

  const clean: Entry[] = [];
  for (const item of raw.slice(0, 50)) {
    const e = item as { address?: unknown; chain?: unknown; label?: unknown };
    const address = typeof e.address === "string" ? e.address.trim() : "";
    const chain = typeof e.chain === "string" ? e.chain.toLowerCase() : "";
    if (!ADDRESS_RE.test(address) || !CHAINS.has(chain)) continue;
    clean.push({ address, chain, label: typeof e.label === "string" ? e.label.slice(0, 64) : "" });
  }

  const admin = getSupabaseAdmin();
  // Substituição total — mas só apagamos DEPOIS de o insert ter sucesso, para
  // uma falha a meio não deixar o utilizador sem watchlist no servidor.
  if (clean.length) {
    const { error } = await admin.from("smart_money_watchlist").insert(
      clean.map((e) => ({ user_id: user.id, address: e.address, chain: e.chain, label: e.label })),
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // remover as antigas que não estão na lista nova
    const keep = new Set(clean.map((e) => `${e.chain}:${e.address.toLowerCase()}`));
    const { data: rows } = await admin.from("smart_money_watchlist").select("id, address, chain").eq("user_id", user.id);
    const stale = (rows ?? []).filter((r) => !keep.has(`${r.chain}:${String(r.address).toLowerCase()}`)).map((r) => r.id);
    if (stale.length) await admin.from("smart_money_watchlist").delete().in("id", stale);
    // duplicados criados pelo insert (mesma chain+address) → manter só 1
    const { data: all } = await admin.from("smart_money_watchlist").select("id, address, chain").eq("user_id", user.id).order("id", { ascending: true });
    const seen = new Set<string>(); const dupes: number[] = [];
    for (const r of all ?? []) { const k = `${r.chain}:${String(r.address).toLowerCase()}`; if (seen.has(k)) dupes.push(r.id as number); else seen.add(k); }
    if (dupes.length) await admin.from("smart_money_watchlist").delete().in("id", dupes);
  } else {
    await admin.from("smart_money_watchlist").delete().eq("user_id", user.id);
  }

  return NextResponse.json({ ok: true, synced: clean.length });
}

// GET — devolve a watchlist guardada no servidor (reidratar noutro dispositivo).
export async function GET() {
  const { supabase, user } = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!(await isUserPremium(supabase, user.id))) return NextResponse.json({ watchlist: [] });
  const admin = getSupabaseAdmin();
  const { data } = await admin.from("smart_money_watchlist").select("address, chain, label").eq("user_id", user.id);
  return NextResponse.json({ watchlist: data ?? [] });
}
