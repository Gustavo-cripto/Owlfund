// Geração de texto com IA e fallback automático entre providers:
//   1. Groq   (free tier)      → GROQ_MODEL ou "llama-3.3-70b-versatile"
//   2. OpenAI (fallback)       → "gpt-4o-mini"
//   3. xAI    (fallback)       → "grok-4-fast-non-reasoning"
// Cada fallback só é usado se a respetiva API key estiver configurada.

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const XAI_URL = "https://api.x.ai/v1/chat/completions";

const OPENAI_MODEL = "gpt-4o-mini";
const XAI_MODEL = "grok-4-fast-non-reasoning";

/** Erro de IA com o status HTTP do último provider que falhou, para tratamento a montante. */
export class AiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "AiError";
  }
}

type ChatMessage = { role: "user" | "system"; content: string };

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
  const messages: ChatMessage[] = [{ role: "user", content: opts.prompt }];
  let lastStatus: number | undefined;

  const groqKey = (process.env.GROQ_API_KEY ?? "").trim();
  if (groqKey) {
    const model = (process.env.GROQ_MODEL ?? "").trim() || "llama-3.3-70b-versatile";
    const r = await callProvider("groq", GROQ_URL, groqKey, model, messages, opts.maxTokens, opts.temperature, 20000);
    if (r.ok && r.content) return r.content;
    if (!r.ok) lastStatus = r.status;
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
