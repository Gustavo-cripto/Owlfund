import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Segmentos de topo que sao paginas REAIS do site. So estes (e a raiz "/") sao
// contados como visualizacoes - assim 404s de bots (/spam-test, /wp-admin, ...)
// e spam direto a este endpoint nao inflam as estatisticas.
// MANUTENCAO: ao adicionar uma pagina nova ao site, junta o seu segmento aqui.
const ALLOWED = new Set([
  "account", "como-funciona", "crypto", "dashboard", "developers", "fire",
  "fiscalidade", "gestor", "historico", "login", "mercado", "portfolio",
  "pricing", "privacidade", "reset-password", "smart-money", "termos", "wallets",
]);

function isRealPage(path: string): boolean {
  if (!path.startsWith("/")) return false;
  if (path === "/") return true;
  const seg = path.split("/")[1]?.toLowerCase() ?? "";
  return ALLOWED.has(seg);
}

// Beacon interno de visualizacoes de pagina, chamado pelo middleware (Edge nao
// tem acesso fiavel ao service role; este handler corre em Node, onde funciona).
// Insere uma linha em page_views so para paginas reais. Responde sempre 204.
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { path?: unknown };
    const path = typeof body.path === "string" ? body.path : "";
    if (isRealPage(path)) {
      await getSupabaseAdmin().from("page_views").insert({ path });
    }
  } catch {
    /* nunca deixar o tracking quebrar a navegacao */
  }
  return new Response(null, { status: 204 });
}
