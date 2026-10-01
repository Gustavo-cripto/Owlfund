// Indicadores técnicos a partir de velas diárias (da mais antiga para a mais
// recente). Puros, sem rede: a rota /api/indicadores dá-lhes as velas da OKX.
// Descrevem o que os números mostram; a página nunca os transforma em
// "compra" ou "vende" (regra do site: a IA e o site descrevem, não aconselham).

export type Vela = { t: number; o: number; h: number; l: number; c: number };

export type Indicadores = {
  preco: number;
  velas: number;
  rsi14: number | null;
  sma50: number | null;
  sma200: number | null;
  /** Distância do preço às médias, em %. */
  vsSma50: number | null;
  vsSma200: number | null;
  /** Cruzamento da média de 50 com a de 200 nos últimos 30 dias. */
  cruzamento: { tipo: "dourado" | "morte"; haDias: number } | null;
  /** Volatilidade anualizada (desvio-padrão dos retornos diários × √365), em %. */
  volatilidade30: number | null;
  max30: number | null; min30: number | null;
  max90: number | null; min90: number | null;
  var7: number | null; var30: number | null; var90: number | null;
};

const media = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

/** Média simples dos últimos n fechos até ao índice `ate` (inclusive). */
export function sma(fechos: readonly number[], n: number, ate = fechos.length - 1): number | null {
  if (ate + 1 < n || ate < 0) return null;
  return media(fechos.slice(ate + 1 - n, ate + 1));
}

/** RSI de Wilder. */
export function rsi(fechos: readonly number[], n = 14): number | null {
  if (fechos.length < n + 1) return null;
  let ganho = 0, perda = 0;
  for (let i = 1; i <= n; i++) {
    const d = fechos[i] - fechos[i - 1];
    if (d >= 0) ganho += d; else perda -= d;
  }
  ganho /= n; perda /= n;
  for (let i = n + 1; i < fechos.length; i++) {
    const d = fechos[i] - fechos[i - 1];
    ganho = (ganho * (n - 1) + Math.max(d, 0)) / n;
    perda = (perda * (n - 1) + Math.max(-d, 0)) / n;
  }
  if (perda === 0) return ganho === 0 ? 50 : 100;
  return 100 - 100 / (1 + ganho / perda);
}

export function volatilidade(fechos: readonly number[], dias = 30): number | null {
  if (fechos.length < dias + 1) return null;
  const r: number[] = [];
  for (let i = fechos.length - dias; i < fechos.length; i++) r.push(Math.log(fechos[i] / fechos[i - 1]));
  const m = media(r);
  const dp = Math.sqrt(r.reduce((s, x) => s + (x - m) ** 2, 0) / (r.length - 1));
  return dp * Math.sqrt(365) * 100;
}

const pct = (a: number, b: number | null) => (b != null && b > 0 ? (a / b - 1) * 100 : null);

export function calcularIndicadores(velasAsc: readonly Vela[]): Indicadores | null {
  const v = velasAsc.filter((x) => [x.o, x.h, x.l, x.c].every((n) => Number.isFinite(n) && n > 0));
  if (v.length < 15) return null;
  const c = v.map((x) => x.c);
  const n = c.length;
  const preco = c[n - 1];
  const s50 = sma(c, 50), s200 = sma(c, 200);
  let cruzamento: Indicadores["cruzamento"] = null;
  if (n >= 201) {
    for (let k = 0; k < Math.min(30, n - 200); k++) {
      const i = n - 1 - k;
      const agora = (sma(c, 50, i) ?? 0) - (sma(c, 200, i) ?? 0);
      const antes = (sma(c, 50, i - 1) ?? 0) - (sma(c, 200, i - 1) ?? 0);
      if (agora > 0 && antes <= 0) { cruzamento = { tipo: "dourado", haDias: k }; break; }
      if (agora < 0 && antes >= 0) { cruzamento = { tipo: "morte", haDias: k }; break; }
    }
  }
  const janela = (d: number) => (n >= d ? v.slice(n - d) : null);
  const j30 = janela(30), j90 = janela(90);
  const atras = (d: number) => (n > d ? c[n - 1 - d] : null);
  return {
    preco, velas: n,
    rsi14: rsi(c, 14),
    sma50: s50, sma200: s200,
    vsSma50: pct(preco, s50), vsSma200: pct(preco, s200),
    cruzamento,
    volatilidade30: volatilidade(c, 30),
    max30: j30 ? Math.max(...j30.map((x) => x.h)) : null, min30: j30 ? Math.min(...j30.map((x) => x.l)) : null,
    max90: j90 ? Math.max(...j90.map((x) => x.h)) : null, min90: j90 ? Math.min(...j90.map((x) => x.l)) : null,
    var7: pct(preco, atras(7)), var30: pct(preco, atras(30)), var90: pct(preco, atras(90)),
  };
}

/** Zona do RSI, só descritiva. */
export const zonaRsi = (r: number | null): "sobrecompra" | "sobrevenda" | "neutra" | null =>
  r == null ? null : r >= 70 ? "sobrecompra" : r <= 30 ? "sobrevenda" : "neutra";

/** Lê a resposta da OKX (data: [[ts,o,h,l,c,…]], mais recente primeiro) para velas ascendentes. */
export function lerVelasOhlcOkx(raw: unknown): Vela[] {
  const j = raw as { code?: string; data?: unknown } | null;
  if (!j || j.code !== "0" || !Array.isArray(j.data)) return [];
  const out: Vela[] = [];
  for (const x of j.data as unknown[]) {
    if (!Array.isArray(x)) continue;
    const [t, o, h, l, c] = x.slice(0, 5).map(Number);
    if ([t, o, h, l, c].every(Number.isFinite)) out.push({ t, o, h, l, c });
  }
  return out.sort((a, b) => a.t - b.t);
}
