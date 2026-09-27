import { isValidEvmAddress, isValidSolAddress } from "@/lib/wallets/address";
let fails = 0;
const eq = (name: string, got: boolean, want: boolean) => { const ok = got === want; if (!ok) fails++; console.log(`${ok ? "✅" : "❌"} ${name}: ${got}${ok ? "" : ` (esperado ${want})`}`); };

// ── Solana ──
eq("SOL: System Program (11111…)", isValidSolAddress("11111111111111111111111111111111"), true);
eq("SOL: Token Program", isValidSolAddress("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"), true);
eq("SOL: carteira comum (44)", isValidSolAddress("5ZWj7a1f8tWkjBESHKgrLmXshuXxqeY9SYcfbshpAqPG"), true);
eq("SOL: wrapped SOL mint", isValidSolAddress("So11111111111111111111111111111111111111112"), true);
eq("SOL: 32-44 chars mas nao base58 (0 e l)", isValidSolAddress("0l0l0l0l0l0l0l0l0l0l0l0l0l0l0l0l0l0l"), false);
eq("SOL: 44 chars base58 mas > 32 bytes", isValidSolAddress("zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz"), false);
// Sem checksum, um caracter a menos ainda pode ser uma chave valida (43 chars codificam 32 bytes):
// o que se garante e o comprimento em bytes, nao a existencia da conta.
eq("SOL: 31 caracteres (curto)", isValidSolAddress("5ZWj7a1f8tWkjBESHKgrLmXshuXxqeY"), false);
eq("SOL: 45 caracteres (longo)", isValidSolAddress("5ZWj7a1f8tWkjBESHKgrLmXshuXxqeY9SYcfbshpAqPGA"), false);
eq("SOL: endereco ETH", isValidSolAddress("0x742d35Cc6634C0532925a3b844Bc454e4438f44e"), false);
eq("SOL: texto curto", isValidSolAddress("abc"), false);
eq("SOL: vazio", isValidSolAddress(""), false);
eq("SOL: nao string", isValidSolAddress(null), false);

// ── EVM ──
eq("EVM: checksum EIP-55", isValidEvmAddress("0x742d35Cc6634C0532925a3b844Bc454e4438f44e"), true);
eq("EVM: minusculas", isValidEvmAddress("0x742d35cc6634c0532925a3b844bc454e4438f44e"), true);
eq("EVM: zero", isValidEvmAddress("0x0000000000000000000000000000000000000000"), true);
eq("EVM: so 0x", isValidEvmAddress("0x"), false);
eq("EVM: 39 hex", isValidEvmAddress("0x742d35cc6634c0532925a3b844bc454e4438f44"), false);
eq("EVM: 41 hex", isValidEvmAddress("0x742d35cc6634c0532925a3b844bc454e4438f44ee"), false);
eq("EVM: caracter fora do hex", isValidEvmAddress("0x742d35cc6634c0532925a3b844bc454e4438f44g"), false);
eq("EVM: sem 0x", isValidEvmAddress("742d35cc6634c0532925a3b844bc454e4438f44e"), false);
eq("EVM: ENS", isValidEvmAddress("vitalik.eth"), false);
eq("EVM: nao string", isValidEvmAddress(undefined), false);

console.log(fails === 0 ? "\nTODOS OK" : `\n${fails} FALHA(S)`); process.exit(fails ? 1 : 0);
