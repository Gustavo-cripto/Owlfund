// Orcamento do CoinGecko (lote F, set 2026): tabela de cache minima por URL,
// travao de 5 min depois de um 429, e leitura do global (CoinGecko/CoinPaprika).
import { CG_TRAVAO_MS, cgRevalidateMin, criarCgFetch } from "@/lib/market/coingecko";
import { lerGlobalCoinGecko, lerGlobalCoinPaprika } from "@/lib/market/globalLeitores";
import { lerTickerOkx } from "@/lib/market/okxSpot";
let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "✅" : "❌"} ${name}: ${JSON.stringify(got)}${ok ? "" : ` (esperado ${JSON.stringify(want)})`}`);
};

const CG = "https://api.coingecko.com/api/v3";

// ── Tabela de revalidate (minimos pedidos no lote F) ─────────────────────────
eq("global → 600", cgRevalidateMin(`${CG}/global`), 600);
eq("coins/markets → 300", cgRevalidateMin(`${CG}/coins/markets?vs_currency=usd&per_page=250`), 300);
eq("simple/price → 120", cgRevalidateMin(`${CG}/simple/price?ids=bitcoin&vs_currencies=eur`), 120);
eq("simple/token_price → 120", cgRevalidateMin(`${CG}/simple/token_price/ethereum?contract_addresses=0x1`), 120);
eq("coins/{id} → 3600", cgRevalidateMin(`${CG}/coins/bitcoin?localization=false`), 3600);
eq("coins/{id}/market_chart → 1800", cgRevalidateMin(`${CG}/coins/bitcoin/market_chart?vs_currency=eur&days=31`), 1800);
eq("search/trending → 1800", cgRevalidateMin(`${CG}/search/trending`), 1800);
eq("search → 1800", cgRevalidateMin(`${CG}/search?query=btc`), 1800);
eq("ping → 3600", cgRevalidateMin(`${CG}/ping`), 3600);
eq("desconhecido → 300", cgRevalidateMin(`${CG}/exchanges`), 300);
eq("URL invalido → 300", cgRevalidateMin("nao e url"), 300);
eq("coins/markets nao e confundido com coins/{id}", cgRevalidateMin(`${CG}/coins/markets`), 300);

// ── cgFetch: revalidate imposto e travao ─────────────────────────────────────
async function main() {
  let agora = 1_000_000;
  const pedidos: Array<{ url: string; init?: RequestInit }> = [];
  let proximoStatus = 200;
  const falso = async (url: string, init?: RequestInit) => {
    pedidos.push({ url, init });
    return new Response("{}", { status: proximoStatus });
  };
  const cg = criarCgFetch(falso, () => agora);

  await cg(`${CG}/global`, { cache: "no-store" });
  eq("global sobe ao minimo de 600 s", pedidos[0].init?.next?.revalidate, 600);
  eq("no-store e retirado (a cache e que segura o orcamento)", pedidos[0].init?.cache, undefined);
  await cg(`${CG}/simple/price?ids=bitcoin`, { next: { revalidate: 900 } });
  eq("pedido acima do minimo fica com o seu", pedidos[1].init?.next?.revalidate, 900);
  await cg(`${CG}/simple/price?ids=bitcoin`, { next: { revalidate: 60 } });
  eq("pedido abaixo do minimo sobe ao minimo", pedidos[2].init?.next?.revalidate, 120);
  eq("tem sempre signal (timeout)", pedidos[2].init?.signal instanceof AbortSignal, true);
  eq("travao livre no inicio", cg.travaoRestanteMs(), 0);

  // Um 429 liga o travao: os pedidos seguintes nao saem para a rede.
  proximoStatus = 429;
  const r429 = await cg(`${CG}/coins/markets`);
  eq("o 429 real passa ao chamador", r429.status, 429);
  eq("travao ligado 5 min", cg.travaoRestanteMs(), CG_TRAVAO_MS);
  proximoStatus = 200;
  const antes = pedidos.length;
  const travada = await cg(`${CG}/global`);
  eq("durante o travao: 429 sintetico", travada.status, 429);
  eq("durante o travao: nao chama a rede", pedidos.length, antes);
  eq("429 sintetico tem Retry-After", travada.headers.get("Retry-After"), "300");
  eq("429 sintetico marcado", travada.headers.get("X-CG-Travao"), "1");

  agora += CG_TRAVAO_MS - 1;
  await cg(`${CG}/global`);
  eq("1 ms antes do fim ainda travado", pedidos.length, antes);
  agora += 1;
  const livre = await cg(`${CG}/global`);
  eq("passados 5 min volta a chamar", pedidos.length, antes + 1);
  eq("e a resposta e a real", livre.status, 200);
  eq("um 500 nao liga o travao", (proximoStatus = 500, await cg(`${CG}/global`), cg.travaoRestanteMs()), 0);

  // Cada cgFetch tem o seu travao (as instancias serverless tambem).
  const outro = criarCgFetch(falso, () => agora);
  eq("outro cgFetch comeca livre", outro.travaoRestanteMs(), 0);

  // ── Global: CoinGecko e CoinPaprika ────────────────────────────────────────
  eq("CoinGecko global lido", lerGlobalCoinGecko({ data: {
    total_market_cap: { usd: 3e12 }, market_cap_change_percentage_24h_usd: -1.2,
    market_cap_percentage: { btc: 56.1, eth: 12.3 }, active_cryptocurrencies: 17000,
  } }), { totalMarketCapUsd: 3e12, marketCapChange24h: -1.2, btcDominance: 56.1, ethDominance: 12.3, activeCryptocurrencies: 17000 });
  eq("CoinGecko sem data → null", lerGlobalCoinGecko({ status: { error_code: 429 } }), null);
  eq("CoinGecko com cap 0 → null (nunca 'tudo a zero')", lerGlobalCoinGecko({ data: { total_market_cap: { usd: 0 } } }), null);
  // Formato real (curl a api.coinpaprika.com/v1/global, 27 set 2026).
  eq("CoinPaprika global lido, ETH a null", lerGlobalCoinPaprika({
    market_cap_usd: 3035988197718, volume_24h_usd: 105324589448, bitcoin_dominance_percentage: 56.08,
    cryptocurrencies_number: 11936, market_cap_change_24h: 0.67, last_updated: 1790519424,
  }), { totalMarketCapUsd: 3035988197718, marketCapChange24h: 0.67, btcDominance: 56.08, ethDominance: null, activeCryptocurrencies: 11936 });
  eq("CoinPaprika vazio → null", lerGlobalCoinPaprika({}), null);
  eq("CoinPaprika lixo → null", lerGlobalCoinPaprika("x"), null);

  // ── OKX ticker ─────────────────────────────────────────────────────────────
  eq("OKX ticker lido", lerTickerOkx({ code: "0", data: [{ instId: "ADA-USDT", last: "0.2548" }] }), 0.2548);
  eq("OKX com erro → null", lerTickerOkx({ code: "51001", data: [] }), null);
  eq("OKX last 0 → null", lerTickerOkx({ code: "0", data: [{ last: "0" }] }), null);

  if (fails) { console.log(`\n${fails} falha(s)`); process.exit(1); }
}
main();
