// Contas do PNL, sem ir à base de dados — para poderem ser testadas sozinhas
// (scripts/testes/insights.test.ts). Quem lê os dados é src/lib/api/insights.ts.

export type SnapRow = { created_at: string; data: unknown };
export type Ponto = { t: number; total: number; iso: string };

export type PnlChange = {
  /** "24h" | "7d" | "30d" | "all" */
  period: string;
  /** Diferença em euros. null = não há snapshot suficientemente antigo. */
  eur: number | null;
  pct: number | null;
  /** Data do snapshot usado como ponto de partida. */
  fromAt: string | null;
};

const DIA = 86_400_000;
const PERIODOS: Array<{ period: string; ms: number }> = [
  { period: "24h", ms: DIA },
  { period: "7d", ms: 7 * DIA },
  { period: "30d", ms: 30 * DIA },
];

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

  // Filtro de anomalias, igual ao do ecrã: um snapshot 4× acima ou abaixo da
  // mediana é um erro de leitura (preço de spam, saldo lido como euros), não
  // uma variação real do portefólio.
  if (brutos.length < 4) return brutos;
  const ordenados = brutos.map((p) => p.total).sort((a, b) => a - b);
  const mediana = ordenados[Math.floor(ordenados.length / 2)];
  return brutos.filter((p) => p.total <= mediana * 4 && p.total >= mediana / 4);
}

/** Variações de uma série já limpa. */
export function variacoes(serie: Ponto[], agora = Date.now()): PnlChange[] {
  const ultimo = serie[serie.length - 1] ?? null;
  const variacao = (desde: Ponto | null): Omit<PnlChange, "period"> => {
    if (!ultimo || !desde) return { eur: null, pct: null, fromAt: null };
    const eur = ultimo.total - desde.total;
    return { eur, pct: desde.total > 0 ? (eur / desde.total) * 100 : null, fromAt: desde.iso };
  };

  const changes: PnlChange[] = PERIODOS.map(({ period, ms }) => {
    const corte = agora - ms;
    // O snapshot mais recente ANTES do corte; sem nenhum, o período fica a null
    // em vez de comparar com o mais antigo que houver (seria um número errado).
    const anterior = [...serie].reverse().find((p) => p.t <= corte) ?? null;
    return { period, ...variacao(anterior) };
  });
  changes.push({ period: "all", ...variacao(serie.length > 1 ? serie[0] : null) });
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
};

export function metricas(serie: Ponto[], agora = Date.now()): Metrics | null {
  if (serie.length < 2) return null;

  // Um snapshot por dia (o último): duplicados no mesmo dia criavam retornos de
  // 0 % em série, que esmagavam a taxa de acerto e anulavam o VaR.
  const porDia = new Map<string, Ponto>();
  for (const s of serie) porDia.set(new Date(s.t).toISOString().slice(0, 10), s);
  const chrono = [...porDia.values()].sort((a, b) => a.t - b.t);
  if (chrono.length < 2) return null;

  // Descartar capturas corrompidas face à mediana: ~0 € (captura parcial) e
  // picos absurdos (>20×), que faziam a queda máxima disparar para -100 %.
  const positivos = chrono.map((s) => s.total).filter((v) => v > 0).sort((a, b) => a - b);
  const mediana = positivos.length ? positivos[Math.floor(positivos.length / 2)] : 0;
  const bons = chrono.filter((s) => s.total > mediana * 0.05 && s.total < mediana * 20);
  if (bons.length < 2) return null;

  const base = bons[0].total;
  const atual = bons[bons.length - 1].total;
  if (base <= 0) return null;
  const days = (agora - bons[0].t) / 86_400_000;

  const roi = ((atual - base) / base) * 100;
  // Anualizar períodos curtos não informa, inventa: abaixo de um trimestre o
  // número honesto é o ROI do período.
  const cagrRaw = days >= 90 ? (Math.pow(atual / base, 365 / days) - 1) * 100 : null;
  const cagr = cagrRaw !== null && Number.isFinite(cagrRaw) ? cagrRaw : null;

  const retornosBrutos: number[] = [];
  for (let i = 1; i < bons.length; i++) {
    const ant = bons[i - 1].total;
    if (ant > 0) retornosBrutos.push((bons[i].total - ant) / ant);
  }
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

  let pico = bons[0].total;
  let maxDd = 0;
  for (const s of bons) {
    if (s.total > pico) pico = s.total;
    const dd = (s.total - pico) / pico;
    if (dd < maxDd) maxDd = dd;
  }
  const maxDrawdown = maxDd * 100;
  const calmar = cagr !== null && maxDrawdown < 0 ? cagr / Math.abs(maxDrawdown) : null;

  let picoVal = bons[0].total;
  let picoT = bons[0].t;
  for (const s of bons) if (s.total > picoVal) { picoVal = s.total; picoT = s.t; }
  const currentDrawdown = picoVal > 0 ? ((atual - picoVal) / picoVal) * 100 : 0;
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
  };
}
