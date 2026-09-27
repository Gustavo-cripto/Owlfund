// Velas diarias da OKX (sem chave, responde a datacenters — a Binance devolve
// 451 a Vercel) para saber o preco de um par ha N dias. Serve /api/prices
// (variacao 7d/30d do BTC/ETH) e /api/historical-prices (precos a 1d/7d/30d).
//
// A OKX devolve as velas da mais recente para a mais antiga; a vela [0] e a de
// hoje (ainda aberta). A abertura da vela [n] e o preco as 00:00 UTC de ha n
// dias — e essa a referencia de "ha N dias", nao um fecho a meio do dia.

export type VelaDiaria = { t: number; open: number; close: number };

const MAX_LIMIT = 100;

/** Precos de abertura (00:00 UTC) ha 1, 7 e 30 dias; null quando a vela falta. */
export type PrecosHaDias = { d1: number | null; d7: number | null; d30: number | null };

/** Le a resposta bruta da OKX (data: [[ts, o, h, l, c, …], …]) para velas validas. */
export function lerVelasOkx(raw: unknown): VelaDiaria[] {
  const j = raw as { code?: string; data?: unknown } | null;
  if (!j || j.code !== "0" || !Array.isArray(j.data)) return [];
  const out: VelaDiaria[] = [];
  for (const c of j.data as unknown[]) {
    if (!Array.isArray(c)) continue;
    const t = Number(c[0]), open = Number(c[1]), close = Number(c[4]);
    if (![t, open, close].every(Number.isFinite) || open <= 0 || close <= 0) continue;
    out.push({ t, open, close });
  }
  // Garantir "mais recente primeiro", venha como vier.
  return out.sort((a, b) => b.t - a.t);
}

/** Abertura da vela de ha `dias` dias (0 = hoje); null se nao houver. */
export function aberturaHaDias(velas: VelaDiaria[], dias: number): number | null {
  const v = velas[dias];
  return v && v.open > 0 ? v.open : null;
}

export function precosHaDias(velas: VelaDiaria[]): PrecosHaDias {
  return { d1: aberturaHaDias(velas, 1), d7: aberturaHaDias(velas, 7), d30: aberturaHaDias(velas, 30) };
}

/** Variacao em % entre o preco atual e um preco de referencia; null sem referencia. */
export function variacaoPct(atual: number, referencia: number | null): number | null {
  return referencia != null && referencia > 0 && atual > 0 ? ((atual - referencia) / referencia) * 100 : null;
}

/** Velas 1D (UTC) de um par da OKX, ex.: "BTC-EUR". Nunca lanca: [] em erro. */
export async function velasDiariasOkx(instId: string, limit = 32): Promise<VelaDiaria[]> {
  try {
    const res = await fetch(
      `https://www.okx.com/api/v5/market/candles?instId=${encodeURIComponent(instId)}&bar=1Dutc&limit=${Math.min(limit, MAX_LIMIT)}`,
      { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(6000), next: { revalidate: 300 } },
    );
    if (!res.ok) return [];
    return lerVelasOkx(await res.json());
  } catch {
    return [];
  }
}
