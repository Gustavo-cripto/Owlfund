// Posicoes na Morpho (vaults e mercados) e no EigenLayer (restaking), lidas de
// fontes gratuitas que nao dependem de nenhuma chave:
//  - Morpho: API GraphQL publica (api.morpho.org) — da o valor em USD por
//    posicao, com fornecido/emprestado/colateral e fator de saude, em Ethereum,
//    Base, Arbitrum, Polygon e Optimism.
//  - EigenLayer: contratos (StrategyManager.getDeposits → shares →
//    sharesToUnderlyingView), com o preco do token subjacente pelo CoinGecko.
//    So o restaking de LSTs; o ETH nativo em EigenPods nao entra (anota-se).
//
// Nao ha dupla contagem com os saldos de tokens: acoes de vault da Morpho e
// shares do EigenLayer nao tem preco na Alchemy, por isso nao aparecem la.
import { cgFetch } from "@/lib/market/coingecko";
import type { LendingChain, LendingPosition } from "./lending";

const MORPHO_CHAIN: Record<LendingChain, number> = { eth: 1, base: 8453, arbitrum: 42161, polygon: 137, optimism: 10 };
const CHAIN_LABEL: Record<LendingChain, string> = { eth: "Ethereum", arbitrum: "Arbitrum", base: "Base", optimism: "Optimism", polygon: "Polygon" };

type MorphoUser = {
  vaultPositions?: Array<{ vault?: { name?: string; symbol?: string; chain?: { id?: number } }; state?: { assetsUsd?: number | null } }>;
  marketPositions?: Array<{ healthFactor?: number | null; market?: { loanAsset?: { symbol?: string }; collateralAsset?: { symbol?: string }; morphoBlue?: { chain?: { id?: number } } }; state?: { supplyAssetsUsd?: number | null; borrowAssetsUsd?: number | null; collateralUsd?: number | null } }>;
};

export async function getMorphoPositions(user: string, chains: readonly LendingChain[]): Promise<LendingPosition[]> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(user)) return [];
  const out: LendingPosition[] = [];
  await Promise.all(chains.map(async (chain) => {
    const chainId = MORPHO_CHAIN[chain];
    if (!chainId) return;
    try {
      const res = await fetch("https://api.morpho.org/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          query: `query($a:String!,$c:Int!){ userByAddress(address:$a, chainId:$c){
            vaultPositions{ vault{ name symbol chain{ id } } state{ assetsUsd } }
            marketPositions{ healthFactor market{ loanAsset{ symbol } collateralAsset{ symbol } } state{ supplyAssetsUsd borrowAssetsUsd collateralUsd } } } }`,
          variables: { a: user, c: chainId },
        }),
        signal: AbortSignal.timeout(9000),
        next: { revalidate: 120 },
      });
      if (!res.ok) return;
      const j = (await res.json()) as { data?: { userByAddress?: MorphoUser | null } };
      const u = j.data?.userByAddress;
      if (!u) return;
      for (const v of u.vaultPositions ?? []) {
        const usd = Number(v.state?.assetsUsd ?? 0) || 0;
        // Poeira (ha enderecos com centenas de posicoes de 1 $) fica de fora.
        if (usd < 0.5) continue;
        out.push({ kind: "lending", protocol: "morpho", name: `Morpho · ${v.vault?.name ?? v.vault?.symbol ?? "Vault"} (${CHAIN_LABEL[chain]})`, chain, supplied: usd, borrowed: 0, usd, healthFactor: null });
      }
      for (const m of u.marketPositions ?? []) {
        const supplied = (Number(m.state?.supplyAssetsUsd ?? 0) || 0) + (Number(m.state?.collateralUsd ?? 0) || 0);
        const borrowed = Number(m.state?.borrowAssetsUsd ?? 0) || 0;
        if (supplied < 0.5 && borrowed < 0.5) continue;
        const par = `${m.market?.collateralAsset?.symbol ?? "?"}/${m.market?.loanAsset?.symbol ?? "?"}`;
        const hf = typeof m.healthFactor === "number" && Number.isFinite(m.healthFactor) && borrowed > 0 ? m.healthFactor : null;
        out.push({ kind: "lending", protocol: "morpho", name: `Morpho Blue ${par} (${CHAIN_LABEL[chain]})`, chain, supplied, borrowed, usd: supplied - borrowed, healthFactor: hf });
      }
    } catch { /* Morpho em baixo nao apaga o resto */ }
  }));
  return out;
}

// ── EigenLayer (Ethereum) ─────────────────────────────────────────────────────
const STRATEGY_MANAGER = "0x858646372CC42E1A627fcE94aa7A7033e7CF075A";
const SEL = { getDeposits: "0x94f649dd", sharesToUnderlyingView: "0x7a8b2637", underlyingToken: "0x2495a599" };
const RPCS = ["https://ethereum.publicnode.com", "https://eth.drpc.org", "https://1rpc.io/eth"];
const pad = (hex: string) => hex.toLowerCase().replace(/^0x/, "").padStart(64, "0");

async function ethCall(to: string, data: string): Promise<string> {
  for (const url of RPCS) {
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }), signal: AbortSignal.timeout(9000), cache: "no-store" });
      if (!res.ok) continue;
      const j = (await res.json()) as { result?: string };
      if (typeof j.result === "string") return j.result;
    } catch { /* seguinte */ }
  }
  return "0x";
}

const words = (res: string): string[] => { const h = res.replace(/^0x/, ""); const w: string[] = []; for (let i = 0; i + 64 <= h.length; i += 64) w.push(h.slice(i, i + 64)); return w; };
const big = (h: string) => (/^[0-9a-fA-F]{64}$/.test(h) ? BigInt("0x" + h) : BigInt(0));

/** Preco USD de tokens ERC-20 de Ethereum por contrato (CoinGecko). */
async function tokenPricesUsd(addresses: string[]): Promise<Record<string, number>> {
  if (addresses.length === 0) return {};
  try {
    const res = await cgFetch(`https://api.coingecko.com/api/v3/simple/token_price/ethereum?contract_addresses=${addresses.join(",")}&vs_currencies=usd`, { next: { revalidate: 300 } });
    if (!res.ok) return {};
    const j = (await res.json()) as Record<string, { usd?: number }>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(j)) if (typeof v?.usd === "number") out[k.toLowerCase()] = v.usd;
    return out;
  } catch { return {}; }
}

export async function getEigenLayerPositions(user: string): Promise<LendingPosition[]> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(user)) return [];
  try {
    const w = words(await ethCall(STRATEGY_MANAGER, SEL.getDeposits + pad(user)));
    // ABI: (address[] strategies, uint256[] shares) — dois arrays dinamicos.
    if (w.length < 4) return [];
    const offStrat = Number(big(w[0]) / BigInt(32)); const offShares = Number(big(w[1]) / BigInt(32));
    const n = Number(big(w[offStrat] ?? ""));
    if (!(n > 0 && n < 64)) return [];
    const strategies = w.slice(offStrat + 1, offStrat + 1 + n).map((x) => "0x" + x.slice(24));
    const shares = w.slice(offShares + 1, offShares + 1 + n).map(big);
    const under = await Promise.all(strategies.map(async (s, i) => {
      const [u, t] = await Promise.all([ethCall(s, SEL.sharesToUnderlyingView + shares[i].toString(16).padStart(64, "0")), ethCall(s, SEL.underlyingToken)]);
      return { strategy: s, amount: Number(big(words(u)[0] ?? "")) / 1e18, token: ("0x" + (words(t)[0] ?? "").slice(24)).toLowerCase() };
    }));
    const prices = await tokenPricesUsd([...new Set(under.map((x) => x.token).filter((t) => t.length === 42))]);
    let supplied = 0; let semPreco = 0;
    for (const x of under) { const p = prices[x.token]; if (p) supplied += x.amount * p; else if (x.amount > 0) semPreco++; }
    if (supplied < 0.01) return [];
    return [{ kind: "lending", protocol: "eigenlayer", name: `EigenLayer · restaking${semPreco ? " (parcial)" : ""} (Ethereum)`, chain: "eth", supplied, borrowed: 0, usd: supplied, healthFactor: null }];
  } catch { return []; }
}
