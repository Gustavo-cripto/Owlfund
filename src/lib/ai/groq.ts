// Geração de texto com IA e fallback automático entre providers:
//   1. Groq   (free tier)      → GROQ_MODEL ou candidatos (ver abaixo)
//   2. Gemini (free tier)      → GEMINI_MODEL ou candidatos (endpoint compatível OpenAI)
//   3. OpenAI (fallback)       → "gpt-4o-mini"
//   4. xAI    (fallback)       → "grok-4-fast-non-reasoning"
// Cada fallback só é usado se a respetiva API key estiver configurada.
//
// O Groq (on_demand) recusa com 413 pedidos acima de GROQ_TOKEN_LIMIT tokens
// (entrada + saída). Quem souber o tamanho do pedido passa `tokensEntrada` e o
// Groq é saltado quando não cabe — vai direto ao Gemini, que aceita contextos
// muito maiores.

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
// Modelos do Gemini por ordem; o 1.º pode ser trocado por GEMINI_MODEL. A Google
// reforma modelos para contas novas (o 2.5-flash devolvia 404 "no longer
// available to new users" em out 2026 e mandava usar o 3.8-flash), por isso há
// candidatos e tenta-se o seguinte em 404/400 ou resposta vazia.
// Nomes confirmados nas respostas da própria API (out 2026): os 2.5 devolvem
// "no longer available to new users" e apontam para o 3.8-flash e o 3.5-flash-lite.
const GEMINI_FALLBACK_MODELS = ["gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-3.5-flash"];
/** Teto de tokens por pedido no Groq (entrada + saída). Sobe com o Dev Tier: GROQ_TOKEN_LIMIT. */
export function groqTokenLimit(): number {
  const n = Number(process.env.GROQ_TOKEN_LIMIT);
  return Number.isFinite(n) && n > 0 ? n : 8000;
}
export const hasGemini = () => Boolean((process.env.GEMINI_API_KEY ?? "").trim());
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const XAI_URL = "https://api.x.ai/v1/chat/completions";

const OPENAI_MODEL = "gpt-4o-mini";
const XAI_MODEL = "grok-4-fast-non-reasoning";

// O Groq reforma modelos sem pré-aviso útil (a linha Llama 3.x inteira morreu
// a 2026-08-16). Mantemos uma lista de candidatos e tentamos por ordem quando
// um devolve 404/400. Substitutos oficiais: openai/gpt-oss-120b, qwen3.6-27b.
const DEAD_GROQ_MODELS = new Set(["llama-3.1-8b-instant", "llama-3.3-70b-versatile", "llama3-8b-8192", "llama3-70b-8192"]);
const GROQ_FALLBACK_MODELS = ["openai/gpt-oss-120b", "qwen/qwen3.6-27b", "meta-llama/llama-4-maverick-17b-128e-instruct"];

/** Modelo Groq preferido: env (se não estiver na lista de mortos) ou o 1º candidato. */
export function resolveGroqModel(): string {
  const env = (process.env.GROQ_MODEL ?? "").trim();
  if (env && !DEAD_GROQ_MODELS.has(env)) return env;
  return GROQ_FALLBACK_MODELS[0];
}

/** Ordem de tentativa no Groq: preferido primeiro, depois os restantes candidatos. */
export function groqModelCandidates(): string[] {
  const preferred = resolveGroqModel();
  return [preferred, ...GROQ_FALLBACK_MODELS.filter((m) => m !== preferred)];
}

/** Ordem de tentativa no Gemini: GEMINI_MODEL (se definido) e depois os candidatos. */
export function geminiModelCandidates(): string[] {
  const env = (process.env.GEMINI_MODEL ?? "").trim();
  return env ? [env, ...GEMINI_FALLBACK_MODELS.filter((m) => m !== env)] : GEMINI_FALLBACK_MODELS;
}

/** Erro de IA com o status HTTP do último provider que falhou, para tratamento a montante. */
export class AiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "AiError";
  }
}

export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type ChatMessage = {
  role: "user" | "system" | "assistant" | "tool";
  content: string;
  /** Pedidos de ferramenta feitos pelo modelo (mensagem assistant). */
  tool_calls?: ToolCall[];
  /** Resposta a um pedido de ferramenta (mensagem tool). */
  tool_call_id?: string;
};
/** Definição de ferramenta no formato OpenAI (function calling). */
export type ToolDef = { type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } };

type ProviderResult =
  | { ok: true; content: string }
  | { ok: false; status: number };

async function callProvider(
  label: string,
  url: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  maxTokens: number,
  temperature: number,
  timeoutMs: number,
  extra: Record<string, unknown> = {},
): Promise<ProviderResult> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, temperature, max_tokens: maxTokens, messages, ...extra }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      const raw = await res.text().catch(() => "");
      // Fica no log do servidor; nunca vai para o cliente.
      console.error(`[ai:${label}] ${res.status} ${res.statusText}: ${raw.slice(0, 300)}`);
      return { ok: false, status: res.status };
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string }; finish_reason?: string }[] };
    const content = data.choices?.[0]?.message?.content?.trim() ?? "";
    // Resposta vazia (ex.: o "raciocínio" gastou os tokens de saída) fica no
    // log com o motivo de paragem; quem chama trata-a como falha e segue.
    if (!content) console.error(`[ai:${label}] resposta vazia (modelo ${model}, finish_reason=${data.choices?.[0]?.finish_reason ?? "?"})`);
    return { ok: true, content };
  } catch (err) {
    console.error(`[ai:${label}] request failed:`, err instanceof Error ? err.message : err);
    return { ok: false, status: 503 };
  }
}

/** Há pelo menos um provider de IA configurado? */
export function hasAnyAiProvider(): boolean {
  return Boolean(
    (process.env.GROQ_API_KEY ?? "").trim() ||
      hasGemini() ||
      (process.env.OPENAI_API_KEY ?? "").trim() ||
      (process.env.XAI_API_KEY ?? "").trim(),
  );
}

/**
 * Gera texto tentando Groq → OpenAI → xAI, por esta ordem.
 * Devolve o primeiro resultado com conteúdo; lança AiError se todos falharem
 * (com o status do último a falhar — ex.: 429 quando o Groq está rate-limited
 * e não há fallbacks configurados). Nunca expõe o corpo cru dos providers.
 */
export async function generateAiText(opts: {
  prompt: string;
  maxTokens: number;
  temperature: number;
}): Promise<string> {
  return generateAiChat([{ role: "user", content: opts.prompt }], {
    maxTokens: opts.maxTokens,
    temperature: opts.temperature,
  });
}

/**
 * Como generateAiText, mas aceita um array de mensagens (system + histórico
 * user/assistant) — para chats multi-turno (ex.: /api/gestor, /api/chat).
 */
type Tentativa = { label: string; url: string; key: string; model: string; maxTokens: number; timeoutMs: number; extra: Record<string, unknown> };
type Resultado = { ok: true; vazio: boolean } | { ok: false; status: number };

/**
 * Plano de tentativas, UM só para texto e para streaming: Groq (se o pedido
 * lhe cabe) → Gemini (candidatos; 400 repete sem reasoning_effort; 401/403
 * desiste; resto passa ao modelo seguinte) → OpenAI → xAI. Quem corre o plano
 * devolve a cada passo o que aconteceu, e o gerador decide o passo seguinte.
 */
function* planoDeTentativas(opts: { maxTokens: number; temperature: number; tokensEntrada?: number }): Generator<Tentativa, number | undefined, Resultado> {
  let lastStatus: number | undefined;

  const groqKey = (process.env.GROQ_API_KEY ?? "").trim();
  const cabeNoGroq = opts.tokensEntrada == null || opts.tokensEntrada + opts.maxTokens <= groqTokenLimit();
  if (groqKey && !cabeNoGroq) console.warn(`[ai:groq] saltado: pedido de ~${opts.tokensEntrada} + ${opts.maxTokens} tokens acima do teto ${groqTokenLimit()}`);
  if (groqKey && cabeNoGroq) {
    // Tenta os candidatos por ordem; 404/400 = modelo reformado → próximo.
    for (const model of groqModelCandidates()) {
      const r = yield { label: "groq", url: GROQ_URL, key: groqKey, model, maxTokens: opts.maxTokens, timeoutMs: 20000, extra: {} };
      if (!r.ok) lastStatus = r.status;
      if (r.ok || (r.status !== 404 && r.status !== 400)) break;
      console.error(`[ai:groq] modelo "${model}" indisponível — a tentar o próximo candidato`);
    }
  }

  const geminiKey = (process.env.GEMINI_API_KEY ?? "").trim();
  if (geminiKey) {
    // Os Gemini "pensam" antes de responder e o raciocínio conta para
    // max_tokens: pede-se esforço baixo e dá-se folga; se mesmo assim a
    // resposta vier vazia ou o parâmetro for recusado (400), repete-se o
    // mesmo modelo sem o parâmetro antes de passar ao candidato seguinte.
    // 1024 de folga não chegava com o contexto largo do Block: o raciocínio
    // comia o orçamento e a resposta visível parava a meio de uma frase (8 out).
    const folga = opts.maxTokens + 4096;
    let desistir = false;
    for (const model of geminiModelCandidates()) {
      if (desistir) break;
      for (const extra of [{ reasoning_effort: "low" }, {}]) {
        const r = yield { label: "gemini", url: GEMINI_URL, key: geminiKey, model, maxTokens: folga, timeoutMs: 30000, extra };
        if (!r.ok) lastStatus = r.status;
        // 401/403: chave inválida, não vale a pena insistir. 400: repetir sem
        // reasoning_effort. Tudo o resto (404 reformado, 429 quota, 503 "high
        // demand" do escalão gratuito…): passar ao modelo seguinte.
        if (!r.ok && (r.status === 401 || r.status === 403)) { desistir = true; break; }
        if (!r.ok && r.status !== 400) { console.error(`[ai:gemini] modelo "${model}" falhou (${r.status}) — a tentar o próximo candidato`); break; }
        if (r.ok) break; // respondeu vazio duas vezes: próximo modelo
      }
    }
  }

  const openaiKey = (process.env.OPENAI_API_KEY ?? "").trim();
  if (openaiKey) {
    const r = yield { label: "openai", url: OPENAI_URL, key: openaiKey, model: OPENAI_MODEL, maxTokens: opts.maxTokens, timeoutMs: 25000, extra: {} };
    if (!r.ok) lastStatus = r.status;
  }

  const xaiKey = (process.env.XAI_API_KEY ?? "").trim();
  if (xaiKey) {
    const r = yield { label: "xai", url: XAI_URL, key: xaiKey, model: XAI_MODEL, maxTokens: opts.maxTokens, timeoutMs: 25000, extra: {} };
    if (!r.ok) lastStatus = r.status;
  }

  return lastStatus;
}

/**
 * Como generateAiText, mas aceita um array de mensagens (system + histórico
 * user/assistant) — para chats multi-turno (ex.: /api/gestor, /api/chat).
 */
export async function generateAiChat(
  messages: ChatMessage[],
  opts: { maxTokens: number; temperature: number; tokensEntrada?: number },
): Promise<string> {
  const plano = planoDeTentativas(opts);
  let passo = plano.next();
  while (!passo.done) {
    const t = passo.value;
    const r = await callProvider(t.label, t.url, t.key, t.model, messages, t.maxTokens, opts.temperature, t.timeoutMs, t.extra);
    if (r.ok && r.content) return r.content;
    passo = plano.next(r.ok ? { ok: true, vazio: true } : { ok: false, status: r.status });
  }
  throw new AiError(passo.value ?? 502, "Todos os providers de IA falharam");
}

// ── Streaming ────────────────────────────────────────────────────────────────

/** Abre um pedido em streaming; só devolve ok depois de o fornecedor aceitar (status 2xx). */
async function abrirStream(t: Tentativa, messages: ChatMessage[], temperature: number, tools?: ToolDef[], prazo?: number): Promise<{ ok: true; body: ReadableStream<Uint8Array> } | { ok: false; status: number }> {
  try {
    // Cobre a ligação E a leitura do corpo. Com `prazo` (ms absolutos) o
    // tempo é o que falta até lá — a rota tem 60 s para tudo, rondas incluídas.
    const restante = prazo ? Math.max(1000, prazo - Date.now()) : 55000;
    const res = await fetch(t.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${t.key}` },
      body: JSON.stringify({ model: t.model, temperature, max_tokens: t.maxTokens, messages, stream: true, ...(tools?.length ? { tools, tool_choice: "auto" } : {}), ...t.extra }),
      signal: AbortSignal.timeout(Math.min(Math.max(t.timeoutMs, 55000), restante)),
    });
    if (!res.ok || !res.body) {
      const raw = await res.text().catch(() => "");
      console.error(`[ai:${t.label}] ${res.status} ${res.statusText}: ${raw.slice(0, 300)}`);
      return { ok: false, status: res.status || 502 };
    }
    return { ok: true, body: res.body };
  } catch (err) {
    console.error(`[ai:${t.label}] request failed:`, err instanceof Error ? err.message : err);
    return { ok: false, status: 503 };
  }
}

/** Converte o SSE "data: {...}" do formato OpenAI num stream de pedaços de texto. */
export function sseParaTexto(body: ReadableStream<Uint8Array>): ReadableStream<string> {
  const decoder = new TextDecoder();
  let resto = "";
  return body.pipeThrough(new TransformStream<Uint8Array, string>({
    transform(chunk, controller) {
      resto += decoder.decode(chunk, { stream: true });
      const linhas = resto.split("\n");
      resto = linhas.pop() ?? "";
      for (const linha of linhas) {
        const l = linha.trim();
        if (!l.startsWith("data:")) continue;
        const data = l.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const j = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string | null } }> };
          const delta = j.choices?.[0]?.delta?.content;
          if (delta) controller.enqueue(delta);
        } catch { /* linha incompleta ou keep-alive */ }
      }
    },
  }));
}

/** Evento de um stream OpenAI: pedaço de texto ou pedaço de um pedido de ferramenta. */
export type EventoSse =
  | { tipo: "texto"; texto: string }
  | { tipo: "tool"; index: number; id?: string; name?: string; args?: string };

/** Como sseParaTexto, mas conserva também os deltas de tool_calls (function calling). */
export function sseParaEventos(body: ReadableStream<Uint8Array>): ReadableStream<EventoSse> {
  const decoder = new TextDecoder();
  let resto = "";
  type Delta = { content?: string | null; tool_calls?: Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }> };
  return body.pipeThrough(new TransformStream<Uint8Array, EventoSse>({
    transform(chunk, controller) {
      resto += decoder.decode(chunk, { stream: true });
      const linhas = resto.split("\n");
      resto = linhas.pop() ?? "";
      for (const linha of linhas) {
        const l = linha.trim();
        if (!l.startsWith("data:")) continue;
        const data = l.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const j = JSON.parse(data) as { choices?: Array<{ delta?: Delta; finish_reason?: string | null }> };
          const d = j.choices?.[0]?.delta;
          // Resposta cortada pelo limite de tokens: fica nos registos para se ver.
          if (j.choices?.[0]?.finish_reason === "length") console.warn("[ai:stream] resposta cortada por max_tokens (finish_reason=length)");
          if (d?.content) controller.enqueue({ tipo: "texto", texto: d.content });
          for (const tc of d?.tool_calls ?? []) {
            controller.enqueue({ tipo: "tool", index: tc.index ?? 0, id: tc.id, name: tc.function?.name, args: tc.function?.arguments });
          }
        } catch { /* linha incompleta ou keep-alive */ }
      }
    },
  }));
}

/**
 * Como generateAiChat, mas devolve um stream de eventos assim que um fornecedor
 * aceita o pedido. O fallback entre fornecedores só é possível ANTES do
 * primeiro byte: um stream que comece e morra a meio chega ao chamador como
 * fim de stream (ele deve tratar texto vazio como erro). Com `tools`, o modelo
 * pode responder com pedidos de ferramenta em vez de texto.
 */
export async function generateAiChatStream(
  messages: ChatMessage[],
  opts: { maxTokens: number; temperature: number; tokensEntrada?: number; tools?: ToolDef[]; /** Instante (ms) até ao qual tudo tem de estar lido. */ prazo?: number },
): Promise<{ eventos: ReadableStream<EventoSse>; provider: string; model: string }> {
  const plano = planoDeTentativas(opts);
  let passo = plano.next();
  while (!passo.done) {
    const t = passo.value;
    const r = await abrirStream(t, messages, opts.temperature, opts.tools, opts.prazo);
    if (r.ok) return { eventos: sseParaEventos(r.body), provider: t.label, model: t.model };
    passo = plano.next({ ok: false, status: r.status });
  }
  throw new AiError(passo.value ?? 502, "Todos os providers de IA falharam");
}

/**
 * Mensagem de erro amigável e localizada para o utilizador — sem JSON cru nem IDs internos.
 */
export function friendlyAiError(status: number | undefined, lang = "pt"): string {
  const pick = (pt: string, en: string, es: string, fr: string) =>
    lang === "en" ? en : lang === "es" ? es : lang === "fr" ? fr : pt;

  if (status === 429) {
    return pick(
      "⏳ Limite da Análise IA atingido por agora. Volta a tentar dentro de alguns minutos.",
      "⏳ AI analysis limit reached for now. Please try again in a few minutes.",
      "⏳ Límite del análisis IA alcanzado por ahora. Inténtalo de nuevo en unos minutos.",
      "⏳ Limite de l'analyse IA atteinte pour l'instant. Réessaie dans quelques minutes.",
    );
  }
  if (status === 401 || status === 403) {
    return pick(
      "Serviço de IA temporariamente indisponível. Tenta novamente mais tarde.",
      "AI service temporarily unavailable. Please try again later.",
      "Servicio de IA temporalmente no disponible. Inténtalo más tarde.",
      "Service IA temporairement indisponible. Réessaie plus tard.",
    );
  }
  return pick(
    "Não foi possível gerar a análise agora. Tenta novamente daqui a pouco.",
    "Couldn't generate the analysis right now. Please try again shortly.",
    "No se pudo generar el análisis ahora. Inténtalo de nuevo en breve.",
    "Impossible de générer l'analyse pour le moment. Réessaie bientôt.",
  );
}

/** Devolve o status HTTP se o erro for um AiError, senão undefined. */
export function errorStatus(err: unknown): number | undefined {
  return err instanceof AiError ? err.status : undefined;
}
