import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Returns EUR prices for BTC/ETH/SOL/ADA at 1d, 7d, 30d ago
// Used for PNL calculation without needing portfolio snapshots

type HistoricalPrices = {
  "1d": Record<string, number>;
  "7d": Record<string, number>;
  "30d": Record<string, number>;
};

const COINS = ["bitcoin", "ethereum", "solana", "cardano"] as const;
const SYMBOL_MAP: Record<string, string> = {
  bitcoin: "BTC", ethereum: "ETH", solana: "SOL", cardano: "ADA",
};

// CoinGecko /coins/{id}/market_chart gives hourly data for <=90 days
async function fetchCoinHistory(coinId: string): Promise<{ d1: number; d7: number; d30: number }> {
  const res = await fetch(
    `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=eur&days=31&interval=daily`,
    {
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(10000),
    }
  );
  if (!res.ok) throw new Error(`CoinGecko ${coinId} ${res.status}`);
  type ChartData = { prices: [number, number][] };
  const data = (await res.json()) as ChartData;
  const prices = data.prices ?? [];
  // prices is array of [timestamp_ms, price_eur] sorted oldest→newest
  const len = prices.length;
  // last entry = today, index [len-2] = 1d ago, [len-8] = 7d ago, [len-31] = 30d ago
  const get = (offset: number) => prices[Math.max(0, len - 1 - offset)]?.[1] ?? 0;
  return { d1: get(1), d7: get(7), d30: get(30) };
}

// Binance Klines fallback — 1d, 7d, 30d closing prices
async function fetchBinanceHistory(symbol: string): Promise<{ d1: number; d7: number; d30: number }> {
  const fetchClose = async (daysAgo: number): Promise<number> => {
    const now = Date.now();
    const startTime = now - (daysAgo + 1) * 86400000;
    const endTime = now - daysAgo * 86400000;
    const res = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${symbol}EUR&interval=1d&startTime=${startTime}&endTime=${endTime}&limit=1`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return 0;
    const data = (await res.json()) as [string, string, string, string, string][];
    return parseFloat(data[0]?.[4] ?? "0"); // close price
  };
  const [d1, d7, d30] = await Promise.all([fetchClose(1), fetchClose(7), fetchClose(30)]);
  return { d1, d7, d30 };
}

const BINANCE_SYMBOLS: Record<string, string> = {
  bitcoin: "BTC", ethereum: "ETH", solana: "SOL", cardano: "ADA",
};

export async function GET() {
  const result: HistoricalPrices = { "1d": {}, "7d": {}, "30d": {} };

  await Promise.all(
    COINS.map(async (coinId) => {
      const sym = SYMBOL_MAP[coinId];
      try {
        const { d1, d7, d30 } = await fetchCoinHistory(coinId);
        if (d1 > 0) {
          result["1d"][sym] = d1;
          result["7d"][sym] = d7;
          result["30d"][sym] = d30;
          return;
        }
      } catch { /* fall through to Binance */ }

      // Fallback: Binance
      try {
        const binanceSym = BINANCE_SYMBOLS[coinId];
        if (binanceSym) {
          const { d1, d7, d30 } = await fetchBinanceHistory(binanceSym);
          result["1d"][sym] = d1;
          result["7d"][sym] = d7;
          result["30d"][sym] = d30;
        }
      } catch { /* ignore */ }
    })
  );

  return NextResponse.json(result, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" },
  });
}
