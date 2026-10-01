import { ganhoAtivo, juntarAtivos, juntarVivos } from "@/lib/portfolios/ativosConta";
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
eq("conta vazia ou com lixo não parte", juntarAtivos([{ "portfolio-wallets": "{x" }]), { cripto: [], tradicional: [], frias: [], temExchanges: false });
// Custo e ganho por ativo.
const comHist = juntarAtivos([{ ...conta1, "trade-history-v1": JSON.stringify([
  { id: "t1", type: "compra", asset: "ETH", assetName: "Ethereum", quantity: 2, priceEur: 1500, totalEur: 3000, date: "2025-01-10", exchange: "Kraken", notes: "" },
  { id: "t2", type: "compra", asset: "ETH", assetName: "Ethereum", quantity: 1, priceEur: 3000, totalEur: 3000, date: "2025-06-10", exchange: "Kraken", notes: "" },
  { id: "t3", type: "venda", asset: "ETH", assetName: "Ethereum", quantity: 1, priceEur: 2500, totalEur: 2500, date: "2025-09-10", exchange: "Kraken", notes: "" },
]) }]);
const eth = por("ETH", comHist)!;
eq("ETH: custo das 2 que sobram no Histórico (1×1500 + 1×3000)", [eth.custoQtd, eth.custoEur], [2, 4500]);
eq("ETH: 3 detidas, custo de 2 → ganho parcial a 2.400", ganhoAtivo(eth, 2400), { medio: 2250, ganhoEur: 300, pct: (2400 / 2250 - 1) * 100, parcial: true });
const btc = por("BTC")!;
eq("BTC manual 0,1 por 5.000 → médio 50.000; 0,6 detidos, ganho só de 0,1", ganhoAtivo(btc, 70000)?.ganhoEur, 2000);
eq("sem custo → sem ganho", ganhoAtivo(por("USDC")!, 1), null);

// Carteiras frias e exchanges.
const fria = juntarAtivos([{ "portfolio-wallets": JSON.stringify({ cexUsd: 50, eth: [
  { address: "0xC0", balance: "1", network: "Ethereum", source: "cold" },
  { address: "0xC0", balance: "0.2", network: "Arbitrum" },
  { address: "0xD1", balance: "3" },
] }) }]);
eq("só a carteira fria entra, com as duas redes registadas", fria.frias.map((f) => [f.address, f.chain, f.redes.length]), [["0xC0", "eth", 2]]);
eq("cexUsd > 0 → tem exchanges", fria.temExchanges, true);
const comVivos = juntarVivos(uma.cripto, [{ symbol: "eth", quantidade: 0.5 }, { symbol: "PEPE", quantidade: 1000 }], "exchangeApi");
eq("vivos somam à moeda existente", comVivos.find((a) => a.symbol === "ETH")?.quantidade, 3.5);
eq("vivos criam moeda nova", comVivos.find((a) => a.symbol === "PEPE")?.fontes, ["exchangeApi"]);
eq("a lista original não muda", por("ETH")?.quantidade, 3);

if (fails) { console.error(`${fails} falha(s)`); process.exit(1); }
