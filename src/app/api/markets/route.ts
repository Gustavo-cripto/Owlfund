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

export async function GET() {
  try {
    const [coinexResponse, coingeckoResponse] = await Promise.all([
      fetch("https://api.coinex.com/v1/market/ticker"),
      fetch(
        "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1"
      ),
    ]);

    if (!coinexResponse.ok) {
      return NextResponse.json(
        { error: "Falha ao consultar CoinEx." },
        { status: 502 }
      );
    }

    const coinexPayload = (await coinexResponse.json()) as {
      data?: { ticker?: Record<string, CoinExTicker> };
    };

    const tickers = coinexPayload.data?.ticker ?? {};

    const coingeckoPayload = coingeckoResponse.ok
      ? ((await coingeckoResponse.json()) as CoinGeckoRow[])
      : [];

    const coingeckoMap = new Map(
      coingeckoPayload.map((row) => [row.symbol.toUpperCase(), row])
    );

    const rows = Object.entries(tickers)
      .filter(([market]) => market.endsWith("USDT"))
      .map(([market, ticker]) => {
        const symbol = market.replace("USDT", "");
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
      .sort((a, b) => b.volume24hUsd - a.volume24hUsd)
      .slice(0, 200);

    return NextResponse.json({ data: rows });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro inesperado." },
      { status: 500 }
    );
  }
}
