import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Beacon interno de visualizacoes de pagina, chamado pelo middleware (Edge nao
// tem acesso fiavel ao service role; este handler corre em Node, onde funciona).
// Insere uma linha em page_views. Responde 204 normalmente; com ?debug=1
// devolve o erro da BD em JSON (diagnostico temporario).
export async function POST(req: NextRequest) {
  const debug = req.nextUrl.searchParams.get("debug") === "1";
  let dberr: unknown = null;
  try {
    const body = (await req.json().catch(() => ({}))) as { path?: unknown };
    const path = typeof body.path === "string" && body.path.startsWith("/") ? body.path : "/";
    const { error } = await getSupabaseAdmin().from("page_views").insert({ path });
    dberr = error;
  } catch (e) {
    dberr = e instanceof Error ? e.message : String(e);
  }
  if (debug) {
    return new Response(JSON.stringify({ ok: !dberr, error: dberr }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
  return new Response(null, { status: 204 });
}
