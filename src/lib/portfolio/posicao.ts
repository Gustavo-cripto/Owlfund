// Base do "PNL da posicao" — a MESMA no Painel e no Portefolio.
//
// Antes o Painel lia os ultimos 5 snapshots (de qualquer conta) e usava o mais
// antigo desses 5 como base; o Portefolio usava o mais antigo da conta ativa
// dentro da janela do plano. O mesmo rotulo dava numeros diferentes. Agora os
// dois passam por aqui: o snapshot mais antigo COM _totalEur, da conta ativa
// (ou legado sem etiqueta), dentro da janela do plano, sem anomalias.
// Sem ir a base de dados, para poder ser testado (scripts/testes/posicao.test.ts).

import { desempenho, indicesAnomalos, type Ponto } from "@/lib/api/pnlMath";

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
 * ativa. Um pico isolado (4x acima ou abaixo dos vizinhos: preco de spam, saldo
 * lido como euros) fica de fora — a mesma regra do ecra e da API
 * (pnlMath.indicesAnomalos). null quando nao ha nenhum.
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
  const fora = indicesAnomalos(pontos.map((p) => p.total));
  return pontos.find((_, i) => !fora.has(i)) ?? null;
}

/**
 * "PNL da posicao" = ganho desde a 1.a fotografia valida SEM as entradas e
 * saidas de capital (ligar/remover carteiras, depositos). Antes era "valor de
 * hoje − 1.a fotografia": quem comecou com 22 € e ligou carteiras depois via
 * +2270 % de "ganho". `totalAtual` (valor ao vivo) entra como ultimo ponto.
 */
export function posicaoAjustada(
  rows: LinhaSnapshot[], activeAccountId: string, totalAtual: number, agora = Date.now(),
): { eur: number; pct: number | null; desde: number; fluxoEur: number; fluxos: number } | null {
  const base = baseDaPosicao(rows, activeAccountId);
  if (!base) return null;
  const pontos = rows
    .filter((r) => daConta(r.data, activeAccountId))
    .map((r) => {
      const total = (r.data as { _totalEur?: unknown } | null)?._totalEur;
      const t = new Date(r.created_at).getTime();
      return typeof total === "number" && Number.isFinite(total) && total > 0 && Number.isFinite(t) && t >= base.createdAt
        ? { t, total, iso: r.created_at }
        : null;
    })
    .filter((p): p is Ponto => p !== null)
    .sort((a, b) => a.t - b.t);
  const fora = indicesAnomalos(pontos.map((p) => p.total));
  const serie = pontos.filter((_, i) => !fora.has(i));
  if (Number.isFinite(totalAtual) && totalAtual > 0) serie.push({ t: agora, total: totalAtual, iso: new Date(agora).toISOString() });
  if (serie.length < 2) return { eur: 0, pct: null, desde: base.createdAt, fluxoEur: 0, fluxos: 0 };
  const d = desempenho(serie, 0);
  return { eur: d.eur, pct: d.pct, desde: base.createdAt, fluxoEur: d.fluxoEur, fluxos: d.fluxos };
}
