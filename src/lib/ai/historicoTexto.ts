// Histórico do portefólio em texto, para os assistentes de IA (Block, Chain e a
// análise do Portefólio). Antes os bots só recebiam o valor de HOJE por categoria
// e, quando lhes perguntavam "quanto subiu nos últimos 60 dias", pediam ao
// utilizador o valor antigo — que a plataforma já tinha nas fotografias.
//
// Sem base de dados, para poder ser testado (scripts/testes/historicoTexto.test.ts).
// Quem lê as linhas é src/lib/ai/historicoPortefolio.ts.
//
// Regras de honestidade (as mesmas da página do Portefólio e da API):
//   • só contam fotografias com o total gravado na altura (nunca recalculadas);
//   • um período sem fotografia suficientemente antiga fica "sem dados" em vez
//     de comparar com o que houver — e o texto diz à IA para NÃO inventar nem
//     pedir o valor ao utilizador;
//   • as fotografias automáticas diárias repetem o último valor conhecido, por
//     isso variações curtas podem ser 0 — a IA é avisada.

import { PERIODOS_ALARGADOS, metricas, pctCoerente, seriePontos, variacoes, type PnlChange, type Ponto, type SnapRow } from "@/lib/api/pnlMath";
import { daConta } from "@/lib/portfolio/posicao";

export type OpcoesHistorico = {
  /** Valor ao vivo do portefólio (entra como último ponto da série). */
  totalAtual?: number | null;
  agora?: number;
  locale?: string;
  /** Dias de histórico que o plano permite (null = tudo). Só para informar a IA. */
  diasDoPlano?: number | null;
  /** Períodos a não escrever (ex.: o Assistente já recebe 24h/7d/30d da página: uma só fonte por janela). */
  omitirPeriodos?: string[];
  /** Não escrever a linha de métricas (quem chama já tem as do ecrã). */
  semMetricas?: boolean;
};

const ROTULO: Record<string, string> = {
  "24h": "24 horas", "7d": "7 dias", "30d": "30 dias", "60d": "60 dias", "90d": "90 dias",
  "180d": "180 dias", "1a": "1 ano", all: "desde a primeira fotografia",
};

const eur = (n: number) => `€ ${n.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const sinal = (n: number) => (n >= 0 ? "+" : "−") + eur(Math.abs(n));
const pct = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toLocaleString("pt-PT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;

/** Série da conta ativa, limpa, com o valor ao vivo como último ponto. */
export function serieDaConta(rows: SnapRow[], accountId: string, opts: OpcoesHistorico = {}): Ponto[] {
  const agora = opts.agora ?? Date.now();
  const daContaAtiva = accountId ? rows.filter((r) => daConta(r.data, accountId)) : rows;
  const serie = seriePontos(daContaAtiva).filter((p) => p.t <= agora);
  const vivo = opts.totalAtual;
  if (typeof vivo === "number" && Number.isFinite(vivo) && vivo > 0) {
    serie.push({ t: agora, total: vivo, iso: new Date(agora).toISOString() });
  }
  return serie;
}

/** Última fotografia de cada mês (AAAA-MM → ponto), por ordem cronológica. */
export function fimDeMes(serie: Ponto[]): Array<{ mes: string; ponto: Ponto }> {
  const porMes = new Map<string, Ponto>();
  for (const p of serie) porMes.set(p.iso.slice(0, 7), p);
  return [...porMes.entries()].map(([mes, ponto]) => ({ mes, ponto })).sort((a, b) => a.mes.localeCompare(b.mes));
}

/**
 * Texto para o prompt. null quando não há nenhuma fotografia (a IA recebe então
 * a nota de "sem histórico" por textoSemHistorico).
 */
/** Nota quando não se sabe a conta e há fotografias de várias contas (ex.: app móvel antiga). */
export const TEXTO_VARIAS_CONTAS = "=== HISTÓRICO DO PORTEFÓLIO ===\nEste utilizador tem fotografias de várias contas e o pedido não indicou qual está ativa, por isso não há uma série única para calcular variações (misturar contas daria números que não são de nenhuma). Se perguntarem quanto subiu ou desceu, explica isto e indica a página Portefólio (/portfolio) no site, com a conta escolhida no seletor. Não inventes uma variação.";

export function textoHistorico(rows: SnapRow[], accountId: string, opts: OpcoesHistorico = {}): string | null {
  if (!accountId) {
    const contas = new Set(rows.map((r) => (r.data as { _account?: unknown } | null)?._account).filter((a) => typeof a === "string" && a !== ""));
    if (contas.size > 1) return TEXTO_VARIAS_CONTAS;
  }
  const agora = opts.agora ?? Date.now();
  const locale = opts.locale ?? "pt-PT";
  const serie = serieDaConta(rows, accountId, opts);
  const temVivo = typeof opts.totalAtual === "number" && opts.totalAtual > 0;
  const fotografias = temVivo ? serie.length - 1 : serie.length;
  if (fotografias < 1) return null;

  const data = (iso: string) => new Date(iso).toLocaleDateString(locale);
  const primeira = serie[0];
  const ultimo = serie[serie.length - 1];
  const linhas: string[] = ["=== HISTÓRICO DO PORTEFÓLIO (fotografias guardadas pela plataforma; valores em EUR da altura) ==="];
  linhas.push(`Primeira fotografia: ${data(primeira.iso)} (${eur(primeira.total)}). Fotografias usadas: ${fotografias}.`);
  linhas.push(`Valor de referência atual: ${eur(ultimo.total)}${temVivo ? " (ao vivo)" : ` (última fotografia, ${data(ultimo.iso)})`}.`);
  if (opts.diasDoPlano != null) linhas.push(`O plano do utilizador guarda ${opts.diasDoPlano} dias de histórico.`);

  linhas.push("Variação por período (ganho ou perda SEM as entradas/saídas de capital, face ao valor na data base):");
  const omitir = new Set(opts.omitirPeriodos ?? []);
  const mudancas: PnlChange[] = variacoes(serie, agora, PERIODOS_ALARGADOS).filter((c) => !omitir.has(c.period));
  for (const c of mudancas) {
    const rotulo = ROTULO[c.period] ?? c.period;
    if (c.eur == null || c.fromAt == null) {
      linhas.push(`  - ${rotulo}: sem fotografia suficientemente antiga (o histórico começa a ${data(primeira.iso)})`);
      continue;
    }
    const base = serie.find((p) => p.iso === c.fromAt);
    const fluxo = c.fluxos ? ` · excluídos ${c.fluxos} salto(s) de capital (${sinal(c.fluxoEur ?? 0)} por ligar/remover carteiras ou depósitos)` : "";
    const emPct = c.pct == null ? "—" : pctCoerente(c.eur, c.pct) ? pct(c.pct) : `rentabilidade ponderada no tempo ${pct(c.pct)}: o ganho anterior foi sobre um valor menor e a variação recente sobre o capital que entrou`;
    linhas.push(`  - ${rotulo}: ${sinal(c.eur)} (${emPct}) face a ${base ? eur(base.total) : "?"} em ${data(c.fromAt)}${fluxo}`);
  }

  if (serie.length >= 2) {
    const max = serie.reduce((a, b) => (b.total > a.total ? b : a));
    const min = serie.reduce((a, b) => (b.total < a.total ? b : a));
    linhas.push(`Máximo: ${eur(max.total)} em ${data(max.iso)} · Mínimo: ${eur(min.total)} em ${data(min.iso)}.`);
    const m = opts.semMetricas ? null : metricas(serie, agora);
    if (m) {
      const n1 = (v: number | null) => (v == null ? "—" : v.toLocaleString("pt-PT", { maximumFractionDigits: 2 }));
      linhas.push(`Métricas (sobre as fotografias, ${m.snapshotsUsed} pontos, ${Math.round(m.days)} dias, sem ${m.fluxos} salto(s) de capital): ROI ${n1(m.roi)} % · CAGR ${m.cagr == null ? "só a partir de 90 dias" : n1(m.cagr) + " %"} · Sharpe ${n1(m.sharpe)} · Sortino ${n1(m.sortino)} · queda máxima ${n1(m.maxDrawdown)} % · queda atual ${n1(m.currentDrawdown)} % (${m.daysSincePeak} dias desde o pico) · volatilidade anual ${n1(m.volatility)} % · taxa de acerto diária ${n1(m.winRate)} % · melhor dia ${n1(m.bestReturn)} % · pior dia ${n1(m.worstReturn)} % · VaR 95 % ${n1(m.var95)} %.`);
    }
    const meses = fimDeMes(serie).slice(-12);
    if (meses.length >= 2) {
      linhas.push("Valor no fim de cada mês (últimos 12): " + meses.map((m) => `${m.mes}: ${eur(m.ponto.total)}`).join(" · "));
    }
  }

  linhas.push("NOTAS: 1) As fotografias automáticas diárias repetem o último valor conhecido quando o utilizador não abre a página do Portefólio — variações curtas podem por isso ser 0 €, e deves dizê-lo se for o caso. 2) Se um período pedido não tem fotografia, explica desde quando há histórico e dá a variação do período mais próximo que exista. 3) NUNCA peças ao utilizador o valor antigo do portefólio nem inventes um: estes são os únicos números válidos. 4) Para percentagens, usa as já calculadas acima. 5) Saltos grandes entre fotografias (ligar ou remover carteiras, depósitos, levantamentos) são entradas/saídas de capital e NÃO são ganho nem perda: as variações e o ROI acima já os excluem; se o utilizador perguntar porque o valor subiu tanto, explica que foi capital que entrou.");
  return linhas.join("\n");
}

/** Nota para a IA quando a conta ainda não tem fotografias. */
export function textoSemHistorico(): string {
  return "=== HISTÓRICO DO PORTEFÓLIO ===\nEsta conta ainda não tem fotografias guardadas, por isso não existe variação calculável (nem 24h, nem 30 ou 60 dias). Se perguntarem quanto subiu ou desceu, explica que o histórico começa quando a página do Portefólio (/portfolio) é aberta com sessão iniciada: a plataforma guarda uma fotografia automática por dia a partir daí. Não peças ao utilizador valores antigos nem inventes uma variação.";
}
