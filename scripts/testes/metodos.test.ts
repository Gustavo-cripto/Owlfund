import { realizar, resumoAnualPolaco, type Operacao } from "@/lib/tax/metodos";
let fails = 0;
const eq = (name: string, got: number | string | boolean, want: number | string | boolean) => {
  const ok = typeof got === "number" && typeof want === "number" ? Math.abs(got - want) < 1e-6 : got === want;
  if (!ok) fails++;
  console.log(`${ok ? "✅" : "❌"} ${name}: ${got}${ok ? "" : ` (esperado ${want})`}`);
};
const c = (date: string, amount: number, price: number, fee = 0): Operacao => ({ type: "compra", asset: "BTC", amount, price, fee, date });
const v = (date: string, amount: number, price: number, fee = 0): Operacao => ({ type: "venda", asset: "BTC", amount, price, fee, date });

// 3 compras (1 @100, 1 @200, 1 @300) e uma venda de 1,5 @400.
const ops = [c("2026-01-01", 1, 100), c("2026-02-01", 1, 200), c("2026-03-01", 1, 300), v("2026-06-01", 1.5, 400)];

const fifo = realizar(ops, "fifo");
eq("FIFO: 2 lotes", fifo.lotes.length, 2);
eq("FIFO: 1.º lote a 100", fifo.lotes[0].buyPrice, 100);
eq("FIFO: ganho total (300 + 100)", fifo.lotes.reduce((s, l) => s + l.gain, 0), 400);
eq("FIFO: aberto 1,5 (0,5 @200 + 1 @300)", Object.values(fifo.abertos.BTC).reduce((s, l) => s + l.amount, 0), 1.5);

const lifo = realizar(ops, "lifo");
eq("LIFO: 1.º lote a 300", lifo.lotes[0].buyPrice, 300);
eq("LIFO: ganho total (100 + 100)", lifo.lotes.reduce((s, l) => s + l.gain, 0), 200);

const pmp = realizar(ops, "wavg");
eq("PMP: preço médio 200", pmp.lotes[0].buyPrice, 200);
eq("PMP: ganho 1,5 × (400 − 200)", pmp.lotes.reduce((s, l) => s + l.gain, 0), 300);
eq("PMP: data do 1.º lote é a mais antiga (para o prazo)", pmp.lotes[0].buyDate, "2026-01-01");
eq("PMP: aberto ao custo médio", pmp.abertos.BTC[0].price, 200);
// Taxa de compra entra no custo médio: 3 × 100 + 30 de taxa → 110/unid.
const pmpTaxa = realizar([c("2026-01-01", 3, 100, 30), v("2026-06-01", 1, 200)], "wavg");
eq("PMP: taxa de compra no custo médio", pmpTaxa.lotes[0].buyPrice, 110);
eq("PMP: ganho 200 − 110", pmpTaxa.lotes[0].gain, 90);

// Reino Unido: mesmo dia > 30 dias seguintes > pool.
const uk = realizar([c("2026-01-01", 2, 100), v("2026-05-01", 2, 300), c("2026-05-01", 0.5, 280), c("2026-05-20", 0.5, 290), c("2026-07-01", 1, 50)], "pool");
eq("Pool: 3 lotes (mesmo dia, 30 dias, pool)", uk.lotes.length, 3);
eq("Pool: mesmo dia primeiro (280)", uk.lotes[0].buyPrice, 280);
eq("Pool: 30 dias a seguir (290)", uk.lotes[1].buyPrice, 290);
eq("Pool: resto ao pool (100)", uk.lotes[2].buyPrice, 100);
eq("Pool: 1 unid. do pool + 1 de 2026-07 ficam abertas", Object.values(uk.abertos.BTC).reduce((s, l) => s + l.amount, 0), 2);

// Irlanda: compra nos 28 dias antes da venda sai primeiro.
const ie = realizar([c("2026-01-01", 1, 100), c("2026-05-20", 1, 500), v("2026-06-01", 1, 400)], "fifo_4w");
eq("4 semanas: lote recente primeiro (500)", ie.lotes[0].buyPrice, 500);
const ieFora = realizar([c("2026-01-01", 1, 100), c("2026-03-01", 1, 500), v("2026-06-01", 1, 400)], "fifo_4w");
eq("4 semanas: fora do prazo volta ao FIFO (100)", ieFora.lotes[0].buyPrice, 100);

// Venda sem compra.
const semCompra = realizar([v("2026-06-01", 1, 400)], "fifo");
eq("sem compra: unmatched 1", semCompra.unmatched.BTC, 1);

// Taxa em token e registo só-taxa tiram quantidade sem ganho.
const gas = realizar([c("2026-01-01", 2, 100), { type: "taxa", asset: "BTC", amount: 0.5, price: 100, fee: 0, date: "2026-02-01" }, v("2026-06-01", 2, 200)], "fifo");
eq("gás: só 1,5 emparelhados", gas.lotes.reduce((s, l) => s + l.amount, 0), 1.5);
eq("gás: 0,5 sem compra", gas.unmatched.BTC, 0.5);

// Polónia: base anual com custos de compras não vendidas e excedente a transitar.
const pl = resumoAnualPolaco([c("2025-03-01", 1, 1000), c("2025-09-01", 1, 1000), v("2025-10-01", 1, 1500), v("2026-02-01", 1, 1800)]);
eq("PL 2025: receitas 1500", pl[0].receitas, 1500);
eq("PL 2025: custos 2000 (as duas compras)", pl[0].custos, 2000);
eq("PL 2025: base 0", pl[0].base, 0);
eq("PL 2025: transita 500", pl[0].transita, 500);
eq("PL 2026: base 1800 − 500", pl[1].base, 1300);

if (fails) { console.log(`\n${fails} FALHA(S)`); process.exit(1); } else console.log("\nTODOS OK");
