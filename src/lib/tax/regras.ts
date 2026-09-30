import type { Allowance, Country, Escalao, RegrasPais } from "./countries";
import { resumirImposto, type TaxEstimate, type TaxSummary } from "@/lib/api/taxMath";
import type { LoteRealizado } from "./metodos";

// Regras de cálculo por país que não cabem numa taxa curta + longa (auditoria
// de 30 set 2026, 21 países). Única implementação: a página de Fiscalidade, o
// PDF, o Excel, a API e o MCP chamam `classificarLote`, `anoFiscalDe` e
// `resumirPais`, para nunca haver dois números diferentes.
//
// O que está aqui, e porquê:
// - prazo de detenção por calendário ("mais de um ano" = depois do dia do
//   aniversário; "6 meses" = meses de calendário, não 183 dias);
// - regras do ANO da venda (IT 26% em 2025, FR 30% até 2024, BE sem imposto
//   antes de 2026, DE Freigrenze €600 até 2023, ES escala antiga, GB taxas e
//   isenção antigas, PT sem imposto antes de 2023);
// - ano fiscal que não é o civil (GB 6 abr, AU 1 jul);
// - escala progressiva sobre a base do ano (ES), isenção por total de vendas
//   (FR €305), apuração mensal com isenção por vendas do mês (BR), ordem de
//   compensação de perdas curto/longo (US);
// - Altbestand austríaco (compras antes de 1 mar 2021, isentas após 1 ano);
// - taxa própria para alguns ativos (IT: e-money tokens em euro a 26%);
// - taxa marginal escolhida pela pessoa, onde a lei a faz depender do
//   rendimento (por omissão usa-se a máxima, com as sobretaxas).

const EPS = 1e-9;
const DIA_MS = 86_400_000;
export const diasEntre = (de: string, ate: string): number => Math.round((Date.parse(ate) - Date.parse(de)) / DIA_MS);

/** Soma meses de calendário a uma data YYYY-MM-DD (31 jan + 1 mês = 28/29 fev). */
export function somarMeses(data: string, meses: number): string {
  const [a, m, d] = data.split("-").map(Number);
  const total = a * 12 + (m - 1) + meses;
  const ano = Math.floor(total / 12);
  const mes = (total % 12) + 1;
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const dia = Math.min(d, ultimo);
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** O lote já conta como "longo prazo" no país? */
export function eLongoPrazo(pais: Pick<Country, "regime" | "regras">, compra: string, venda: string): boolean {
  const p = pais.regras?.prazo;
  if (p?.tipo === "meses") return venda > somarMeses(compra, p.n);
  const dias = p?.tipo === "dias" ? p.n : pais.regime.longDays;
  return dias > 0 && diasEntre(compra, venda) >= dias;
}

export type RegimeEfetivo = {
  short: number;
  long: number;
  longDays: number;
  allowance?: Allowance;
  escaloes?: Escalao[];
  semImposto?: boolean;
  isencaoVendas?: number;
};

/** Taxas, isenção e escala em vigor numa data de venda. */
export function regimeNaData(pais: Pick<Country, "regime" | "regras">, data: string): RegimeEfetivo {
  const r: RegimeEfetivo = {
    short: pais.regime.short,
    long: pais.regime.long,
    longDays: pais.regime.longDays,
    allowance: pais.regime.allowance,
    escaloes: pais.regras?.escaloes,
    isencaoVendas: pais.regras?.isencaoVendas,
  };
  // Da data de corte mais recente para a mais antiga: a mais antiga que ainda
  // se aplica ganha (é a mais específica para vendas antigas).
  const hist = [...(pais.regras?.historico ?? [])].sort((a, b) => (a.ate < b.ate ? 1 : -1));
  for (const h of hist) {
    if (!(data < h.ate)) continue;
    if (h.short != null) r.short = h.short;
    if (h.long != null) r.long = h.long;
    if (h.allowance !== undefined) r.allowance = h.allowance ?? undefined;
    if (h.escaloes) r.escaloes = h.escaloes;
    if (h.semImposto) r.semImposto = true;
  }
  return r;
}

/** Taxa marginal escrita pela pessoa (fração 0–1). */
export type TaxaPessoal = { curto?: number; longo?: number };

/** Aplica a taxa pessoal ao regime, conforme o país a faça depender do rendimento. */
export function comTaxaPessoal(pais: Pick<Country, "regras" | "regime">, r: RegimeEfetivo, tp?: TaxaPessoal): RegimeEfetivo {
  const m = pais.regras?.taxaMarginal;
  if (!m || !tp) return r;
  const out = { ...r };
  if (tp.curto != null) {
    out.short = tp.curto;
    if (m.longo === "igual") out.long = tp.curto;
    if (m.longo === "metade") out.long = tp.curto / 2;
  }
  if (m.longo === "separado" && tp.longo != null) out.long = tp.longo;
  return out;
}

/** Taxa e classificação de um lote realizado. */
export function classificarLote(
  pais: Pick<Country, "regime" | "regras">,
  lote: { asset: string; buyDate: string; sellDate: string },
  tp?: TaxaPessoal,
  /** A escolha "onde estão as moedas" está na opção alternativa (ver RegrasPais.alternativa). */
  alternativa?: boolean,
): { longo: boolean; taxa: number } {
  const r = comTaxaPessoal(pais, regimeNaData(pais, lote.sellDate), tp);
  const longo = eLongoPrazo(pais, lote.buyDate, lote.sellDate);
  if (r.semImposto) return { longo, taxa: 0 };
  const a = alternativa ? pais.regras?.alternativa : undefined;
  if (a?.taxa != null) return { longo, taxa: a.taxa };
  if (a?.semIsencaoPrazo) return { longo, taxa: r.short };
  const alt = pais.regras?.altbestand;
  if (alt && lote.buyDate < alt.antes && lote.sellDate > somarMeses(lote.buyDate, 12)) return { longo: true, taxa: 0 };
  const ta = pais.regras?.taxaAtivos;
  if (ta && ta.simbolos.includes(lote.asset.toUpperCase()) && (!ta.desde || lote.sellDate >= ta.desde)) return { longo, taxa: ta.taxa };
  return { longo, taxa: longo ? r.long : r.short };
}

/** Ano fiscal de uma data (GB e AU: o ano em que o ano fiscal COMEÇA). */
export function anoFiscalDe(pais: Pick<Country, "regras"> | null | undefined, data: string): number {
  const ano = Number(data.slice(0, 4));
  const inicio = pais?.regras?.anoFiscalInicio;
  if (!inicio) return ano;
  return data.slice(5) < inicio ? ano - 1 : ano;
}

/** Rótulo do ano fiscal: "2025" ou "2025/26". */
export function rotuloAnoFiscal(pais: Pick<Country, "regras"> | null | undefined, ano: number): string {
  return pais?.regras?.anoFiscalInicio ? `${ano}/${String((ano + 1) % 100).padStart(2, "0")}` : String(ano);
}

/** Uma data dentro do ano fiscal (a última), para saber que regras se aplicam. */
export function fimDoAnoFiscal(pais: Pick<Country, "regras"> | null | undefined, ano: number): string {
  const inicio = pais?.regras?.anoFiscalInicio;
  if (!inicio) return `${ano}-12-31`;
  const d = new Date(Date.UTC(ano + 1, Number(inicio.slice(0, 2)) - 1, Number(inicio.slice(3)) - 1));
  return d.toISOString().slice(0, 10);
}

/** Imposto progressivo sobre uma base. */
export function porEscaloes(base: number, escaloes: Escalao[]): number {
  let imposto = 0;
  let de = 0;
  for (const [ate, taxa] of escaloes) {
    if (base <= de) break;
    imposto += (Math.min(base, ate) - de) * taxa;
    de = ate;
  }
  return imposto;
}

export type EventoFiscal = {
  gain: number;
  taxRate: number;
  longTerm: boolean;
  sellDate: string;
  /** Valor de venda (preço × quantidade) na moeda do relatório. */
  saleValue: number;
};

export type OpcoesResumo = {
  /**
   * A opção alternativa de "onde estão as moedas" (RegrasPais.alternativa):
   * BR exchange estrangeira, PT contraparte sem convenção, AR venda em pesos.
   */
  alternativa?: boolean;
  /** Taxa marginal escrita pela pessoa (onde a lei a faz depender do rendimento). */
  taxaPessoal?: TaxaPessoal;
};

const cent = (n: number) => Math.round(n * 100) / 100;

/**
 * Resumo fiscal de UM ano fiscal de um país. `eventos` já vêm classificados
 * (classificarLote) e são todos do mesmo ano fiscal.
 */
export function resumirPais(pais: Pick<Country, "code" | "regime" | "regras">, eventos: readonly EventoFiscal[], opcoes: OpcoesResumo = {}): TaxSummary {
  if (!eventos.length) return resumirImposto([], { short: 0, long: 0, longDays: 0 });
  const r = comTaxaPessoal(pais, regimeNaData(pais, eventos.reduce((m, e) => (e.sellDate > m ? e.sellDate : m), eventos[0].sellDate)), opcoes.taxaPessoal);
  const regras = pais.regras;
  const allowance = r.allowance && !r.allowance.disputada ? r.allowance : undefined;
  const base = { short: r.short, long: r.long, longDays: r.longDays, allowance };

  // Brasil: apuração MENSAL; isento o mês cujas vendas não passem de R$35.000;
  // perdas não passam de um mês para outro. No exterior, 15% anual sem isenção.
  if (regras?.brMensal) {
    if (opcoes.alternativa) {
      return resumirImposto(eventos.map((e) => ({ gain: e.gain, taxRate: regras.brMensal!.taxaExterior })), { short: regras.brMensal.taxaExterior, long: regras.brMensal.taxaExterior, longDays: 0 });
    }
    const porMes = new Map<string, EventoFiscal[]>();
    for (const e of eventos) porMes.set(e.sellDate.slice(0, 7), [...(porMes.get(e.sellDate.slice(0, 7)) ?? []), e]);
    let totalGain = 0, taxable = 0, exempt = 0, losses = 0, deductibleLosses = 0, lossesApplied = 0, tax = 0;
    for (const lista of porMes.values()) {
      const vendas = lista.reduce((s, e) => s + e.saleValue, 0);
      const ganhos = lista.filter((e) => e.gain > 0).reduce((s, e) => s + e.gain, 0);
      const perdas = lista.filter((e) => e.gain < 0).reduce((s, e) => s + e.gain, 0);
      totalGain += ganhos + perdas;
      losses += perdas;
      if (vendas <= regras.brMensal.isencaoVendasMes + EPS) { exempt += ganhos; continue; }
      deductibleLosses += perdas;
      const usa = Math.min(ganhos, -perdas);
      lossesApplied += usa;
      const liquido = ganhos - usa;
      taxable += liquido;
      tax += porEscaloes(liquido, regras.brMensal.escaloes);
    }
    return { totalGain: cent(totalGain), taxable: cent(taxable), exempt: cent(exempt), losses: cent(losses), deductibleLosses: cent(deductibleLosses), lossesApplied: cent(lossesApplied), allowanceUsed: 0, tax: cent(tax) };
  }

  // França: isento se o TOTAL DAS VENDAS do ano não passar de €305.
  if (r.isencaoVendas != null) {
    const vendas = eventos.reduce((s, e) => s + e.saleValue, 0);
    if (vendas <= r.isencaoVendas + EPS) {
      const s = resumirImposto(eventos, base);
      return { ...s, allowanceUsed: s.taxable, taxable: 0, tax: 0 };
    }
  }

  // EUA: perdas de curto abatem primeiro a ganhos de curto, as de longo a
  // ganhos de longo; só o saldo negativo de uma categoria passa para a outra.
  if (regras?.ordemPerdasUS) {
    const cat = (longo: boolean) => eventos.filter((e) => e.longTerm === longo && e.taxRate > 0);
    const soma = (l: EventoFiscal[], f: (e: EventoFiscal) => boolean) => l.filter(f).reduce((s, e) => s + e.gain, 0);
    const curto = cat(false), longo = cat(true);
    let st = soma(curto, () => true), lt = soma(longo, () => true);
    if (st < 0 && lt > 0) { lt += st; st = 0; } else if (lt < 0 && st > 0) { st += lt; lt = 0; }
    st = Math.max(0, st); lt = Math.max(0, lt);
    const s = resumirImposto(eventos, base);
    const brutoTributavel = soma([...curto, ...longo], (e) => e.gain > 0);
    return { ...s, taxable: cent(st + lt), lossesApplied: cent(Math.max(0, brutoTributavel - st - lt)), tax: cent(st * r.short + lt * r.long) };
  }

  const s = resumirImposto(eventos, base);
  // Espanha: escala da base do aforro sobre o saldo do ano.
  if (r.escaloes && s.taxable > 0) return { ...s, tax: cent(porEscaloes(s.taxable, r.escaloes)) };
  return s;
}

/**
 * Estimativa de um país a partir de lotes JÁ na moeda do relatório (a API
 * converte cada operação antes do motor). `ano` é o ano fiscal (GB/AU: o ano
 * em que começa). Sem ano: um resumo por ano fiscal, somados — nunca netting
 * entre anos.
 */
export function estimarImpostoPais(
  lotes: readonly LoteRealizado[],
  pais: Pick<Country, "code" | "regime" | "regras">,
  ano?: number,
  opcoes: OpcoesResumo = {},
): TaxEstimate & { anos: number[] } {
  const eventos = lotes.map((l) => {
    const c = classificarLote(pais, l, opcoes.taxaPessoal, opcoes.alternativa);
    return {
      asset: l.asset, buyDate: l.buyDate, sellDate: l.sellDate, amount: l.amount,
      gain: l.gain, holdingDays: diasEntre(l.buyDate, l.sellDate), longTerm: c.longo, taxRate: c.taxa,
      saleValue: l.sellPrice * l.amount, fees: l.fees + l.feesNoPreco,
    };
  });
  const anos = [...new Set(eventos.map((e) => anoFiscalDe(pais, e.sellDate)))].sort((a, b) => a - b);
  const alvo = ano == null ? anos : anos.filter((a) => a === ano);
  const parciais = alvo.map((a) => resumirPais(pais, eventos.filter((e) => anoFiscalDe(pais, e.sellDate) === a), opcoes));
  const soma = (f: (r: TaxSummary) => number) => cent(parciais.reduce((acc, r) => acc + f(r), 0));
  const doAno = eventos.filter((e) => alvo.includes(anoFiscalDe(pais, e.sellDate)));
  return {
    totalGain: soma((r) => r.totalGain), taxable: soma((r) => r.taxable), exempt: soma((r) => r.exempt),
    losses: soma((r) => r.losses), deductibleLosses: soma((r) => r.deductibleLosses), lossesApplied: soma((r) => r.lossesApplied),
    allowanceUsed: soma((r) => r.allowanceUsed), tax: soma((r) => r.tax),
    events: doAno.map(({ saleValue: _s, fees: _f, ...e }) => e),
    fees: cent(doAno.reduce((acc, e) => acc + e.fees, 0)),
    droppedLots: 0,
    anos,
  };
}
