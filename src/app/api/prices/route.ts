import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Prices = { ETH: number; SOL: number; BTC: number; ADA: number; usdToEur?: number };
type Benchmark = {
  btc_eur: number; btc_24h: number; btc_7d: number; btc_30d: number;
  eth_eur: number; eth_24h: number; eth_7d: number; eth_30d: number;
  gold_eur: number; gold_24h: number; gold_7d: number; gold_30d: number;
};

// ── Binance (EUR pairs via USDT + ECB rate approx) ──────────────────────────
async function fromBinance(): Promise<{ prices: Prices; benchmark: Partial<Benchmark> }> {
  const symbols = ["ETHEUR", "SOLEUR", "BTCEUR", "ADAEUR", "BTCUSDT"];
  const res = await fetch(
    `https://api.binance.com/api/v3/ticker/24hr?symbols=${JSON.stringify(symbols)}`,
    { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(6000) }
  );
  if (!res.ok) throw new Error(`Binance ${res.status}`);
  const data = (await res.json()) as Array<{
    symbol: string; lastPrice: string;
    priceChangePercent: string;
  }>;
  const map: Record<string, { price: number; change24h: number }> = {};
  for (const row of data) {
    map[row.symbol] = {
      price: parseFloat(row.lastPrice),
      change24h: parseFloat(row.priceChangePercent),
    };
  }
  const btcEur = map.BTCEUR?.price ?? 0;
  const btcUsd = map.BTCUSDT?.price ?? 0;
  const usdToEur = btcEur > 0 && btcUsd > 0 ? btcEur / btcUsd : undefined;
  const prices: Prices = {
    ETH: map.ETHEUR?.price ?? 0,
    SOL: map.SOLEUR?.price ?? 0,
    BTC: btcEur,
    ADA: map.ADAEUR?.price ?? 0,
    usdToEur,
  };
  const benchmark: Partial<Benchmark> = {
    btc_eur: prices.BTC,
    btc_24h: map.BTCEUR?.change24h ?? 0,
    eth_eur: prices.ETH,
    eth_24h: map.ETHEUR?.change24h ?? 0,
  };
  return { prices, benchmark };
}

// ── Kraken (EUR pairs) ───────────────────────────────────────────────────────
async function fromKraken(): Promise<{ prices: Prices; benchmark: Partial<Benchmark> }> {
  const pairs = "XETHZEUR,SOLEUR,XXBTZEUR,ADAEUR,XXBTZUSD";
  const res = await fetch(
    `https://api.kraken.com/0/public/Ticker?pair=${pairs}`,
    { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(6000) }
  );
  if (!res.ok) throw new Error(`Kraken ${res.status}`);
  type KrakenTicker = { c: [string]; P: [string, string] };
  const data = (await res.json()) as { result: Record<string, KrakenTicker>; error: string[] };
  if (data.error?.length) throw new Error(data.error[0]);
  const r = data.result;
  const getPrice = (key: string) => parseFloat(r[key]?.c[0] ?? "0");
  const getChange = (key: string) => parseFloat(r[key]?.P[1] ?? "0");
  const btcEur = getPrice("XXBTZEUR");
  const btcUsd = getPrice("XXBTZUSD");
  const usdToEur = btcEur > 0 && btcUsd > 0 ? btcEur / btcUsd : undefined;
  const prices: Prices = {
    ETH: getPrice("XETHZEUR"),
    SOL: getPrice("SOLEUR"),
    BTC: btcEur,
    ADA: getPrice("ADAEUR"),
    usdToEur,
  };
  const benchmark: Partial<Benchmark> = {
    btc_eur: prices.BTC,
    btc_24h: getChange("XXBTZEUR"),
    eth_eur: prices.ETH,
    eth_24h: getChange("XETHZEUR"),
  };
  return { prices, benchmark };
}

// ── CoinGecko (with retries) ─────────────────────────────────────────────────
async function fromCoinGecko(): Promise<{ prices: Prices; benchmark: Partial<Benchmark> }> {
  const res = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,cardano,gold&vs_currencies=eur,usd&include_24hr_change=true&include_7d_change=true&include_30d_change=true",
    {
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(8000),
    }
  );
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
  type CoinData = { eur?: number; usd?: number; eur_24h_change?: number; eur_7d_change?: number; eur_30d_change?: number };
  const d = (await res.json()) as Record<string, CoinData>;
  const btcEur = d.bitcoin?.eur ?? 0;
  const btcUsd = d.bitcoin?.usd ?? 0;
  const prices: Prices = {
    ETH: d.ethereum?.eur ?? 0,
    SOL: d.solana?.eur ?? 0,
    BTC: btcEur,
    ADA: d.cardano?.eur ?? 0,
    usdToEur: btcEur > 0 && btcUsd > 0 ? btcEur / btcUsd : undefined,
  };
  const benchmark: Partial<Benchmark> = {
    btc_eur: d.bitcoin?.eur ?? 0,
    btc_24h: d.bitcoin?.eur_24h_change ?? 0,
    btc_7d: d.bitcoin?.eur_7d_change ?? 0,
    btc_30d: d.bitcoin?.eur_30d_change ?? 0,
    eth_eur: d.ethereum?.eur ?? 0,
    eth_24h: d.ethereum?.eur_24h_change ?? 0,
    eth_7d: d.ethereum?.eur_7d_change ?? 0,
    eth_30d: d.ethereum?.eur_30d_change ?? 0,
    gold_eur: d.gold?.eur ?? 0,
    gold_24h: d.gold?.eur_24h_change ?? 0,
    gold_7d: d.gold?.eur_7d_change ?? 0,
    gold_30d: d.gold?.eur_30d_change ?? 0,
  };
  return { prices, benchmark };
}

const isValid = (p: Prices) => p.BTC > 0 && p.ETH > 0;

export async function GET() {
  // Try each source in order; first valid one wins
  const sources = [fromBinance, fromKraken, fromCoinGecko];
  let lastErr = "";
  for (const source of sources) {
    try {
      const { prices, benchmark } = await source();
      if (!isValid(prices)) continue;
      const fullBenchmark: Benchmark = {
        btc_eur: benchmark.btc_eur ?? 0,
        btc_24h: benchmark.btc_24h ?? 0,
        btc_7d: benchmark.btc_7d ?? 0,
        btc_30d: benchmark.btc_30d ?? 0,
        eth_eur: benchmark.eth_eur ?? 0,
        eth_24h: benchmark.eth_24h ?? 0,
        eth_7d: benchmark.eth_7d ?? 0,
        eth_30d: benchmark.eth_30d ?? 0,
        gold_eur: benchmark.gold_eur ?? 0,
        gold_24h: benchmark.gold_24h ?? 0,
        gold_7d: benchmark.gold_7d ?? 0,
        gold_30d: benchmark.gold_30d ?? 0,
      };
      return NextResponse.json({ prices, benchmark: fullBenchmark, source: source.name }, {
        headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
      });
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
  }
  return NextResponse.json({ error: `All price sources failed: ${lastErr}` }, { status: 502 });
}
