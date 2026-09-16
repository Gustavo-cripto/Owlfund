// Historico do portefolio RECONSTRUIDO: posicoes atuais × precos historicos.
//
// E o que a Revolut, a Delta e a CoinStats fazem. Da centenas de pontos em
// qualquer intervalo, hoje, sem esperar por snapshots. A limitacao, honesta e
// dita no ecra: uma compra feita ha tres dias nao aparece como salto — aparece
// como se ja la estivesse. Os snapshots continuam a servir para "Tudo" e para
// o PNL realizado.
//
// Tudo aqui e puro (sem rede) para ser testavel: quem vai buscar as velas e
// /api/portfolio-history; quem converte para euros e o cliente.

export type Bar = { t: number; o: number; h: number; l: number; c: number };
export type SeriesBySymbol = Record<string, Bar[]>;

export type Timeframe = "1h" | "1d" | "1s" | "1m" | "1a";

/** Vela da OKX e quantas por intervalo. */
export const TF: Record<Timeframe, { bar: string; limit: number; ms: number }> = {
  "1h": { bar: "1m", limit: 60, ms: 60_000 },
  "1d": { bar: "5m", limit: 288, ms: 300_000 },
  "1s": { bar: "1H", limit: 168, ms: 3_600_000 },
  "1m": { bar: "4H", limit: 180, ms: 14_400_000 },
  "1a": { bar: "1Dutc", limit: 365, ms: 86_400_000 },
};

// Estaveis: 1 USD por definicao — nao ha vela e nao e preciso.
export const STABLE_USD = new Set(["USDT", "USDC", "DAI", "USD", "TUSD", "FDUSD", "PYUSD", "USDS", "USDE"]);
export const STABLE_EUR = new Set(["EURC", "EURT", "EURS"]);

/**
 * Soma as velas dos ativos, ponderadas pela quantidade, num so historico do
 * portefolio. `constant` e o que nao tem vela (tradicionais, stablecoins,
 * tokens sem historico…), somado a todos os pontos. `scale[symbol]` corrige a
 * base de cada ativo para a serie acabar no preco atual da app (a OKX e a
 * fonte de precos da app podem diferir alguns decimos por cento).
 *
 * Um ativo sem vela num instante leva o ultimo fecho conhecido (ou o primeiro,
 * se ainda nao tinha comecado): nunca um zero, que faria um buraco.
 */
export function combineSeries(
  series: SeriesBySymbol,
  quantities: Record<string, number>,
  scale: Record<string, number>,
  constant: number,
): Bar[] {
  const symbols = Object.keys(series).filter((s) => (quantities[s] ?? 0) > 0 && series[s].length > 0);
  if (symbols.length === 0) return [];
  const times = new Set<number>();
  for (const s of symbols) for (const b of series[s]) times.add(b.t);
  const sorted = [...times].sort((a, b) => a - b);
  const idx: Record<string, number> = {};
  const last: Record<string, Bar | null> = {};
  const out: Bar[] = [];
  for (const t of sorted) {
    let o = constant, h = constant, l = constant, c = constant;
    for (const s of symbols) {
      const arr = series[s];
      let i = idx[s] ?? 0;
      while (i < arr.length && arr[i].t <= t) { last[s] = arr[i]; i++; }
      idx[s] = i;
      const b = last[s] ?? arr[0];
      const exact = b.t === t;
      const q = quantities[s] * (scale[s] ?? 1);
      // Sem vela neste instante: o ativo esta "parado" no ultimo fecho.
      o += (exact ? b.o : b.c) * q; h += (exact ? b.h : b.c) * q; l += (exact ? b.l : b.c) * q; c += b.c * q;
    }
    out.push({ t, o, h, l, c });
  }
  return out;
}

/** Media movel simples sobre os fechos; null onde ainda nao ha janela completa. */
export function sma(bars: Bar[], n: number): Array<{ t: number; v: number | null }> {
  let sum = 0;
  return bars.map((b, i) => {
    sum += b.c;
    if (i >= n) sum -= bars[i - n].c;
    return { t: b.t, v: i >= n - 1 ? sum / n : null };
  });
}
