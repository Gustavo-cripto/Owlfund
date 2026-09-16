import { isValidBtcAddress } from "@/lib/wallets/btcAddress";
let fails = 0;
const eq = (name: string, got: boolean, want: boolean) => { const ok = got === want; if (!ok) fails++; console.log(`${ok ? "✅" : "❌"} ${name}: ${got}${ok ? "" : ` (esperado ${want})`}`); };
// Validos (carteiras conhecidas, confirmadas na blockchain)
eq("P2PKH Silk Road", isValidBtcAddress("1F1tAaz5x1HUXrCNLbtMDqcw6o5GNn4xqX"), true);
eq("P2SH Binance cold", isValidBtcAddress("34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo"), true);
eq("bech32 El Salvador", isValidBtcAddress("bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh"), true);
eq("bech32 longo Bitfinex", isValidBtcAddress("bc1qgdjqv0av3q56jvd82tkdjpy7gdp9ut8tlqmgrpmv24sq90ecnvqqjwvw97"), true);
eq("bech32m Taproot", isValidBtcAddress("bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297"), true);
eq("bech32 em maiusculas", isValidBtcAddress("BC1QXY2KGDYGJRSQTZQ2N0YRF2493P83KKFJHX0WLH"), true);
// Invalidos
eq("BKA Movie2k (checksum falha)", isValidBtcAddress("bc1q9n3ywg3vxydmcj72m9m4stvy6s8jwfn3x05fmj"), false);
eq("um caracter trocado", isValidBtcAddress("1F1tAaz5x1HUXrCNLbtMDqcw6o5GNn4xqY"), false);
eq("bech32 misto", isValidBtcAddress("bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0WLH"), false);
eq("testnet", isValidBtcAddress("tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx"), false);
eq("ETH", isValidBtcAddress("0x742d35Cc6634C0532925a3b844Bc454e4438f44e"), false);
eq("vazio", isValidBtcAddress(""), false);
eq("nao string", isValidBtcAddress(null), false);
console.log(fails === 0 ? "\nTODOS OK" : `\n${fails} FALHA(S)`); process.exit(fails ? 1 : 0);
