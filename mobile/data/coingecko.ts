// Serviço de preços reais via CoinGecko (grátis, sem chave). Puxa em EUR para
// casar com a moeda do portfólio. Só cobre cripto — ativos tradicionais
// (Selic/CDB/ações B3) não têm feed unificado gratuito e ficam sem preço.

export type MarketRow = {
  symbol: string;
  priceEur: number;
  change1h: number | null;
  change24h: number | null;
  change7d: number | null;
  volumeEur: number;
  marketCapEur: number | null;
  sparkline: number[];
};

// Mapa símbolo → id CoinGecko para os ativos que o app oferece (ASSET_OPTIONS.crypto)
// mais alguns comuns. CoinGecko busca por id, não por símbolo, então mapeamos aqui.
const SYMBOL_TO_ID: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  BNB: 'binancecoin',
  XRP: 'ripple',
  USDT: 'tether',
  USDC: 'usd-coin',
  ADA: 'cardano',
  DOGE: 'dogecoin',
  DOT: 'polkadot',
  MATIC: 'matic-network',
  LINK: 'chainlink',
  AVAX: 'avalanche-2',
  TRX: 'tron',
  LTC: 'litecoin',
};

export const resolveCoinId = (symbol: string | undefined): string | null => {
  if (!symbol) return null;
  return SYMBOL_TO_ID[symbol.toUpperCase()] ?? null;
};

type CoinGeckoMarket = {
  symbol?: string;
  current_price?: number | null;
  total_volume?: number | null;
  market_cap?: number | null;
  price_change_percentage_1h_in_currency?: number | null;
  price_change_percentage_24h_in_currency?: number | null;
  price_change_percentage_7d_in_currency?: number | null;
  sparkline_in_7d?: { price?: number[] };
};

// Cache módulo-level com dedup de pedidos em curso. O CoinGecko grátis tem
// rate limit apertado (~10/min) e as respostas 429 chegam sem CORS no web —
// por isso: (1) TTL de 55s por conjunto de ids; (2) um só fetch por conjunto
// mesmo com vários ecrãs montados; (3) em falha, serve o último valor bom.
const CACHE_TTL_MS = 55_000;
const cacheByKey = new Map<string, { at: number; rows: CoinGeckoMarket[] }>();
const inflightByKey = new Map<string, Promise<CoinGeckoMarket[]>>();

async function fetchRows(ids: string[]): Promise<CoinGeckoMarket[]> {
  const key = ids.join(',');
  const cached = cacheByKey.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.rows;

  const existing = inflightByKey.get(key);
  if (existing) return existing;

  const url =
    'https://api.coingecko.com/api/v3/coins/markets' +
    '?vs_currency=eur' +
    `&ids=${key}` +
    '&sparkline=true' +
    '&price_change_percentage=1h,24h,7d';

  const p = (async () => {
    try {
      const res = await fetch(url, { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`CoinGecko respondeu ${res.status}`);
      const rows = (await res.json()) as CoinGeckoMarket[];
      cacheByKey.set(key, { at: Date.now(), rows });
      return rows;
    } catch (err) {
      // Rate limit / rede: devolve o último valor bom (stale) se existir.
      if (cached) return cached.rows;
      throw err;
    } finally {
      inflightByKey.delete(key);
    }
  })();
  inflightByKey.set(key, p);
  return p;
}

// Recebe símbolos (ex: ['BTC','ETH']), resolve ids e devolve um mapa
// símbolo→MarketRow apenas para os que o CoinGecko reconhece.
export async function fetchMarketPrices(
  symbols: string[]
): Promise<Record<string, MarketRow>> {
  const ids = Array.from(
    new Set(
      symbols
        .map((s) => resolveCoinId(s))
        .filter((id): id is string => Boolean(id))
    )
  ).sort();

  if (ids.length === 0) return {};

  const rows = await fetchRows(ids);
  const bySymbol: Record<string, MarketRow> = {};

  for (const row of rows) {
    const symbol = (row.symbol ?? '').toUpperCase();
    if (!symbol) continue;
    bySymbol[symbol] = {
      symbol,
      priceEur: Number(row.current_price ?? 0),
      change1h: row.price_change_percentage_1h_in_currency ?? null,
      change24h: row.price_change_percentage_24h_in_currency ?? null,
      change7d: row.price_change_percentage_7d_in_currency ?? null,
      volumeEur: Number(row.total_volume ?? 0),
      marketCapEur: row.market_cap ?? null,
      sparkline: row.sparkline_in_7d?.price ?? [],
    };
  }

  return bySymbol;
}
