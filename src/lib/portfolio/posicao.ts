// Base do "PNL da posicao" — a MESMA no Painel e no Portefolio.
//
// Antes o Painel lia os ultimos 5 snapshots (de qualquer conta) e usava o mais
// antigo desses 5 como base; o Portefolio usava o mais antigo da conta ativa
// dentro da janela do plano. O mesmo rotulo dava numeros diferentes. Agora os
// dois passam por aqui: o snapshot mais antigo COM _totalEur, da conta ativa
// (ou legado sem etiqueta), dentro da janela do plano, sem anomalias.
// Sem ir a base de dados, para poder ser testado (scripts/testes/posicao.test.ts).

export type PlanoHistorico = "free" | "pro" | "premium";
export type LinhaSnapshot = { created_at: string; data: unknown };
export type BasePosicao = { total: number; createdAt: number };

const DIA_MS = 86_400_000;

/** Dias de historico por plano (Free 30 · Pro 1 ano · Premium tudo). */
export function diasDaJanela(plan: PlanoHistorico): number | null {
  return plan === "premium" ? null : plan === "pro" ? 365 : 30;
}

/** ISO do inicio da janela do plano (epoch 0 para o Premium). */
export function inicioDaJanela(plan: PlanoHistorico, agora = Date.now()): string {
  const dias = diasDaJanela(plan);
  return dias == null ? new Date(0).toISOString() : new Date(agora - dias * DIA_MS).toISOString();
}

/** Maximo de linhas a pedir para a janela (1 por dia). */
export function limiteDaJanela(plan: PlanoHistorico): number {
  return diasDaJanela(plan) ?? 3650;
}

/** Snapshot pertence a conta ativa? Os legados sem etiqueta contam para todas. */
export function daConta(data: unknown, activeAccountId: string): boolean {
  const acc = (data as { _account?: unknown } | null)?._account;
  return typeof acc !== "string" || acc === "" || acc === activeAccountId;
}

/**
 * O snapshot mais antigo com total gravado na altura (_totalEur > 0), da conta
 * ativa. Um snapshot 4x acima ou abaixo da mediana e um erro de leitura (preco
 * de spam, saldo lido como euros) e fica de fora — a mesma regra do ecra e da
 * API (pnlMath.seriePontos). null quando nao ha nenhum.
 */
export function baseDaPosicao(rows: LinhaSnapshot[], activeAccountId: string): BasePosicao | null {
  const pontos = rows
    .filter((r) => daConta(r.data, activeAccountId))
    .map((r) => {
      const total = (r.data as { _totalEur?: unknown } | null)?._totalEur;
      const t = new Date(r.created_at).getTime();
      return typeof total === "number" && Number.isFinite(total) && total > 0 && Number.isFinite(t)
        ? { total, createdAt: t }
        : null;
    })
    .filter((p): p is BasePosicao => p !== null)
    .sort((a, b) => a.createdAt - b.createdAt);
  if (pontos.length === 0) return null;
  if (pontos.length < 4) return pontos[0];
  const ordenados = pontos.map((p) => p.total).sort((a, b) => a - b);
  const mediana = ordenados[Math.floor(ordenados.length / 2)];
  return pontos.find((p) => p.total <= mediana * 4 && p.total >= mediana / 4) ?? null;
}
