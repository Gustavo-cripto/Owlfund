import { NextRequest } from "next/server";
import { z } from "zod";
import { authenticateApiKey } from "@/lib/api/auth";
import { responderPortefolio } from "@/lib/api/ai";
import { apiJson } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 60 s como os outros bots: a cadeia Groq (20 s) → Gemini (30 s) não cabia em
// 30 s e o cliente recebia o 504 da Vercel em vez do JSON documentado (api-01).
export const maxDuration = 60;
/** Folga antes do corte da Vercel para ainda responder 503 em JSON. */
const PRAZO_MS = 50_000;

// As mensagens de erro da API v1 são em inglês, com `error`/`code` estáveis.
const Corpo = z.object({ message: z.unknown() });
const Mensagem = z.string().trim().min(1).max(1000);

// POST /api/v1/chat  { "message": "…" }
// Assistente de IA que responde sobre o portefólio real do dono da chave.
export async function GET() {
  return apiJson({ error: "method_not_allowed", code: "method_not_allowed", message: "Use POST with { \"message\": \"…\" }." }, { status: 405 });
}

export async function POST(req: NextRequest) {
  const inicio = Date.now();
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return auth.response;

  // Corpo validado: `{"message":123}` ou corpo `null` davam um 500 genérico (api-09).
  const corpo = Corpo.safeParse(await req.json().catch(() => null));
  const bruto = corpo.success ? corpo.data.message : undefined;
  if (bruto == null || (typeof bruto === "string" && !bruto.trim())) {
    return apiJson({ error: "missing_message", code: "missing_message", message: "Send a JSON body { \"message\": \"…\" }." }, { status: 400 });
  }
  const mensagem = Mensagem.safeParse(bruto);
  if (!mensagem.success) {
    return apiJson({ error: "invalid_param", code: "invalid_param", message: "message must be a string of 1 to 1000 characters." }, { status: 400 });
  }

  const r = await responderPortefolio(auth.userId, mensagem.data, { prazo: inicio + PRAZO_MS });
  if (r.ok) return apiJson({ reply: r.reply });

  const res = apiJson({ error: r.code, code: r.code, message: r.message }, { status: r.status });
  if (r.retryAfter) res.headers.set("Retry-After", String(r.retryAfter));
  return res;
}
