// Dados de mercado do próprio site (/api/markets, público) + Fear & Greed
// (alternative.me, gratuito). Cache módulo-level 55s como no coingecko.ts.
import { SITE_URL } from '@/lib/supabase';

export type GlobalMarket = {
  totalMarketCapUsd: number | null;
  marketCapChange24h: number | null;
  btcDominance: number | null;
  ethDominance: number | null;
};

export type MarketCoin = {
  symbol: string;
  name: string;
  priceUsd: number;
  change24h: number | null;
};

export type FearGreed = { value: number; label: string };

type MarketsPayload = { global: GlobalMarket | null; coins: MarketCoin[] };

let cache: { at: number; data: MarketsPayload } | null = null;
let inflight: Promise<MarketsPayload> | null = null;

export async function fetchSiteMarkets(): Promise<MarketsPayload> {
  if (cache && Date.now() - cache.at < 55_000) return cache.data;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch(`${SITE_URL}/api/markets`, { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`markets ${res.status}`);
      const json = (await res.json()) as {
        global?: GlobalMarket | null;
        data?: { symbol?: string; name?: string; priceUsd?: number; change24h?: number | null }[];
      };
      const coins: MarketCoin[] = (json.data ?? [])
        .filter((c) => c.symbol && typeof c.priceUsd === 'number')
        .map((c) => ({
          symbol: (c.symbol as string).toUpperCase(),
          name: c.name ?? (c.symbol as string),
          priceUsd: c.priceUsd as number,
          change24h: c.change24h ?? null,
        }));
      const data = { global: json.global ?? null, coins };
      cache = { at: Date.now(), data };
      return data;
    } catch (err) {
      if (cache) return cache.data;
      throw err;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

let fngCache: { at: number; data: FearGreed } | null = null;

export async function fetchFearGreed(): Promise<FearGreed | null> {
  if (fngCache && Date.now() - fngCache.at < 10 * 60_000) return fngCache.data;
  try {
    const res = await fetch('https://api.alternative.me/fng/?limit=1');
    if (!res.ok) return fngCache?.data ?? null;
    const json = (await res.json()) as { data?: { value?: string; value_classification?: string }[] };
    const row = json.data?.[0];
    if (!row?.value) return fngCache?.data ?? null;
    const labels: Record<string, string> = {
      'Extreme Fear': 'Medo extremo',
      Fear: 'Medo',
      Neutral: 'Neutro',
      Greed: 'Ganância',
      'Extreme Greed': 'Ganância extrema',
    };
    const data = {
      value: Number(row.value),
      label: labels[row.value_classification ?? ''] ?? row.value_classification ?? '—',
    };
    fngCache = { at: Date.now(), data };
    return data;
  } catch {
    return fngCache?.data ?? null;
  }
}
