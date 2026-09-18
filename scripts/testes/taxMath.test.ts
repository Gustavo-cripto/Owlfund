import { diasEntre, estimarImposto } from "@/lib/api/taxMath";
import type { RealizedLot } from "@/lib/portfolios/trades";
let fails = 0;
const eq = (name: string, got: number | boolean, want: number | boolean) => {
  const ok = typeof got === "number" && typeof want === "number" ? Math.abs(got - want) < 1e-6 : got === want;
  if (!ok) fails++;
  console.log(`${ok ? "✅" : "❌"} ${name}: ${got}${ok ? "" : ` (esperado ${want})`}`);
};

const lote = (buyDate: string, sellDate: string, buyPrice: number, sellPrice: number, amount = 1, fees = 0): RealizedLot =>
  ({ asset: "BTC", buyDate, sellDate, buyPrice, sellPrice, amount, fees, gain: (sellPrice - buyPrice) * amount - fees });
const emEuros = (eur: number) => eur; // país da zona euro: sem conversão

// Portugal: 28 % abaixo de 365 dias, isento a partir daí.
const PT = { short: 0.28, long: 0, longDays: 365 };
const curto = estimarImposto([lote("2026-01-10", "2026-06-10", 100, 200)], PT, emEuros);
eq("curto prazo: ganho", curto.totalGain, 100);
eq("curto prazo: tributável", curto.taxable, 100);
eq("curto prazo: imposto 28 %", curto.tax, 28);
eq("curto prazo: marcado como curto", curto.events[0].longTerm, false);

const longo = estimarImposto([lote("2024-01-10", "2026-06-10", 100, 200)], PT, emEuros);
eq("longo prazo (>365 dias): isento", longo.tax, 0);
eq("longo prazo: ganho continua a contar", longo.totalGain, 100);
eq("longo prazo: entra em isento, não em tributável", longo.exempt, 100);

// Taxas e gás descem ao ganho.
const comTaxa = estimarImposto([lote("2026-01-10", "2026-06-10", 100, 200, 1, 10)], PT, emEuros);
eq("taxa deduzida ao ganho", comTaxa.totalGain, 90);
eq("imposto sobre o ganho líquido", comTaxa.tax, 25.2);

// Perdas: entram no total, não geram imposto negativo.
const comPerda = estimarImposto([lote("2026-01-10", "2026-06-10", 200, 100)], PT, emEuros);
eq("perda no total", comPerda.totalGain, -100);
eq("perda não gera imposto", comPerda.tax, 0);
eq("perda registada", comPerda.losses, -100);

// Alemanha: isenção "tudo ou nada" (Freigrenze) de 1000 €.
const DE = { short: 0.45, long: 0, longDays: 365, allowance: { amount: 1000, kind: "threshold" as const } };
const abaixo = estimarImposto([lote("2026-01-10", "2026-06-10", 100, 900)], DE, emEuros);
eq("abaixo do limite: sem imposto", abaixo.tax, 0);
eq("abaixo do limite: isenção usada", abaixo.allowanceUsed, 800);
const acima = estimarImposto([lote("2026-01-10", "2026-06-10", 100, 1200)], DE, emEuros);
eq("acima do limite: paga tudo", acima.tax, 1100 * 0.45);
eq("acima do limite: isenção não usada", acima.allowanceUsed, 0);

// Reino Unido: isenção que ABATE ao tributável (deduct).
const GB = { short: 0.24, long: 0.24, longDays: 0, allowance: { amount: 3000, kind: "deduct" as const } };
const gb = estimarImposto([lote("2026-01-10", "2026-06-10", 1000, 5000)], GB, emEuros);
eq("abate 3000 ao tributável de 4000", gb.allowanceUsed, 3000);
eq("imposto só sobre 1000", gb.tax, 1000 * 0.24);

// Conversão por data: compra a 1,10 e venda a 1,20 dá um ganho diferente do bruto.
const taxas: Record<string, number> = { "2026-01-10": 1.10, "2026-06-10": 1.20 };
const emDolares = (eur: number, data: string) => eur * (taxas[data] ?? 0);
const us = estimarImposto([lote("2026-01-10", "2026-06-10", 100, 200)], { short: 0.2, long: 0.15, longDays: 365 }, emDolares);
eq("cada perna à taxa da sua data", us.totalGain, 200 * 1.2 - 100 * 1.1);
eq("imposto na moeda do país", us.tax, (200 * 1.2 - 100 * 1.1) * 0.2);

// Sem taxa de câmbio para a data, o lote fica de fora (não entra com valor errado).
const semTaxa = estimarImposto([lote("2026-01-10", "2026-06-10", 100, 200)], PT, (_e, d) => (d === "2026-06-10" ? null : 1));
eq("lote sem câmbio é ignorado", semTaxa.events.length, 0);
eq("…e não inventa imposto", semTaxa.tax, 0);

eq("dias entre datas", diasEntre("2026-01-01", "2026-01-31"), 30);
eq("datas invertidas não dão negativo", diasEntre("2026-01-31", "2026-01-01"), 0);

console.log(fails === 0 ? "\nTODOS OK" : `\n${fails} FALHA(S)`); process.exit(fails ? 1 : 0);
