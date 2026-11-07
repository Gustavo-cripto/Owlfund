import { NextResponse } from "next/server";
import { segredoCerto, validarBatimento } from "@/lib/bots/vigiaMac";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Último batimento do vigia do Mac dos bots: uma linha só (id=1) em bots_status.
// Enquanto BOTS_HEARTBEAT_SECRET não estiver na Vercel a rota responde 404, como
// antes de existir. O upsert não toca em ultimo_aviso (ver lib/bots/vigiaMac.ts).
const SEM_CACHE = { "Cache-Control": "no-store" };
const MAX_BYTES = 8_192;

export async function POST(req: Request) {
  const segredo = (process.env.BOTS_HEARTBEAT_SECRET ?? "").trim();
  if (!segredo) return NextResponse.json({ ok: false }, { status: 404, headers: SEM_CACHE });
  if (!segredoCerto(req.headers.get("x-bots-secret"), segredo)) {
    return NextResponse.json({ ok: false }, { status: 401, headers: SEM_CACHE });
  }

  const texto = await req.text().catch(() => "");
  if (texto.length > MAX_BYTES) return NextResponse.json({ ok: false, reason: "tamanho" }, { status: 413, headers: SEM_CACHE });
  let corpo: unknown = null;
  try { corpo = JSON.parse(texto); } catch { /* validarBatimento recusa */ }
  const payload = validarBatimento(corpo);
  if (!payload) return NextResponse.json({ ok: false, reason: "body" }, { status: 400, headers: SEM_CACHE });

  const { error } = await getSupabaseAdmin()
    .from("bots_status")
    .upsert({ id: 1, payload, received_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) {
    console.error("[bots/heartbeat]", error.code ?? error.message);
    return NextResponse.json({ ok: false }, { status: 503, headers: SEM_CACHE });
  }
  return NextResponse.json({ ok: true }, { headers: SEM_CACHE });
}
