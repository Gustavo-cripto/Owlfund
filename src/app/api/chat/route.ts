import { NextResponse } from "next/server";

type IncomingMessage = {
  role: "user" | "assistant";
  content: string;
};

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY não configurada." },
      { status: 500 }
    );
  }

  let body: { messages?: IncomingMessage[] } | null = null;
  try {
    body = (await request.json()) as { messages?: IncomingMessage[] };
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const incoming = body?.messages ?? [];
  const recentMessages = incoming.slice(-12);

  try {
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
        model: "gpt-4o-mini",
        temperature: 0.6,
        messages: [
          {
            role: "system",
            content:
              "Tu és o Chain: um analista de cripto/mercados com linguagem clara e direta (PT-PT). Não dês aconselhamento financeiro direto nem promessas. Foca em contexto, riscos, níveis técnicos, fatores macro e on-chain quando fizer sentido. Quando faltarem dados, faz 1-2 perguntas objetivas. Se o utilizador pedir 'o que comprar/vender', responde com cenários e gestão de risco em vez de recomendações.",
          },
          ...recentMessages,
        ],
      }),
    }).finally(() => clearTimeout(timeoutId));

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      return NextResponse.json(
        { error: payload?.error?.message ?? "Erro ao chamar OpenAI." },
        { status: response.status }
      );
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const reply = data.choices?.[0]?.message?.content?.trim();
    if (!reply) {
      return NextResponse.json(
        { error: "Resposta vazia da IA." },
        { status: 502 }
      );
    }

    return NextResponse.json({ reply });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return NextResponse.json(
        { error: "Timeout ao contactar o OpenAI." },
        { status: 504 }
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro inesperado." },
      { status: 500 }
    );
  }
}
