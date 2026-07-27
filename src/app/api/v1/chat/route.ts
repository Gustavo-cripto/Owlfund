import { NextRequest } from "next/server";
import { authenticateApiKey } from "@/lib/api/auth";
import { getPortfolio } from "@/lib/api/data";
import { askAI } from "@/lib/api/ai";
import { apiJson } from "@/lib/api/response";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Teto diário por conta (para não estourar o free tier da Groq / evitar abuso).
const DAILY_CHAT_LIMIT = 50;

// POST /api/v1/chat  { "message": "…" }
// Assistente de IA que responde sobre o portefólio real do dono da chave.
export async function GET() {
  return apiJson({ error: "method_not_allowed", message: "Usa POST com { message }." }, { status: 405 });
}

export async function POST(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({})) as { message?: string };
  const message = (body.message ?? "").trim().slice(0, 1000);
  if (!message) return apiJson({ error: "missing_message", message: "Passa { message: \"…\" }." }, { status: 400 });

  const admin = getSupabaseAdmin();

  // Teto diário de mensagens de chat (contador de janela de 24h por conta).
  try {
    const { data, error } = await admin.rpc("api_rate_check", {
      p_key_hash: `${auth.userId}:chat`,
      p_limit: DAILY_CHAT_LIMIT,
      p_window_seconds: 86400,
    });
    if (!error && data === false) {
      const res = apiJson({ error: "chat_limit", message: `Limite diário de ${DAILY_CHAT_LIMIT} mensagens atingido. Tenta amanhã.` }, { status: 429 });
      res.headers.set("Retry-After", "86400");
      return res;
    }
  } catch { /* função ainda não migrada → deixa passar */ }

  const portfolio = await getPortfolio(auth.userId);

  const system = [
    "És o assistente de IA do ChainFolioAI, um analista pessoal de investimentos.",
    "Responde em linguagem natural, conciso, com base nos dados reais do portefólio do utilizador abaixo.",
    "Nunca dás ordens de compra ou venda — apresentas cenários, riscos e contexto.",
    "Se te faltarem dados, di-lo com franqueza.",
    "",
    `Dados do portefólio (JSON): ${JSON.stringify(portfolio)}`,
  ].join("\n");

  const reply = await askAI([
    { role: "system", content: system },
    { role: "user", content: message },
  ]);

  if (!reply) return apiJson({ error: "ai_unavailable", message: "Assistente de IA indisponível de momento." }, { status: 503 });
  return apiJson({ reply });
}
