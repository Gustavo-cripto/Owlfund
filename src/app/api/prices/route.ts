import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Server-side CoinGecko proxy — avoids browser rate limits & CORS issues
export async function GET() {
  try {
    const [cryptoRes, benchmarkRes] = await Promise.all([
      fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,cardano&vs_currencies=eur&include_24hr_change=true&include_7d_change=true&include_30d_change=true",
        {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; Owlfund/1.0)" },
          cache: "no-store",
        }
      ),
      fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,gold&vs_currencies=eur&include_24hr_change=true&include_7d_change=true&include_30d_change=true",
        {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; Owlfund/1.0)" },
          cache: "no-store",
        }
      ),
    ]);

    type CoinData = {
      eur?: number;
      eur_24h_change?: number;
      eur_7d_change?: number;
      eur_30d_change?: number;
    };

    const cryptoData = cryptoRes.ok
      ? ((await cryptoRes.json()) as Record<string, CoinData>)
      : {};
    const benchmarkData = benchmarkRes.ok
      ? ((await benchmarkRes.json()) as Record<string, CoinData>)
      : {};

    const prices = {
      ETH: cryptoData.ethereum?.eur ?? 0,
      SOL: cryptoData.solana?.eur ?? 0,
      BTC: cryptoData.bitcoin?.eur ?? 0,
      ADA: cryptoData.cardano?.eur ?? 0,
    };

    const benchmark = {
      btc_eur: benchmarkData.bitcoin?.eur ?? 0,
      btc_24h: benchmarkData.bitcoin?.eur_24h_change ?? 0,
      btc_7d: benchmarkData.bitcoin?.eur_7d_change ?? 0,
      btc_30d: benchmarkData.bitcoin?.eur_30d_change ?? 0,
      eth_eur: benchmarkData.ethereum?.eur ?? 0,
      eth_24h: benchmarkData.ethereum?.eur_24h_change ?? 0,
      eth_7d: benchmarkData.ethereum?.eur_7d_change ?? 0,
      eth_30d: benchmarkData.ethereum?.eur_30d_change ?? 0,
      gold_eur: benchmarkData.gold?.eur ?? 0,
      gold_24h: benchmarkData.gold?.eur_24h_change ?? 0,
      gold_7d: benchmarkData.gold?.eur_7d_change ?? 0,
      gold_30d: benchmarkData.gold?.eur_30d_change ?? 0,
    };

    return NextResponse.json({ prices, benchmark }, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "fetch failed" },
      { status: 502 }
    );
  }
}
