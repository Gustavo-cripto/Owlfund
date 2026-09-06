import { UpstreamError, assertUpstream } from "@/lib/api/upstream";
// Ferramentas de investimento para a API pública e o MCP.
// Cada função é autónoma (busca a própria fonte) para não tocar nas rotas internas.

// ── Fear & Greed ───────────────────────────────────────────────────────────
export type FearGreedPoint = { value: number; classification: string; timestamp: number };

export async function getFearGreed(): Promise<{ now: FearGreedPoint | null; history: FearGreedPoint[] }> {
  try {
    const res = await fetch("https://api.alternative.me/fng/?limit=8&format=json", { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return { now: null, history: [] };
    const j = await res.json() as { data?: Array<{ value: string; value_classification: string; timestamp: string }> };
    const map = (d: { value: string; value_classification: string; timestamp: string }): FearGreedPoint =>
      ({ value: Number(d.value), classification: d.value_classification, timestamp: Number(d.timestamp) * 1000 });
    const data = (j.data ?? []).map(map);
    return { now: data[0] ?? null, history: data };
  } catch { return { now: null, history: [] }; }
}

// ── Preço de um ativo ──────────────────────────────────────────────────────
export type AssetQuote = {
  symbol: string; name: string; priceUsd: number | null; marketCap: number | null;
  volume24h: number | null; change24h: number | null; change7d: number | null; rank: number | null;
};

export async function getAsset(symbol: string): Promise<AssetQuote | null> {
  const s = symbol.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!s) return null;
  try {
    const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&symbols=${encodeURIComponent(s)}&price_change_percentage=24h,7d`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    assertUpstream(res, "coingecko");
    if (!res.ok) return null;
    const rows = await res.json() as Array<Record<string, unknown>>;
    if (!Array.isArray(rows) || !rows.length) return null;
    const r = rows.sort((a, b) => Number(b.market_cap ?? 0) - Number(a.market_cap ?? 0))[0];
    return {
      symbol: String(r.symbol ?? "").toUpperCase(),
      name: String(r.name ?? ""),
      priceUsd: (r.current_price as number) ?? null,
      marketCap: (r.market_cap as number) ?? null,
      volume24h: (r.total_volume as number) ?? null,
      change24h: (r.price_change_percentage_24h as number) ?? null,
      change7d: (r.price_change_percentage_7d_in_currency as number) ?? null,
      rank: (r.market_cap_rank as number) ?? null,
    };
  } catch (e) { if (e instanceof UpstreamError) throw e; return null; }
}

// ── FIRE (regra dos 4%) ────────────────────────────────────────────────────
export type FireInput = {
  monthlyExpenses: number; monthlyInvestment: number; annualReturn: number;
  inflation: number; currentAge: number; currentPortfolio: number;
};

export function computeFire(i: FireInput) {
  const monthlyExpenses = Math.max(i.monthlyExpenses || 0, 0);
  const monthlyInvestment = Math.max(i.monthlyInvestment || 0, 0);
  const portfolioValue = Math.max(i.currentPortfolio || 0, 0);
  const fireTarget = monthlyExpenses * 12 * 25; // 25× despesas anuais (regra dos 4%)
  const realReturn = ((i.annualReturn || 0) - (i.inflation || 0)) / 100;
  const monthlyReal = realReturn / 12;

  let yearsToFire: number | null;
  if (realReturn <= 0) yearsToFire = null;
  else if (portfolioValue >= fireTarget) yearsToFire = 0;
  else {
    const months = monthlyInvestment > 0
      ? Math.log((fireTarget * monthlyReal + monthlyInvestment) / (portfolioValue * monthlyReal + monthlyInvestment)) / Math.log(1 + monthlyReal)
      : Math.log(fireTarget / Math.max(portfolioValue, 1)) / Math.log(1 + monthlyReal);
    yearsToFire = Math.ceil(months / 12);
  }

  return {
    fireTarget,
    realReturnPct: Math.round(realReturn * 1000) / 10,
    yearsToFire,
    retirementAge: yearsToFire !== null ? i.currentAge + yearsToFire : null,
    retirementYear: yearsToFire !== null ? new Date().getFullYear() + yearsToFire : null,
    note: realReturn <= 0 ? "Retorno real ≤ 0 — com estes valores nunca se atinge o objetivo." : undefined,
  };
}

// ── Notícias ───────────────────────────────────────────────────────────────
export type NewsItem = { title: string; url: string; source: string; publishedAt: string | null };

const FEEDS = [
  { url: "https://feeds.feedburner.com/CoinDesk", source: "CoinDesk" },
  { url: "https://cointelegraph.com/rss", source: "CoinTelegraph" },
];

function stripCdata(s: string): string {
  return s.replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "").replace(/&amp;/g, "&").trim();
}

async function parseFeed(url: string, source: string): Promise<NewsItem[]> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000), headers: { "User-Agent": "ChainFolioAI/1" } });
    if (!res.ok) return [];
    const xml = await res.text();
    const items = xml.split(/<item[>\s]/).slice(1, 9);
    return items.map((block) => {
      const title = block.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1] ?? "";
      const link = block.match(/<link[^>]*>([\s\S]*?)<\/link>/)?.[1] ?? "";
      const date = block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/)?.[1] ?? "";
      return { title: stripCdata(title), url: stripCdata(link), source, publishedAt: date ? new Date(stripCdata(date)).toISOString() : null };
    }).filter((n) => n.title && n.url);
  } catch { return []; }
}

export async function getNews(limit = 15): Promise<NewsItem[]> {
  const all = (await Promise.all(FEEDS.map((f) => parseFeed(f.url, f.source)))).flat();
  all.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
  return all.slice(0, Math.min(Math.max(limit, 1), 30));
}

// ── Blocos BTC (mempool) ───────────────────────────────────────────────────
export async function getBtcBlocks() {
  try {
    const [blocksRes, feesRes] = await Promise.all([
      fetch("https://mempool.space/api/v1/blocks", { signal: AbortSignal.timeout(6000) }),
      fetch("https://mempool.space/api/v1/fees/recommended", { signal: AbortSignal.timeout(6000) }),
    ]);
    const blocksRaw = blocksRes.ok ? await blocksRes.json() as Array<Record<string, unknown>> : [];
    const fees = feesRes.ok ? await feesRes.json() as Record<string, number> : null;
    const blocks = (Array.isArray(blocksRaw) ? blocksRaw : []).slice(0, 8).map((b) => ({
      height: b.height as number,
      txCount: b.tx_count as number,
      timestamp: (b.timestamp as number) * 1000,
      medianFee: (b.extras as { medianFee?: number })?.medianFee ?? null,
      pool: (b.extras as { pool?: { name?: string } })?.pool?.name ?? null,
    }));
    return { blocks, fees, timestamp: Date.now() };
  } catch { return { blocks: [], fees: null, timestamp: Date.now() }; }
}
