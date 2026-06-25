import { NextResponse } from "next/server";

type Quote = {
  symbol: string;
  price: number | null;
  changePercent: number | null;
  volume: number | null;
  updatedAt?: string;
};

type TwelveQuote = {
  symbol: string;
  close?: string;
  percent_change?: string;
  volume?: string;
  datetime?: string;
  status?: string;
  message?: string;
  code?: number;
};

async function fetchTwelveData(symbols: string[], apiKey: string): Promise<Quote[]> {
  const joined = symbols.join(",");
  const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(joined)}&apikey=${apiKey}&dp=2`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Twelve Data error: ${res.status}`);

  const payload = (await res.json()) as Record<string, TwelveQuote> | TwelveQuote;

  // Single symbol returns object directly; multiple returns { SYMBOL: {...}, ... }
  const entries: [string, TwelveQuote][] =
    symbols.length === 1
      ? [[symbols[0], payload as TwelveQuote]]
      : Object.entries(payload as Record<string, TwelveQuote>);

  return entries.map(([sym, q]) => ({
    symbol: q.symbol ?? sym,
    price: q.close != null ? Number(q.close) : null,
    changePercent: q.percent_change != null ? Number(q.percent_change) : null,
    volume: q.volume != null ? Number(q.volume) : null,
    updatedAt: q.datetime?.slice(0, 10),
  }));
}

export async function GET(request: Request) {
  const apiKey = (process.env.TWELVEDATA_API_KEY ?? "").trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Adiciona TWELVEDATA_API_KEY nas variáveis de ambiente do Vercel (twelvedata.com — plano gratuito).", data: [] },
      { status: 400 }
    );
  }

  const url = new URL(request.url);
  const symbolsParam = url.searchParams.get("symbols") ?? "";
  const symbols = symbolsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);

  if (symbols.length === 0) return NextResponse.json({ data: [] });

  try {
    const data = await fetchTwelveData(symbols, apiKey);
    return NextResponse.json({ data, errors: [], skipped: [] });
  } catch (err) {
    return NextResponse.json(
      { error: String(err), data: [], errors: [] },
      { status: 502 }
    );
  }
}
