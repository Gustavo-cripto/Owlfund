import { NextResponse } from "next/server";
import { apiLang, apiMsg } from "@/lib/api/apiMessages";
import { unstable_cache } from "next/cache";
import { generateAiChat, friendlyAiError, errorStatus, hasAnyAiProvider } from "@/lib/ai/groq";
import { estimarTokens } from "@/lib/ai/orcamentoBlock";
import { requireUser } from "@/lib/api/requireUser";
import { getPlanOrNull, planUnavailableResponse, requiresPlanResponse } from "@/lib/api/entitlement";
import { lerNoticias } from "@/lib/news/feeds";
import { mercadoAgoraTexto } from "@/lib/ai/mercadoAgora";
import { langMercado, promptBriefingNoticias, type LangMercado } from "@/lib/ai/promptsMercado";

// Chamada a fornecedor de IA: pode demorar.
export const maxDuration = 60;

type Manchete = { title: string; description: string; source: string };

/**
 * Gera o briefing de notícias, em cache (Data Cache do Next/Vercel) por conjunto de
 * notícias + idioma durante 45 min. As notícias são lidas PELO SERVIDOR (antes
 * vinham do browser, sem confirmação, e o texto saía com o selo "com base em
 * notícias reais"). Lança em caso de erro (erros não ficam em cache).
 */
const generateNewsBriefing = unstable_cache(
  async (items: Manchete[], lang: LangMercado): Promise<{ content: string; date: string }> => {
    const today = new Date().toISOString().split("T")[0];
    const time = new Date().toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Lisbon" });
    // Preços ao vivo (OKX): só com eles o prompt pode falar de níveis de preço.
    const mercado = await mercadoAgoraTexto([], {
      nota: "Preços da OKX lidos agora. São os ÚNICOS números de mercado que podes citar; as notícias não trazem preços.",
    }).catch(() => null);
    const prompt = promptBriefingNoticias(items, lang, { data: today, hora: time }, mercado);
    const content = await generateAiChat([{ role: "user", content: prompt }], {
      maxTokens: 2000,
      temperature: 0.25,
      tokensEntrada: estimarTokens(prompt),
    });
    return { content, date: `${today} ${time}` };
  },
  ["news-briefing-v2"],
  { revalidate: 2700 },
);

export async function POST(request: Request) {
  // Gera IA paga: só com sessão e plano Pro/Premium (antes qualquer pessoa na
  // internet podia invocar esta rota).
  const auth = await requireUser(request, { route: "news-briefing", limit: 10 });
  if (!auth.ok) return auth.response;
  const plan = await getPlanOrNull(auth.userId);
  if (!plan) return planUnavailableResponse();
  if (plan === "free") return requiresPlanResponse("pro");

  // O cliente envia só { lang }; os itens (se ainda vierem) são ignorados.
  let body: { lang?: unknown } = {};
  try {
    const bruto = await request.text();
    if (bruto.length > 4096) return NextResponse.json({ error: apiMsg(request, "invalid_body"), code: "body_too_large" }, { status: 413 });
    body = bruto ? (JSON.parse(bruto) as typeof body) : {};
  } catch {
    return NextResponse.json({ error: apiMsg(request, "invalid_body"), code: "invalid_body" }, { status: 400 });
  }
  const lang = langMercado(body?.lang) ?? apiLang(request);

  if (!hasAnyAiProvider()) return NextResponse.json({ error: apiMsg(request, "ai_unconfigured"), code: "ai_unconfigured" }, { status: 503 });

  const noticias = await lerNoticias({ max: 20 });
  if (!noticias.length) return NextResponse.json({ error: apiMsg(request, "news_unavailable"), code: "news_unavailable" }, { status: 503 });
  // Só o que o prompt usa entra na chave da cache (links e imagens não).
  const items: Manchete[] = noticias.map((n) => ({ title: n.title.slice(0, 200), description: n.description.slice(0, 120), source: n.source }));

  try {
    const result = await generateNewsBriefing(items, lang);
    return NextResponse.json(result);
  } catch (err) {
    const status = errorStatus(err);
    return NextResponse.json(
      { error: friendlyAiError(status, lang) },
      { status: status === 429 ? 429 : 502 },
    );
  }
}
