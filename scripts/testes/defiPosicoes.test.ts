import { completarPosicao, lerSimboloAbi, precoDoTick, precoPorSimbolo, tickDoSlot0 } from "@/lib/defi/posicoes";
let fails = 0;
const eq = (name: string, got: unknown, want: unknown, tol = 1e-9) => {
  const ok = typeof got === "number" && typeof want === "number" ? Math.abs(got - want) <= tol * Math.max(1, Math.abs(want)) : JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "✅" : "❌"} ${name}: ${JSON.stringify(got)}${ok ? "" : ` (esperado ${JSON.stringify(want)})`}`);
};
// WETH(18)/USDC(6): tick ≈ -196256 dá ~3000 USDC por WETH? token0=USDC(6), token1=WETH(18) é o caso real.
eq("tick 0 com decimais iguais = 1", precoDoTick(0, 18, 18), 1);
eq("USDC(6)/WETH(18) no tick 200311 ≈ 0,0005 WETH por USDC", precoDoTick(200311, 6, 18), 1 / 2000, 1e-3);
const palavra = (n: number) => (n < 0 ? (BigInt(1) << BigInt(256)) + BigInt(n) : BigInt(n)).toString(16).padStart(64, "0");
eq("tick positivo do slot0", tickDoSlot0("0x" + palavra(123) + palavra(200311)), 200311);
eq("tick negativo do slot0", tickDoSlot0("0x" + palavra(123) + palavra(-887220)), -887220);
eq("slot0 curto → null", tickDoSlot0("0x12"), null);
const str = "0x" + palavra(32) + palavra(4) + Buffer.from("USDC").toString("hex").padEnd(64, "0");
eq("symbol() em string ABI", lerSimboloAbi(str), "USDC");
eq("symbol() em bytes32 (MKR)", lerSimboloAbi("0x" + Buffer.from("MKR").toString("hex").padEnd(64, "0")), "MKR");
eq("símbolo vazio → null", lerSimboloAbi("0x"), null);
eq("par e protocolo do nome antigo", completarPosicao({ name: "Uniswap V2 WETH/PEPE", usd: 10 }), { name: "Uniswap V2 WETH/PEPE", usd: 10, protocolo: "Uniswap V2", par: ["WETH", "PEPE"], estado: "aberta", tipo: "liquidez" });
eq("Aave é empréstimo", completarPosicao({ name: "Aave V3", usd: 5 }).tipo, "emprestimo");
eq("preço por símbolo tira o W", precoPorSimbolo(new Map([["MATIC", 0.5]]), "WMATIC"), 0.5);
if (fails) { console.error(`${fails} falha(s)`); process.exit(1); }
