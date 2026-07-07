const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

/** Erro tipado de uma chamada ao Groq, com o status HTTP para tratamento a montante. */
export class GroqError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "GroqError";
  }
}

/**
 * Chama o Groq (chat completions) e devolve só o texto.
 * Lança GroqError em caso de falha — NUNCA expõe o corpo cru ao utilizador.
 */
export async function callGroq(opts: {
  apiKey: string;
  model: string;
  prompt: string;
  maxTokens: number;
  temperature: number;
}): Promise<string> {
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model,
      messages: [{ role: "user", content: opts.prompt }],
      max_tokens: opts.maxTokens,
      temperature: opts.temperature,
    }),
  });

  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    // Fica no log do servidor para diagnóstico; não vai para o cliente.
    console.error(`[groq] ${res.status} ${res.statusText}: ${raw.slice(0, 500)}`);
    throw new GroqError(res.status, `Groq ${res.status}`);
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? "";
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

/** Devolve o status HTTP se o erro for um GroqError, senão undefined. */
export function errorStatus(err: unknown): number | undefined {
  return err instanceof GroqError ? err.status : undefined;
}
