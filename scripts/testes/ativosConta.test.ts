import { juntarAtivos } from "@/lib/portfolios/ativosConta";
let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "✅" : "❌"} ${name}: ${JSON.stringify(got)}${ok ? "" : ` (esperado ${JSON.stringify(want)})`}`);
};
const conta1 = {
  "portfolio-wallets": JSON.stringify({ btc: [{ address: "bc1qA", balance: "0.5" }], eth: { address: "0xAB", balance: "2" }, cexUsd: 100 }),
  "owlfund.stablecoin.addresses.v1": JSON.stringify([{ id: "1", symbol: "USDC", network: "eth", address: "0xAB", balance: "150" }]),
  "owlfund.crypto.holdings.v1": JSON.stringify({ BTC: { quantity: 0.1, buyValue: 5000 }, DOT: { buyValue: 300 } }),
  "owlfund.venue.holdings.v1": JSON.stringify([{ id: "v", venue: "bitpanda", assets: [{ asset: "eth", qty: 1 }], source: "manual", updatedAt: 1 }]),
  "owlfund.traditional.holdings.v1": JSON.stringify({ AAPL: { quantity: 3, buyValue: 450 }, UST10Y: { buyValue: 1000 } }),
};
const conta2 = {
  "portfolio-wallets": JSON.stringify({ btc: [{ address: "BC1QA", balance: "0.5" }], sol: [{ address: "So1", balance: "10" }] }),
  "owlfund.traditional.holdings.v1": JSON.stringify({ AAPL: { quantity: 2, buyValue: 300 } }),
};
const uma = juntarAtivos([conta1]);
const por = (s: string, r = uma) => r.cripto.find((a) => a.symbol === s);
eq("BTC: carteira 0,5 + manual 0,1", por("BTC")?.quantidade, 0.6);
eq("BTC: duas origens", por("BTC")?.fontes, ["carteira", "manual"]);
eq("ETH: carteira 2 + exchange 1 (minúsculas)", por("ETH")?.quantidade, 3);
eq("USDC da estável", por("USDC")?.quantidade, 150);
eq("DOT manual sem quantidade fica com o investido", [por("DOT")?.quantidade, por("DOT")?.investidoSemQuantidadeEur], [0, 300]);
eq("tradicionais", uma.tradicional, [{ id: "AAPL", quantidade: 3, investidoEur: 450 }, { id: "UST10Y", quantidade: null, investidoEur: 1000 }]);
const todas = juntarAtivos([conta1, conta2]);
eq("Todas: a mesma carteira BTC em duas contas conta uma vez", por("BTC", todas)?.quantidade, 0.6);
eq("Todas: SOL da conta 2", por("SOL", todas)?.quantidade, 10);
eq("Todas: AAPL somado", todas.tradicional.find((t) => t.id === "AAPL"), { id: "AAPL", quantidade: 5, investidoEur: 750 });
eq("conta vazia ou com lixo não parte", juntarAtivos([{ "portfolio-wallets": "{x" }]), { cripto: [], tradicional: [] });
if (fails) { console.error(`${fails} falha(s)`); process.exit(1); }
