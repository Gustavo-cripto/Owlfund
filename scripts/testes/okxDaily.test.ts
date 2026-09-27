// Velas diarias da OKX → preco "ha N dias" e variacao em % (auditoria set 2026, lote A):
// alimenta o 7d/30d do BTC/ETH em /api/prices e o fallback de /api/historical-prices.
import { aberturaHaDias, lerVelasOkx, precosHaDias, variacaoPct } from "@/lib/market/okxDaily";
let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = typeof got === "number" && typeof want === "number" ? Math.abs(got - want) < 1e-9 : JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "✅" : "❌"} ${name}: ${JSON.stringify(got)}${ok ? "" : ` (esperado ${JSON.stringify(want)})`}`);
};

const DIA = 86_400_000;
const HOJE = Date.parse("2026-09-26T00:00:00Z");
// Formato real da OKX: [ts, open, high, low, close, vol, volCcy, volCcyQuote, confirm], mais recente primeiro.
const vela = (diasAtras: number, open: number) => [String(HOJE - diasAtras * DIA), String(open), String(open * 1.01), String(open * 0.99), String(open * 1.005), "1", "1", "1", "1"];
const resposta = { code: "0", msg: "", data: Array.from({ length: 32 }, (_, i) => vela(i, 100_000 - i * 1000)) };

const velas = lerVelasOkx(resposta);
eq("le as 32 velas", velas.length, 32);
eq("mais recente primeiro", velas[0].open, 100_000);
eq("abertura de hoje (indice 0)", aberturaHaDias(velas, 0), 100_000);
eq("abertura ha 7 dias", aberturaHaDias(velas, 7), 93_000);
eq("abertura ha 30 dias", aberturaHaDias(velas, 30), 70_000);
eq("fora do intervalo → null", aberturaHaDias(velas, 40), null);
eq("precosHaDias junta os tres", precosHaDias(velas), { d1: 99_000, d7: 93_000, d30: 70_000 });

// Ordem trocada na resposta nao muda o resultado.
const baralhada = lerVelasOkx({ code: "0", data: [...resposta.data].reverse() });
eq("ordena por tempo mesmo se vier ao contrario", aberturaHaDias(baralhada, 7), 93_000);

// Respostas invalidas: nunca inventa precos.
eq("code diferente de 0 → sem velas", lerVelasOkx({ code: "50011", data: [] }), []);
eq("corpo vazio → sem velas", lerVelasOkx(null), []);
eq("vela com open 0 e descartada", lerVelasOkx({ code: "0", data: [["1", "0", "1", "1", "1"]] }), []);
eq("vela com lixo e descartada", lerVelasOkx({ code: "0", data: [["x", "a", "b", "c", "d"], vela(0, 5)] }).length, 1);
eq("com poucas velas, 30d fica a null (nunca 0)", precosHaDias(lerVelasOkx({ code: "0", data: [vela(0, 10), vela(1, 9)] })), { d1: 9, d7: null, d30: null });

// Variacao em %.
eq("+7,5 % de 93 000 para 100 000", Math.round(variacaoPct(100_000, 93_000)! * 1000) / 1000, 7.527);
eq("sem referencia → null", variacaoPct(100_000, null), null);
eq("referencia 0 → null", variacaoPct(100_000, 0), null);
eq("preco atual 0 → null", variacaoPct(0, 93_000), null);

if (fails) { console.log(`\n${fails} falha(s)`); process.exit(1); }
console.log("\nTODOS OK");
