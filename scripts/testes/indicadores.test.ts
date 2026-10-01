import { calcularIndicadores, lerVelasOhlcOkx, rsi, sma, volatilidade, zonaRsi, type Vela } from "@/lib/market/indicadores";
let fails = 0;
const eq = (name: string, got: unknown, want: unknown, tol = 1e-6) => {
  const ok = typeof got === "number" && typeof want === "number" ? Math.abs(got - want) < tol : JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "✅" : "❌"} ${name}: ${JSON.stringify(got)}${ok ? "" : ` (esperado ${JSON.stringify(want)})`}`);
};
eq("SMA de 1..5 a 3 = 4", sma([1, 2, 3, 4, 5], 3), 4);
eq("SMA sem velas suficientes = null", sma([1, 2], 3), null);
eq("RSI só a subir = 100", rsi(Array.from({ length: 20 }, (_, i) => i + 1)), 100);
eq("RSI só a descer = 0", rsi(Array.from({ length: 20 }, (_, i) => 20 - i)), 0);
// Exemplo clássico de Wilder (14 períodos): RSI ≈ 70,46 com estes 15 fechos.
const wilder = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28];
eq("RSI de Wilder (exemplo de referência)", rsi(wilder), 70.46, 0.05);
eq("preço constante → volatilidade 0", volatilidade(Array(40).fill(100)), 0);
eq("zonas do RSI", [zonaRsi(75), zonaRsi(25), zonaRsi(50), zonaRsi(null)], ["sobrecompra", "sobrevenda", "neutra", null]);

// 260 dias: desce até ao dia 180 e sobe 1,5/dia depois → a média de 50 passa a
// de 200 há 29 dias (calculado à parte).
const velas: Vela[] = Array.from({ length: 260 }, (_, i) => {
  const c = i < 180 ? 200 - i * 0.5 : 110 + (i - 180) * 1.5;
  return { t: i * 86_400_000, o: c, h: c * 1.01, l: c * 0.99, c };
});
const ind = calcularIndicadores(velas)!;
const ultimo = 110 + 79 * 1.5;
eq("preço = último fecho", ind.preco, ultimo);
eq("cruzamento dourado há 29 dias", [ind.cruzamento?.tipo, ind.cruzamento?.haDias], ["dourado", 29]);
eq("máximo de 30 dias = último máximo", ind.max30, ultimo * 1.01);
eq("variação a 7 dias", ind.var7, (ultimo / (110 + 72 * 1.5) - 1) * 100);
eq("poucas velas → null", calcularIndicadores(velas.slice(0, 10)), null);
eq("OKX: lê e ordena do mais antigo", lerVelasOhlcOkx({ code: "0", data: [["2", "1", "3", "0.5", "2"], ["1", "1", "2", "0.5", "1.5"]] }).map((v) => v.t), [1, 2]);
eq("OKX: erro → vazio", lerVelasOhlcOkx({ code: "51001", data: [] }), []);
if (fails) { console.error(`${fails} falha(s)`); process.exit(1); }
