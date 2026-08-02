import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Beacon interno de visualizacoes de pagina, chamado pelo middleware (Edge nao
// tem acesso fiavel ao service role; este handler corre em Node, onde funciona).
// Insere uma linha em page_views. Responde sempre 204; nunca lanca.
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { path?: unknown };
    const path = typeof body.path === "string" && body.path.startsWith("/") ? body.path : "/";
    await getSupabaseAdmin().from("page_views").insert({ path });
  } catch {
    /* nunca deixar o tracking quebrar a navegacao */
  }
  return new Response(null, { status: 204 });
}
