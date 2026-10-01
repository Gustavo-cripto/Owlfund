import { cryptoHoldingValueEur, linhasManuais, registoDeLinhas } from "@/lib/crypto/storage";
let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "✅" : "❌"} ${name}: ${JSON.stringify(got)}${ok ? "" : ` (esperado ${JSON.stringify(want)})`}`);
};
eq("registo antigo vira uma carteira sem nome", linhasManuais({ quantity: 0.5, buyValue: 300, buyDate: "2026-09-15" }), [{ id: "principal", quantity: 0.5, buyValue: 300, buyDate: "2026-09-15" }]);
eq("registo vazio não tem carteiras", linhasManuais({}), []);
const r = registoDeLinhas([
  { id: "a", nome: "Ledger", quantity: 0.1, buyValue: 250, buyDate: "2026-09-15" },
  { id: "b", nome: "Binance", quantity: 0.05, buyValue: 100, buyDate: "2026-03-01" },
]);
eq("totais: soma da quantidade e do investido, data mais antiga", [r.quantity, r.buyValue, r.buyDate], [0.15, 350, "2026-03-01"]);
eq("as carteiras ficam guardadas", r.carteiras?.map((l) => l.nome), ["Ledger", "Binance"]);
const misto = registoDeLinhas([{ id: "a", quantity: 1 }, { id: "b", buyValue: 200 }]);
eq("valor misto: 1 × 2.000 + 200 investido sem quantidade", cryptoHoldingValueEur(misto, 2000), 2200);
eq("sem preço: cai no investido de cada carteira", cryptoHoldingValueEur(registoDeLinhas([{ id: "a", quantity: 1, buyValue: 150 }, { id: "b", buyValue: 200 }])), 350);
eq("registo antigo continua igual", cryptoHoldingValueEur({ quantity: 2, buyValue: 10 }, 5), 10);
eq("sem carteiras com valores → totais vazios", registoDeLinhas([{ id: "a", nome: "X" }]), { carteiras: [{ id: "a", nome: "X" }] });
if (fails) { console.error(`${fails} falha(s)`); process.exit(1); }
