import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { generateAiText, friendlyAiError, errorStatus, hasAnyAiProvider } from "@/lib/ai/groq";
import { NO_ADVICE_RULE } from "@/lib/ai/disclaimer";

const COINGECKO_IDS: Record<string, string> = {
  BTC: "bitcoin", ETH: "ethereum", SOL: "solana",
  BNB: "binancecoin", ADA: "cardano", XRP: "ripple",
  DOGE: "dogecoin", AVAX: "avalanche-2", DOT: "polkadot",
};

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch { return null; }
}

async function buildCryptoContext(): Promise<string> {
  const lines: string[] = [];

  // 1. Preços + variação 24h
  const ids = Object.values(COINGECKO_IDS).join(",");
  type PriceData = Record<string, { usd: number; usd_24h_change: number; usd_market_cap: number; usd_24h_vol: number }>;
  const prices = await fetchJson<PriceData>(
    `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true`
  );

  lines.push("=== PREÇOS EM TEMPO REAL ===");
  if (prices) {
    for (const [sym, id] of Object.entries(COINGECKO_IDS)) {
      const p = prices[id];
      if (!p) continue;
      const sign = p.usd_24h_change >= 0 ? "+" : "";
      const mcap = p.usd_market_cap ? ` | Mcap: $${(p.usd_market_cap / 1e9).toFixed(1)}B` : "";
      lines.push(`${sym}: $${p.usd.toLocaleString("en-US", { maximumFractionDigits: 2 })} (${sign}${p.usd_24h_change?.toFixed(2) ?? "?"}% 24h${mcap})`);
    }
  }

  // 2. Dados globais do mercado
  type GlobalData = { data: { total_market_cap: { usd: number }; total_volume: { usd: number }; market_cap_percentage: { btc: number; eth: number }; market_cap_change_percentage_24h_usd: number; active_cryptocurrencies: number } };
  const global = await fetchJson<GlobalData>("https://api.coingecko.com/api/v3/global");
  if (global?.data) {
    const g = global.data;
    lines.push("\n=== MERCADO GLOBAL ===");
    lines.push(`Cap total: $${(g.total_market_cap.usd / 1e12).toFixed(2)}T`);
    lines.push(`Volume 24h: $${(g.total_volume.usd / 1e9).toFixed(1)}B`);
    lines.push(`Variação cap 24h: ${g.market_cap_change_percentage_24h_usd?.toFixed(2)}%`);
    lines.push(`Dominância BTC: ${g.market_cap_percentage?.btc?.toFixed(1)}% | ETH: ${g.market_cap_percentage?.eth?.toFixed(1)}%`);
  }

  // 3. Fear & Greed
  type FearGreed = { data: { value: string; value_classification: string }[] };
  const fg = await fetchJson<FearGreed>("https://api.alternative.me/fng/?limit=1");
  if (fg?.data?.[0]) {
    lines.push("\n=== FEAR & GREED INDEX ===");
    lines.push(`${fg.data[0].value}/100 — ${fg.data[0].value_classification}`);
  }

  // 4. Trending coins
  type Trending = { coins: { item: { name: string; symbol: string; price_btc: number } }[] };
  const trending = await fetchJson<Trending>("https://api.coingecko.com/api/v3/search/trending");
  if (trending?.coins) {
    lines.push("\n=== TRENDING (últimas 24h) ===");
    trending.coins.slice(0, 5).forEach((c) => {
      lines.push(`${c.item.name} (${c.item.symbol})`);
    });
  }

  return lines.join("\n");
}

async function buildTraditionalContext(): Promise<string> {
  const lines: string[] = [];

  // Ouro e prata via metals API (gratuita)
  type MetalsData = { price: number; currency: string };
  const gold = await fetchJson<MetalsData>("https://api.metals.live/v1/spot/gold");
  const silver = await fetchJson<MetalsData>("https://api.metals.live/v1/spot/silver");

  lines.push("=== COMMODITIES EM TEMPO REAL ===");
  if (gold) lines.push(`Ouro (XAU): $${gold.price?.toFixed(2) ?? "n/d"}/oz`);
  if (silver) lines.push(`Prata (XAG): $${silver.price?.toFixed(2) ?? "n/d"}/oz`);

  lines.push("\n=== NOTA ===");
  lines.push("Para ações e índices (S&P 500, NVDA, AAPL, MSFT), faz análise baseada em tendências estruturais e contexto macro — não inventes cotações específicas do dia.");

  return lines.join("\n");
}

type MarketMode = "crypto" | "tradicional";

/**
 * Gera o briefing de mercado, em cache (Data Cache do Next/Vercel) por modo+idioma
 * durante 45 min. A análise é igual para todos os utilizadores, por isso o cache
 * evita gerar de novo a cada clique e poupa tokens do Groq. Lança em caso de erro
 * (erros não ficam em cache).
 */
const generateMarketBriefing = unstable_cache(
  async (mode: MarketMode, lang: string): Promise<{ content: string; mode: MarketMode; date: string }> => {
  const LANG_NAME: Record<string, string> = { pt: "português europeu (PT-PT)", en: "English", es: "español", fr: "français" };
  const langInstruction = `\n\nIDIOMA (regra crítica): Escreve TODO o briefing em ${LANG_NAME[lang] ?? "português europeu (PT-PT)"}, incluindo títulos e secções.`;

  const today = new Date().toISOString().split("T")[0];
  const time = new Date().toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Lisbon" });

  const context = mode === "crypto"
    ? await buildCryptoContext()
    : await buildTraditionalContext();

  const prompt = mode === "crypto"
    ? `És um analista de criptomoedas sénior. Data/hora atual: ${today} ${time} (Lisboa).

DADOS REAIS DE MERCADO AGORA:
${context}

Com base EXCLUSIVAMENTE nos dados reais acima, escreve um briefing de mercado em português europeu.

REGRAS:
- Usa APENAS os valores fornecidos acima para preços
- Nunca inventes dados — se não sabes algo, diz "dados não disponíveis"
- Foca em análise técnica, sentimento (Fear & Greed) e dominância

## 📊 Resumo do Mercado
[Sentimento geral baseado no Fear & Greed e variações 24h reais]

## 🔥 Destaques
- [baseado nos dados reais — variações, trending, dominância]
- [outro destaque real]
- [outro]

## 📈 Análise por Ativo
**BTC $[preço real]:** [análise]
**ETH $[preço real]:** [análise]
**SOL $[preço real]:** [análise]
**BNB $[preço real]:** [análise]

## 🚀 Trending Agora
[Menciona as coins trending fornecidas e por que podem estar a ganhar atenção]

## ⚠️ Riscos
- [risco identificável com base nos dados]
- [outro]

## 🎯 Perspetiva 24-48h
[Outlook baseado no sentimento e dados reais]`
    : `És um analista de mercados financeiros sénior. Data/hora atual: ${today} ${time} (Lisboa).

DADOS REAIS DE MERCADO:
${context}

Escreve um briefing do mercado tradicional em português europeu.

## 📊 Resumo Macro
[Contexto macro atual: Fed, inflação, ciclo económico]

## 🔥 Destaques
- [tendência setorial relevante]
- [outro]
- [outro]

## 📈 Análise por Setor
**Commodities (Ouro: $[preço real], Prata: $[preço real]):** [análise]
**Tecnologia (NVDA, AAPL, MSFT):** [tendência estrutural do setor]
**S&P 500 / Índices:** [contexto e expectativas]

## ⚠️ Riscos Macro
- [risco real identificável]
- [outro]

## 🎯 Perspetiva
[Outlook para os próximos dias]`;

    const content = await generateAiText({
      prompt: prompt + "\n\n" + NO_ADVICE_RULE + langInstruction,
      maxTokens: 1500,
      temperature: 0.2,
    });
    return { content, mode, date: `${today} ${time}` };
  },
  ["market-news-briefing-v1"],
  { revalidate: 2700 },
);

export async function POST(request: Request) {
  const body = await request.json() as { mode?: MarketMode; lang?: string };
  const { mode = "crypto", lang = "pt" } = body;

  if (!hasAnyAiProvider()) return NextResponse.json({ error: "Serviço de IA não configurado." }, { status: 503 });

  try {
    const result = await generateMarketBriefing(mode, lang);
    return NextResponse.json(result);
  } catch (err) {
    const status = errorStatus(err);
    return NextResponse.json(
      { error: friendlyAiError(status, lang) },
      { status: status === 429 ? 429 : 502 },
    );
  }
}
