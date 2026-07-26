// Dados de mercado (top criptoativos), para a API pública e o MCP.
// Fonte: CoinGecko (a mesma que a app já usa).

export type MarketCoin = {
  rank: number | null;
  id: string;
  symbol: string;
  name: string;
  priceUsd: number | null;
  marketCap: number | null;
  volume24h: number | null;
  change24h: number | null;
  change7d: number | null;
};

type CoinGeckoRow = {
  market_cap_rank: number | null;
  id: string;
  symbol: string;
  name: string;
  current_price: number | null;
  market_cap: number | null;
  total_volume: number | null;
  price_change_percentage_24h: number | null;
  price_change_percentage_7d_in_currency?: number | null;
};

export type MarketResult = { coins: MarketCoin[]; count: number; source: string; timestamp: number };

/** Top `limit` criptoativos por capitalização (1–250). */
export async function getMarket(limit: number): Promise<MarketResult> {
  const perPage = Math.min(Math.max(Math.trunc(limit) || 50, 1), 250);
  const url =
    `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc` +
    `&per_page=${perPage}&page=1&price_change_percentage=24h,7d`;

  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return { coins: [], count: 0, source: "coingecko", timestamp: Date.now() };

  const rows = (await res.json().catch(() => [])) as CoinGeckoRow[];
  const coins: MarketCoin[] = (Array.isArray(rows) ? rows : []).map((r) => ({
    rank: r.market_cap_rank ?? null,
    id: r.id,
    symbol: (r.symbol ?? "").toUpperCase(),
    name: r.name,
    priceUsd: r.current_price ?? null,
    marketCap: r.market_cap ?? null,
    volume24h: r.total_volume ?? null,
    change24h: r.price_change_percentage_24h ?? null,
    change7d: r.price_change_percentage_7d_in_currency ?? null,
  }));

  return { coins, count: coins.length, source: "coingecko", timestamp: Date.now() };
}
