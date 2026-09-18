// Taxas de câmbio históricas do lado do SERVIDOR (a versão do browser chama a
// nossa própria rota, que não existe aqui). Mesma fonte (feed do BCE via
// Frankfurter) e mesma regra: fim de semana ou feriado usa a última cotação
// publicada antes da data — é o que as autoridades fiscais aceitam.

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MAX_LOOKBACK_DAYS = 10;

const shiftDay = (iso: string, days: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export type FxLookup = {
  /** Converte de euros para `currency` à taxa da data. null = sem taxa. */
  fromEur: (amount: number, date: string) => number | null;
  /** True se alguma conversão pedida ficou sem taxa. */
  readonly incomplete: boolean;
};

export async function loadFxServer(dates: string[], currency: string): Promise<FxLookup> {
  const cur = currency.toUpperCase();
  const validas = dates.filter((d) => ISO.test(d)).sort();

  let rates: Record<string, Record<string, number>> = {};
  if (cur !== "EUR" && validas.length > 0) {
    const from = shiftDay(validas[0], -MAX_LOOKBACK_DAYS);
    const to = validas[validas.length - 1];
    try {
      const res = await fetch(
        `https://api.frankfurter.dev/v1/${from}..${to}?base=EUR&symbols=${cur}`,
        { signal: AbortSignal.timeout(8000), next: { revalidate: 21600 } },
      );
      if (res.ok) {
        const j = (await res.json()) as { rates?: Record<string, Record<string, number>> };
        rates = j.rates ?? {};
      }
    } catch { /* sem taxas: as conversões devolvem null e quem chama avisa */ }
  }

  let incomplete = false;
  const fromEur = (amount: number, date: string): number | null => {
    if (cur === "EUR") return amount;
    if (!ISO.test(date)) { incomplete = true; return null; }
    for (let i = 0; i <= MAX_LOOKBACK_DAYS; i++) {
      const v = rates[shiftDay(date, -i)]?.[cur];
      if (typeof v === "number" && v > 0) return amount * v;
    }
    incomplete = true;
    return null;
  };

  return { fromEur, get incomplete() { return incomplete; } };
}
