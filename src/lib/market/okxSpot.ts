// Preco a vista na OKX (sem chave, responde a datacenters) para os poucos
// simbolos que ela cobre bem: BTC, ETH, SOL, ADA. Lote F (set 2026): onde a
// OKX ja da o mesmo dado, poupa-se o orcamento mensal do CoinGecko.
//
// USD = par -USDT (1 USDT ≈ 1 USD, o mesmo que /api/markets ja assume com a
// CoinEx). EUR = par -EUR, que a OKX tem para estes quatro.

export const OKX_SIMBOLOS = ["BTC", "ETH", "SOL", "ADA"] as const;
export type OkxSimbolo = (typeof OKX_SIMBOLOS)[number];

export function eSimboloOkx(s: string): s is OkxSimbolo {
  return (OKX_SIMBOLOS as readonly string[]).includes(s.toUpperCase());
}

/** Le o `last` de uma resposta /market/ticker da OKX; null se invalido. */
export function lerTickerOkx(raw: unknown): number | null {
  const j = raw as { code?: string; data?: Array<{ last?: string }> } | null;
  if (!j || j.code !== "0" || !Array.isArray(j.data)) return null;
  const last = Number(j.data[0]?.last);
  return Number.isFinite(last) && last > 0 ? last : null;
}

/** Ultimo preco de um par da OKX, ex.: "BTC-USDT". Nunca lanca: null em erro. */
export async function precoOkx(instId: string): Promise<number | null> {
  try {
    const res = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${encodeURIComponent(instId)}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(6000),
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return lerTickerOkx(await res.json());
  } catch {
    return null;
  }
}

/** Precos em USD (via -USDT) dos simbolos pedidos que a OKX cobre. Os que faltarem ficam de fora. */
export async function precosOkxUsd(simbolos: string[]): Promise<Record<string, number>> {
  const alvo = [...new Set(simbolos.map((s) => s.toUpperCase()))].filter(eSimboloOkx);
  const valores = await Promise.all(alvo.map((s) => precoOkx(`${s}-USDT`)));
  const out: Record<string, number> = {};
  alvo.forEach((s, i) => { const v = valores[i]; if (v != null) out[s] = v; });
  return out;
}

/** Preço + variação 24 h no formato do simple/price do CoinGecko, indexado pelos ids dele. */
export type Precos24h = Record<string, { usd: number; usd_24h_change: number; usd_24h_vol?: number }>;

/**
 * Lê a resposta de /market/tickers?instType=SPOT da OKX para os símbolos pedidos
 * (`{ BTC: "bitcoin", … }`), no formato do simple/price do CoinGecko. Pura (testada
 * em scripts/testes/okxTickers.test.ts). null se não sobrar nenhum preço.
 * USDT ≈ USD: num resumo de mercado a diferença (décimas de %) não muda nada.
 */
export function lerTickersOkx(raw: unknown, idsPorSimbolo: Record<string, string>): Precos24h | null {
  const j = raw as { code?: string; data?: Array<{ instId: string; last: string; open24h: string; volCcy24h?: string }> } | null;
  if (!j || j.code !== "0" || !Array.isArray(j.data) || !j.data.length) return null;
  const porPar = new Map(j.data.map((r) => [r.instId, r]));
  const out: Precos24h = {};
  for (const [sym, id] of Object.entries(idsPorSimbolo)) {
    const r = porPar.get(`${sym}-USDT`);
    if (!r) continue;
    const last = parseFloat(r.last);
    const open = parseFloat(r.open24h);
    if (!(last > 0)) continue;
    const vol = parseFloat(r.volCcy24h ?? "");
    out[id] = { usd: last, usd_24h_change: open > 0 ? ((last - open) / open) * 100 : 0, ...(vol > 0 ? { usd_24h_vol: vol } : {}) };
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Reserva de preços quando o CoinGecko falha (ex.: 429 por quota), num pedido só
 * (os 1400+ pares). Usada pelo briefing diário e pelo resumo de mercado do
 * /mercado — antes eram as únicas chamadas de preços sem plano B.
 */
export async function precosOkx24h(idsPorSimbolo: Record<string, string>): Promise<Precos24h | null> {
  try {
    const res = await fetch("https://www.okx.com/api/v5/market/tickers?instType=SPOT", {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(6000),
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return lerTickersOkx(await res.json(), idsPorSimbolo);
  } catch {
    return null;
  }
}
