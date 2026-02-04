import { NextResponse } from "next/server";

type IncomingMessage = {
  role: "user" | "assistant";
  content: string;
};

const SYSTEM_PROMPT =
  "Tu és o Chain: um analista de cripto/mercados com linguagem clara e direta (PT-PT). Não dês aconselhamento financeiro direto nem promessas. Foca em contexto, riscos, níveis técnicos, fatores macro e on-chain quando fizer sentido. Quando faltarem dados, faz 1-2 perguntas objetivas. Se o utilizador pedir 'o que comprar/vender', responde com cenários e gestão de risco em vez de recomendações.";

type ProviderName = "openai" | "groq" | "ollama" | "xai";

const pickProvider = (): ProviderName => {
  const forced = (process.env.CHAT_PROVIDER ?? "").trim().toLowerCase();
  if (forced === "ollama") return "ollama";
  if (forced === "groq") return "groq";
  if (forced === "xai") return "xai";
  if (forced === "openai") return "openai";

  // Auto: prefer Ollama (local), then Groq, then xAI, then OpenAI.
  const hasOllama = Boolean((process.env.OLLAMA_BASE_URL ?? "").trim());
  const hasGroq = Boolean((process.env.GROQ_API_KEY ?? "").trim());
  const hasXai = Boolean((process.env.XAI_API_KEY ?? "").trim());
  const hasOpenAi = Boolean((process.env.OPENAI_API_KEY ?? "").trim());
  if (hasOllama) return "ollama";
  if (hasGroq) return "groq";
  if (hasXai) return "xai";
  if (hasOpenAi) return "openai";
  return "openai";
};

const toChatMessages = (recentMessages: IncomingMessage[]) => [
  { role: "system", content: SYSTEM_PROMPT },
  ...recentMessages,
];

async function callOpenAi(messages: Array<{ role: string; content: string }>) {
  const apiKey = (process.env.OPENAI_API_KEY ?? "").trim();
  if (!apiKey) {
    return {
      ok: false as const,
      status: 500,
      error: "OPENAI_API_KEY não configurada.",
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    signal: controller.signal,
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      temperature: 0.6,
      messages,
    }),
  }).finally(() => clearTimeout(timeoutId));

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const msg = payload?.error?.message as unknown;
    const message = typeof msg === "string" ? msg : "";

    if (response.status === 401) {
      return {
        ok: false as const,
        status: 401,
        error:
          "Chave OpenAI inválida. Na Vercel, confirma `OPENAI_API_KEY` (sem espaços/linhas a mais e sem aspas) e faz Redeploy.",
      };
    }

    if (/exceeded your current quota/i.test(message)) {
      return {
        ok: false as const,
        status: 402,
        error:
          "A tua conta OpenAI está sem créditos/quota. Se queres não pagar, usa `GROQ_API_KEY` (free tier) ou `OLLAMA_BASE_URL` (local).",
      };
    }

    return {
      ok: false as const,
      status: response.status,
      error: message || "Erro ao chamar OpenAI.",
    };
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const reply = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!reply) {
    return { ok: false as const, status: 502, error: "Resposta vazia da IA." };
  }
  return { ok: true as const, reply };
}

async function callGroq(messages: Array<{ role: string; content: string }>) {
  const apiKey = (process.env.GROQ_API_KEY ?? "").trim();
  if (!apiKey) {
    return {
      ok: false as const,
      status: 500,
      error: "GROQ_API_KEY não configurada.",
    };
  }

  const model = (process.env.GROQ_MODEL ?? "").trim() || "llama-3.1-8b-instant";
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    signal: controller.signal,
    body: JSON.stringify({
      model,
      temperature: 0.6,
      messages,
    }),
  }).finally(() => clearTimeout(timeoutId));

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const msg = payload?.error?.message as unknown;
    const message = typeof msg === "string" ? msg : "";
    return {
      ok: false as const,
      status: response.status,
      error: message || "Erro ao chamar Groq.",
    };
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const reply = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!reply) {
    return { ok: false as const, status: 502, error: "Resposta vazia da IA." };
  }
  return { ok: true as const, reply };
}

async function callXai(messages: Array<{ role: string; content: string }>) {
  const apiKey = (process.env.XAI_API_KEY ?? "").trim();
  if (!apiKey) {
    return {
      ok: false as const,
      status: 500,
      error: "XAI_API_KEY não configurada.",
    };
  }

  // xAI é compatível com o SDK/OpenAI via base_url=https://api.x.ai/v1
  const baseUrl = (process.env.XAI_BASE_URL ?? "").trim() || "https://api.x.ai/v1";
  const model =
    (process.env.XAI_MODEL ?? "").trim() || "grok-4-fast-non-reasoning";

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    signal: controller.signal,
    body: JSON.stringify({
      model,
      temperature: 0.6,
      messages,
    }),
  }).finally(() => clearTimeout(timeoutId));

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const msg = payload?.error?.message as unknown;
    const message = typeof msg === "string" ? msg : "";
    return {
      ok: false as const,
      status: response.status,
      error: message || "Erro ao chamar xAI (Grok).",
    };
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const reply = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!reply) {
    return { ok: false as const, status: 502, error: "Resposta vazia da IA." };
  }
  return { ok: true as const, reply };
}

async function callOllama(messages: Array<{ role: string; content: string }>) {
  const baseUrl = (process.env.OLLAMA_BASE_URL ?? "").trim() || "http://127.0.0.1:11434";
  const model = (process.env.OLLAMA_MODEL ?? "").trim() || "llama3.1:8b";
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: controller.signal,
    body: JSON.stringify({
      model,
      stream: false,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    }),
  }).finally(() => clearTimeout(timeoutId));

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return {
      ok: false as const,
      status: response.status,
      error:
        "Não foi possível contactar o Ollama. Confirma que está a correr e define `OLLAMA_BASE_URL` (ex: http://127.0.0.1:11434). " +
        (text ? `Detalhes: ${text.slice(0, 200)}` : ""),
    };
  }

  const data = (await response.json()) as {
    message?: { content?: string };
  };
  const reply = data.message?.content?.trim() ?? "";
  if (!reply) {
    return { ok: false as const, status: 502, error: "Resposta vazia do Ollama." };
  }
  return { ok: true as const, reply };
}

export async function POST(request: Request) {
  let body: { messages?: IncomingMessage[] } | null = null;
  try {
    body = (await request.json()) as { messages?: IncomingMessage[] };
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const incoming = body?.messages ?? [];
  const recentMessages = incoming.slice(-12);

  try {
    const messages = toChatMessages(recentMessages);
    const provider = pickProvider();

    let result:
      | { ok: true; reply: string }
      | { ok: false; status: number; error: string };

    if (provider === "ollama") result = await callOllama(messages);
    else if (provider === "groq") result = await callGroq(messages);
    else if (provider === "xai") result = await callXai(messages);
    else result = await callOpenAi(messages);

    // Auto fallback: if chosen provider is missing config, try next ones.
    if (!result.ok && provider !== "ollama") {
      // no-op
    }
    if (!result.ok && provider === "openai") {
      // If OpenAI failed, try Groq then xAI then Ollama.
      const groqTry = await callGroq(messages);
      if (groqTry.ok) result = groqTry;
      else {
        const xaiTry = await callXai(messages);
        if (xaiTry.ok) result = xaiTry;
        else {
          const ollamaTry = await callOllama(messages);
          if (ollamaTry.ok) result = ollamaTry;
        }
      }
    } else if (!result.ok && provider === "groq") {
      // If Groq failed, try xAI then Ollama then OpenAI.
      const xaiTry = await callXai(messages);
      if (xaiTry.ok) result = xaiTry;
      else {
      const ollamaTry = await callOllama(messages);
      if (ollamaTry.ok) result = ollamaTry;
      else {
        const openAiTry = await callOpenAi(messages);
        if (openAiTry.ok) result = openAiTry;
      }
      }
    } else if (!result.ok && provider === "xai") {
      // If xAI failed, try Groq then Ollama then OpenAI.
      const groqTry = await callGroq(messages);
      if (groqTry.ok) result = groqTry;
      else {
        const ollamaTry = await callOllama(messages);
        if (ollamaTry.ok) result = ollamaTry;
        else {
          const openAiTry = await callOpenAi(messages);
          if (openAiTry.ok) result = openAiTry;
        }
      }
    } else if (!result.ok && provider === "ollama") {
      // If Ollama failed, try Groq then xAI then OpenAI.
      const groqTry = await callGroq(messages);
      if (groqTry.ok) result = groqTry;
      else {
        const xaiTry = await callXai(messages);
        if (xaiTry.ok) result = xaiTry;
        else {
          const openAiTry = await callOpenAi(messages);
          if (openAiTry.ok) result = openAiTry;
        }
      }
    }

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ reply: result.reply });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return NextResponse.json(
        { error: "Timeout ao contactar o provider de IA." },
        { status: 504 }
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro inesperado." },
      { status: 500 }
    );
  }
}
