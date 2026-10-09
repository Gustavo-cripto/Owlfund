// Assistente de IA da API pública: UMA função para /api/v1/chat e para a
// ferramenta MCP ask_ai (antes cada rota tinha a sua cópia da quota, da
// recolha de dados e do prompt, e já divergiam — auditoria api-08, out 2026).
//
// Faz, por esta ordem: teto diário partilhado (falha fechado), dados do
// portefólio + PNL do mesmo portefólio + mercado ao vivo, prompt único
// (src/lib/api/promptPortefolio.ts) e a cadeia de fornecedores com prazo.
// Se não houver resposta, a mensagem é devolvida ao contador.
import { generateAiChat } from "@/lib/ai/groq";
import { mercadoAgoraTexto } from "@/lib/ai/mercadoAgora";
import { simbolosDaPergunta } from "@/lib/ai/mercadoSimbolos";
import { getPortfolio } from "@/lib/api/data";
import { getPnl } from "@/lib/api/insights";
import { limiteDiario, segundosAteMeiaNoiteUtc } from "@/lib/api/limiteDiario";
import { contaDoRegisto, montarPromptPortefolio, simbolosDoPortefolio } from "@/lib/api/promptPortefolio";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { API_CHAT_PER_DAY } from "@/lib/plans";

/** Tokens de saída: o 1.º modelo do Groq raciocina e 500 cortava respostas a meio (api-02). */
const MAX_TOKENS = 900;
const MERCADO_TIMEOUT_MS = 6000;
const DIA_S = 86_400;

export type RespostaPortefolio =
  | { ok: true; reply: string }
  | { ok: false; status: 429 | 503; code: "chat_limit" | "service_unavailable" | "ai_unavailable"; message: string; retryAfter?: number };

const chaveDoChat = (userId: string) => `${userId}:chat`;

/** Início da janela diária do api_rate_check (meia-noite UTC), como o SQL a calcula. */
function inicioDaJanelaUtc(agora = Date.now()): string {
  return new Date(Math.floor(agora / 1000 / DIA_S) * DIA_S * 1000).toISOString();
}

/**
 * Devolve 1 mensagem ao contador diário quando a IA não chegou a responder.
 * Compare-and-set (só desce se ninguém mexeu entretanto), para nunca apagar a
 * contagem de um pedido em paralelo. Melhor esforço: nunca lança.
 */
async function devolverMensagem(userId: string, janela: string): Promise<boolean> {
  try {
    const admin = getSupabaseAdmin();
    for (let i = 0; i < 3; i++) {
      const { data, error } = await admin
        .from("api_rate_limits").select("count")
        .eq("key_hash", chaveDoChat(userId)).eq("window_start", janela).maybeSingle();
      const atual = Number((data as { count?: unknown } | null)?.count);
      if (error || !(atual > 0)) return false;
      const { data: feito, error: e2 } = await admin
        .from("api_rate_limits").update({ count: atual - 1 })
        .eq("key_hash", chaveDoChat(userId)).eq("window_start", janela).eq("count", atual)
        .select("count");
      if (e2) return false;
      if (Array.isArray(feito) && feito.length > 0) return true;
    }
  } catch (e) {
    console.error("[api/ai] devolução da mensagem falhou:", e instanceof Error ? e.message : e);
  }
  return false;
}

/** Nome do portefólio e quantos há na conta (só o registo do blob, não o blob todo). */
async function contaDoUtilizador(userId: string, accountId: string | null) {
  const { data, error } = await getSupabaseAdmin()
    .from("wallet_config").select("registry:data->registry").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  return contaDoRegisto((data as { registry?: unknown } | null)?.registry, accountId);
}

function comTimeout<T>(p: Promise<T>, ms: number, seFalhar: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<T>((r) => { timer = setTimeout(() => r(seFalhar), ms); });
  return Promise.race([p.catch(() => seFalhar), limite]).finally(() => clearTimeout(timer));
}

/**
 * Responde a uma pergunta sobre o portefólio do dono da chave.
 * `prazo` é o instante absoluto (ms) até ao qual tem de haver resposta.
 */
export async function responderPortefolio(userId: string, pergunta: string, opts: { prazo: number }): Promise<RespostaPortefolio> {
  // Teto diário partilhado entre instâncias; falha FECHADO (sem contador não há IA paga).
  const janela = inicioDaJanelaUtc();
  const limite = await limiteDiario(chaveDoChat(userId), API_CHAT_PER_DAY);
  if (limite === "excedido") {
    return {
      ok: false, status: 429, code: "chat_limit", retryAfter: segundosAteMeiaNoiteUtc(),
      message: `Daily limit of ${API_CHAT_PER_DAY} messages reached. It resets at 00:00 UTC.`,
    };
  }
  if (limite === "indisponivel") {
    return { ok: false, status: 503, code: "service_unavailable", message: "The AI assistant is temporarily unavailable. Try again shortly." };
  }

  try {
    const portfolio = await getPortfolio(userId);
    const simbolos = [...simbolosDoPortefolio(portfolio.portfolio), ...simbolosDaPergunta(pergunta)];
    const [pnl, conta, mercado] = await Promise.all([
      getPnl(userId).catch((e) => { console.error("[api/ai] pnl:", e instanceof Error ? e.message : e); return null; }),
      contaDoUtilizador(userId, portfolio.accountId).catch(() => null),
      comTimeout(mercadoAgoraTexto(simbolos, {
        eur: true,
        nota: "Preços lidos agora na OKX. Não há notícias aqui nem o peso de cada ativo no portefólio: não inventes causas de subidas ou descidas, descreve só os números.",
      }), MERCADO_TIMEOUT_MS, null),
    ]);

    const system = montarPromptPortefolio({ portfolio, pnl, mercado, conta });
    const reply = await generateAiChat(
      [{ role: "system", content: system }, { role: "user", content: pergunta }],
      { maxTokens: MAX_TOKENS, temperature: 0.5, tokensEntrada: Math.ceil((system.length + pergunta.length) / 3), prazo: opts.prazo },
    );
    if (reply.trim()) return { ok: true, reply: reply.trim() };
  } catch (e) {
    console.error("[api/ai]", e instanceof Error ? e.message : e);
  }

  // Sem resposta (dados, fornecedores ou prazo): a mensagem não conta.
  const devolvida = await devolverMensagem(userId, janela);
  return {
    ok: false, status: 503, code: "ai_unavailable",
    message: `The AI assistant is unavailable right now.${devolvida ? " This message was not counted." : ""} Try again shortly.`,
  };
}
