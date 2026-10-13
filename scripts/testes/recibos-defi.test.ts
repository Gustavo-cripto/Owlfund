import { contaComoDefi } from "@/lib/defi/recibos";
let fails = 0;
const eq = (name: string, got: boolean, want: boolean) => {
  const ok = got === want;
  if (!ok) fails++;
  console.log(`${ok ? "✅" : "❌"} ${name}: ${got}${ok ? "" : ` (esperado ${want})`}`);
};
eq("Aave aEthWETH", contaComoDefi({ symbol: "aEthWETH", chain: "eth" }), true);
eq("Aave aArbUSDC", contaComoDefi({ symbol: "aArbUSDC", chain: "eth" }), true);
eq("dívida variableDebtEthUSDC", contaComoDefi({ symbol: "variableDebtEthUSDC", chain: "eth" }), true);
eq("Spark spDAI", contaComoDefi({ symbol: "spDAI", chain: "eth" }), true);
eq("Compound cUSDCv3", contaComoDefi({ symbol: "cUSDCv3", chain: "eth" }), true);
eq("AAVE (o token) não é recibo", contaComoDefi({ symbol: "AAVE", chain: "eth" }), false);
eq("ARB não é recibo", contaComoDefi({ symbol: "ARB", chain: "eth" }), false);
eq("ETH nativo não", contaComoDefi({ symbol: "ETH", address: "native", chain: "eth" }), false);
eq("SPX (meme) não", contaComoDefi({ symbol: "SPX", chain: "eth" }), false);
eq("sETHFI não", contaComoDefi({ symbol: "sETHFI", chain: "eth" }), false);
eq("SOL jitoSOL", contaComoDefi({ address: "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn", chain: "sol" }), true);
eq("SOL USDC (contado no DeFi de Solana)", contaComoDefi({ address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", chain: "sol" }), true);
eq("SOL meme não", contaComoDefi({ address: "Bef3tWKVEws4jAzYEAzEfNCkTff4Y7xzKdeq9JeZpump", chain: "sol" }), false);
if (fails) { console.log(`❌ ${fails} falha(s)`); process.exit(1); }
