// Posicoes de EMPRESTIMO (Aave V3, Spark, Compound V3) lidas diretamente dos
// contratos, com depositado e emprestado separados.
//
// Porque diretamente e nao pela Moralis:
//  - a Moralis dava um valor por protocolo, sem dizer se descontava a divida —
//    quem tem colateral e stablecoins emprestadas via o total do portefolio
//    inflacionado (pergunta que veio do Reddit, 15 set 2026);
//  - o plano gratuito da Moralis foi suspenso ("Free usage is paused"), e a
//    Aave e a Compound passaram a aparecer a 0;
//  - os contratos sao a fonte de verdade, gratuitos, e ja dao os dois lados.
//
// Valores em USD. Aave/Spark: getUserAccountData devolve colateral e divida na
// moeda base do mercado (USD com 8 casas). Compound V3: base fornecida e base
// emprestada + cada colateral, com os oraculos do proprio mercado.
//
// Recompensas por reclamar (incentivos) NAO entram: dizemo-lo na interface.

export type LendingPosition = {
  kind: "lending";
  protocol: "aave-v3" | "spark" | "compound-v3" | "morpho" | "eigenlayer";
  name: string;
  chain: LendingChain;
  /** Colateral + fornecido, em USD. */
  supplied: number;
  /** Divida, em USD. */
  borrowed: number;
  /** supplied − borrowed: e o que conta para o total do portefolio. */
  usd: number;
  /** Aave/Spark: fator de saude (null sem divida). */
  healthFactor: number | null;
};

export type LendingChain = "eth" | "arbitrum" | "base" | "optimism" | "polygon";
export const LENDING_CHAINS: readonly LendingChain[] = ["eth", "arbitrum", "base", "optimism", "polygon"];

const CHAIN_LABEL: Record<LendingChain, string> = { eth: "Ethereum", arbitrum: "Arbitrum", base: "Base", optimism: "Optimism", polygon: "Polygon" };

const RPC: Record<LendingChain, string[]> = {
  eth: ["https://ethereum.publicnode.com", "https://eth.drpc.org"],
  arbitrum: ["https://arbitrum-one.publicnode.com", "https://arb1.arbitrum.io/rpc"],
  base: ["https://base.publicnode.com", "https://mainnet.base.org"],
  optimism: ["https://optimism.publicnode.com", "https://mainnet.optimism.io"],
  polygon: ["https://polygon-bor.publicnode.com", "https://polygon-rpc.com"],
};

// Enderecos verificados na cadeia a 15 set 2026 (getUserAccountData / numAssets).
const AAVE_LIKE: Array<{ chain: LendingChain; protocol: "aave-v3" | "spark"; label: string; pool: string }> = [
  { chain: "eth", protocol: "aave-v3", label: "Aave V3", pool: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2" },
  { chain: "eth", protocol: "spark", label: "Spark", pool: "0xC13e21B648A5Ee794902342038FF3aDAB66BE987" },
  { chain: "arbitrum", protocol: "aave-v3", label: "Aave V3", pool: "0x794a61358D6845594F94dc1DB02A252b5b4814aD" },
  { chain: "optimism", protocol: "aave-v3", label: "Aave V3", pool: "0x794a61358D6845594F94dc1DB02A252b5b4814aD" },
  { chain: "polygon", protocol: "aave-v3", label: "Aave V3", pool: "0x794a61358D6845594F94dc1DB02A252b5b4814aD" },
  { chain: "base", protocol: "aave-v3", label: "Aave V3", pool: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5" },
];

const COMET: Array<{ chain: LendingChain; label: string; address: string }> = [
  { chain: "eth", label: "Compound V3 USDC", address: "0xc3d688B66703497DAA19211EEdff47f25384cdc3" },
  { chain: "eth", label: "Compound V3 WETH", address: "0xA17581A9E3356d9A858b789D68B4d866e593aE94" },
  { chain: "eth", label: "Compound V3 USDT", address: "0x3Afdc9BCA9213A35503b077a6072F3D0d5AB0840" },
  { chain: "arbitrum", label: "Compound V3 USDC", address: "0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf" },
  { chain: "base", label: "Compound V3 USDC", address: "0xb125E6687d4313864e53df431d5425969c15Eb2F" },
  { chain: "optimism", label: "Compound V3 USDC", address: "0x2e44e174f7D53F0212823acC11C01A11d58c5bCB" },
  { chain: "polygon", label: "Compound V3 USDC", address: "0xF25212E676D1F7F89Cd72fFEe66158f541246445" },
];

// Seletores (keccak256 da assinatura, verificados).
const SEL = {
  getUserAccountData: "0xbf92857c",
  balanceOf: "0x70a08231",
  borrowBalanceOf: "0x374c49b4",
  numAssets: "0xa46fe83b",
  getAssetInfo: "0xc8c7fe6b",
  userCollateral: "0x2b92a07d",
  getPrice: "0x41976e09",
  baseScale: "0x44c1e5eb",
  baseTokenPriceFeed: "0xe7dad6bd",
};

const pad = (hex: string) => hex.toLowerCase().replace(/^0x/, "").padStart(64, "0");
const word = (res: string, i: number): bigint => {
  const h = res.replace(/^0x/, "").slice(i * 64, (i + 1) * 64);
  return /^[0-9a-fA-F]{64}$/.test(h) ? BigInt("0x" + h) : BigInt(0);
};
const addr = (res: string, i: number) => "0x" + res.replace(/^0x/, "").slice(i * 64 + 24, (i + 1) * 64);
// Divisao com precisao para numeros grandes (evita perder casas em Number(bigint)).
const toNum = (v: bigint, decimals: number) => Number(v) / 10 ** decimals;

type Call = { to: string; data: string };

/** Varios eth_call num so pedido (JSON-RPC batch), com o RPC de reserva se o primeiro falhar. */
async function batch(chain: LendingChain, calls: Call[]): Promise<string[]> {
  if (calls.length === 0) return [];
  const body = JSON.stringify(calls.map((c, id) => ({ jsonrpc: "2.0", id, method: "eth_call", params: [{ to: c.to, data: c.data }, "latest"] })));
  for (const url of RPC[chain]) {
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body, signal: AbortSignal.timeout(9000), cache: "no-store" });
      if (!res.ok) continue;
      const json = (await res.json()) as Array<{ id: number; result?: string }>;
      if (!Array.isArray(json)) continue;
      const out = new Array<string>(calls.length).fill("0x");
      for (const r of json) if (Number.isInteger(r.id) && r.id >= 0 && r.id < calls.length && typeof r.result === "string") out[r.id] = r.result;
      return out;
    } catch { /* tenta o seguinte */ }
  }
  throw new Error(`RPC ${chain} indisponível`);
}

async function aaveLike(user: string, chains: readonly LendingChain[]): Promise<LendingPosition[]> {
  const out: LendingPosition[] = [];
  await Promise.all(chains.map(async (chain) => {
    const pools = AAVE_LIKE.filter((p) => p.chain === chain);
    if (!pools.length) return;
    // Uma cadeia sem RPC nao apaga as outras.
    let res: string[];
    try { res = await batch(chain, pools.map((p) => ({ to: p.pool, data: SEL.getUserAccountData + pad(user) }))); } catch { return; }
    pools.forEach((p, i) => {
      const r = res[i];
      if (!r || r.length < 2 + 64 * 6) return;
      const supplied = toNum(word(r, 0), 8);
      const borrowed = toNum(word(r, 1), 8);
      if (supplied < 0.01 && borrowed < 0.01) return;
      const hf = borrowed > 0 ? toNum(word(r, 5), 18) : null;
      out.push({ kind: "lending", protocol: p.protocol, name: `${p.label} (${CHAIN_LABEL[chain]})`, chain, supplied, borrowed, usd: supplied - borrowed, healthFactor: hf });
    });
  }));
  return out;
}

// Estrutura de cada mercado Compound (ativos, oraculos, escalas) — nao muda,
// por isso lê-se uma vez por instancia.
type CometMeta = { baseScale: bigint; basePriceFeed: string; assets: Array<{ asset: string; priceFeed: string; scale: bigint }> };
const cometMeta = new Map<string, Promise<CometMeta>>();

function loadCometMeta(chain: LendingChain, comet: string): Promise<CometMeta> {
  const key = `${chain}:${comet}`;
  let p = cometMeta.get(key);
  if (!p) {
    p = (async () => {
      const [n, bs, bpf] = await batch(chain, [
        { to: comet, data: SEL.numAssets }, { to: comet, data: SEL.baseScale }, { to: comet, data: SEL.baseTokenPriceFeed },
      ]);
      const count = Number(word(n, 0));
      if (!(count >= 0 && count < 64)) throw new Error("numAssets inválido");
      const infos = await batch(chain, Array.from({ length: count }, (_, i) => ({ to: comet, data: SEL.getAssetInfo + pad(i.toString(16)) })));
      // AssetInfo: (uint8 offset, address asset, address priceFeed, uint64 scale, …)
      const assets = infos.map((r) => ({ asset: addr(r, 1), priceFeed: addr(r, 2), scale: word(r, 3) })).filter((a) => a.scale > BigInt(0));
      return { baseScale: word(bs, 0), basePriceFeed: addr(bpf, 0), assets };
    })();
    p.catch(() => cometMeta.delete(key));
    cometMeta.set(key, p);
  }
  return p;
}

async function compoundV3(user: string, chains: readonly LendingChain[]): Promise<LendingPosition[]> {
  const out: LendingPosition[] = [];
  await Promise.all(COMET.filter((c) => chains.includes(c.chain)).map(async (m) => {
    try {
      const meta = await loadCometMeta(m.chain, m.address);
      const res = await batch(m.chain, [
        { to: m.address, data: SEL.balanceOf + pad(user) },
        { to: m.address, data: SEL.borrowBalanceOf + pad(user) },
        ...meta.assets.map((a) => ({ to: m.address, data: SEL.userCollateral + pad(user) + pad(a.asset) })),
      ]);
      const baseSupplied = word(res[0], 0);
      const baseBorrowed = word(res[1], 0);
      const coll = meta.assets.map((a, i) => ({ ...a, balance: word(res[2 + i], 0) })).filter((a) => a.balance > BigInt(0));
      if (baseSupplied === BigInt(0) && baseBorrowed === BigInt(0) && coll.length === 0) return;
      const prices = await batch(m.chain, [meta.basePriceFeed, ...coll.map((c) => c.priceFeed)].map((feed) => ({ to: m.address, data: SEL.getPrice + pad(feed) })));
      const basePrice = toNum(word(prices[0], 0), 8);
      const baseDec = meta.baseScale.toString().length - 1;
      const supplied = toNum(baseSupplied, baseDec) * basePrice
        + coll.reduce((s, c, i) => s + toNum(c.balance, c.scale.toString().length - 1) * toNum(word(prices[1 + i], 0), 8), 0);
      const borrowed = toNum(baseBorrowed, baseDec) * basePrice;
      if (supplied < 0.01 && borrowed < 0.01) return;
      out.push({ kind: "lending", protocol: "compound-v3", name: `${m.label} (${CHAIN_LABEL[m.chain]})`, chain: m.chain, supplied, borrowed, usd: supplied - borrowed, healthFactor: null });
    } catch { /* um mercado em baixo nao apaga os outros */ }
  }));
  return out;
}

/** Todas as posicoes de emprestimo do endereco nas cadeias pedidas. Nunca lanca. */
export async function getLendingPositions(user: string, chains: readonly LendingChain[]): Promise<LendingPosition[]> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(user)) return [];
  const [a, c] = await Promise.allSettled([aaveLike(user, chains), compoundV3(user, chains)]);
  return [...(a.status === "fulfilled" ? a.value : []), ...(c.status === "fulfilled" ? c.value : [])]
    .sort((x, y) => y.supplied - x.supplied);
}

/** Protocolos que passam a vir dos contratos — as linhas da Moralis com estes nomes saem, para nao contar duas vezes. */
export function isOnchainLendingProtocol(nameOrId: string): boolean {
  return /aave|spark|compound|morpho|eigen/i.test(nameOrId);
}
