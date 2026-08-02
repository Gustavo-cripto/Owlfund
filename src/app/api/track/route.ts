import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Teto diário de page views aceites por IP. Existe porque este beacon escreve
// com o service role (ignora RLS): sem limite, qualquer pessoa podia enviar
// pedidos em ciclo e inflacionar as estatísticas / encher a tabela. Alto o
// suficiente para navegação normal (mesmo atrás de NAT partilhado).
const MAX_VIEWS_PER_IP_PER_DAY = 500;

// Comparação em tempo constante (não vaza o segredo pela duração).
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Só o middleware deve chamar este endpoint. Quando TRACK_SECRET está definido
// exigimos o cabeçalho — pedidos externos são recusados. Sem a env var definida
// não bloqueamos (senão o tracking deixava de funcionar em silêncio até alguém
// a configurar); nesse caso o limite por IP abaixo é a única defesa.
function isInternalCall(req: NextRequest): boolean {
  const secret = (process.env.TRACK_SECRET ?? "").trim();
  if (!secret) return true;
  const got = (req.headers.get("x-track-secret") ?? "").trim();
  return got.length > 0 && timingSafeEqual(got, secret);
}

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
    if (!isInternalCall(req)) return new Response(null, { status: 204 });

    const body = (await req.json().catch(() => ({}))) as { path?: unknown };
    const path = typeof body.path === "string" ? body.path : "";
    if (!isRealPage(path)) return new Response(null, { status: 204 });

    const admin = getSupabaseAdmin();

    // Teto diário por IP (janela de 24h persistida na BD — ao contrário de um
    // contador em memória, resiste ao arranque de novas instâncias serverless).
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const ipHash = createHash("sha256").update(`track:${ip}`).digest("hex").slice(0, 32);
    try {
      const { data, error } = await admin.rpc("api_rate_check", {
        p_key_hash: ipHash,
        p_limit: MAX_VIEWS_PER_IP_PER_DAY,
        p_window_seconds: 86400,
      });
      if (!error && data === false) return new Response(null, { status: 204 });
    } catch { /* função ainda não migrada → não perder tracking legítimo */ }

    await admin.from("page_views").insert({ path });
  } catch {
    /* nunca deixar o tracking quebrar a navegacao */
  }
  return new Response(null, { status: 204 });
}
