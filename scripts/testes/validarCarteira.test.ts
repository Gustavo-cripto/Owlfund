import { getAllowedHosts, isAdaAddress, isBtcAddress, isEvmAddress, isSolAddress, sanitizeLabel } from "@/lib/wallets/validar";
let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fails++; console.log(`${ok ? "✅" : "❌"} ${name}: ${JSON.stringify(got)}${ok ? "" : ` (esperado ${JSON.stringify(want)})`}`); };
// EVM: 0x + 40 hex, sem mais nada
eq("EVM valido", isEvmAddress("0x742d35Cc6634C0532925a3b844Bc454e4438f44e"), true);
eq("EVM curto", isEvmAddress("0x742d35Cc6634C0532925a3b844Bc454e4438f44"), false);
eq("EVM sem 0x", isEvmAddress("742d35Cc6634C0532925a3b844Bc454e4438f44e"), false);
eq("EVM indefinido", isEvmAddress(undefined), false);
// Solana: base58 32-44 (sem 0, O, I, l)
eq("SOL valido", isSolAddress("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"), true);
eq("SOL com 0", isSolAddress("0WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"), false);
eq("SOL curto", isSolAddress("9WzDXwBbmkg8"), false);
// BTC: formato largo (bc1 / 1 / 3), sem checksum
eq("BTC bech32", isBtcAddress("bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh"), true);
eq("BTC P2PKH", isBtcAddress("1F1tAaz5x1HUXrCNLbtMDqcw6o5GNn4xqX"), true);
eq("BTC ETH nao", isBtcAddress("0x742d35Cc6634C0532925a3b844Bc454e4438f44e"), false);
// ADA: addr1 / stake1
eq("ADA addr1", isAdaAddress("addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgse35a3x"), true);
eq("ADA stake1", isAdaAddress("stake1uyehkck0lajq8gr28t9uxnuvgcqrc6070x3k9r8048z8y5gh6ffgw"), true);
eq("ADA outro", isAdaAddress("DdzFFzCqrht"), false);
// Nomes: sem HTML/aspas/javascript:, aparado, max 64
eq("sanitize HTML", sanitizeLabel(" <b>Minha</b> \"carteira\" "), "bMinha/b carteira");
eq("sanitize javascript:", sanitizeLabel("JavaScript:alert(1)"), "alert(1)");
eq("sanitize 64", sanitizeLabel("x".repeat(80)).length, 64);
// Hosts permitidos: lista separada por virgulas
process.env.NEXT_PUBLIC_ALLOWED_HOSTS = " a.com, ,b.com ";
eq("hosts", getAllowedHosts(), ["a.com", "b.com"]);
delete process.env.NEXT_PUBLIC_ALLOWED_HOSTS;
eq("hosts vazio", getAllowedHosts(), []);
console.log(fails === 0 ? "\nTODOS OK" : `\n${fails} FALHA(S)`); process.exit(fails ? 1 : 0);
