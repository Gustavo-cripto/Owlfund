import { rateLimitPublic } from "@/lib/api/requireUser";
import { isBotUserAgent } from "@/lib/analytics/bots";
import { eEvento, PREFIXO_EVENTO } from "@/lib/analytics/eventos";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Beacon dos momentos do funil (ver src/lib/analytics/eventos.ts). Publico, por
// isso: so nomes da lista, 30 por 10 min por IP, e responde sempre 204.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (rateLimitPublic(req, "evento", 30, 10 * 60_000)) return new Response(null, { status: 204 });
  try {
    const body = (await req.json().catch(() => ({}))) as { e?: unknown };
    if (!eEvento(body.e)) return new Response(null, { status: 204 });
    const isBot = isBotUserAgent(req.headers.get("user-agent"));
    // Origem do primeiro toque (cookie cfa-src), para saber que canal traz quem usa a demo.
    const src = (/(?:^|;\s*)cfa-src=([A-Za-z0-9_-]{1,40})/.exec(req.headers.get("cookie") ?? "")?.[1]) ?? "";
    const admin = getSupabaseAdmin();
    const linha = { path: `${PREFIXO_EVENTO}${body.e}`, is_bot: isBot, ...(src ? { src } : {}) };
    const { error } = await admin.from("page_views").insert(linha);
    if (error && src) await admin.from("page_views").insert({ path: linha.path, is_bot: isBot });
  } catch { /* nunca falhar */ }
  return new Response(null, { status: 204 });
}
