import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Prices = { ETH: number; SOL: number; BTC: number; ADA: number; usdToEur?: number };
type Benchmark = {
  btc_eur: number; btc_24h: number; btc_7d: number; btc_30d: number;
  eth_eur: number; eth_24h: number; eth_7d: number; eth_30d: number;
  gold_eur: number; gold_24h: number; gold_7d: number; gold_30d: number;
  sp500: number;
};

// Cotação de um símbolo no Yahoo Finance (grátis, sem chave). Substituiu o
// stooq, que passou a exigir proof-of-work no browser e devolvia sempre 0.
// Devolve { price, prevClose } — prevClose permite calcular a variação 24h.
async function fetchYahooQuote(symbol: string): Promise<{ price: number; prevClose: number }> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`,
      {
        cache: "no-store",
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!res.ok) return { price: 0, prevClose: 0 };
    const json = (await res.json()) as {
      chart?: { result?: Array<{ meta?: { regularMarketPrice?: number; chartPreviousClose?: number; previousClose?: number } }> };
    };
    const meta = json.chart?.result?.[0]?.meta;
    const price = Number(meta?.regularMarketPrice ?? 0);
    const prevClose = Number(meta?.chartPreviousClose ?? meta?.previousClose ?? 0);
    return {
      price: Number.isFinite(price) && price > 0 ? price : 0,
      prevClose: Number.isFinite(prevClose) && prevClose > 0 ? prevClose : 0,
    };
  } catch {
    return { price: 0, prevClose: 0 };
  }
}

const pctChange = (price: number, prev: number) =>
  price > 0 && prev > 0 ? ((price - prev) / prev) * 100 : 0;

/** S&P 500 (pontos do índice) + ouro em EUR/onça, ambos do Yahoo.
 *  O ouro vinha do id "gold" da CoinGecko, que é um TOKEN cripto (~0,00002 €),
 *  não ouro real — o valor mostrado estava errado por ordens de grandeza. */
async function fetchMarketBenchmarks(): Promise<Pick<Benchmark, "sp500" | "gold_eur" | "gold_24h">> {
  const [spx, gold, eurusd] = await Promise.all([
    fetchYahooQuote("^GSPC"),
    fetchYahooQuote("GC=F"),   // futuros de ouro, em USD/onça
    fetchYahooQuote("EURUSD=X"),
  ]);
  const rate = eurusd.price > 0 ? eurusd.price : 0; // USD por 1 EUR
  const goldEur = gold.price > 0 && rate > 0 ? gold.price / rate : 0;
  const goldPrevEur = gold.prevClose > 0 && rate > 0 ? gold.prevClose / rate : 0;
  return {
    sp500: spx.price,
    gold_eur: goldEur,
    // A variação é a mesma em USD ou EUR quando se usa a mesma taxa nos dois lados.
    gold_24h: pctChange(goldEur, goldPrevEur),
  };
}

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
    "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,cardano&vs_currencies=eur,usd&include_24hr_change=true&include_7d_change=true&include_30d_change=true",
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
    // Sem ouro aqui: o id "gold" da CoinGecko é um token cripto, não o metal.
    // O ouro real vem de fetchMarketBenchmarks() (Yahoo GC=F).
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
      // S&P 500 + ouro real (Yahoo). Best-effort: 0 se falhar, nunca rebenta.
      const market = await fetchMarketBenchmarks();
      const fullBenchmark: Benchmark = {
        sp500: market.sp500,
        btc_eur: benchmark.btc_eur ?? 0,
        btc_24h: benchmark.btc_24h ?? 0,
        btc_7d: benchmark.btc_7d ?? 0,
        btc_30d: benchmark.btc_30d ?? 0,
        eth_eur: benchmark.eth_eur ?? 0,
        eth_24h: benchmark.eth_24h ?? 0,
        eth_7d: benchmark.eth_7d ?? 0,
        eth_30d: benchmark.eth_30d ?? 0,
        gold_eur: market.gold_eur,
        gold_24h: market.gold_24h,
        // 7d/30d do ouro exigiriam histórico; ficam a 0 em vez de valores falsos.
        gold_7d: 0,
        gold_30d: 0,
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
