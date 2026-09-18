import { UpstreamError, assertUpstream } from "@/lib/api/upstream";
import { cgFetch } from "@/lib/market/coingecko";
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

  let res: Response;
  try { res = await fetch(url, { signal: AbortSignal.timeout(8000) }); }
  catch { throw new UpstreamError(504, "coingecko"); }
  assertUpstream(res, "coingecko");
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

// ── Mercado global (dominância) ──────────────────────────────────────────────

export type GlobalMarket = {
  totalMarketCapUsd: number | null;
  marketCapChange24h: number | null;
  btcDominance: number | null;
  ethDominance: number | null;
  activeCryptocurrencies: number | null;
  timestamp: number;
};

/** Capitalização total e dominância BTC/ETH (CoinGecko). */
export async function getGlobalMarket(): Promise<GlobalMarket> {
  const vazio: GlobalMarket = {
    totalMarketCapUsd: null, marketCapChange24h: null, btcDominance: null,
    ethDominance: null, activeCryptocurrencies: null, timestamp: Date.now(),
  };
  try {
    const res = await cgFetch("https://api.coingecko.com/api/v3/global", {
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 300 },
    });
    if (!res.ok) return vazio;
    const j = (await res.json()) as {
      data?: {
        total_market_cap?: { usd?: number };
        market_cap_change_percentage_24h_usd?: number;
        market_cap_percentage?: { btc?: number; eth?: number };
        active_cryptocurrencies?: number;
      };
    };
    const d = j.data;
    if (!d) return vazio;
    return {
      totalMarketCapUsd: d.total_market_cap?.usd ?? null,
      marketCapChange24h: d.market_cap_change_percentage_24h_usd ?? null,
      btcDominance: d.market_cap_percentage?.btc ?? null,
      ethDominance: d.market_cap_percentage?.eth ?? null,
      activeCryptocurrencies: d.active_cryptocurrencies ?? null,
      timestamp: Date.now(),
    };
  } catch {
    return vazio;
  }
}

// ── Preço de um dia (velas diárias da OKX) ───────────────────────────────────

const ISO_DIA = /^\d{4}-\d{2}-\d{2}$/;
const STABLES = new Set(["USDT", "USDC", "DAI", "USD"]);

/** Preço de fecho em dólares de um símbolo numa data (UTC). null = sem dados. */
export async function getPriceOn(symbol: string, date: string): Promise<{ symbol: string; date: string; usd: number | null }> {
  const sym = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
  if (!sym || !ISO_DIA.test(date)) return { symbol: sym, date, usd: null };
  if (STABLES.has(sym)) return { symbol: sym, date, usd: 1 };

  const dia = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(dia) || dia > Date.now()) return { symbol: sym, date, usd: null };

  try {
    const url = `https://www.okx.com/api/v5/market/history-candles?instId=${sym}-USDT&bar=1Dutc&after=${dia + 86_400_000}&limit=1`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 86_400 },
    });
    if (!res.ok) return { symbol: sym, date, usd: null };
    const j = (await res.json()) as { code?: string; data?: string[][] };
    const c = j.data?.[0];
    // A vela devolvida tem de ser mesmo a do dia pedido; senão é outra data.
    if (j.code !== "0" || !c || Number(c[0]) !== dia) return { symbol: sym, date, usd: null };
    const usd = Number(c[4]);
    return { symbol: sym, date, usd: usd > 0 ? usd : null };
  } catch {
    return { symbol: sym, date, usd: null };
  }
}
