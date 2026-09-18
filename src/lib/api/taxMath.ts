import type { RealizedLot } from "@/lib/portfolios/trades";

// Estimativa de imposto sobre mais-valias, sem base de dados nem rede — para
// poder ser testada sozinha. Mesmas regras da página de Fiscalidade:
//   • cada venda usa a taxa de curto ou longo prazo conforme os dias de detenção;
//   • a isenção anual do país abate ao tributável ("deduct") ou isenta tudo se
//     ficar abaixo do limite ("threshold");
//   • perdas entram no total de ganhos, mas não geram imposto negativo.
//
// É uma ESTIMATIVA: não substitui a declaração nem cobre casos pessoais
// (residência parcial, englobamento, deduções próprias).

export type RegimeInput = {
  short: number;
  long: number;
  longDays: number;
  allowance?: { amount: number; kind: "deduct" | "threshold" };
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

export type TaxEstimate = {
  events: TaxEvent[];
  totalGain: number;
  taxable: number;
  exempt: number;
  losses: number;
  allowanceUsed: number;
  tax: number;
  fees: number;
};

export const diasEntre = (de: string, ate: string): number =>
  Math.max(0, Math.floor((new Date(ate).getTime() - new Date(de).getTime()) / 86_400_000));

/**
 * `converter` traduz um valor em euros para a moeda do relatório à taxa DA DATA
 * indicada (compra à taxa do dia da compra, venda à do dia da venda). Devolver
 * null significa "sem taxa para essa data" — o lote fica de fora.
 */
export function estimarImposto(
  lots: RealizedLot[],
  regime: RegimeInput,
  converter: (eur: number, data: string) => number | null,
): TaxEstimate {
  const events: TaxEvent[] = [];
  let fees = 0;

  for (const l of lots) {
    const compra = converter(l.buyPrice * l.amount, l.buyDate);
    const venda = converter(l.sellPrice * l.amount, l.sellDate);
    const taxa = converter(l.fees, l.sellDate);
    if (compra == null || venda == null || taxa == null) continue;

    const holdingDays = diasEntre(l.buyDate, l.sellDate);
    const longTerm = regime.longDays > 0 && holdingDays >= regime.longDays;
    events.push({
      asset: l.asset,
      buyDate: l.buyDate,
      sellDate: l.sellDate,
      amount: l.amount,
      gain: venda - compra - taxa,
      holdingDays,
      longTerm,
      taxRate: longTerm ? regime.long : regime.short,
    });
    fees += taxa;
  }

  const totalGain = events.reduce((s, e) => s + e.gain, 0);
  const taxable = events.filter((e) => e.gain > 0 && e.taxRate > 0).reduce((s, e) => s + e.gain, 0);
  const exempt = events.filter((e) => e.gain > 0 && e.taxRate === 0).reduce((s, e) => s + e.gain, 0);
  const losses = events.filter((e) => e.gain < 0).reduce((s, e) => s + e.gain, 0);

  let tax = events.filter((e) => e.gain > 0).reduce((s, e) => s + e.gain * e.taxRate, 0);
  let allowanceUsed = 0;
  const alw = regime.allowance;
  if (alw && taxable > 0 && tax > 0) {
    if (alw.kind === "threshold") {
      // Tudo-ou-nada: abaixo do limite não há imposto; acima, paga tudo.
      if (taxable <= alw.amount) { allowanceUsed = taxable; tax = 0; }
    } else {
      allowanceUsed = Math.min(alw.amount, taxable);
      tax = tax * (1 - allowanceUsed / taxable);
    }
  }

  return { events, totalGain, taxable, exempt, losses, allowanceUsed, tax, fees };
}
