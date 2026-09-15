import { chronoCompare, computeFifo, parseTradesCsv, tradesToCsv, sanitizeTrade, type Trade } from "@/lib/portfolios/trades";
let fails = 0;
const eq = (name: string, got: number, want: number) => { const ok = Math.abs(got - want) < 1e-9; if (!ok) fails++; console.log(`${ok ? "✅" : "❌"} ${name}: ${got} ${ok ? "" : `(esperado ${want})`}`); };
const T = (o: Partial<Trade>): Trade => ({ id: Math.random().toString(36), type: "compra", asset: "BTC", assetName: "Bitcoin", quantity: 1, priceEur: 0, date: "2024-01-01", exchange: "", notes: "", ...o, totalEur: (o.quantity ?? 1) * (o.priceEur ?? 0) });
let r = computeFifo([T({ quantity: 2, priceEur: 100 }), T({ type: "venda", quantity: 2, priceEur: 150, date: "2024-06-01" })]);
eq("sem taxas → ganho (igual a antes)", r.realizedPnl, 100);
r = computeFifo([T({ quantity: 2, priceEur: 100, feeEur: 4 }), T({ type: "venda", quantity: 1, priceEur: 150, feeEur: 3, date: "2024-06-01" })]);
eq("venda parcial com taxas → ganho líquido 150-100-2-3", r.realizedPnl, 45);
eq("taxas imputadas ao lote", r.lots[0].fees, 5);
eq("custo em aberto inclui a taxa restante 1×(100+2)", r.byAsset.BTC.costOpen, 102);
eq("total de taxas", r.fees, 7);
eq("sanitize mantém feeEur", sanitizeTrade({ ...T({ quantity: 1, priceEur: 10 }), feeEur: 1.5, feeInput: 1.7 })!.feeEur ?? -1, 1.5);
eq("sanitize: taxa negativa é ignorada", sanitizeTrade({ ...T({ quantity: 1, priceEur: 10 }), feeEur: -2 })!.feeEur ?? 0, 0);
const orig = [T({ quantity: 0.5, priceEur: 60000, feeEur: 12.34, feeInput: 13.5, currency: "USD", priceInput: 65000 }), T({ type: "venda", quantity: 0.2, priceEur: 70000, date: "2025-02-01" })];
const back = parseTradesCsv(tradesToCsv(orig)).trades;
eq("CSV ida e volta: nº", back.length, 2);
eq("CSV ida e volta: feeEur", back[0].feeEur ?? -1, 12.34);
eq("CSV ida e volta: feeInput", back[0].feeInput ?? -1, 13.5);
eq("CSV ida e volta: sem taxa continua sem taxa", back[1].feeEur ?? 0, 0);
const o2 = parseTradesCsv("date,type,asset,quantity,price_eur,total_eur,exchange,notes,currency,price_original\n2024-01-01,buy,ETH,1,2000,2000,Kraken,,EUR,2000");
eq("CSV antigo (sem colunas de taxa) importa", o2.trades.length, 1);
eq("CSV antigo fica sem taxa", o2.trades[0].feeEur ?? 0, 0);
const o3 = parseTradesCsv("Date;Side;Symbol;Amount;Price;Gas Price;Fee\n01/03/2024;BUY;SOL;10;100;25;1,5");
eq("CSV de terceiros: lê 'Fee' e ignora 'Gas Price'", o3.trades[0]?.feeEur ?? -1, 1.5);
// ── registos "so taxa" e taxa paga em token
r = computeFifo([
  T({ asset: "ETH", quantity: 1, priceEur: 2000 }),
  T({ type: "taxa", asset: "ETH", quantity: 0.01, priceEur: 2100, date: "2024-02-01" }),
  T({ asset: "UNI", quantity: 100, priceEur: 5, feeEur: 21, feeInput: 0.01, feeAsset: "ETH", date: "2024-03-01" }),
  T({ type: "venda", asset: "ETH", quantity: 0.98, priceEur: 3000, date: "2024-06-01" }),
]);
eq("só-taxa: não gera ganho; venda de 0,98 ETH após 2 consumos de 0,01", r.realizedPnl, 0.98 * 1000);
eq("só-taxa: valor fica em standaloneFees", r.standaloneFees, 21);
eq("taxa em token: conta nas taxas deduzidas", r.fees, 21);
eq("ETH em carteira no fim = 0", Math.round(r.byAsset.ETH.qtyNet * 1e9) / 1e9, 0);
eq("taxa em token: ganho da UNI não mexe (sem venda)", r.byAsset.UNI.realizedPnl, 0);
const rt = parseTradesCsv(tradesToCsv([T({ type: "taxa", asset: "ETH", quantity: 0.01, priceEur: 2100 }), T({ asset: "UNI", quantity: 100, priceEur: 5, feeEur: 21, feeInput: 0.01, feeAsset: "ETH" })])).trades;
const rtFee = rt.find((x) => x.type === "taxa");
const rtUni = rt.find((x) => x.asset === "UNI");
eq("CSV ida e volta: tipo taxa", rtFee ? 1 : 0, 1);
eq("CSV ida e volta: feeAsset ETH", rtUni?.feeAsset === "ETH" ? 1 : 0, 1);
eq("CSV ida e volta: feeInput em unidades do token", rtUni?.feeInput ?? -1, 0.01);
// ── comparador: ordem total no mesmo dia (compra < taxa < venda), independente da ordem de entrada
{
  const day = "2024-04-04";
  const a = [T({ type: "venda", quantity: 1, priceEur: 10, date: day }), T({ type: "taxa", quantity: 0.1, priceEur: 10, date: day }), T({ quantity: 1, priceEur: 10, date: day })];
  const o1 = [...a].sort(chronoCompare).map((x) => x.type).join(",");
  const o2 = [...a].reverse().sort(chronoCompare).map((x) => x.type).join(",");
  eq("ordem estável compra,taxa,venda", o1 === "compra,taxa,venda" && o2 === o1 ? 1 : 0, 1);
}
// ── cabeçalho "Fee Asset" antes de "Fee" não confunde a coluna do valor
{
  const csv = "date,type,asset,quantity,price,fee_asset,fee\n2024-01-01,buy,UNI,10,5,ETH,0.5";
  const r4 = parseTradesCsv(csv).trades[0];
  eq("fee lida da coluna certa (0.5)", r4?.feeEur ?? -1, 0.5);
}
console.log(fails === 0 ? "\nTODOS OK" : `\n${fails} FALHA(S)`); process.exit(fails ? 1 : 0);
