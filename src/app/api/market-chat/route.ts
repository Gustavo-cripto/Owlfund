import { NextResponse } from "next/server";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

type ChatMsg = { role: "user" | "assistant"; content: string };

export async function POST(request: Request) {
  const apiKey = (process.env.GROQ_API_KEY ?? "").trim();
  if (!apiKey) return NextResponse.json({ error: "GROQ_API_KEY não configurada." }, { status: 503 });

  const body = await request.json() as {
    briefing: string;
    mode: "crypto" | "tradicional";
    messages: ChatMsg[];
  };

  const { briefing, mode, messages } = body;
  if (!briefing || !messages?.length) {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  const systemPrompt = `És o assistente financeiro da ChainFolioAI, especializado em mercados ${mode === "crypto" ? "cripto" : "tradicionais"}.
O utilizador acabou de receber este briefing diário gerado por ti:

--- BRIEFING ---
${briefing}
--- FIM DO BRIEFING ---

Responde em português europeu de forma clara e concisa. Baseia as tuas respostas no briefing fornecido e no teu conhecimento de mercados. Mantém o tom profissional mas acessível. Não repitas o briefing completo — responde diretamente à pergunta.`;

  const groqMessages = [
    { role: "system", content: systemPrompt },
    ...messages.map(m => ({ role: m.role, content: m.content })),
  ];

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: groqMessages,
      max_tokens: 600,
      temperature: 0.4,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: "Erro Groq: " + err.slice(0, 200) }, { status: 500 });
  }

  const data = await res.json() as { choices: { message: { content: string } }[] };
  const reply = data.choices[0]?.message?.content ?? "Sem resposta.";
  return NextResponse.json({ reply });
}
