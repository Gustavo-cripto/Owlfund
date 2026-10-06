import { rateLimitPublicPartilhado } from "@/lib/api/requireUser";
import { isBotUserAgent } from "@/lib/analytics/bots";
import { eEvento, PREFIXO_EVENTO } from "@/lib/analytics/eventos";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { eInterno } from "@/lib/analytics/interno";
import { limparOrigem, ORIGEM_PADRAO } from "@/lib/origem";
import { lerSelo, verificarSelo } from "@/lib/analytics/selo";

// Beacon dos momentos do funil (ver src/lib/analytics/eventos.ts). Publico, por
// isso: so nomes da lista, selo do middleware, 30 por 10 min por IP (partilhado
// entre instancias), e responde sempre 204.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (await rateLimitPublicPartilhado(req, "evento", 30, 10 * 60_000)) return new Response(null, { status: 204 });
  // Visitas internas (o dono, os agentes) não contam: src/lib/analytics/interno.ts
  if (eInterno(req.headers.get("cookie"))) return new Response(null, { status: 204 });
  // Selo do middleware (cookie cfa-ev assinado com TRACK_SECRET, ver
  // src/lib/analytics/selo.ts): prova que o beacon vem de um browser que
  // carregou uma página, não de um POST direto a inflacionar o funil. Sem
  // TRACK_SECRET definido não se exige (o mesmo compromisso do /api/track).
  const segredo = (process.env.TRACK_SECRET ?? "").trim();
  if (segredo && !(await verificarSelo(segredo, lerSelo(req.headers.get("cookie"))))) return new Response(null, { status: 204 });
  try {
    const body = (await req.json().catch(() => ({}))) as { e?: unknown };
    if (!eEvento(body.e)) return new Response(null, { status: 204 });
    const isBot = isBotUserAgent(req.headers.get("user-agent"));
    // Origem do primeiro toque (cookie cfa-src), para saber que canal traz quem usa a demo.
    const src = limparOrigem(new RegExp(`(?:^|;\\s*)cfa-src=(${ORIGEM_PADRAO})`).exec(req.headers.get("cookie") ?? "")?.[1] ?? "");
    const admin = getSupabaseAdmin();
    const linha = { path: `${PREFIXO_EVENTO}${body.e}`, is_bot: isBot, ...(src ? { src } : {}) };
    const { error } = await admin.from("page_views").insert(linha);
    if (error && src) await admin.from("page_views").insert({ path: linha.path, is_bot: isBot });
  } catch { /* nunca falhar */ }
  return new Response(null, { status: 204 });
}
