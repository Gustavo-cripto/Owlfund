import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { generateAiText, friendlyAiError, errorStatus, hasAnyAiProvider } from "@/lib/ai/groq";
import { NO_ADVICE_RULE } from "@/lib/ai/disclaimer";

type NewsItem = {
  title: string;
  description: string;
  source: string;
  pubDate: string;
  category?: string;
};

/**
 * Gera o briefing de notícias, em cache (Data Cache do Next/Vercel) por conjunto de
 * notícias + idioma durante 45 min. Enquanto as notícias forem as mesmas, todos os
 * utilizadores partilham o mesmo briefing — poupa tokens do Groq. Lança em caso de
 * erro (erros não ficam em cache).
 */
const generateNewsBriefing = unstable_cache(
  async (items: NewsItem[], lang: string): Promise<{ content: string; date: string }> => {
  const LANG_NAME: Record<string, string> = { pt: "português europeu (PT-PT)", en: "English", es: "español", fr: "français" };
  const langInstruction = `\n\nIDIOMA (regra crítica): Escreve TODO o briefing em ${LANG_NAME[lang] ?? "português europeu (PT-PT)"}, incluindo títulos e secções.`;

  const today = new Date().toISOString().split("T")[0];
  const time = new Date().toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Lisbon" });

  const newsBlock = items
    .map((it, i) => `[${i + 1}] [${it.source}] ${it.title}${it.description ? ` — ${it.description.slice(0, 120)}` : ""}`)
    .join("\n");

  const prompt = `És um analista financeiro sénior e jornalista especializado em mercados cripto e tradicionais. Data/hora atual: ${today} ${time} (Lisboa).

NOTÍCIAS EM TEMPO REAL (últimas horas — fontes: CoinDesk, CoinTelegraph, Reuters):
${newsBlock}

Com base nestas notícias reais, escreve um BRIEFING COMPLETO em português europeu. Sê específico, cita as notícias pelo número [n] e analisa o impacto provável nos mercados.

## 🌍 Contexto Global
[2-3 frases sobre o panorama macro do dia — o que domina o sentimento dos mercados?]

## 🔥 Principais Notícias do Dia
### [Título da notícia mais importante]
[Análise: o que aconteceu, por que importa, impacto esperado no mercado. Cita a fonte [n].]

### [Segunda notícia mais importante]
[Análise detalhada. Cita a fonte [n].]

### [Terceira notícia relevante]
[Análise. Cita a fonte [n].]

## 📊 Impacto nos Mercados
**Cripto:** [Como estas notícias afetam BTC, ETH e altcoins? Bullish ou bearish? Porquê?]
**Mercado Tradicional:** [Impacto em ações, commodities, índices — se relevante nas notícias]
**Sentimento Geral:** [Resumo do sentimento: medo, euforia, incerteza, acumulação?]

## 💡 O Que Vigiar Hoje
- [Evento ou dado económico a monitorizar]
- [Nível de preço ou threshold crítico]
- [Catalisador potencial — positivo ou negativo]

## ⚠️ Riscos Identificados
- [Risco 1 concreto baseado nas notícias]
- [Risco 2]
- [Risco regulatório, macro ou de liquidez, se aplicável]

## 🎯 Perspetiva para as Próximas 24h
[Outlook claro e fundamentado: o que esperar com base nestas notícias. Evita vagas generalidades — sê direto e analítico.]

---
*Análise gerada por ChainFolioAI com base em notícias reais de ${today} ${time}*`;

    const content = await generateAiText({
      prompt: prompt + "\n\n" + NO_ADVICE_RULE + langInstruction,
      maxTokens: 2000,
      temperature: 0.25,
    });
    return { content, date: `${today} ${time}` };
  },
  ["news-briefing-v1"],
  { revalidate: 2700 },
);

export async function POST(request: Request) {
  const body = await request.json() as { items?: NewsItem[]; lang?: string };
  const items = (body.items ?? []).slice(0, 20);
  const lang = body.lang ?? "pt";

  if (!hasAnyAiProvider()) return NextResponse.json({ error: "Serviço de IA não configurado." }, { status: 503 });

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
