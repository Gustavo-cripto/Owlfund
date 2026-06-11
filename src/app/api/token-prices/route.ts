import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Returns USD prices for a list of symbols via CoinEx public ticker (no auth needed)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbolsParam = searchParams.get("symbols") ?? "";
  const symbols = symbolsParam
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  if (symbols.length === 0) {
    return NextResponse.json({ prices: {} });
  }

  const prices: Record<string, number> = { USDT: 1, USDC: 1, BUSD: 1, DAI: 1 };

  try {
    const markets = symbols
      .filter((s) => !prices[s])
      .map((s) => `${s}USDT`)
      .join(",");

    if (markets) {
      const res = await fetch(
        `https://api.coinex.com/v2/spot/ticker?market=${markets}`,
        { signal: AbortSignal.timeout(6000) }
      );
      if (res.ok) {
        const data = (await res.json()) as { data?: Array<{ market: string; last: string }> };
        (data.data ?? []).forEach((t) => {
          const sym = t.market.replace(/USDT$/, "");
          const price = parseFloat(t.last);
          if (Number.isFinite(price) && price > 0) prices[sym] = price;
        });
      }
    }
  } catch {
    // return whatever we have
  }

  return NextResponse.json({ prices }, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
  });
}
