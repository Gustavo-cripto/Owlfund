import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { generateAiChat, friendlyAiError, errorStatus } from "@/lib/ai/groq";
import { mercadoAgoraTexto } from "@/lib/ai/mercadoAgora";
import { MAJORS_CHAIN, simbolosDaPergunta } from "@/lib/ai/mercadoSimbolos";
import { CHAIN_DAILY_LIMIT, FREE_AI_LIMIT } from "@/lib/plans";
import { quotaErrorResponse, releaseAiUsage, reserveAiUsage } from "@/lib/api/entitlement";
import { historicoSeguro } from "@/lib/ai/historicoSeguro";
import { limiteDiario, respostaLimiteDiario } from "@/lib/api/limiteDiario";
import { rateLimitPublic } from "@/lib/api/requireUser";
import { estimarTokens } from "@/lib/ai/orcamentoBlock";
import { linguaChain, mensagensChain, paginaPermitida } from "@/lib/ai/promptChain";

// Chain: o assistente do site, em todos os planos, só com sessão (o widget não
// aparece a visitantes). Desde a auditoria de 8 out 2026 usa a cadeia comum de
// fornecedores (Groq → Gemini → OpenAI → xAI, com limite de resposta e prazo),
// tem teto diário partilhado para Pro/Premium e nunca devolve erros crus.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

const MSG_DIARIO: Record<string, string> = {
  pt: "Atingiste o limite diário de mensagens do Chain. Volta a partir das 00:00 UTC.",
  en: "You've reached today's Chain message limit. It resets at 00:00 UTC.",
  es: "Has alcanzado el límite diario de mensajes de Chain. Se reinicia a las 00:00 UTC.",
  fr: "Vous avez atteint la limite quotidienne de messages Chain. Elle se réinitialise à 00:00 UTC.",
};

// Chamada a fornecedor de IA: pode demorar. O widget desiste aos 25 s, por isso
// a cadeia tem prazo de 22 s (a resposta chega sempre antes de o cliente sair).
export const maxDuration = 60;
const PRAZO_MS = 22_000;

export async function POST(request: Request) {
  const inicio = Date.now();
  const limitado = rateLimitPublic(request, "chat", 30);
  if (limitado) return limitado;

  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: { get: (name) => cookieStore.get(name)?.value, set: () => {}, remove: () => {} },
  });
  const { data: { user } } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
  // Visitantes não têm o Chain (o widget só aparece com sessão): sem conta, sem IA.
  if (!user) return NextResponse.json({ error: "Sessão necessária.", code: "unauthenticated" }, { status: 401 });

  // Corpo validado ANTES de reservar a quota (um corpo inválido não gasta nada).
  const body = (await request.json().catch(() => null)) as { messages?: unknown; pageContext?: unknown; nickname?: unknown; lang?: unknown } | null;
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Pedido inválido.", code: "bad_json" }, { status: 400 });
  const lingua = linguaChain(body.lang);
  const historico = historicoSeguro(body.messages, { max: 12, maxChars: 2500, maxTotal: 12_000 });
  if (!historico.length || historico[historico.length - 1].role !== "user") {
    return NextResponse.json({ error: "Sem pergunta.", code: "empty" }, { status: 400 });
  }

  const quota = await reserveAiUsage(user.id);
  if (!quota.ok) return quotaErrorResponse(quota);
  if (!quota.free) {
    // Pro/Premium: "ilimitado" com teto diário de uso razoável, contado na BD.
    const r = await limiteDiario(`chain:${user.id}`, CHAIN_DAILY_LIMIT);
    if (r === "excedido") return respostaLimiteDiario(MSG_DIARIO[lingua]);
    if (r === "indisponivel") return NextResponse.json({ error: friendlyAiError(503, lingua), code: "unavailable" }, { status: 503 });
  }

  try {
    const ultima = historico[historico.length - 1].content;
    const mercado = await mercadoAgoraTexto([...simbolosDaPergunta(ultima), ...MAJORS_CHAIN], {
      nota: "Preços da OKX (par USDT ≈ USD) lidos neste momento. Usa-os quando perguntarem por preços ou pelo mercado de hoje; dá primeiro o valor em euros (o site mostra euros) e o dólar ao lado. Não digas «Mercado Agora» ao utilizador (é o nome interno desta secção): diz «preços da OKX neste momento». Não há notícias aqui: não inventes causas para os movimentos.",
      eur: true,
    }).catch(() => null);
    const mensagens = mensagensChain({
      historico, mercado, lingua,
      pagina: paginaPermitida(body.pageContext),
      nome: typeof body.nickname === "string" ? body.nickname : undefined,
    });
    const reply = await generateAiChat(mensagens, {
      maxTokens: 700,
      temperature: 0.5,
      tokensEntrada: estimarTokens(mensagens.map((m) => m.content).join("\n")),
      prazo: inicio + PRAZO_MS,
    });
    return NextResponse.json({
      reply,
      usage: quota.free ? { count: quota.count, limit: FREE_AI_LIMIT } : undefined,
    });
  } catch (e) {
    // A IA não respondeu: a mensagem reservada do Gratuito é devolvida.
    if (quota.free) await releaseAiUsage(user.id).catch(() => {});
    const status = errorStatus(e);
    console.error("[chat] IA indisponível:", status ?? (e instanceof Error ? e.message : e));
    return NextResponse.json(
      { error: friendlyAiError(status, lingua), code: status === 429 ? "ai_rate_limited" : status === 504 ? "timeout" : "provider_error" },
      { status: status === 429 ? 429 : 503 },
    );
  }
}
