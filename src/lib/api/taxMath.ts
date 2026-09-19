import type { RealizedLot } from "@/lib/portfolios/trades";

// Estimativa de imposto sobre mais-valias, sem base de dados nem rede — para
// poder ser testada sozinha. Esta é a ÚNICA implementação: o ecrã de
// Fiscalidade, o PDF, o Excel, a API e o MCP chamam todos `resumirImposto`,
// para nunca haver dois números diferentes para a mesma pergunta.
//
// Regras, por ordem de aplicação:
//   1. cada venda usa a taxa de curto ou de longo prazo conforme os dias de
//      detenção;
//   2. as menos-valias ABATEM às mais-valias do mesmo ano — é o saldo que se
//      tributa (PT: art. 43.º do CIRS; GB: net gains antes da isenção anual;
//      DE: Gesamtgewinn). Só abatem as perdas de eventos TRIBUTADOS: se o ganho
//      de um ativo detido mais de um ano não é tributado, a perda desse mesmo
//      ativo também não é dedutível;
//   3. o abatimento começa pelo escalão de taxa mais alta, que é o que favorece
//      o contribuinte;
//   4. a isenção anual aplica-se por fim, ao saldo JÁ compensado.
//
// É uma ESTIMATIVA: não substitui a declaração nem cobre casos pessoais
// (residência parcial, englobamento, deduções próprias).

export type RegimeInput = {
  short: number;
  long: number;
  longDays: number;
  allowance?: { amount: number; kind: "deduct" | "threshold" };
  /**
   * País que NÃO deixa compensar menos-valias com mais-valias. A regra
   * permissiva é a normal; esta é a exceção, e tem de ser declarada no país.
   */
  noLossOffset?: boolean;
};

export type TaxEvent = {
  asset: string;
  buyDate: string;
  sellDate: string;
  amount: number;
  /** Ganho na moeda do relatório, já com taxas deduzidas. */
  gain: number;
  holdingDays: number;
  longTerm: boolean;
  taxRate: number;
};

export type TaxSummary = {
  totalGain: number;
  /** Base já compensada e sobre a qual incide imposto (nunca negativa). */
  taxable: number;
  /** Ganhos de eventos com taxa 0 (longo prazo isento, países sem imposto). */
  exempt: number;
  /** TODAS as menos-valias, para mostrar ao utilizador. */
  losses: number;
  /** A parte das menos-valias que a lei deixa abater (só eventos tributados). */
  deductibleLosses: number;
  /** Quanto das menos-valias dedutíveis foi efetivamente usado a abater. */
  lossesApplied: number;
  allowanceUsed: number;
  tax: number;
};

export type TaxEstimate = TaxSummary & {
  events: TaxEvent[];
  fees: number;
  /** Lotes deixados de fora por falta de câmbio na data. Nunca em silêncio. */
  droppedLots: number;
};

export const diasEntre = (de: string, ate: string): number =>
  Math.max(0, Math.floor((new Date(ate).getTime() - new Date(de).getTime()) / 86_400_000));

/** Ano fiscal de um evento: o ano da VENDA, em UTC. */
export const anoDoEvento = (e: { sellDate: string }): number => new Date(e.sellDate).getUTCFullYear();

/**
 * O resumo fiscal de um conjunto de eventos JÁ do mesmo ano.
 *
 * Não filtra por ano de propósito: quem chama decide o ano, porque compensar
 * perdas entre anos diferentes seria um erro a favor do contribuinte — o pior
 * tipo de erro para pôr num relatório que alguém vai entregar.
 */
export function resumirImposto(
  // Só precisa do ganho e da taxa: assim o ecrã de Fiscalidade, que tem um tipo
  // de evento com outros campos, chama exatamente esta função em vez de ter uma
  // cópia da conta.
  events: ReadonlyArray<{ gain: number; taxRate: number }>,
  regime: RegimeInput,
): TaxSummary {
  const totalGain = events.reduce((s, e) => s + e.gain, 0);
  const exempt = events.filter((e) => e.gain > 0 && e.taxRate === 0).reduce((s, e) => s + e.gain, 0);
  const losses = events.filter((e) => e.gain < 0).reduce((s, e) => s + e.gain, 0);

  // Só as perdas de eventos tributados abatem. Uma perda num ativo cujo ganho
  // seria isento não gera dedução nenhuma.
  const deductibleLosses = regime.noLossOffset
    ? 0
    : events.filter((e) => e.gain < 0 && e.taxRate > 0).reduce((s, e) => s + e.gain, 0);

  // Ganhos tributáveis por escalão de taxa, do mais alto para o mais baixo: o
  // abatimento entra primeiro onde poupa mais.
  const porTaxa = new Map<number, number>();
  for (const e of events) {
    if (e.gain > 0 && e.taxRate > 0) porTaxa.set(e.taxRate, (porTaxa.get(e.taxRate) ?? 0) + e.gain);
  }
  const escaloes = [...porTaxa.entries()].sort((a, b) => b[0] - a[0]);

  let porAbater = Math.abs(deductibleLosses);
  const abatido = porAbater;
  const bases: Array<{ taxa: number; base: number }> = [];
  for (const [taxa, bruto] of escaloes) {
    const usa = Math.min(porAbater, bruto);
    porAbater -= usa;
    bases.push({ taxa, base: bruto - usa });
  }
  const lossesApplied = abatido - porAbater;

  let taxable = bases.reduce((s, b) => s + b.base, 0);
  let tax = bases.reduce((s, b) => s + b.base * b.taxa, 0);

  // A isenção anual entra por último, sobre o saldo já compensado.
  let allowanceUsed = 0;
  const alw = regime.allowance;
  if (alw && taxable > 0 && tax > 0) {
    if (alw.kind === "threshold") {
      // Tudo-ou-nada: abaixo do limite não há imposto; acima, paga-se sobre tudo.
      if (taxable <= alw.amount) { allowanceUsed = taxable; tax = 0; }
    } else {
      allowanceUsed = Math.min(alw.amount, taxable);
      // Consome a isenção a começar no escalão mais alto, pela mesma razão.
      let porIsentar = allowanceUsed;
      tax = 0;
      for (const b of bases) {
        const usa = Math.min(porIsentar, b.base);
        porIsentar -= usa;
        tax += (b.base - usa) * b.taxa;
      }
    }
  }

  // Arredondar só no fim, ao cêntimo: arredondar por evento acumula erro.
  const cent = (n: number) => Math.round(n * 100) / 100;
  taxable = cent(taxable);

  return {
    totalGain: cent(totalGain),
    taxable,
    exempt: cent(exempt),
    losses: cent(losses),
    deductibleLosses: cent(deductibleLosses),
    lossesApplied: cent(lossesApplied),
    allowanceUsed: cent(allowanceUsed),
    tax: cent(Math.max(0, tax)),
  };
}

/**
 * `converter` traduz um valor em euros para a moeda do relatório à taxa DA DATA
 * indicada (compra à taxa do dia da compra, venda à do dia da venda). Devolver
 * null significa "sem taxa para essa data" — o lote fica de fora e é contado em
 * `droppedLots`, para quem chama nunca apresentar um total feito de um pedaço.
 *
 * `ano` limita o relatório a um ano fiscal (pelo ano da venda). Sem ano, os
 * eventos são agrupados por ano e os impostos anuais somados — nunca há
 * compensação de perdas entre anos.
 */
export function estimarImposto(
  lots: RealizedLot[],
  regime: RegimeInput,
  converter: (eur: number, data: string) => number | null,
  ano?: number,
): TaxEstimate {
  const events: TaxEvent[] = [];
  let fees = 0;
  let droppedLots = 0;

  for (const l of lots) {
    const compra = converter(l.buyPrice * l.amount, l.buyDate);
    const venda = converter(l.sellPrice * l.amount, l.sellDate);
    // A taxa da compra é da data da COMPRA; a da venda, da data da venda.
    const taxaCompra = converter(l.buyFees ?? 0, l.buyDate);
    const taxaVenda = converter(l.sellFees ?? l.fees, l.sellDate);
    if (compra == null || venda == null || taxaCompra == null || taxaVenda == null) { droppedLots++; continue; }

    const holdingDays = diasEntre(l.buyDate, l.sellDate);
    const longTerm = regime.longDays > 0 && holdingDays >= regime.longDays;
    const custo = taxaCompra + taxaVenda;
    events.push({
      asset: l.asset,
      buyDate: l.buyDate,
      sellDate: l.sellDate,
      amount: l.amount,
      gain: venda - compra - custo,
      holdingDays,
      longTerm,
      taxRate: longTerm ? regime.long : regime.short,
    });
    fees += custo;
  }

  const doAno = ano == null ? events : events.filter((e) => anoDoEvento(e) === ano);

  // Sem ano escolhido: um resumo por ano, somados — nunca netting entre anos.
  let resumo: TaxSummary;
  if (ano == null) {
    const anos = [...new Set(events.map(anoDoEvento))];
    const parciais = anos.map((a) => resumirImposto(events.filter((e) => anoDoEvento(e) === a), regime));
    const soma = (f: (r: TaxSummary) => number) => Math.round(parciais.reduce((s, r) => s + f(r), 0) * 100) / 100;
    resumo = {
      totalGain: soma((r) => r.totalGain),
      taxable: soma((r) => r.taxable),
      exempt: soma((r) => r.exempt),
      losses: soma((r) => r.losses),
      deductibleLosses: soma((r) => r.deductibleLosses),
      lossesApplied: soma((r) => r.lossesApplied),
      allowanceUsed: soma((r) => r.allowanceUsed),
      tax: soma((r) => r.tax),
    };
  } else {
    resumo = resumirImposto(doAno, regime);
  }

  return { ...resumo, events: doAno, fees: Math.round(fees * 100) / 100, droppedLots };
}
