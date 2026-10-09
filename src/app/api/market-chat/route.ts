import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { generateAiChat, friendlyAiError, errorStatus, hasAnyAiProvider, type ChatMessage } from "@/lib/ai/groq";
import { estimarTokens } from "@/lib/ai/orcamentoBlock";
import { rateLimit, clientIp } from "@/lib/utils/rateLimit";
import { getPlanOrNull, planUnavailableResponse, requiresPlanResponse } from "@/lib/api/entitlement";
import { apiLang, apiMsg } from "@/lib/api/apiMessages";
import { limiteDiario, respostaLimiteDiario } from "@/lib/api/limiteDiario";
import { MARKET_CHAT_DAILY_LIMIT } from "@/lib/plans";
import { generateMarketBriefing } from "@/lib/ai/briefingMercado";
import { mercadoAgoraTexto } from "@/lib/ai/mercadoAgora";
import { MAJORS_CHAIN, simbolosDaPergunta } from "@/lib/ai/mercadoSimbolos";
import { historicoMercado, langMercado, modoMercado, promptChatMercado } from "@/lib/ai/promptsMercado";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

async function getAuthUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: { get: (name) => cookieStore.get(name)?.value, set: () => {}, remove: () => {} },
  });
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

// Chamada a fornecedor de IA: pode demorar. Sem isto a funcao usa o tempo por
// omissao da plataforma e corta a meio uma resposta que ia chegar.
export const maxDuration = 60;

// Só mensagens (o briefing já não vem do browser): 8 × 2500 caracteres chegam.
const MAX_CORPO = 32 * 1024;

export async function POST(request: Request) {
  const inicio = Date.now();
  const erro = (status: number, code: Parameters<typeof apiMsg>[1], extra?: string) =>
    NextResponse.json({ error: apiMsg(request, code), code: extra ?? code }, { status });

  // Rate limit por IP (trava abuso/custo de IA)
  if (!rateLimit(`market-chat:${clientIp(request)}`, 20, 60_000)) return erro(429, "rate_limited");

  // Exigir sessão — a página /mercado já exige login (useRequireAuth)
  const user = await getAuthUser();
  if (!user) return erro(401, "not_authenticated");

  // O chat sobre o briefing é Pro/Premium (a UI já o esconde; o servidor decide).
  const plan = await getPlanOrNull(user.id);
  if (!plan) return planUnavailableResponse();
  if (plan === "free") return requiresPlanResponse("pro");
  if (!rateLimit(`market-chat:u:${user.id}`, 15, 60_000)) return erro(429, "rate_limited");

  if (!hasAnyAiProvider()) return erro(503, "ai_unconfigured");

  const declarado = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declarado) && declarado > MAX_CORPO) return erro(413, "invalid_body", "body_too_large");
  const bruto = await request.text();
  if (bruto.length > MAX_CORPO) return erro(413, "invalid_body", "body_too_large");

  let body: { mode?: unknown; messages?: unknown; nickname?: unknown; lang?: unknown };
  try {
    body = JSON.parse(bruto) as typeof body;
  } catch {
    return erro(400, "invalid_body");
  }
  if (!body || typeof body !== "object") return erro(400, "invalid_body");

  // Modo e língua de listas fechadas: são a chave da cache do briefing.
  const mode = modoMercado(body.mode);
  if (!mode) return erro(400, "invalid_body", "invalid_mode");
  const lang = langMercado(body.lang) ?? apiLang(request);
  // Só user/assistant, texto, as últimas 8 (o papel "system" do cliente é descartado).
  const historico = historicoMercado(body.messages);
  const ultima = historico[historico.length - 1];
  if (!ultima || ultima.role !== "user") return erro(400, "invalid_body");

  // Teto diário partilhado entre instâncias (o rateLimit acima vive em memória).
  const limite = await limiteDiario(`market-chat:${user.id}`, MARKET_CHAT_DAILY_LIMIT);
  if (limite === "excedido") return respostaLimiteDiario(apiMsg(request, "market_chat_daily_limit"));
  if (limite === "indisponivel") return erro(503, "daily_limit_unavailable");

  try {
    // O briefing vem da cache do servidor (o mesmo texto que a página mostra),
    // nunca do browser; e entra no prompt como dados, não como instrução.
    const [briefing, mercado] = await Promise.all([
      generateMarketBriefing(mode, lang),
      mercadoAgoraTexto([...simbolosDaPergunta(ultima.content), ...MAJORS_CHAIN], {
        eur: true,
        nota: "Preços da OKX (par USDT ≈ USD) lidos neste momento. Usa-os quando perguntarem por preços ou pelo mercado de hoje; dá primeiro o valor em euros (o site mostra euros) e o dólar ao lado. Não há notícias aqui: não inventes causas para os movimentos.",
      }).catch(() => null),
    ]);
    const systemPrompt = promptChatMercado({
      modo: mode,
      lang,
      briefing: briefing.content,
      mercado,
      nickname: typeof body.nickname === "string" ? body.nickname : "",
    });
    const chatMessages: ChatMessage[] = [{ role: "system", content: systemPrompt }, ...historico];
    const tokensEntrada = estimarTokens(chatMessages.map((m) => m.content).join("\n"));
    const reply = await generateAiChat(chatMessages, {
      maxTokens: 600,
      temperature: 0.4,
      tokensEntrada,
      prazo: inicio + 55_000,
    });
    if (!reply) return erro(502, "ai_failed");
    return NextResponse.json({ reply });
  } catch (err) {
    const status = errorStatus(err);
    return NextResponse.json(
      { error: friendlyAiError(status, lang), code: "ai_failed" },
      { status: status === 429 ? 429 : 502 },
    );
  }
}
