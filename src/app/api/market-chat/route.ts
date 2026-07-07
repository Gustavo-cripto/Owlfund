import { NextResponse } from "next/server";
import { generateAiChat, friendlyAiError, errorStatus, hasAnyAiProvider, type ChatMessage } from "@/lib/ai/groq";

type ChatMsg = { role: "user" | "assistant"; content: string };

export async function POST(request: Request) {
  if (!hasAnyAiProvider()) return NextResponse.json({ error: "Serviço de IA não configurado." }, { status: 503 });

  const body = await request.json() as {
    briefing: string;
    mode: "crypto" | "tradicional";
    messages: ChatMsg[];
    nickname?: string;
    lang?: string;
  };

  const { briefing, mode, messages } = body;
  if (!briefing || !messages?.length) {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }
  const nickname = typeof body.nickname === "string" ? body.nickname.trim().slice(0, 40) : "";
  const lang = typeof body.lang === "string" ? body.lang : "pt";

  const nameDirective = nickname
    ? `\n\nNOME DO UTILIZADOR: chama-se ${nickname}. Trata-o por esse nome de forma natural. Não inventes outro nome.`
    : "";

  const systemPrompt = `És o assistente financeiro da ChainFolioAI, especializado em mercados ${mode === "crypto" ? "cripto" : "tradicionais"}.
O utilizador acabou de receber este briefing diário gerado por ti:

--- BRIEFING ---
${briefing}
--- FIM DO BRIEFING ---

Responde de forma clara e concisa. Baseia as tuas respostas no briefing fornecido e no teu conhecimento de mercados. Mantém o tom profissional mas acessível. Não repitas o briefing completo — responde diretamente à pergunta.${nameDirective}
IDIOMA (regra crítica): Responde SEMPRE no mesmo idioma em que o utilizador escreveu a pergunta (inglês→inglês, espanhol→espanhol, francês→francês, português→PT-PT). Deteta o idioma da pergunta; não assumas português por defeito.`;

  const chatMessages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  try {
    const reply = await generateAiChat(chatMessages, { maxTokens: 600, temperature: 0.4 });
    return NextResponse.json({ reply: reply || "Sem resposta." });
  } catch (err) {
    const status = errorStatus(err);
    return NextResponse.json(
      { error: friendlyAiError(status, lang) },
      { status: status === 429 ? 429 : 502 },
    );
  }
}
