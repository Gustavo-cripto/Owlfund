import { detetarRede } from "@/lib/wallets/detetarRede";
let fails = 0;
const ok = (n: string, c: boolean, extra = "") => { if (!c) fails++; console.log(`${c ? "✅" : "❌"} ${n}${extra ? `: ${extra}` : ""}`); };
const rede = (s: string) => { const d = detetarRede(s); return d.tipo === "rede" ? d.rede : d.tipo; };

ok("EVM 0x…40", rede("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045") === "eth");
ok("BTC bech32", rede("bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh") === "btc");
ok("BTC legado 1…", rede("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa") === "btc");
ok("BTC P2SH 3…", rede("3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy") === "btc");
ok("Cardano addr1", rede("addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgse35a3x") === "ada");
ok("Solana base58", rede("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM") === "sol");
ok("frase de 12 palavras", rede("abandon ability able about above absent absorb abstract absurd abuse access accident") === "frase");
ok("chave privada 64 hex", rede("4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318") === "chave");
ok("chave privada com 0x", rede("0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318") === "chave");
ok("texto qualquer", rede("ola tudo bem") === "desconhecido");
ok("vazio", rede("   ") === "desconhecido");
ok("espacos a volta nao contam", rede("  0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 ") === "eth");
if (fails) { console.log(`\n${fails} falha(s)`); process.exit(1); }
