import { completarFoto, diferencas, migrarFoto, type Foto } from "@/lib/wallets/historico";
let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "✅" : "❌"} ${name}: ${JSON.stringify(got)}${ok ? "" : ` (esperado ${JSON.stringify(want)})`}`);
};
const vazia = (): Foto => ({ carteiras: {}, tokens: {}, estaveis: {}, exchanges: {}, corretoras: {}, manuais: {}, tradicionais: {}, defi: {}, nfts: {} });
const tipos = (a: Foto, b: Foto) => diferencas(a, b, 1).map((e) => `${e.tipo}:${e.alvo}${e.simbolo ? ":" + e.simbolo : ""}`);

const a = vazia(), b = vazia();
a.carteiras = { "eth:0x1:Ethereum": { nome: "Ledger", simbolo: "ETH", saldo: 1 }, "btc:bc1:Bitcoin": { nome: "Cold", simbolo: "BTC", saldo: 0.5 } };
b.carteiras = { "eth:0x1:Ethereum": { nome: "Ledger", simbolo: "ETH", saldo: 0.8 }, "sol:So1:Solana": { nome: "Phantom", simbolo: "SOL", saldo: 3 } };
eq("carteiras: saldo, adicionada e removida", tipos(a, b), ["saldo:Ledger:ETH", "carteira_adicionada:Phantom:SOL", "carteira_removida:Cold:BTC"]);

const c = vazia(), d = vazia();
c.carteiras = { k: { nome: "X", simbolo: "ETH", saldo: 1 } };
d.carteiras = { k: { nome: "X", simbolo: "ETH", saldo: null } };
eq("saldo que não se leu não conta como movimento", tipos(c, d), []);
const comp = completarFoto(c, d);
eq("a fotografia guarda o último saldo conhecido", comp.carteiras.k.saldo, 1);

const e = vazia(), f = vazia();
e.exchanges = { "api:1": { nome: "Kraken", saldos: { BTC: 0.5, ETH: 2 } } };
f.exchanges = { "api:1": { nome: "Kraken", saldos: { BTC: 0.4, SOL: 10 } }, "api:2": { nome: "Bybit", saldos: {} } };
eq("exchange: saldo, ativo novo, ativo que saiu e exchange ligada", tipos(e, f), ["exchange_saldo:Kraken:BTC", "exchange_ativo_entrou:Kraken:SOL", "exchange_ativo_saiu:Kraken:ETH", "exchange_ligada:Bybit"]);
const g = vazia(); g.exchanges = null;
eq("exchanges ainda a carregar: sem eventos", tipos(e, g), []);
const h = vazia(); h.exchanges = {};
eq("exchange removida", tipos(e, h), ["exchange_removida:Kraken"]);

const i = vazia(), j = vazia();
i.defi = { w: { nome: "Ledger", posicoes: { p1: { nome: "ETH/USDC", estado: "aberta" }, p2: { nome: "ARB/ETH", estado: "aberta" } } } };
j.defi = { w: { nome: "Ledger", posicoes: { p1: { nome: "ETH/USDC", estado: "fechada" }, p3: { nome: "WBTC/ETH", estado: "aberta" } } } };
eq("DeFi: fechada, aberta e desaparecida", tipos(i, j), ["defi_fechada:Ledger", "defi_aberta:Ledger", "defi_removida:Ledger"]);
const k = vazia(); k.defi = { w: { nome: "Ledger", posicoes: null } };
eq("DeFi que falhou: sem eventos", tipos(i, k), []);

const l = vazia(), m = vazia();
l.nfts = { w: { nome: "Ledger", total: 2, ids: { a: "Punk #1", b: "Ape #2" } } };
m.nfts = { w: { nome: "Ledger", total: 2, ids: { a: "Punk #1", c: "Pudgy #3" } } };
const nf = diferencas(l, m, 1);
eq("NFTs por ids: entrou e saiu, com nomes", nf.map((x) => [x.tipo, x.nomes]), [["nft_entrou", ["Pudgy #3"]], ["nft_saiu", ["Ape #2"]]]);
const n2 = vazia(); n2.nfts = { w: { nome: "Ledger", total: 5, ids: null } };
eq("NFTs só pela contagem", diferencas(l, n2, 1).map((x) => [x.tipo, x.quantos]), [["nft_entrou", 3]]);

const o = vazia(), p = vazia();
o.manuais = { DOT: { qtd: 10, investido: 50 } };
p.manuais = { DOT: { qtd: 12, investido: 50 }, ADA: { qtd: null, investido: 100 } };
o.corretoras = { v1: { nome: "Bitpanda", saldos: { BTC: 0.1 } } };
eq("manuais e corretoras", tipos(o, p), ["exchange_removida:Bitpanda", "manual_alterado:DOT:DOT", "manual_adicionado:ADA:ADA"]);
eq("rebase pequeno de token não conta", diferencas({ ...vazia(), tokens: { t: { nome: "L", saldos: { STETH: 1 } } } }, { ...vazia(), tokens: { t: { nome: "L", saldos: { STETH: 1.0001 } } } }, 1).length, 0);
eq("igual → nada", tipos(b, b), []);
const antiga = { ...vazia(), manuais: { ETH: { qtd: 0.13, investido: 300 } } };
const nova = { ...vazia(), manuais: { "ETH|principal": { nome: "ETH", qtd: 0.13, investido: 300 } } };
eq("fotografia antiga convertida: sem movimentos falsos", tipos(migrarFoto(antiga)!, nova), []);
const outra = { ...vazia(), manuais: { "ETH|principal": { nome: "ETH", qtd: 0.13, investido: 300 }, "ETH|c1": { nome: "ETH · Binance", qtd: 0.05, investido: 100 } } };
eq("nova carteira de um ativo manual", tipos(nova, outra), ["manual_adicionado:ETH · Binance:ETH"]);
if (fails) { console.error(`${fails} falha(s)`); process.exit(1); }
