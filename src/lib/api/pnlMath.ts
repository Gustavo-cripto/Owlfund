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
