import { loadFxTable } from "@/lib/fx/historical";
let fails = 0;
const eq = (name: string, got: number | boolean | string | null, want: number | boolean | string | null) => { const ok = typeof got === "number" && typeof want === "number" ? Math.abs(got - want) < 1e-9 : got === want; if (!ok) fails++; console.log(`${ok ? "✅" : "❌"} ${name}: ${got}${ok ? "" : ` (esperado ${want})`}`); };

// Simula o /api/fx/historical (feed do BCE: so dias uteis). Natal de 2025:
// 24 (qua) publicado, 25-26 feriado, 27-28 fim de semana, 29 (seg) publicado.
const RATES: Record<string, Record<string, number>> = {
  "2025-12-23": { USD: 1.1750, GBP: 0.8700 },
  "2025-12-24": { USD: 1.1787, GBP: 0.8710 },
  "2025-12-29": { USD: 1.1766, GBP: 0.8690 },
};
const pedidos: string[] = [];
globalThis.fetch = (async (url: string | URL) => {
  const u = String(url); pedidos.push(u);
  const from = /from=([\d-]+)/.exec(u)?.[1] ?? ""; const to = /to=([\d-]+)/.exec(u)?.[1] ?? "";
  const rates = Object.fromEntries(Object.entries(RATES).filter(([d]) => d >= from && d <= to));
  return new Response(JSON.stringify({ rates }), { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;

(async () => {
  const fx = await loadFxTable(["2025-12-28", "2025-12-25", "2025-12-29"], ["USD"]);
  eq("uma so chamada para o intervalo todo", pedidos.length, 1);
  eq("pede 10 dias antes da 1.ª data (fim de semana no inicio)", /from=2025-12-15/.test(pedidos[0]), true);
  eq("dia util: taxa do proprio dia", fx.rate("2025-12-29", "USD"), 1.1766);
  eq("feriado (25 dez): ultimo dia util anterior (24)", fx.rate("2025-12-25", "USD"), 1.1787);
  eq("domingo (28 dez): ultimo dia util anterior (24)", fx.rate("2025-12-28", "USD"), 1.1787);
  eq("EUR e sempre 1", fx.rate("2025-12-28", "EUR"), 1);
  eq("EUR→USD no domingo usa a taxa de 24", fx.convert(100, "EUR", "USD", "2025-12-28"), 117.87);
  eq("USD→EUR (entrada no Historico em dolares)", fx.convert(117.87, "USD", "EUR", "2025-12-28"), 100);
  eq("ida e volta nao perde valor", fx.convert(fx.convert(1234.56, "EUR", "USD", "2025-12-29")!, "USD", "EUR", "2025-12-29"), 1234.56);
  eq("mesma moeda: devolve igual sem taxa", fx.convert(50, "USD", "USD", "1990-01-01"), 50);
  eq("ainda completo", fx.incomplete, false);
  eq("moeda sem taxa → null", fx.convert(10, "EUR", "JPY", "2025-12-29"), null);
  eq("…e fica marcado como incompleto", fx.incomplete, true);
  eq("data sem cotacao nos 10 dias anteriores → null", fx.rate("2026-03-01", "USD"), null);
  eq("data mal formada → null", fx.rate("29/12/2025", "USD"), null);

  // Sem rede: nada rebenta, tudo devolve null e fica incompleto.
  globalThis.fetch = (async () => { throw new Error("Failed to fetch"); }) as typeof fetch;
  const semRede = await loadFxTable(["2025-12-29"], ["USD"]);
  eq("sem rede: convert devolve null", semRede.convert(1, "EUR", "USD", "2025-12-29"), null);
  eq("sem rede: incompleto", semRede.incomplete, true);

  console.log(fails === 0 ? "\nTODOS OK" : `\n${fails} FALHA(S)`); process.exit(fails ? 1 : 0);
})();
