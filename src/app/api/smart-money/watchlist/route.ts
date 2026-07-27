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
  // Substituição total: apaga as atuais e insere as novas.
  await admin.from("smart_money_watchlist").delete().eq("user_id", user.id);
  if (clean.length) {
    await admin.from("smart_money_watchlist").insert(
      clean.map((e) => ({ user_id: user.id, address: e.address, chain: e.chain, label: e.label })),
    );
  }

  return NextResponse.json({ ok: true, synced: clean.length });
}
