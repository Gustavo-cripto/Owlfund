import { NextResponse } from "next/server";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export async function POST(request: Request) {
  const body = await request.json() as { mode?: "crypto" | "tradicional"; symbols?: string[] };
  const { mode = "crypto", symbols = [] } = body;

  const apiKey = (process.env.GROQ_API_KEY ?? "").trim();
  if (!apiKey) {
    return NextResponse.json({ error: "GROQ_API_KEY não configurada." }, { status: 503 });
  }

  const model = (process.env.GROQ_MODEL ?? "").trim() || "llama-3.3-70b-versatile";

  const today = new Date().toISOString().split("T")[0];

  const symbolList = symbols.length > 0 ? symbols.join(", ") : (mode === "crypto" ? "BTC, ETH, SOL, BNB, ADA" : "S&P 500, NVDA, AAPL, MSFT, Ouro");

  const prompt = mode === "crypto"
    ? `És um analista de criptomoedas sénior. Hoje é ${today}. Faz um briefing diário de mercado cripto em português europeu para os seguintes ativos: ${symbolList}.

Estrutura a resposta EXATAMENTE assim (usa estes headers):

## 📊 Resumo do Mercado
[2-3 frases sobre o sentimento geral do mercado cripto hoje]

## 🔥 Destaques
[3-4 bullet points com os movimentos mais relevantes, trends e catalisadores]

## 📈 Análise por Ativo
[Para cada ativo principal: tendência curto prazo, nível de suporte/resistência chave, sentimento]

## ⚠️ Riscos a Monitorizar
[2-3 riscos macro ou específicos do mercado cripto]

## 🎯 Perspetiva
[1 parágrafo com outlook para as próximas 24-48h]

Usa dados e contexto do teu conhecimento até à data de treino. Sê específico, profissional e conciso.`
    : `És um analista de mercados financeiros sénior. Hoje é ${today}. Faz um briefing diário do mercado tradicional em português europeu para: ${symbolList}.

Estrutura a resposta EXATAMENTE assim:

## 📊 Resumo Macro
[2-3 frases sobre sentimento geral: Fed, inflação, índices]

## 🔥 Destaques
[3-4 bullet points com os movimentos mais relevantes do dia]

## 📈 Análise por Ativo
[Para cada ativo: tendência, níveis técnicos chave, catalisadores]

## ⚠️ Riscos Macro
[2-3 riscos geopolíticos, económicos ou setoriais]

## 🎯 Perspetiva
[1 parágrafo com outlook para os próximos dias]

Usa dados do teu conhecimento. Sê específico, profissional e conciso.`;

  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1200,
        temperature: 0.4,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `Groq: ${err}` }, { status: 502 });
    }

    const data = await res.json() as { choices: { message: { content: string } }[] };
    const content = data.choices[0]?.message?.content ?? "";
    return NextResponse.json({ content, mode, date: today });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro" }, { status: 500 });
  }
}
