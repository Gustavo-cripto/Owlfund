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
  current_price?: number | null;
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

const STABLE_SYMBOLS = new Set([
  "USDT",
  "USDC",
  "DAI",
  "BUSD",
  "TUSD",
  "FDUSD",
  "USDE",
  "PYUSD",
  "USDP",
  "EURC",
  "GUSD",
  "FRAX",
]);

// Stablecoins que caem abaixo do top-250 por capitalização e por isso não vêm na
// lista principal do CoinGecko — pedidas à parte para poderem ser registadas como
// posição manual.
const EXTRA_STABLE_IDS = [
  "paxos-standard", // USDP
  "euro-coin",      // EURC
  "binance-usd",    // BUSD
  "gemini-dollar",  // GUSD
  "frax",           // FRAX
];

export async function GET() {
  try {
    const [coinexResponse, coingeckoResponse, coingeckoTopResponse, coingeckoExtraResponse, coingeckoGlobalResponse] = await Promise.all([
      fetch("https://api.coinex.com/v2/spot/ticker"),
      fetch(
        "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1"
      ),
      fetch(
        // fetch more and then filter (avoid stablecoins / missing markets)
        "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=true"
      ),
      fetch(
        `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${EXTRA_STABLE_IDS.join(",")}`
      ),
      // Dados globais: dominância BTC/ETH, capitalização total e variação 24h.
      fetch("https://api.coingecko.com/api/v3/global"),
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

    // Falha aqui não deve partir a rota — apenas ficamos sem estas estáveis extra.
    const coingeckoExtraPayload = coingeckoExtraResponse.ok
      ? await coingeckoExtraResponse.json().catch(() => [] as CoinGeckoRow[]) as CoinGeckoRow[]
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

    const sentimentTop10: SentimentRow[] = coingeckoTopPayload
      .filter((row) => row.symbol)
      .filter((row) => !STABLE_SYMBOLS.has(row.symbol.toUpperCase()))
      .map((row) => {
        const symbol = row.symbol.toUpperCase();
        const prices = row.sparkline_in_7d?.price ?? [];
        const rsi = computeRsi(prices, 14);
        const score = rsi == null ? null : clamp(rsi, 0, 100);
        return {
          symbol,
          name: row.name,
          rsi7d: rsi,
          score,
          label: labelFromScore(score),
        };
      })
      // keep only assets that exist in our CoinEx rows (so clicking always works)
      .filter((row) => rows.some((marketRow) => marketRow.symbol === row.symbol))
      .slice(0, 10);

    // Lista completa para o dropdown "Por ativos cripto manual" (~250 criptos).
    // Inclui stablecoins (USDT, USDC, DAI…): o utilizador pode querer registá-las
    // como posição manual. A tabela de mercado (`data`) e o sentimento continuam
    // sem elas. O preço vai aqui porque alguns ativos (ex.: USDT) não têm par na
    // CoinEx e por isso não aparecem em `data`.
    const toSelectEntry = (row: CoinGeckoRow) => ({
      symbol: row.symbol.toUpperCase(),
      name: row.name ?? row.symbol,
      priceUsd: typeof row.current_price === "number" ? row.current_price : null,
      marketCapUsd: row.market_cap ?? null,
    });

    // Desduplicado por símbolo: o CoinGecko devolve tickers repetidos (ex.: USDF é
    // usado por "Falcon USD" e "Aster USDF"), o que daria chaves repetidas no
    // dropdown. Como vem ordenado por capitalização, o primeiro é o dominante.
    // As estáveis extra entram no fim, se ainda não existirem.
    const bySymbol = new Map<string, ReturnType<typeof toSelectEntry>>();
    for (const row of coingeckoPayload.filter((r) => r.symbol).slice(0, 250)) {
      const entry = toSelectEntry(row);
      if (!bySymbol.has(entry.symbol)) bySymbol.set(entry.symbol, entry);
    }
    for (const row of coingeckoExtraPayload.filter((r) => r?.symbol)) {
      const entry = toSelectEntry(row);
      if (!bySymbol.has(entry.symbol)) bySymbol.set(entry.symbol, entry);
    }

    // Dados globais (dominância + cap total). Falha aqui não parte a rota.
    type GlobalPayload = { data?: { total_market_cap?: { usd?: number }; market_cap_change_percentage_24h_usd?: number; market_cap_percentage?: { btc?: number; eth?: number } } };
    const globalPayload = coingeckoGlobalResponse.ok
      ? await coingeckoGlobalResponse.json().catch(() => ({}) as GlobalPayload) as GlobalPayload
      : {} as GlobalPayload;
    const global = globalPayload.data
      ? {
          totalMarketCapUsd: globalPayload.data.total_market_cap?.usd ?? null,
          marketCapChange24h: globalPayload.data.market_cap_change_percentage_24h_usd ?? null,
          btcDominance: globalPayload.data.market_cap_percentage?.btc ?? null,
          ethDominance: globalPayload.data.market_cap_percentage?.eth ?? null,
        }
      : null;

    return NextResponse.json({
      data: rows,
      sentimentTop10,
      selectList: [...bySymbol.values()],
      global,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro inesperado." },
      { status: 500 }
    );
  }
}
