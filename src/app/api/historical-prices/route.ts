import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/requireUser";
import { cgFetch } from "@/lib/market/coingecko";
import { precosHaDias, velasDiariasOkx } from "@/lib/market/okxDaily";

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
  const res = await cgFetch(
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

// Fallback: velas diarias da OKX (a Binance devolve 451 a datacenters — a
// rota respondia 0 em silencio e o "PNL hoje/30 d" ficava a 0).
const OKX_PAIRS: Record<string, string> = {
  bitcoin: "BTC-EUR", ethereum: "ETH-EUR", solana: "SOL-EUR", cardano: "ADA-EUR",
};

export async function GET(request: Request) {
  // Proxy com custo/quota nossa: so com sessao, e com limite por utilizador.
  const auth = await requireUser(request, { route: "historical-prices", limit: 60 });
  if (!auth.ok) return auth.response;
  const result: HistoricalPrices & { partial?: boolean } = { "1d": {}, "7d": {}, "30d": {} };
  // So se escreve um simbolo com valor > 0; o que falta fica de fora e a
  // resposta diz partial: true, para o cliente mostrar "—" em vez de 0.
  let partial = false;
  const guardar = (periodo: keyof HistoricalPrices, sym: string, v: number | null | undefined) => {
    if (typeof v === "number" && Number.isFinite(v) && v > 0) result[periodo][sym] = v;
    else partial = true;
  };

  await Promise.all(
    COINS.map(async (coinId) => {
      const sym = SYMBOL_MAP[coinId];
      try {
        const { d1, d7, d30 } = await fetchCoinHistory(coinId);
        if (d1 > 0) {
          guardar("1d", sym, d1);
          guardar("7d", sym, d7);
          guardar("30d", sym, d30);
          return;
        }
      } catch { /* cai nas velas da OKX */ }

      const { d1, d7, d30 } = precosHaDias(await velasDiariasOkx(OKX_PAIRS[coinId], 32));
      guardar("1d", sym, d1);
      guardar("7d", sym, d7);
      guardar("30d", sym, d30);
    })
  );
  if (partial) result.partial = true;

  return NextResponse.json(result, {
    // Resposta incompleta nao fica 1 h em cache: tenta-se de novo daqui a 5 min.
    headers: { "Cache-Control": partial ? "private, s-maxage=300, stale-while-revalidate=600" : "private, s-maxage=3600, stale-while-revalidate=7200" },
  });
}
