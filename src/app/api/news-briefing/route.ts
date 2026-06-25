import { NextResponse } from "next/server";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

type NewsItem = {
  title: string;
  description: string;
  source: string;
  pubDate: string;
  category?: string;
};

export async function POST(request: Request) {
  const body = await request.json() as { items?: NewsItem[] };
  const items = (body.items ?? []).slice(0, 20);

  const apiKey = (process.env.GROQ_API_KEY ?? "").trim();
  if (!apiKey) return NextResponse.json({ error: "GROQ_API_KEY não configurada." }, { status: 503 });

  const model = (process.env.GROQ_MODEL ?? "").trim() || "llama-3.3-70b-versatile";
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

  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 2000,
        temperature: 0.25,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `Groq: ${err}` }, { status: 502 });
    }

    const data = await res.json() as { choices: { message: { content: string } }[] };
    const content = data.choices[0]?.message?.content ?? "";
    return NextResponse.json({ content, date: `${today} ${time}` });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro" }, { status: 500 });
  }
}
