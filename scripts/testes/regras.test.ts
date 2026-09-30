// Regras por país (auditoria de cálculos de 30 set 2026). Cada caso é um
// cenário do relatório, com o número que a calculadora dava e o certo.
import { COUNTRIES } from "@/lib/tax/countries";
import { realizar, type LoteRealizado, type Operacao } from "@/lib/tax/metodos";
import { anoFiscalDe, estimarImpostoPais, rotuloAnoFiscal, somarMeses } from "@/lib/tax/regras";

let fails = 0;
const eq = (name: string, got: number | string | boolean, want: number | string | boolean) => {
  const ok = typeof got === "number" && typeof want === "number" ? Math.abs(got - want) < 0.011 : got === want;
  if (!ok) fails++;
  console.log(`${ok ? "✅" : "❌"} ${name}: ${got}${ok ? "" : ` (esperado ${want})`}`);
};
const P = (c: string) => COUNTRIES.find((x) => x.code === c)!;
let n = 0;
const lote = (buyDate: string, sellDate: string, buy: number, sell: number, amount = 1, asset = "BTC"): LoteRealizado =>
  ({ asset, buyDate, sellDate, buyPrice: buy, sellPrice: sell, amount, buyFees: 0, sellFees: 0, fees: 0, gain: (sell - buy) * amount, feesNoPreco: 0, venda: n++ });
const imposto = (c: string, lotes: LoteRealizado[], ano?: number, opc = {}) => estimarImpostoPais(lotes, P(c), ano, opc).tax;

// 1. Espanha: escala 19/21/23/27/30 sobre a base do ano.
eq("ES ganho 10.000 → 1.980", imposto("ES", [lote("2025-01-10", "2026-03-10", 20000, 30000)], 2026), 1980);
eq("ES ganho 100.000 → 21.880", imposto("ES", [lote("2025-01-10", "2026-03-10", 0, 100000)], 2026), 21880);
eq("ES ganho 400.000 → 101.880", imposto("ES", [lote("2025-01-10", "2026-03-10", 0, 400000)], 2026), 101880);
eq("ES 2024 (escalão de topo 28%): 400.000 → 99.880", imposto("ES", [lote("2023-01-10", "2024-03-10", 0, 400000)], 2024), 99880);

// 2. Brasil: isenção mensal por vendas, sem compensação entre meses.
eq("BR venda R$34.000, ganho 4.000 → 0", imposto("BR", [lote("2025-01-10", "2026-03-10", 30000, 34000)], 2026), 0);
eq("BR duas vendas de R$30.000 em meses diferentes → 0", imposto("BR", [lote("2025-01-10", "2026-03-10", 25000, 30000), lote("2025-01-10", "2026-05-10", 25000, 30000)], 2026), 0);
eq("BR +10k em março e −10k em novembro → 1.500", imposto("BR", [lote("2025-01-10", "2026-03-10", 40000, 50000), lote("2025-01-10", "2026-11-10", 50000, 40000)], 2026), 1500);
eq("BR exterior: 15% anual sem isenção (venda de 34.000, ganho 4.000) → 600", imposto("BR", [lote("2025-01-10", "2026-03-10", 30000, 34000)], 2026, { alternativa: true }), 600);

// 3. Ano fiscal britânico e australiano.
eq("GB 10 fev 2026 é do ano fiscal 2025/26", rotuloAnoFiscal(P("GB"), anoFiscalDe(P("GB"), "2026-02-10")), "2025/26");
eq("GB 10 jul 2026 é do ano fiscal 2026/27", rotuloAnoFiscal(P("GB"), anoFiscalDe(P("GB"), "2026-07-10")), "2026/27");
const gb = [lote("2025-01-10", "2026-02-10", 0, 3000), lote("2025-01-10", "2026-07-10", 0, 3000)];
eq("GB £3k em fev + £3k em jul: 2025/26 → 0", imposto("GB", gb, 2025), 0);
eq("GB £3k em fev + £3k em jul: 2026/27 → 0", imposto("GB", gb, 2026), 0);
eq("AU mar 2026 é do FY 2025/26", anoFiscalDe(P("AU"), "2026-03-10"), 2025);
eq("AU ago 2026 é do FY 2026/27", anoFiscalDe(P("AU"), "2026-08-10"), 2026);

// 4. Regras do ano da venda.
eq("IT venda em 2025 a 26% → 2.600", imposto("IT", [lote("2024-01-10", "2025-03-10", 20000, 30000)], 2025), 2600);
eq("IT venda em 2026 a 33% → 3.300", imposto("IT", [lote("2025-01-10", "2026-03-10", 20000, 30000)], 2026), 3300);
eq("IT 2024: ganho de 1.500 abaixo do limiar de €2.000 → 0", imposto("IT", [lote("2023-01-10", "2024-03-10", 0, 1500)], 2024), 0);
eq("BE venda em 2025 (antes do regime) → 0", imposto("BE", [lote("2024-01-10", "2025-03-10", 0, 30000)], 2025), 0);
eq("BE venda em 2026: 10% sobre 30k − 10k → 2.000", imposto("BE", [lote("2025-01-10", "2026-03-10", 0, 30000)], 2026), 2000);
eq("FR venda em 2024 a 30% → 3.000", imposto("FR", [lote("2023-01-10", "2024-03-10", 20000, 30000)], 2024), 3000);
eq("FR venda em 2025 a 31,4% (CSG retroativa) → 3.140", imposto("FR", [lote("2024-01-10", "2025-03-10", 20000, 30000)], 2025), 3140);
eq("PT venda em 2022 (antes do regime) → 0", imposto("PT", [lote("2022-01-10", "2022-06-10", 20000, 30000)], 2022), 0);
eq("DE 2023: Freigrenze €600, ganho 700 → 332,33", imposto("DE", [lote("2023-01-10", "2023-06-10", 0, 700)], 2023), 700 * 0.47475);

// 5. Áustria: Altbestand isento após 1 ano.
eq("AT compra 2020-06 (Altbestand), venda 2026 → 0", imposto("AT", [lote("2020-06-01", "2026-03-10", 8000, 60000)], 2026), 0);
eq("AT compra 2022 (Neuvermögen), venda 2026 → 27,5%", imposto("AT", [lote("2022-06-01", "2026-03-10", 8000, 18000)], 2026), 2750);

// 6. Troca cripto↔cripto em Portugal: sem imposto; custo e prazo a partir da troca.
const ops: Operacao[] = [
  { type: "compra", asset: "BTC", amount: 1, price: 20000, fee: 0, date: "2025-01-10" },
  { type: "compra", asset: "ETH", amount: 10, price: 3000, fee: 0, date: "2025-06-10", swapId: "s1" },
  { type: "venda", asset: "BTC", amount: 1, price: 30000, fee: 0, date: "2025-06-10", swapId: "s1" },
  { type: "venda", asset: "ETH", amount: 10, price: 3500, fee: 0, date: "2026-03-10" },
];
const neutra = realizar(ops, "fifo", { permutaNeutra: true });
eq("PT troca: só a venda em dinheiro realiza (1 lote)", neutra.lotes.length, 1);
eq("PT troca: o ETH herda o custo do BTC (ganho 35k − 20k)", neutra.lotes[0].gain, 15000);
eq("PT troca: imposto 28% (menos de 365 dias desde a troca)", estimarImpostoPais(neutra.lotes, P("PT"), 2026).tax, 4200);
eq("DE troca é tributável: 2 lotes", realizar(ops, "fifo").lotes.length, 2);

// 8. Prazo por calendário e estrito.
eq("DE venda no dia do aniversário → tributada", imposto("DE", [lote("2025-03-10", "2026-03-10", 20000, 30000)], 2026), 10000 * 0.47475);
eq("DE venda no dia seguinte → isenta", imposto("DE", [lote("2025-03-10", "2026-03-11", 20000, 30000)], 2026), 0);
eq("US venda no aniversário → curto prazo (máx. 40,8%)", imposto("US", [lote("2025-03-10", "2026-03-10", 20000, 30000)], 2026), 4080);
eq("LU 15 jan → 15 jul (exatamente 6 meses) → especulativo", imposto("LU", [lote("2026-01-15", "2026-07-15", 20000, 30000)], 2026), 4578);
eq("LU 15 jan → 16 jul → isento", imposto("LU", [lote("2026-01-15", "2026-07-16", 20000, 30000)], 2026), 0);
eq("somarMeses 31 jan + 1 = 28 fev", somarMeses("2026-01-31", 1), "2026-02-28");

// 10. Limite "tudo ou nada" estrito.
eq("DE ganho de exatamente €1.000 → tributado", imposto("DE", [lote("2026-01-10", "2026-05-10", 0, 1000)], 2026), 474.75);
eq("DE ganho de €999 → 0", imposto("DE", [lote("2026-01-10", "2026-05-10", 0, 999)], 2026), 0);

// 11. França: isenção por total de vendas ≤ €305.
eq("FR vendas de €300 com ganho 100 → 0", imposto("FR", [lote("2026-01-10", "2026-05-10", 200, 300)], 2026), 0);
eq("FR vendas de €400 com ganho 100 → 31,40", imposto("FR", [lote("2026-01-10", "2026-05-10", 300, 400)], 2026), 31.4);

// 12. EUA: perdas compensam dentro da categoria primeiro.
const us = [lote("2026-01-10", "2026-06-10", 0, 10000), lote("2024-01-10", "2026-06-10", 0, 10000), lote("2024-01-10", "2026-06-10", 10000, 5000)];
eq("US curto +10k, longo +10k, longo −5k (37%/20%) → 4.700", imposto("US", us, 2026, { taxaPessoal: { curto: 0.37, longo: 0.20 } }), 4700);

// Onde estão as moedas: Portugal sem convenção e Argentina em pesos.
eq("PT detido 400 dias, corretora na UE → isento", imposto("PT", [lote("2025-01-10", "2026-02-14", 20000, 30000)], 2026), 0);
eq("PT detido 400 dias, contraparte sem convenção → 28%", imposto("PT", [lote("2025-01-10", "2026-02-14", 20000, 30000)], 2026, { alternativa: true }), 2800);
eq("AR em moeda estrangeira → 15%", imposto("AR", [lote("2025-01-10", "2026-03-10", 20000, 30000)], 2026), 1500);
eq("AR em pesos sem ajuste → 5%", imposto("AR", [lote("2025-01-10", "2026-03-10", 20000, 30000)], 2026, { alternativa: true }), 500);

// 13. México: isenção disputada não entra na conta.
eq("MX ganho MX$100k → 35% (sem a isenção disputada)", imposto("MX", [lote("2025-01-10", "2026-03-10", 0, 100000)], 2026), 35000);

// 20. Itália: e-money tokens em euro a 26% (desde 2026).
eq("IT EURC em 2026 → 26%", imposto("IT", [lote("2025-01-10", "2026-03-10", 0, 1000, 1, "EURC")], 2026), 260);

// Taxa pessoal: Reino Unido na banda básica (18%).
eq("GB ganho £10k, taxa pessoal 18% → (10k − 3k) × 18% = 1.260", imposto("GB", [lote("2025-05-10", "2026-03-10", 0, 10000)], 2025, { taxaPessoal: { curto: 0.18 } }), 1260);

if (fails) { console.log(`\n${fails} FALHA(S)`); process.exit(1); } else console.log("\nTODOS OK");
