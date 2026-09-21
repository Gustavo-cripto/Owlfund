import { importarCryptocomApp } from "@/lib/imports/cryptocomApp";
let fails = 0;
const ok = (name: string, cond: boolean, extra = "") => { if (!cond) fails++; console.log(`${cond ? "✅" : "❌"} ${name}${extra ? `: ${extra}` : ""}`); };
const csv = [
  "Timestamp (UTC),Transaction Description,Currency,Amount,To Currency,To Amount,Native Currency,Native Amount,Native Amount (in USD),Transaction Kind,Transaction Hash",
  '2025-01-10 09:00:00,Buy BTC,BTC,0.01,,,EUR,900,950,crypto_purchase,',
  '2025-01-11 09:00:00,Card Cashback,CRO,10,,,EUR,1.5,1.6,referral_card_cashback,',
  '2025-01-12 09:00:00,BTC -> ETH,BTC,-0.005,ETH,0.2,EUR,450,470,crypto_exchange,',
  '2025-01-13 09:00:00,Earn,ETH,-0.1,,,EUR,-160,-170,crypto_earn_program_created,',
  '2025-01-14 09:00:00,Earn interest,ETH,0.001,,,EUR,1.6,1.7,crypto_earn_interest_paid,',
  '2025-01-15 09:00:00,EUR -> SOL,EUR,-100,SOL,0.5,EUR,100,105,viban_purchase,',
  '2025-01-16 09:00:00,To Exchange,CRO,-4,,,EUR,-0.6,-0.6,crypto_to_exchange_transfer,',
  '2025-01-17 09:00:00,Withdraw,BTC,-0.001,,,EUR,-95,-100,crypto_withdrawal,',
].join("\n");
const r = importarCryptocomApp(csv);
ok("sem erro", !r.erro, r.erro ?? "");
ok("BTC: 0.01 - 0.005 - 0.001", Math.abs(r.saldos.BTC - 0.004) < 1e-12, String(r.saldos.BTC));
ok("ETH: 0.2 + 0.001 (Earn nao desconta)", Math.abs(r.saldos.ETH - 0.201) < 1e-12, String(r.saldos.ETH));
ok("CRO: 10 - 4 (transferencia para a Exchange desconta)", Math.abs(r.saldos.CRO - 6) < 1e-12, String(r.saldos.CRO));
ok("SOL: 0.5 (compra com fiat)", r.saldos.SOL === 0.5, String(r.saldos.SOL));
ok("EUR nao aparece como saldo", !("EUR" in r.saldos));
const compras = r.trades.filter((t) => t.type === "compra"); const vendas = r.trades.filter((t) => t.type === "venda");
ok("compras: BTC, CRO cashback, ETH (troca), ETH juros, SOL = 5", compras.length === 5, String(compras.length));
ok("vendas: BTC na troca = 1 (levantamento e transferencia nao sao vendas)", vendas.length === 1 && vendas[0].asset === "BTC", vendas.map((v) => v.asset).join(","));
const btc = compras.find((t) => t.asset === "BTC"); ok("preco BTC = 900/0.01", !!btc && Math.abs(btc.priceEur - 90000) < 1e-6, String(btc?.priceEur));
const sol = compras.find((t) => t.asset === "SOL"); ok("preco SOL = 100/0.5", !!sol && sol.priceEur === 200, String(sol?.priceEur));
ok("moeda nativa EUR", r.moedaNativa === "EUR");
ok("periodo", r.periodo?.de === "2025-01-10" && r.periodo?.ate === "2025-01-17");
ok("ficheiro vazio -> erro", importarCryptocomApp("").erro === "vazio");
ok("colunas erradas -> erro", importarCryptocomApp("a,b\n1,2").erro === "colunas");
console.log(fails === 0 ? "\nTODOS OK" : `\n${fails} FALHA(S)`); process.exit(fails ? 1 : 0);
