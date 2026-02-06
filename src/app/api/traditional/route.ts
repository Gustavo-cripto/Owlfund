import { NextResponse } from "next/server";

type AlphaQuote = {
  symbol: string;
  price: number | null;
  changePercent: number | null;
  volume: number | null;
  updatedAt?: string;
};

const API_BASE = "https://www.alphavantage.co/query";
const MAX_SYMBOLS = 5;

const parseNumber = (value: unknown) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const parsePercent = (value: unknown) => {
  if (typeof value !== "string") return parseNumber(value);
  return parseNumber(value.replace("%", ""));
};

const fetchQuote = async (symbol: string, apiKey: string) => {
  const url = `${API_BASE}?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(
    symbol
  )}&apikey=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url);
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  const info = payload?.Information ?? payload?.Note ?? payload?.["Error Message"];
  if (typeof info === "string" && info.length > 0) {
    return { ok: false as const, symbol, error: info };
  }
  const quote = (payload?.["Global Quote"] ?? {}) as Record<string, string>;
  if (!quote || Object.keys(quote).length === 0) {
    return { ok: false as const, symbol, error: "Sem dados para o símbolo." };
  }
  const result: AlphaQuote = {
    symbol: quote["01. symbol"] ?? symbol,
    price: parseNumber(quote["05. price"]),
    changePercent: parsePercent(quote["10. change percent"]),
    volume: parseNumber(quote["06. volume"]),
    updatedAt: quote["07. latest trading day"],
  };
  return { ok: true as const, data: result };
};

export async function GET(request: Request) {
  const apiKey = (process.env.ALPHAVANTAGE_API_KEY ?? "").trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Define ALPHAVANTAGE_API_KEY no ambiente." },
      { status: 400 }
    );
  }
  const url = new URL(request.url);
  const symbolsParam = url.searchParams.get("symbols") ?? "";
  const symbols = symbolsParam
    .split(",")
    .map((symbol) => symbol.trim())
    .filter(Boolean);
  if (symbols.length === 0) {
    return NextResponse.json({ data: [] });
  }

  const limited = symbols.slice(0, MAX_SYMBOLS);
  const results = await Promise.all(limited.map((symbol) => fetchQuote(symbol, apiKey)));

  const data: AlphaQuote[] = [];
  const errors: Array<{ symbol: string; error: string }> = [];
  results.forEach((result) => {
    if (result.ok) data.push(result.data);
    else errors.push({ symbol: result.symbol, error: result.error });
  });

  return NextResponse.json({
    data,
    errors,
    skipped: symbols.length > MAX_SYMBOLS ? symbols.slice(MAX_SYMBOLS) : [],
  });
}
