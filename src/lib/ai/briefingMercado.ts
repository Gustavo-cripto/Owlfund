// Briefing de mercado (cripto ou tradicional), partilhado por /api/market-news
// e /api/market-chat (auditoria 8 out 2026, mercado-02). Antes vivia na rota do
// market-news e o Chat de Mercado recebia o texto do browser — que podia ser
// qualquer coisa. Agora o chat chama esta função com (modo, língua) validados e
// recebe o MESMO texto da cache de 45 min, sem gastar mais.
//
// Os prompts são montados em src/lib/ai/promptsMercado.ts (puro, testado).

import { unstable_cache } from "next/cache";
import { generateAiChat } from "@/lib/ai/groq";
import { estimarTokens } from "@/lib/ai/orcamentoBlock";
import { cgFetch } from "@/lib/market/coingecko";
import { getGlobalMarket } from "@/lib/api/market";
import { precoOkx, precosOkx24h } from "@/lib/market/okxSpot";
import { lerNoticias } from "@/lib/news/feeds";
import {
  promptBriefingCripto,
  promptBriefingTradicional,
  type DadosCripto,
  type DadosTradicional,
  type LangMercado,
  type ModoMercado,
} from "@/lib/ai/promptsMercado";

const COINGECKO_IDS: Record<string, string> = {
  BTC: "bitcoin", ETH: "ethereum", SOL: "solana",
  BNB: "binancecoin", ADA: "cardano", XRP: "ripple",
  DOGE: "dogecoin", AVAX: "avalanche-2", DOT: "polkadot",
};

// O CoinGecko vai SEMPRE pelo cgFetch (lote F): chave Demo — sem ela conta no
// IP partilhado da Vercel —, cache mínima por tipo de pedido e travão após 429.
async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const f = url.startsWith("https://api.coingecko.com/") ? cgFetch : fetch;
    const res = await f(url, { next: { revalidate: 300 }, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch { return null; }
}

// Dentro do unstable_cache o Next ignora a cache de dados dos fetch (trata-os
// como no-store), e o briefing é gerado por língua: sem isto eram 3 pedidos ao
// CoinGecko por língua. Os dados são os mesmos nas 4 — guardam-se 10 min nesta
// instância (lote F). Só se guardam com preços: dados pobres tentam de novo.
const CTX_TTL_MS = 10 * 60_000;
let ctxCripto: { em: number; dados: DadosCripto } | null = null;

export async function dadosCripto(): Promise<DadosCripto> {
  if (ctxCripto && Date.now() - ctxCripto.em < CTX_TTL_MS) return ctxCripto.dados;
  const d = await lerDadosCripto();
  if (d.precos.length) ctxCripto = { em: Date.now(), dados: d };
  return d;
}

async function lerDadosCripto(): Promise<DadosCripto> {
  const ids = Object.values(COINGECKO_IDS).join(",");
  type PriceData = Record<string, { usd: number; usd_24h_change: number; usd_market_cap?: number }>;
  type FearGreed = { data: { value: string; value_classification: string }[] };
  type Trending = { coins: { item: { name: string; symbol: string } }[] };
  const [cg, g, fg, trending] = await Promise.all([
    fetchJson<PriceData>(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true`),
    getGlobalMarket().catch(() => null),
    fetchJson<FearGreed>("https://api.alternative.me/fng/?limit=1"),
    fetchJson<Trending>("https://api.coingecko.com/api/v3/search/trending"),
  ]);
  // Plano B: OKX (sem capitalização — a coluna "Mcap" simplesmente não aparece).
  const prices: PriceData | null = cg ?? ((await precosOkx24h(COINGECKO_IDS)) as PriceData | null);

  const precos: DadosCripto["precos"] = [];
  if (prices) {
    for (const [simbolo, id] of Object.entries(COINGECKO_IDS)) {
      const p = prices[id];
      if (!p || !Number.isFinite(p.usd) || p.usd <= 0) continue;
      precos.push({ simbolo, usd: p.usd, var24h: Number.isFinite(p.usd_24h_change) ? p.usd_24h_change : null, mcapUsd: p.usd_market_cap ?? null });
    }
  }
  return {
    precos,
    global: g && g.totalMarketCapUsd != null
      ? { capUsd: g.totalMarketCapUsd, var24h: g.marketCapChange24h, domBtc: g.btcDominance, domEth: g.ethDominance }
      : null,
    fearGreed: fg?.data?.[0] ? { valor: String(fg.data[0].value), rotulo: String(fg.data[0].value_classification ?? "") } : null,
    trending: (trending?.coins ?? []).slice(0, 5).map((c) => ({ nome: String(c.item?.name ?? ""), simbolo: String(c.item?.symbol ?? "") })).filter((c) => c.nome),
  };
}

async function dadosTradicional(): Promise<DadosTradicional> {
  type MetalsData = { price?: number } | Array<{ price?: number; gold?: number; silver?: number }>;
  const valor = (m: MetalsData | null): number | null => {
    const v = Array.isArray(m) ? m[0]?.price : m?.price;
    return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
  };
  const [gold, silver, manchetes] = await Promise.all([
    fetchJson<MetalsData>("https://api.metals.live/v1/spot/gold"),
    fetchJson<MetalsData>("https://api.metals.live/v1/spot/silver"),
    lerNoticias({ tipo: "macro", max: 15 }).catch(() => []),
  ]);
  let ouro: DadosTradicional["ouro"] = valor(gold) != null ? { usd: valor(gold)!, fonte: "metals.live, XAU" } : null;
  if (!ouro) {
    // Reserva: XAUT (Tether Gold, 1 token ≈ 1 onça troy) na OKX.
    const xaut = await precoOkx("XAUT-USDT");
    if (xaut) ouro = { usd: xaut, fonte: "OKX, token XAUT ≈ 1 onça" };
  }
  return { ouro, prata: valor(silver), manchetes };
}

const agora = () => ({
  data: new Date().toISOString().split("T")[0],
  hora: new Date().toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Lisbon" }),
});

/**
 * Gera o briefing de mercado, em cache (Data Cache do Next/Vercel) por modo+língua
 * durante 45 min. A análise é igual para todos os utilizadores, por isso a cache
 * evita gerar de novo a cada clique e poupa tokens. Lança em caso de erro (erros
 * não ficam em cache). Quem chama VALIDA modo e língua (chaves fixas: 8 no total).
 */
export const generateMarketBriefing = unstable_cache(
  async (mode: ModoMercado, lang: LangMercado): Promise<{ content: string; mode: ModoMercado; date: string }> => {
    const a = agora();
    const prompt = mode === "crypto"
      ? promptBriefingCripto(await dadosCripto(), lang, a)
      : promptBriefingTradicional(await dadosTradicional(), lang, a);
    const content = await generateAiChat([{ role: "user", content: prompt }], {
      maxTokens: 1500,
      temperature: 0.2,
      tokensEntrada: estimarTokens(prompt),
    });
    return { content, mode, date: `${a.data} ${a.hora}` };
  },
  ["market-news-briefing-v2"],
  { revalidate: 2700 },
);
