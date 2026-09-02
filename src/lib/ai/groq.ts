// Geração de texto com IA e fallback automático entre providers:
//   1. Groq   (free tier)      → GROQ_MODEL ou candidatos (ver abaixo)
//   2. OpenAI (fallback)       → "gpt-4o-mini"
//   3. xAI    (fallback)       → "grok-4-fast-non-reasoning"
// Cada fallback só é usado se a respetiva API key estiver configurada.

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
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

/** Erro de IA com o status HTTP do último provider que falhou, para tratamento a montante. */
export class AiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "AiError";
  }
}

export type ChatMessage = { role: "user" | "system" | "assistant"; content: string };

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
): Promise<ProviderResult> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, temperature, max_tokens: maxTokens, messages }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      const raw = await res.text().catch(() => "");
      // Fica no log do servidor; nunca vai para o cliente.
      console.error(`[ai:${label}] ${res.status} ${res.statusText}: ${raw.slice(0, 300)}`);
      return { ok: false, status: res.status };
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content?.trim() ?? "";
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
export async function generateAiChat(
  messages: ChatMessage[],
  opts: { maxTokens: number; temperature: number },
): Promise<string> {
  let lastStatus: number | undefined;

  const groqKey = (process.env.GROQ_API_KEY ?? "").trim();
  if (groqKey) {
    // Tenta os candidatos por ordem; 404/400 = modelo reformado → próximo.
    let lastGroq: ProviderResult | null = null;
    for (const model of groqModelCandidates()) {
      const r = await callProvider("groq", GROQ_URL, groqKey, model, messages, opts.maxTokens, opts.temperature, 20000);
      if (r.ok && r.content) return r.content;
      lastGroq = r;
      if (r.ok || (r.status !== 404 && r.status !== 400)) break;
      console.error(`[ai:groq] modelo "${model}" indisponível — a tentar o próximo candidato`);
    }
    if (lastGroq && !lastGroq.ok) lastStatus = lastGroq.status;
  }

  const openaiKey = (process.env.OPENAI_API_KEY ?? "").trim();
  if (openaiKey) {
    const r = await callProvider("openai", OPENAI_URL, openaiKey, OPENAI_MODEL, messages, opts.maxTokens, opts.temperature, 25000);
    if (r.ok && r.content) return r.content;
    if (!r.ok) lastStatus = r.status;
  }

  const xaiKey = (process.env.XAI_API_KEY ?? "").trim();
  if (xaiKey) {
    const r = await callProvider("xai", XAI_URL, xaiKey, XAI_MODEL, messages, opts.maxTokens, opts.temperature, 25000);
    if (r.ok && r.content) return r.content;
    if (!r.ok) lastStatus = r.status;
  }

  throw new AiError(lastStatus ?? 502, "Todos os providers de IA falharam");
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
