// Tokens que representam posições DeFi já contadas pela rota /api/defi-balance.
// Na soma dos tokens das carteiras (Carteiras → tokensUsd) ficam de fora, senão
// o mesmo dinheiro contava duas vezes: uma como token, outra como posição.

/** Solana: mint → protocolo. A rota de DeFi lê estes mints como posições. */
export const SOL_DEFI_TOKENS: Record<string, string> = {
  mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So: "Marinade (mSOL)",
  "7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj": "Lido (stSOL)",
  J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn: "Jito (jitoSOL)",
  bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1: "BlazeStake (bSOL)",
  "27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4": "Jupiter (JLP)",
  LSTxxxnJzKDFSLr4dUkPcmCf5VyryEqzPLz5j4bpxFp: "Marginfi (LST)",
  "5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm": "Orca (whSOL)",
  "7Q2afV64in6N6SeZsAAB81TJzwDoD6zpqmHkzi9Dcavn": "Raydium (USDC-SOL LP)",
  "3UNBZ6o52WTWwjac2kPiK9xns6XHW5UsqohAd5n4VFGf": "Raydium (SOL-USDC)",
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: "USDC",
};

// EVM: recibos dos empréstimos lidos dos contratos (src/lib/defi/lending.ts):
// Aave V3 (aEthWETH, aArbUSDC…, e as dívidas variableDebt…/stableDebt…),
// Spark (spDAI, spWETH…) e Compound V3 (cUSDCv3, cWETHv3…).
const RECIBO_EVM = /^(a(Eth|Arb|Opt|Bas|Pol|Ava|Lin|Scr|Gno|Bnb|BnB|ZkS|Zks)[A-Za-z0-9.]+|variableDebt[A-Za-z0-9.]+|stableDebt[A-Za-z0-9.]+|sp[A-Z][A-Za-z0-9.]*|c[A-Z][A-Za-z0-9.]*v3)$/;

/** O token já entra no total como posição DeFi? */
export function contaComoDefi(t: { symbol?: string; address?: string; chain?: string }): boolean {
  if (t.chain === "sol") return Boolean(t.address && t.address in SOL_DEFI_TOKENS);
  return RECIBO_EVM.test(t.symbol ?? "");
}
