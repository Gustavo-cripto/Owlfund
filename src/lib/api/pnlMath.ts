// Contas do PNL, sem ir à base de dados — para poderem ser testadas sozinhas
// (scripts/testes/insights.test.ts). Quem lê os dados é src/lib/api/insights.ts.

export type SnapRow = { created_at: string; data: unknown };
export type Ponto = { t: number; total: number; iso: string };

export type PnlChange = {
  /** "24h" | "7d" | "30d" | "all" */
  period: string;
  /** Ganho ou perda em euros SEM as entradas/saídas de capital. null = não há snapshot suficientemente antigo. */
  eur: number | null;
  /** Rentabilidade do período (encadeada, sem os saltos de capital). */
  pct: number | null;
  /** Data do snapshot usado como ponto de partida. */
  fromAt: string | null;
  /** Euros que entraram (+) ou saíram (−) no período por ligar/remover carteiras ou depósitos. */
  fluxoEur?: number;
  /** Quantos saltos de capital foram excluídos. */
  fluxos?: number;
};

const DIA = 86_400_000;
export type Periodo = { period: string; ms: number };
const PERIODOS: Periodo[] = [
  { period: "24h", ms: DIA },
  { period: "7d", ms: 7 * DIA },
  { period: "30d", ms: 30 * DIA },
];
/** Janelas que os assistentes de IA recebem (o utilizador pergunta "60 dias", "este ano"…). */
export const PERIODOS_ALARGADOS: Periodo[] = [
  ...PERIODOS,
  { period: "60d", ms: 60 * DIA },
  { period: "90d", ms: 90 * DIA },
  { period: "180d", ms: 180 * DIA },
  { period: "1a", ms: 365 * DIA },
];

// ── Entradas de capital e picos (out 2026) ───────────────────────────────────
// Antes: o "início" era a 1.ª fotografia e um filtro global (4× a mediana) tirava
// pontos. Numa conta que começou com 22 € e ligou carteiras depois, a mediana
// ficava nos 22 € e o filtro DEITAVA FORA as fotografias reais recentes, o ROI
// dava +2270 % e o Block dizia +2411 % "nas últimas 24 h". Agora:
//  • um PICO isolado (4× acima ou abaixo dos dois vizinhos, e volta) é erro de
//    leitura e sai; a 1.ª fotografia sai se estiver 4× longe das duas seguintes;
//  • um SALTO que fica (ligar/remover carteiras, depositar) é entrada ou saída
//    de capital: conta para o valor, não para o ganho nem para a rentabilidade.

const DIA_MS = 86_400_000;
/** Movimento máximo "de mercado" por dia, em logaritmo (×1,49 ou ÷1,49), que cresce com √dias. */
const LOG_DIARIO_MAX = 0.4;
/** Teto: ×3 ou ÷3 entre duas fotografias é sempre capital, por maior que seja o intervalo
 *  (sem isto, 23 € → 292 € com 57 dias sem fotografias passava por "mercado"). */
const LOG_TETO = Math.log(3);

/** O passo de `a` para `b`, com `gapMs` de intervalo, é entrada/saída de capital (e não mercado)? */
export function eFluxo(a: number, b: number, gapMs: number): boolean {
  if (!(a > 0) || !(b > 0)) return false;
  const dias = Math.max(1, gapMs / DIA_MS);
  return Math.abs(Math.log(b / a)) > Math.min(LOG_TETO, LOG_DIARIO_MAX * Math.sqrt(dias));
}

/** Índices (na ordem dada, cronológica) de picos isolados que são erros de leitura. */
export function indicesAnomalos(totais: number[]): Set<number> {
  const out = new Set<number>();
  const longe = (x: number, y: number) => x > y * 4 || x < y / 4;
  for (let i = 0; i < totais.length; i++) {
    const v = totais[i];
    if (!(v > 0)) { out.add(i); continue; }
    if (i === 0) {
      const [b, c] = [totais[1], totais[2]];
      if (b > 0 && c > 0 && longe(v, b) && longe(v, c) && !longe(b, c)) out.add(i);
      continue;
    }
    if (i === totais.length - 1) continue; // a mais recente pode ser um depósito real: conta como fluxo
    const [a, b] = [totais[i - 1], totais[i + 1]];
    if (a > 0 && b > 0 && ((v > a * 4 && v > b * 4) || (v < a / 4 && v < b / 4))) out.add(i);
  }
  return out;
}

/**
 * A percentagem encadeada (rentabilidade ponderada no tempo) pode ter sinal
 * contrário aos euros quando entrou capital a meio: +18 % sobre 22 € e −8 %
 * sobre 576 € dão +8,9 % mas −41 €. Lado a lado parece um erro; quem mostra os
 * dois usa esta função e, se os sinais não batem, explica ou mostra só os euros.
 */
export function pctCoerente(eur: number | null, pct: number | null): boolean {
  if (eur == null || pct == null) return false;
  if (Math.abs(eur) < 0.005 || Math.abs(pct) < 0.05) return true;
  return Math.sign(eur) === Math.sign(pct);
}

/** Ganho sem fluxos entre o ponto `desde` e o último da série. */
export function desempenho(serie: Ponto[], desde = 0): { eur: number; pct: number | null; fluxoEur: number; fluxos: number } {
  let eur = 0, fator = 1, fluxoEur = 0, fluxos = 0;
  for (let i = desde + 1; i < serie.length; i++) {
    const a = serie[i - 1], b = serie[i];
    if (eFluxo(a.total, b.total, b.t - a.t)) { fluxoEur += b.total - a.total; fluxos++; continue; }
    eur += b.total - a.total;
    if (a.total > 0) fator *= b.total / a.total;
  }
  return { eur, pct: serie.length - 1 > desde ? (fator - 1) * 100 : null, fluxoEur, fluxos };
}

/**
 * Só contam snapshots gravados ao vivo, que trazem o total em euros do momento
 * (`_totalEur`). Recalcular um snapshot antigo com os preços de HOJE daria uma
 * curva falsa — é a mesma regra que a página do Portefólio usa nas métricas.
 */
export function seriePontos(rows: SnapRow[]): Ponto[] {
  const brutos = rows
    .map((r) => {
      const total = (r.data as { _totalEur?: unknown } | null)?._totalEur;
      return typeof total === "number" && Number.isFinite(total) && total > 0
        ? { t: new Date(r.created_at).getTime(), total, iso: r.created_at }
        : null;
    })
    .filter((p): p is Ponto => p !== null)
    .sort((a, b) => a.t - b.t);

  // Picos isolados (preço de spam, saldo lido como euros) saem; saltos que
  // ficam são fluxos de capital e tratam-se em desempenho()/metricas().
  const fora = indicesAnomalos(brutos.map((p) => p.total));
  return brutos.filter((_, i) => !fora.has(i));
}

/** Variações de uma série já limpa (por omissão 24h/7d/30d + "all"). */
export function variacoes(serie: Ponto[], agora = Date.now(), periodos: Periodo[] = PERIODOS): PnlChange[] {
  const variacao = (idx: number): Omit<PnlChange, "period"> => {
    if (idx < 0 || idx >= serie.length - 1) return { eur: null, pct: null, fromAt: null };
    const d = desempenho(serie, idx);
    return { eur: d.eur, pct: d.pct, fromAt: serie[idx].iso, fluxoEur: d.fluxoEur, fluxos: d.fluxos };
  };

  const changes: PnlChange[] = periodos.map(({ period, ms }) => {
    const corte = agora - ms;
    // O snapshot mais recente ANTES do corte; sem nenhum, o período fica a null
    // em vez de comparar com o mais antigo que houver (seria um número errado).
    let idx = -1;
    for (let i = serie.length - 1; i >= 0; i--) if (serie[i].t <= corte) { idx = i; break; }
    return { period, ...variacao(idx) };
  });
  changes.push({ period: "all", ...variacao(serie.length > 1 ? 0 : -1) });
  return changes;
}

// ── Métricas avançadas ───────────────────────────────────────────────────────
// Mesmas contas da página do Portefólio, portadas para poderem correr no
// servidor (API/MCP). Diferença honesta: aqui o "valor atual" é o do último
// snapshot gravado, não o preço ao vivo do ecrã — por isso os números podem
// diferir ligeiramente dos da app entre snapshots.

export type Metrics = {
  days: number;
  roi: number;
  cagr: number | null;
  sharpe: number | null;
  sortino: number | null;
  calmar: number | null;
  maxDrawdown: number;
  currentDrawdown: number;
  daysSincePeak: number;
  volatility: number | null;
  winRate: number | null;
  bestReturn: number | null;
  worstReturn: number | null;
  var95: number | null;
  snapshotsUsed: number;
  /** Saltos de capital excluídos e o seu valor (+ entrou, − saiu). */
  fluxos: number;
  fluxoEur: number;
};

export function metricas(serie: Ponto[], agora = Date.now()): Metrics | null {
  if (serie.length < 2) return null;

  // Um snapshot por dia (o último): duplicados no mesmo dia criavam retornos de
  // 0 % em série, que esmagavam a taxa de acerto e anulavam o VaR.
  const porDia = new Map<string, Ponto>();
  for (const s of serie) porDia.set(new Date(s.t).toISOString().slice(0, 10), s);
  const chrono = [...porDia.values()].sort((a, b) => a.t - b.t);
  if (chrono.length < 2) return null;

  // Picos isolados (captura parcial ~0 €, saldo lido como euros) saem.
  const fora = indicesAnomalos(chrono.map((s) => s.total));
  const bons = chrono.filter((_, i) => !fora.has(i));
  if (bons.length < 2) return null;
  if (bons[0].total <= 0) return null;
  const days = (agora - bons[0].t) / 86_400_000;

  // Índice de desempenho: começa em 1 e só se move com o mercado. Os saltos de
  // capital (ligar/remover carteiras, depósitos) não mexem no índice — senão
  // ligar uma carteira contava como +2000 % de "rentabilidade".
  const indice: number[] = [1];
  const retornosBrutos: number[] = [];
  let fluxos = 0, fluxoEur = 0;
  for (let i = 1; i < bons.length; i++) {
    const a = bons[i - 1], b = bons[i];
    if (eFluxo(a.total, b.total, b.t - a.t)) {
      fluxos++; fluxoEur += b.total - a.total;
      indice.push(indice[i - 1]);
      continue;
    }
    const r = (b.total - a.total) / a.total;
    retornosBrutos.push(r);
    indice.push(indice[i - 1] * (1 + r));
  }
  const fatorTotal = indice[indice.length - 1];

  const roi = (fatorTotal - 1) * 100;
  // Anualizar períodos curtos não informa, inventa: abaixo de um trimestre o
  // número honesto é o ROI do período.
  const cagrRaw = days >= 90 ? (Math.pow(fatorTotal, 365 / days) - 1) * 100 : null;
  const cagr = cagrRaw !== null && Number.isFinite(cagrRaw) ? cagrRaw : null;
  // Saltos > ±50 % entre capturas são quase sempre depósitos ou levantamentos,
  // não movimento de mercado — inflavam a volatilidade de forma irreal.
  const retornos = retornosBrutos.filter((r) => Math.abs(r) < 0.5);

  const passosPorAno = retornosBrutos.length > 0 && days > 0
    ? Math.min(365, Math.max(12, 365 / (days / retornosBrutos.length)))
    : 252;
  const ann = Math.sqrt(passosPorAno);

  const media = retornos.length ? retornos.reduce((s, r) => s + r, 0) / retornos.length : 0;
  const variancia = retornos.length ? retornos.reduce((s, r) => s + (r - media) ** 2, 0) / retornos.length : 0;
  const desvio = Math.sqrt(variancia);

  const sharpe = retornos.length >= 5 && desvio > 0 ? (media / desvio) * ann : null;
  const volatility = retornos.length >= 5 ? desvio * ann * 100 : null;

  const desceVar = retornos.length ? retornos.reduce((s, r) => s + (r < 0 ? r * r : 0), 0) / retornos.length : 0;
  const desce = Math.sqrt(desceVar);
  const sortino = retornos.length >= 5 && desce > 0 ? (media / desce) * ann : null;

  // Quedas medidas no índice (um levantamento não é uma "queda").
  let pico = indice[0];
  let maxDd = 0;
  let picoT = bons[0].t;
  for (let i = 0; i < indice.length; i++) {
    if (indice[i] > pico) { pico = indice[i]; picoT = bons[i].t; }
    const dd = (indice[i] - pico) / pico;
    if (dd < maxDd) maxDd = dd;
  }
  const maxDrawdown = maxDd * 100;
  const calmar = cagr !== null && maxDrawdown < 0 ? cagr / Math.abs(maxDrawdown) : null;
  const currentDrawdown = pico > 0 ? ((fatorTotal - pico) / pico) * 100 : 0;
  const daysSincePeak = Math.max(0, Math.round((agora - picoT) / 86_400_000));

  const winRate = retornos.length ? (retornos.filter((r) => r > 0).length / retornos.length) * 100 : null;
  const bestReturn = retornos.length ? Math.max(...retornos) * 100 : null;
  const worstReturn = retornos.length ? Math.min(...retornos) * 100 : null;

  let var95: number | null = null;
  if (retornos.length >= 10) {
    const ord = [...retornos].sort((a, b) => a - b);
    var95 = ord[Math.floor(0.05 * ord.length)] * 100;
  }

  return {
    days: Math.round(days), roi, cagr, sharpe, sortino, calmar,
    maxDrawdown, currentDrawdown, daysSincePeak, volatility,
    winRate, bestReturn, worstReturn, var95, snapshotsUsed: bons.length,
    fluxos, fluxoEur,
  };
}
