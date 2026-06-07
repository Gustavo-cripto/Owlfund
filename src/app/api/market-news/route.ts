import { NextResponse } from "next/server";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const COINGECKO_IDS: Record<string, string> = {
  BTC: "bitcoin", ETH: "ethereum", SOL: "solana",
  BNB: "binancecoin", ADA: "cardano", XRP: "ripple",
  DOGE: "dogecoin", AVAX: "avalanche-2", DOT: "polkadot",
};

async function fetchCryptoPrices(): Promise<Record<string, { usd: number; usd_24h_change: number }>> {
  try {
    const ids = Object.values(COINGECKO_IDS).join(",");
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`,
      { next: { revalidate: 300 } }
    );
    if (!res.ok) return {};
    return await res.json() as Record<string, { usd: number; usd_24h_change: number }>;
  } catch {
    return {};
  }
}

function formatPrices(prices: Record<string, { usd: number; usd_24h_change: number }>): string {
  const lines: string[] = [];
  for (const [sym, id] of Object.entries(COINGECKO_IDS)) {
    const p = prices[id];
    if (!p) continue;
    const sign = p.usd_24h_change >= 0 ? "+" : "";
    lines.push(`${sym}: $${p.usd.toLocaleString("en-US", { maximumFractionDigits: 2 })} (${sign}${p.usd_24h_change.toFixed(2)}% 24h)`);
  }
  return lines.join("\n");
}

export async function POST(request: Request) {
  const body = await request.json() as { mode?: "crypto" | "tradicional" };
  const { mode = "crypto" } = body;

  const apiKey = (process.env.GROQ_API_KEY ?? "").trim();
  if (!apiKey) {
    return NextResponse.json({ error: "GROQ_API_KEY não configurada." }, { status: 503 });
  }

  const model = (process.env.GROQ_MODEL ?? "").trim() || "llama-3.3-70b-versatile";
  const today = new Date().toISOString().split("T")[0];

  let priceContext = "";
  if (mode === "crypto") {
    const prices = await fetchCryptoPrices();
    const formatted = formatPrices(prices);
    if (formatted) {
      priceContext = `\n\nPREÇOS REAIS EM TEMPO REAL (usa ESTES valores — não inventes preços):\n${formatted}\n`;
    }
  }

  const prompt = mode === "crypto"
    ? `És um analista de criptomoedas sénior. A data de hoje é ${today}.${priceContext}

Com base nos preços reais acima, faz um briefing de mercado cripto em português europeu.

REGRAS IMPORTANTES:
- Usa APENAS os preços fornecidos acima — NUNCA inventes valores
- Não menciones preços do teu conhecimento de treino
- Foca em análise técnica, sentimento e contexto macro
- Sê profissional e conciso

Estrutura a resposta EXATAMENTE assim:

## 📊 Resumo do Mercado
[2-3 frases sobre o sentimento geral com base nos preços reais]

## 🔥 Destaques
- [movimento relevante baseado nos dados reais]
- [outro destaque]
- [outro destaque]

## 📈 Análise por Ativo
**BTC:** [análise com preço real fornecido]
**ETH:** [análise]
**SOL:** [análise]
**BNB:** [análise]

## ⚠️ Riscos a Monitorizar
- [risco macro ou cripto]
- [outro risco]

## 🎯 Perspetiva
[1 parágrafo com outlook para as próximas 24-48h baseado nos dados reais]`
    : `És um analista de mercados financeiros sénior. A data de hoje é ${today}.

Faz um briefing do mercado tradicional em português europeu. Foca em análise macro, tendências estruturais e contexto de investimento — NÃO inventes cotações específicas do dia se não tens acesso a dados em tempo real.

## 📊 Resumo Macro
[Sentimento geral: Fed, inflação, crescimento económico]

## 🔥 Destaques
- [tendência ou catalisador relevante]
- [outro]
- [outro]

## 📈 Análise por Setor
**Tecnologia (NVDA, AAPL, MSFT):** [tendência setorial]
**S&P 500 / Índices:** [contexto]
**Commodities (Ouro, Petróleo):** [análise]

## ⚠️ Riscos Macro
- [risco geopolítico ou económico]
- [outro]

## 🎯 Perspetiva
[Outlook para os próximos dias/semanas]`;

  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1400,
        temperature: 0.3,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `Groq: ${err}` }, { status: 502 });
    }

    const data = await res.json() as { choices: { message: { content: string } }[] };
    const content = data.choices[0]?.message?.content ?? "";
    return NextResponse.json({ content, mode, date: today, hasPrices: !!priceContext });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro" }, { status: 500 });
  }
}
