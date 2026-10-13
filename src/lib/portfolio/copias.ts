// Cópias do cron diário de snapshots (src/app/api/cron/snapshot/route.ts).
//
// O cron não consegue recalcular o valor no servidor (os ativos manuais vivem
// no browser), por isso copia a última fotografia. Uma cópia não é uma medição:
// repete o valor anterior. Contá-la nas métricas criava dias "parados" (taxa de
// dias positivos a 4 %, VaR a 0 %) e, pior, contava como fotografia recente e
// impedia a página de gravar o valor real — o histórico ficava congelado
// (auditoria de 13 out 2026: três dias a 576 € com o portefólio a 489 €).
//
// Uma cópia reconhece-se por `_copia: true` (desde 13 out) ou, nas antigas, por
// não ter `_bench` e repetir ao cêntimo o total da fotografia anterior da mesma conta.

type ComDados = { created_at: string; data: unknown };
type Dados = { _copia?: unknown; _bench?: unknown; _totalEur?: unknown; _account?: unknown } | null;

const contaDe = (d: Dados): string => (typeof d?._account === "string" ? d._account : "");
const totalDe = (d: Dados): number | null => (typeof d?._totalEur === "number" ? d._totalEur : null);

/** Tira as cópias do cron, mantendo a ordem original da lista. */
export function semCopiasDoCron<T extends ComDados>(rows: T[]): T[] {
  const ordem = [...rows].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const anterior = new Map<string, number | null>();
  const copias = new Set<T>();
  for (const r of ordem) {
    const d = r.data as Dados;
    const conta = contaDe(d);
    const total = totalDe(d);
    const antes = anterior.get(conta);
    const repete = total != null && antes != null && Math.round(total * 100) === Math.round(antes * 100);
    if (d?._copia === true || (d?._bench == null && repete)) copias.add(r);
    if (total != null) anterior.set(conta, total);
  }
  return copias.size === 0 ? rows : rows.filter((r) => !copias.has(r));
}
