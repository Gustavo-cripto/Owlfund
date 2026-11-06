// Importação de CSV: datas americanas, números com milhares e símbolos (auditoria 6 nov 2026).
import { csvPreco, dataReal, decimalDoFicheiro, ordemDasDatas, parseTradesCsv, sanitizeTrade, simboloDoAtivo, tradesToCsv, type Trade } from "@/lib/portfolios/trades";
import { primeiroDiaLongo } from "@/lib/tax/regras";
import { COUNTRIES } from "@/lib/tax/countries";
let fails = 0;
const eq = (n: string, got: unknown, want: unknown) => { const c = got === want; if (!c) fails++; console.log(`${c ? "✅" : "❌"} ${n}: ${String(got)}${c ? "" : ` (esperado ${String(want)})`}`); };
const csv = (linhas: string[]) => parseTradesCsv(["date,type,asset,quantity,price", ...linhas].join("\n"));

eq("data real", dataReal("2024-12-31"), true);
eq("mês 31 não existe", dataReal("2024-31-12"), false);
eq("31 de fevereiro não existe", dataReal("2024-02-31"), false);

const us = csv(["12/31/2024,buy,BTC,1,100", "03/04/2024,buy,BTC,1,100"]);
eq("ficheiro americano: dia 31", us.trades[0]?.date, "2024-12-31");
eq("ficheiro americano: a linha ambígua segue o ficheiro", us.trades[1]?.date, "2024-03-04");
const eu = csv(["31/12/2024,buy,BTC,1,100", "03/04/2024,buy,BTC,1,100"]);
eq("ficheiro europeu: dd/mm", eu.trades[1]?.date, "2024-04-03");
eq("só ambíguas: dd/mm, como antes", ordemDasDatas(["03/04/2024"]), "dmy");
const mau = csv(["2024-13-45,buy,BTC,1,100", "31/02/2024,buy,BTC,1,100", "2999-01-01,buy,BTC,1,100"]);
eq("datas impossíveis ou futuras ficam de fora", mau.skipped, 3);

const antigo = { id: "a", type: "compra", asset: "BTC", quantity: 1, priceEur: 1, date: "2024-31-12" };
eq("registo antigo com a troca é reparado", sanitizeTrade(antigo)?.date, "2024-12-31");
eq("irreparável fica à vista, não desaparece", sanitizeTrade({ ...antigo, date: "2024-13-45" })?.date, "2024-13-45");
const pt = COUNTRIES.find((c) => c.code === "PT");
eq("data má não derruba o prazo fiscal", pt ? primeiroDiaLongo(pt, "2024-13-45") : null, null);

eq("par com separador", simboloDoAtivo("BTC/EUR"), "BTC");
eq("par sem separador", simboloDoAtivo("BTCUSDT"), "BTC");
eq("estável com par", simboloDoAtivo("USDC/EUR"), "USDC");
eq("estável com hífen", simboloDoAtivo("USDT-EUR"), "USDT");
for (const s of ["FDUSD", "PYUSD", "CRVUSD", "TUSD", "AGEUR", "USDT", "EUR"]) eq(`${s} fica inteiro`, simboloDoAtivo(s), s);

const num = (linha: string, extra: string[] = []) => csv([`2024-01-01,buy,BTC,${linha}`, ...extra]).trades[0]?.priceEur;
eq("milhares repetidos com vírgula", num('1,"1,234,567"'), 1234567);
eq("milhares repetidos com ponto", num("1,1.234.567"), 1234567);
eq("europeu completo", num('1,"1.234,56"'), 1234.56);
eq("65,000 num ficheiro com ponto decimal é 65 mil", csv(['2024-01-01,buy,BTC,0.5,"65,000"']).trades[0]?.priceEur, 65000);
eq("1.234 num ficheiro com vírgula decimal é 1234", csv(['2024-01-01,buy,BTC,"0,5",1.234']).trades[0]?.priceEur, 1234);
eq("1.234 sem mais pistas fica decimal", csv(["2024-01-01,buy,BTC,1.234,100"]).trades[0]?.quantity, 1.234);
eq("0,5 é decimal", csv(['2024-01-01,buy,BTC,"0,5",100']).trades[0]?.quantity, 0.5);
eq("pistas contraditórias: sem decisão", decimalDoFicheiro(["0,5", "0.5"]), null);

eq("preço de token barato", csvPreco(0.00001234), "0.00001234");
eq("preço com muitas casas", csvPreco(2345.678912), "2345.678912");
eq("preço inteiro", csvPreco(100), "100");
eq("preço zero", csvPreco(0), "0");
const t: Trade = { id: "a", type: "compra", asset: "SHIB", assetName: "", quantity: 1000, priceEur: 0.00001234, totalEur: 0, date: "2025-03-01", exchange: "", notes: "" };
eq("token barato volta com o custo", parseTradesCsv(tradesToCsv([t])).trades[0]?.priceEur, 0.00001234);

console.log(fails === 0 ? "\nTODOS OK" : `\n${fails} FALHA(S)`);
process.exit(fails ? 1 : 0);
