import { NextResponse } from "next/server";

type Quote = {
  symbol: string;
  price: number | null;
  changePercent: number | null;
  volume: number | null;
  updatedAt?: string;
};

type YahooQuoteResult = {
  symbol: string;
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
  regularMarketVolume?: number;
  regularMarketTime?: number;
};

type YahooResponse = {
  quoteResponse?: {
    result?: YahooQuoteResult[];
    error?: unknown;
  };
};

const fetchYahooQuotes = async (symbols: string[]): Promise<Quote[]> => {
  const joined = symbols.map(encodeURIComponent).join(",");
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${joined}&fields=regularMarketPrice,regularMarketChangePercent,regularMarketVolume,regularMarketTime`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; ChainFolioAI/1.0)",
      Accept: "application/json",
    },
    next: { revalidate: 300 },
  });

  if (!res.ok) throw new Error(`Yahoo Finance responded ${res.status}`);

  const payload = (await res.json()) as YahooResponse;
  const results = payload?.quoteResponse?.result ?? [];

  return results.map((r) => ({
    symbol: r.symbol,
    price: r.regularMarketPrice ?? null,
    changePercent: r.regularMarketChangePercent ?? null,
    volume: r.regularMarketVolume ?? null,
    updatedAt: r.regularMarketTime
      ? new Date(r.regularMarketTime * 1000).toISOString().slice(0, 10)
      : undefined,
  }));
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbolsParam = url.searchParams.get("symbols") ?? "";
  const symbols = symbolsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (symbols.length === 0) {
    return NextResponse.json({ data: [] });
  }

  try {
    const data = await fetchYahooQuotes(symbols.slice(0, 20));
    return NextResponse.json({ data, errors: [], skipped: [] });
  } catch (err) {
    return NextResponse.json(
      { error: String(err), data: [], errors: [] },
      { status: 502 }
    );
  }
}
