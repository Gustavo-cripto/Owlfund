// Interruptor "Emails do produto" em Conta → Notificacoes. Le e escreve a
// MESMA tabela (email_optout) que o cancelamento por link, para haver uma
// unica verdade que o cron respeita. Com sessao; a tabela e so-service-role.
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/requireUser";
import { apiMsg } from "@/lib/api/apiMessages";
import { isOptedOut, setOptout } from "@/lib/emailOptout";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireUser(req, { route: "email-optout", limit: 30 });
  if (!auth.ok) return auth.response;
  try {
    const optout = await isOptedOut(getSupabaseAdmin(), auth.userId);
    return NextResponse.json({ optout }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[email/optout]", e instanceof Error ? e.message : e);
    return NextResponse.json({ optout: false }, { headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(req: Request) {
  const auth = await requireUser(req, { route: "email-optout", limit: 30 });
  if (!auth.ok) return auth.response;
  let optout: unknown;
  try { optout = ((await req.json()) as { optout?: unknown })?.optout; } catch { /* corpo vazio */ }
  if (typeof optout !== "boolean") return NextResponse.json({ error: apiMsg(req, "invalid_body") }, { status: 400 });
  let ok = false;
  try { ok = await setOptout(getSupabaseAdmin(), auth.userId, optout); } catch (e) { console.error("[email/optout]", e instanceof Error ? e.message : e); }
  if (!ok) return NextResponse.json({ error: apiMsg(req, "server_unconfigured") }, { status: 503 });
  return NextResponse.json({ optout });
}
