import { pnlAtivoManual, quotePriceEurFrom, totalGeralEur } from "@/lib/wallets/totais";
let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fails++; console.log(`${ok ? "✅" : "❌"} ${name}: ${JSON.stringify(got)}${ok ? "" : ` (esperado ${JSON.stringify(want)})`}`); };

// Total geral: o que esta em USD converte uma vez; manual e stablecoins ja vem na moeda
eq("total geral", totalGeralEur({ walletsTotalUsd: 100, totalDefiUsd: 50, cexHlTotalUsd: 25, coldTokensExtraUsd: 25, usdToEurRate: 0.9, cryptoManualTotal: 10, stablecoinTotalEur: 5 }), 195);
eq("total geral a zeros", totalGeralEur({ walletsTotalUsd: 0, totalDefiUsd: 0, cexHlTotalUsd: 0, coldTokensExtraUsd: 0, usdToEurRate: 0.92, cryptoManualTotal: 0, stablecoinTotalEur: 0 }), 0);
// Mesma ordem de somas que a pagina sempre usou (arredondamentos iguais)
const v = { walletsTotalUsd: 0.1, totalDefiUsd: 0.2, cexHlTotalUsd: 0.3, coldTokensExtraUsd: 0.4, usdToEurRate: 0.93, cryptoManualTotal: 0.7, stablecoinTotalEur: 0.11 };
eq("ordem das somas", totalGeralEur(v), (0.1 + 0.2 + 0.3 + 0.4) * 0.93 + 0.7 + 0.11);

// PNL de um ativo registado a mao
eq("pnl empatado", pnlAtivoManual(2, 100, 100, 0.5), { marketValueEur: 100, pnlEur: 0, pnlPct: 0 });
eq("pnl com lucro", pnlAtivoManual(2, 100, 200, 0.5), { marketValueEur: 200, pnlEur: 100, pnlPct: 100 });
eq("pnl com perda", pnlAtivoManual(1, 200, 100, 1), { marketValueEur: 100, pnlEur: -100, pnlPct: -50 });
eq("sem quantidade: sem valor nem pnl", pnlAtivoManual(undefined, 100, 100, 1), { marketValueEur: undefined, pnlEur: undefined, pnlPct: undefined });
eq("sem preco: sem valor", pnlAtivoManual(1, 100, undefined, 1).marketValueEur, undefined);
eq("preco 0: sem valor", pnlAtivoManual(1, 100, 0, 1).marketValueEur, undefined);
eq("sem investido: valor sem pnl", pnlAtivoManual(1, undefined, 50, 1), { marketValueEur: 50, pnlEur: undefined, pnlPct: undefined });

// Cotacao tradicional em EUR (fxRates = unidades por 1 EUR)
const fx = { USD: 1.1, GBP: 0.85 };
eq("cotacao EUR direta", quotePriceEurFrom({ price: 10, currency: "eur" }, fx), 10);
eq("cotacao USD", quotePriceEurFrom({ price: 11, currency: "USD" }, fx), 10);
eq("sem moeda = USD", quotePriceEurFrom({ price: 11 }, fx), 10);
eq("moeda sem taxa", quotePriceEurFrom({ price: 11, currency: "JPY" }, fx), undefined);
eq("sem preco", quotePriceEurFrom({ price: null, currency: "USD" }, fx), undefined);
eq("sem cotacao", quotePriceEurFrom(undefined, fx), undefined);
eq("taxa 0", quotePriceEurFrom({ price: 5, currency: "XXX" }, { XXX: 0 }), undefined);
console.log(fails === 0 ? "\nTODOS OK" : `\n${fails} FALHA(S)`); process.exit(fails ? 1 : 0);
