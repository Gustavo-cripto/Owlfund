import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { generateAiChat, friendlyAiError, errorStatus, hasAnyAiProvider, type ChatMessage } from "@/lib/ai/groq";
import { rateLimit, clientIp } from "@/lib/utils/rateLimit";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

async function getAuthUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: { get: (name) => cookieStore.get(name)?.value, set: () => {}, remove: () => {} },
  });
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

type ChatMsg = { role: "user" | "assistant"; content: string };

export async function POST(request: Request) {
  // Rate limit por IP (trava abuso/custo de IA)
  if (!rateLimit(`market-chat:${clientIp(request)}`, 20, 60_000)) {
    return NextResponse.json({ error: "Demasiados pedidos. Tenta novamente em 1 minuto." }, { status: 429 });
  }

  // Exigir sessão — a página /mercado já exige login (useRequireAuth)
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

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
