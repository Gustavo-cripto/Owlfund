import { NextResponse } from "next/server";

type CoinExTicker = {
  last: string;
  open: string;
  vol: string;
  value: string;
};

type CoinGeckoRow = {
  symbol: string;
  name: string;
  market_cap: number | null;
};

const extractCoinExTickers = (payload: unknown): Record<string, CoinExTicker> => {
  const data = (payload ?? {}) as Record<string, unknown>;
  const inner = (data.data ?? {}) as Record<string, unknown>;
  const ticker = inner.ticker ?? inner.tickers;
  if (ticker && typeof ticker === "object") {
    return ticker as Record<string, CoinExTicker>;
  }
  return {};
};

export async function GET() {
  try {
    const [coinexResponse, coingeckoResponse] = await Promise.all([
      fetch("https://api.coinex.com/v2/spot/market/ticker"),
      fetch(
        "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1"
      ),
    ]);

    let coinexPayload: unknown = null;
    if (coinexResponse.ok) {
      coinexPayload = await coinexResponse.json().catch(() => null);
    } else {
      const fallback = await fetch("https://api.coinex.com/v1/market/ticker");
      if (fallback.ok) {
        coinexPayload = await fallback.json().catch(() => null);
      }
    }

    if (!coinexPayload) {
      return NextResponse.json({ error: "Falha ao consultar CoinEx." }, { status: 502 });
    }

    const tickers = extractCoinExTickers(coinexPayload);

    const coingeckoPayload = coingeckoResponse.ok
      ? ((await coingeckoResponse.json()) as CoinGeckoRow[])
      : [];

    const coingeckoMap = new Map(
      coingeckoPayload.map((row) => [row.symbol.toUpperCase(), row])
    );

    const rows = coingeckoPayload
      .filter((row) => row.symbol)
      .map((row) => {
        const symbol = row.symbol.toUpperCase();
        const market = `${symbol}USDT`;
        const ticker = tickers[market];
        if (!ticker) return null;
        const last = Number(ticker.last);
        const open = Number(ticker.open);
        const change24h = open ? ((last - open) / open) * 100 : 0;
        const marketCap = coingeckoMap.get(symbol)?.market_cap ?? null;
        const name = coingeckoMap.get(symbol)?.name ?? symbol;
        const volume = Number(ticker.value);

        return {
          market,
          symbol,
          name,
          priceUsd: Number.isFinite(last) ? last : 0,
          change24h: Number.isFinite(change24h) ? change24h : 0,
          marketCapUsd: Number.isFinite(marketCap ?? 0) ? marketCap : null,
          volume24hUsd: Number.isFinite(volume) ? volume : 0,
        };
      })
      .filter((row): row is NonNullable<typeof row> => !!row)
      .sort((a, b) => (b.marketCapUsd ?? 0) - (a.marketCapUsd ?? 0))
      .slice(0, 200);

    return NextResponse.json({ data: rows });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro inesperado." },
      { status: 500 }
    );
  }
}
