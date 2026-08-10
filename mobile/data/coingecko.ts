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
  );

  if (ids.length === 0) return {};

  const url =
    'https://api.coingecko.com/api/v3/coins/markets' +
    '?vs_currency=eur' +
    `&ids=${ids.join(',')}` +
    '&sparkline=true' +
    '&price_change_percentage=1h,24h,7d';

  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`CoinGecko respondeu ${res.status}`);
  }

  const rows = (await res.json()) as CoinGeckoMarket[];
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
