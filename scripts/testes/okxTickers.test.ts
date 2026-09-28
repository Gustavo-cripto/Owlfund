// Reserva de preços do briefing e do resumo de mercado: resposta de
// /market/tickers da OKX → formato do simple/price do CoinGecko.
import { lerTickersOkx } from "@/lib/market/okxSpot";

let fails = 0;
const ok = (n: string, c: boolean, extra = "") => { if (!c) fails++; console.log(`${c ? "✅" : "❌"} ${n}${extra ? `: ${extra}` : ""}`); };

const ids = { BTC: "bitcoin", ETH: "ethereum", XRP: "ripple", FOO: "foo-coin" };
const raw = {
  code: "0",
  data: [
    { instId: "BTC-USDT", last: "110", open24h: "100", volCcy24h: "5000000" },
    { instId: "ETH-USDT", last: "2000", open24h: "2000" },
    { instId: "XRP-USDT", last: "0", open24h: "1" },          // preço inválido → fora
    { instId: "BTC-EUR", last: "95", open24h: "90" },         // outro par → ignorado
  ],
};
const r = lerTickersOkx(raw, ids);
ok("BTC pelo id do CoinGecko", r?.bitcoin?.usd === 110);
ok("variação 24 h em %", Math.abs((r?.bitcoin?.usd_24h_change ?? 0) - 10) < 1e-9, String(r?.bitcoin?.usd_24h_change));
ok("volume quando existe", r?.bitcoin?.usd_24h_vol === 5000000);
ok("sem volume não inventa", r?.ethereum !== undefined && !("usd_24h_vol" in (r?.ethereum ?? {})));
ok("variação 0 quando não mexeu", r?.ethereum?.usd_24h_change === 0);
ok("preço 0 fica de fora", r?.ripple === undefined);
ok("símbolo sem par fica de fora", r?.["foo-coin"] === undefined);
ok("resposta com erro → null", lerTickersOkx({ code: "50011", data: [] }, ids) === null);
ok("lixo → null", lerTickersOkx("x", ids) === null);
ok("nenhum preço válido → null", lerTickersOkx({ code: "0", data: [{ instId: "XRP-USDT", last: "0", open24h: "1" }] }, ids) === null);

if (fails) { console.log(`\n${fails} falha(s)`); process.exit(1); }
console.log("TODOS OK");
