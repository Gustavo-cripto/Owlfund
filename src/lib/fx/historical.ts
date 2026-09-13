// Conversão de valores à taxa de câmbio da DATA em que a transação aconteceu.
//
// Serve o relatório fiscal: uma venda feita em dólares em março de 2023 tem de
// entrar na declaração convertida à taxa de março de 2023. Usar a taxa de hoje
// muda a mais-valia e o imposto — e é exatamente o tipo de erro que só se
// descobre numa inspeção.

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Mapa data → { MOEDA: quanto vale 1 EUR nessa moeda }. */
export type RateMap = Record<string, Record<string, number>>;

export type FxTable = {
  /** Taxa de 1 EUR na moeda pedida, na data (ou no dia útil anterior). */
  rate: (date: string, currency: string) => number | null;
  /** Converte entre duas moedas à taxa da data. Devolve null se faltar taxa. */
  convert: (amount: number, from: string, to: string, date: string) => number | null;
  /** True se alguma conversão pedida não teve taxa — para avisar no ecrã. */
  readonly incomplete: boolean;
};

/** Quantos dias recuar à procura do último dia útil com cotação (feriados longos). */
const MAX_LOOKBACK_DAYS = 10;

const shiftDay = (iso: string, days: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/**
 * Vai buscar as taxas necessárias para converter um conjunto de datas.
 * Uma só chamada, para o intervalo todo — não uma por transação.
 */
export async function loadFxTable(dates: string[], currencies: string[]): Promise<FxTable> {
  const validDates = dates.filter((d) => ISO.test(d)).sort();
  const needed = [...new Set(currencies.map((c) => c.toUpperCase()))].filter((c) => c !== "EUR");

  let rates: RateMap = {};
  if (validDates.length > 0 && needed.length > 0) {
    // Recuar alguns dias no início: se a primeira transação foi num domingo,
    // a taxa dela está no dia útil anterior, que pode ficar fora do intervalo.
    const from = shiftDay(validDates[0], -MAX_LOOKBACK_DAYS);
    const to = validDates[validDates.length - 1];
    try {
      const res = await fetch(
        `/api/fx/historical?from=${from}&to=${to}&symbols=${needed.join(",")}`,
      );
      if (res.ok) {
        const j = (await res.json()) as { rates?: RateMap };
        rates = j.rates ?? {};
      }
    } catch {
      /* sem taxas: as conversões devolvem null e o ecrã avisa */
    }
  }

  let incomplete = false;

  const rate = (date: string, currency: string): number | null => {
    const cur = currency.toUpperCase();
    if (cur === "EUR") return 1;
    if (!ISO.test(date)) return null;
    // Fim de semana ou feriado: vale a última cotação publicada antes da data.
    for (let i = 0; i <= MAX_LOOKBACK_DAYS; i++) {
      const v = rates[shiftDay(date, -i)]?.[cur];
      if (typeof v === "number" && v > 0) return v;
    }
    return null;
  };

  const convert = (amount: number, from: string, to: string, date: string): number | null => {
    const a = from.toUpperCase();
    const b = to.toUpperCase();
    if (a === b) return amount;
    const rf = rate(date, a);
    const rt = rate(date, b);
    if (rf == null || rt == null) { incomplete = true; return null; }
    return (amount / rf) * rt;
  };

  return {
    rate,
    convert,
    get incomplete() { return incomplete; },
  };
}
