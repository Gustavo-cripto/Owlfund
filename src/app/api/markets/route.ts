import { NextResponse } from "next/server";

type CoinExTicker = {
  last: string;
  open: string;
  vol: string;
  value: string;
};

type CoinGeckoRow = {
  id?: string;
  symbol: string;
  name: string;
  market_cap: number | null;
  sparkline_in_7d?: { price?: number[] };
};

type SentimentRow = {
  symbol: string;
  name: string;
  rsi7d: number | null;
  score: number | null;
  label: string;
};

const extractCoinExTickers = (payload: unknown): Record<string, CoinExTicker> => {
  const data = (payload ?? {}) as Record<string, unknown>;
  const inner = data.data;
  if (Array.isArray(inner)) {
    return inner.reduce<Record<string, CoinExTicker>>((acc, item) => {
      if (!item || typeof item !== "object") return acc;
      const row = item as Record<string, unknown>;
      const market = typeof row.market === "string" ? row.market : "";
      if (!market) return acc;
      acc[market] = {
        last: String(row.last ?? row.close ?? ""),
        open: String(row.open ?? ""),
        vol: String(row.volume ?? row.vol ?? ""),
        value: String(row.value ?? ""),
      };
      return acc;
    }, {});
  }
  const innerRecord = (inner ?? {}) as Record<string, unknown>;
  const ticker = innerRecord.ticker ?? innerRecord.tickers;
  if (ticker && typeof ticker === "object") {
    return ticker as Record<string, CoinExTicker>;
  }
  return {};
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const computeRsi = (prices: number[], period = 14): number | null => {
  if (!Array.isArray(prices) || prices.length < period + 1) return null;
  const deltas: number[] = [];
  for (let i = 1; i < prices.length; i += 1) {
    deltas.push(prices[i] - prices[i - 1]);
  }
  let gain = 0;
  let loss = 0;
  for (let i = 0; i < period; i += 1) {
    const d = deltas[i] ?? 0;
    if (d >= 0) gain += d;
    else loss += -d;
  }
  gain /= period;
  loss /= period;
  for (let i = period; i < deltas.length; i += 1) {
    const d = deltas[i] ?? 0;
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    gain = (gain * (period - 1) + g) / period;
    loss = (loss * (period - 1) + l) / period;
  }
  if (loss === 0) return 100;
  const rs = gain / loss;
  const rsi = 100 - 100 / (1 + rs);
  return clamp(rsi, 0, 100);
};

const labelFromScore = (score: number | null) => {
  if (score == null) return "—";
  if (score < 25) return "Medo extremo";
  if (score < 45) return "Medo";
  if (score < 55) return "Neutro";
  if (score < 75) return "Ganância";
  return "Ganância extrema";
};

export async function GET() {
  try {
    const [coinexResponse, coingeckoResponse, coingeckoTopResponse] = await Promise.all([
      fetch("https://api.coinex.com/v2/spot/ticker"),
      fetch(
        "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1"
      ),
      fetch(
        "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=10&page=1&sparkline=true"
      ),
    ]);

    const coinexPayload = coinexResponse.ok
      ? await coinexResponse.json().catch(() => null)
      : null;

    if (!coinexPayload) {
      return NextResponse.json({ error: "Falha ao consultar CoinEx." }, { status: 502 });
    }

    const tickers = extractCoinExTickers(coinexPayload);

    const coingeckoPayload = coingeckoResponse.ok
      ? ((await coingeckoResponse.json()) as CoinGeckoRow[])
      : [];

    const coingeckoTopPayload = coingeckoTopResponse.ok
      ? ((await coingeckoTopResponse.json()) as CoinGeckoRow[])
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

    const sentimentTop10: SentimentRow[] = coingeckoTopPayload.map((row) => {
      const prices = row.sparkline_in_7d?.price ?? [];
      const rsi = computeRsi(prices, 14);
      const score = rsi == null ? null : clamp(rsi, 0, 100);
      return {
        symbol: row.symbol.toUpperCase(),
        name: row.name,
        rsi7d: rsi,
        score,
        label: labelFromScore(score),
      };
    });

    return NextResponse.json({ data: rows, sentimentTop10 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro inesperado." },
      { status: 500 }
    );
  }
}
