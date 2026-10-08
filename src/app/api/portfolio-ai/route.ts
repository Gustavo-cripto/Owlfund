import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { generateAiChat, friendlyAiError, errorStatus } from "@/lib/ai/groq";
import { rateLimit, clientIp } from "@/lib/utils/rateLimit";
import { getPlanOrNull } from "@/lib/api/entitlement";
import { historicoParaIa } from "@/lib/ai/historicoPortefolio";
import { mercadoAgoraTexto } from "@/lib/ai/mercadoAgora";
import { historicoSeguro } from "@/lib/ai/historicoSeguro";
import { cortarHistorico, estimarTokens } from "@/lib/ai/orcamentoBlock";
import { limiteDiario, respostaLimiteDiario } from "@/lib/api/limiteDiario";
import { PORTFOLIO_AI_DAILY_LIMIT } from "@/lib/plans";
import { MAX_PERGUNTA, buildSystemPrompt, contextoValido, simbolosDoContexto } from "@/lib/ai/promptPortefolio";

// Assistente IA do Portefólio (Pro e Premium; o Gratuito tem o Chain).
// Auditoria de 8 out 2026: corpo validado antes de tudo, plano lido sem mexer na
// quota mensal do Gratuito, teto diário partilhado, uma só fonte por período
// (24h/7d/30d vêm da página; o histórico dá o resto), prazo na cadeia de IA e
// erros sempre na língua do utilizador e com código.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

type Lingua = "pt" | "en" | "es" | "fr";
const lingua = (v: unknown): Lingua => (v === "en" || v === "es" || v === "fr" ? v : "pt");

const MSG: Record<Lingua, Record<"auth" | "rate" | "bad" | "plan" | "daily", string>> = {
  pt: { auth: "Sessão necessária.", rate: "Demasiados pedidos. Tenta novamente dentro de 1 minuto.", bad: "Pedido inválido.", plan: "O Assistente IA do Portefólio faz parte do plano Pro. No plano Gratuito tens o Chain.", daily: "Atingiste o limite diário do Assistente IA do Portefólio. Volta a partir das 00:00 UTC." },
  en: { auth: "Sign-in required.", rate: "Too many requests. Please try again in a minute.", bad: "Invalid request.", plan: "The Portfolio AI Assistant is part of the Pro plan. On the Free plan you have Chain.", daily: "You've reached today's Portfolio AI Assistant limit. It resets at 00:00 UTC." },
  es: { auth: "Necesitas iniciar sesión.", rate: "Demasiadas solicitudes. Inténtalo de nuevo en 1 minuto.", bad: "Solicitud no válida.", plan: "El Asistente IA de la Cartera forma parte del plan Pro. En el plan Gratuito tienes Chain.", daily: "Has alcanzado el límite diario del Asistente IA de la Cartera. Se reinicia a las 00:00 UTC." },
  fr: { auth: "Connexion requise.", rate: "Trop de requêtes. Réessayez dans une minute.", bad: "Requête invalide.", plan: "L'Assistant IA du Portefeuille fait partie du plan Pro. Avec le plan Gratuit, vous avez Chain.", daily: "Vous avez atteint la limite quotidienne de l'Assistant IA du Portefeuille. Elle se réinitialise à 00:00 UTC." },
};

const erro = (mensagem: string, code: string, status: number) => NextResponse.json({ error: mensagem, code }, { status });

// O cliente desiste aos 30 s; a cadeia tem prazo de 25 s.
export const maxDuration = 60;
const PRAZO_MS = 25_000;

export async function POST(request: Request) {
  const inicio = Date.now();
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const lang = lingua(body?.lang);
  const m = MSG[lang];

  if (!rateLimit(`portfolio-ai:${clientIp(request)}`, 20, 60_000)) return erro(m.rate, "rate_limited", 429);

  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: { get: (name) => cookieStore.get(name)?.value, set: () => {}, remove: () => {} },
  });
  const { data: { user } } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
  if (!user) return erro(m.auth, "unauthenticated", 401);
  if (!rateLimit(`portfolio-ai:u:${user.id}`, 10, 60_000)) return erro(m.rate, "rate_limited", 429);

  // Corpo validado antes do plano e da quota: um pedido inválido não gasta nada.
  if (!body || typeof body !== "object") return erro(m.bad, "bad_json", 400);
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question || question.length > MAX_PERGUNTA) return erro(m.bad, "bad_question", 400);
  const context = contextoValido(body.context);
  if (!context) return erro(m.bad, "bad_context", 400);

  // Só Pro e Premium. O plano lê-se sem reservar nada na quota mensal do Gratuito.
  const plan = await getPlanOrNull(user.id);
  if (!plan) return erro(friendlyAiError(503, lang), "unavailable", 503);
  if (plan === "free") return NextResponse.json({ error: m.plan, code: "plan_required", plan: "free" }, { status: 403 });
  const r = await limiteDiario(`portfolio-ai:${user.id}`, PORTFOLIO_AI_DAILY_LIMIT);
  if (r === "excedido") return respostaLimiteDiario(m.daily);
  if (r === "indisponivel") return erro(friendlyAiError(503, lang), "unavailable", 503);

  const accountId = typeof body.accountId === "string" ? body.accountId.trim().slice(0, 80) : "";
  const nickname = typeof body.nickname === "string" ? body.nickname : "";
  const anteriores = historicoSeguro(body.history, { max: 8, maxChars: 2500, maxTotal: 12_000 });

  try {
    const [historico, mercado] = await Promise.all([
      historicoParaIa({
        userId: user.id, plan, accountId, totalAtual: context.totalEur,
        // 24h/7d/30d e as métricas já vêm da página (o que o utilizador vê): uma só fonte por janela.
        omitirPeriodos: ["24h", "7d", "30d"],
        semMetricas: true,
      }),
      mercadoAgoraTexto(simbolosDoContexto(context), {
        eur: true,
        nota: "Preços da OKX (par USDT ≈ USD) lidos neste momento, com a variação 24 h. Para 'porque caiu/subiu hoje', cruza estas variações com o peso de cada ativo. Não há notícias aqui: não inventes causas.",
      }).catch(() => null),
    ]);
    const system = buildSystemPrompt(context, nickname, historico, mercado);
    // A conversa cabe no orçamento: a pergunta entra sempre; as anteriores, das mais recentes para trás.
    const conversa = cortarHistorico([...anteriores, { role: "user" as const, content: question }], 9_000);
    const mensagens = [{ role: "system" as const, content: system }, ...conversa];
    const reply = await generateAiChat(mensagens, {
      maxTokens: 1000,
      temperature: 0.4,
      tokensEntrada: estimarTokens(mensagens.map((x) => x.content).join("\n")),
      prazo: inicio + PRAZO_MS,
    });
    return NextResponse.json({ reply });
  } catch (e) {
    const status = errorStatus(e);
    // Log interno; nunca expor detalhes do erro ao cliente.
    console.error("[portfolio-ai] IA indisponível:", status ?? (e instanceof Error ? e.message : e));
    return erro(friendlyAiError(status, lang), status === 429 ? "ai_rate_limited" : status === 504 ? "timeout" : "provider_error", status === 429 ? 429 : 503);
  }
}
