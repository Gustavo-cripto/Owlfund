import { NextResponse } from "next/server";

type Quote = {
  symbol: string;
  price: number | null;
  changePercent: number | null;
  volume: number | null;
  updatedAt?: string;
};

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json,text/plain,*/*",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  Referer: "https://finance.yahoo.com/",
  Origin: "https://finance.yahoo.com",
};

// Cache crumb in module scope (warm between requests on same instance)
let cachedCrumb: string | null = null;
let cachedCookie: string | null = null;

async function getCrumb(): Promise<{ crumb: string; cookie: string }> {
  if (cachedCrumb && cachedCookie) return { crumb: cachedCrumb, cookie: cachedCookie };

  // Step 1: get a session cookie
  const cookieRes = await fetch("https://fc.yahoo.com", {
    headers: BROWSER_HEADERS,
    redirect: "follow",
  });
  const rawCookies = cookieRes.headers.get("set-cookie") ?? "";
  const cookie = rawCookies
    .split(",")
    .map((c) => c.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");

  // Step 2: fetch crumb
  const crumbRes = await fetch(
    "https://query1.finance.yahoo.com/v1/test/getcrumb",
    {
      headers: { ...BROWSER_HEADERS, Cookie: cookie },
      cache: "no-store",
    }
  );
  const crumb = await crumbRes.text();
  if (!crumb || crumb.includes("<")) throw new Error("Failed to get Yahoo crumb");

  cachedCrumb = crumb;
  cachedCookie = cookie;
  return { crumb, cookie };
}

async function fetchYahooQuotes(symbols: string[]): Promise<Quote[]> {
  const { crumb, cookie } = await getCrumb();
  const joined = symbols.map(encodeURIComponent).join(",");
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${joined}&crumb=${encodeURIComponent(crumb)}&fields=regularMarketPrice,regularMarketChangePercent,regularMarketVolume,regularMarketTime`;

  const res = await fetch(url, {
    headers: { ...BROWSER_HEADERS, Cookie: cookie },
    cache: "no-store",
  });

  if (res.status === 401) {
    // Crumb expired — reset and retry once
    cachedCrumb = null;
    cachedCookie = null;
    return fetchYahooQuotes(symbols);
  }

  if (!res.ok) throw new Error(`Yahoo Finance error: ${res.status}`);

  const payload = (await res.json()) as {
    quoteResponse?: {
      result?: Array<{
        symbol: string;
        regularMarketPrice?: number;
        regularMarketChangePercent?: number;
        regularMarketVolume?: number;
        regularMarketTime?: number;
      }>;
    };
  };

  return (payload?.quoteResponse?.result ?? []).map((r) => ({
    symbol: r.symbol,
    price: r.regularMarketPrice ?? null,
    changePercent: r.regularMarketChangePercent ?? null,
    volume: r.regularMarketVolume ?? null,
    updatedAt: r.regularMarketTime
      ? new Date(r.regularMarketTime * 1000).toISOString().slice(0, 10)
      : undefined,
  }));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbolsParam = url.searchParams.get("symbols") ?? "";
  const symbols = symbolsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);

  if (symbols.length === 0) return NextResponse.json({ data: [] });

  try {
    const data = await fetchYahooQuotes(symbols);
    return NextResponse.json({ data, errors: [], skipped: [] });
  } catch (err) {
    return NextResponse.json(
      { error: String(err), data: [], errors: [] },
      { status: 502 }
    );
  }
}
