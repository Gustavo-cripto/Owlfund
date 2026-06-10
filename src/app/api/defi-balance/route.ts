import { NextResponse } from "next/server";

const MORALIS_DEFI = "https://deep-index.moralis.io/api/v2.2/wallets";

type ChainId = "eth" | "sol" | "btc" | "ada";

function isEvmAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}
function isSolAddress(address: string): boolean {
  return typeof address === "string" && address.length >= 32 && address.length <= 44;
}
function isBtcAddress(address: string): boolean {
  return /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,}$/.test(address);
}
function isAdaAddress(address: string): boolean {
  return /^(addr1|stake1)[0-9a-z]+$/i.test(address);
}

function validateAddressForChain(address: string, chain: ChainId): boolean {
  switch (chain) {
    case "eth":
      return isEvmAddress(address);
    case "sol":
      return isSolAddress(address);
    case "btc":
      return isBtcAddress(address);
    case "ada":
      return isAdaAddress(address);
    default:
      return false;
  }
}

type MoralisProtocol = {
  protocol_name?: string;
  protocol_id?: string;
  name?: string;
  total_usd_value?: string;
  positions?: unknown;
};

type MoralisDefiSummary = {
  total_usd_value?: string;
  protocols?: MoralisProtocol[];
};

// Map Moralis protocol slugs to friendly names
const PROTOCOL_NAMES: Record<string, string> = {
  "uniswap-v2": "Uniswap V2",
  "uniswap-v3": "Uniswap V3",
  "uniswap-v4": "Uniswap V4",
  "aave-v2": "Aave V2",
  "aave-v3": "Aave V3",
  "compound-v2": "Compound V2",
  "compound-v3": "Compound V3",
  "curve": "Curve",
  "curve-v2": "Curve V2",
  "lido": "Lido",
  "convex": "Convex",
  "balancer-v2": "Balancer V2",
  "1inch": "1inch",
  "maker": "MakerDAO",
  "sushiswap": "SushiSwap",
  "pancakeswap-v2": "PancakeSwap V2",
  "pancakeswap-v3": "PancakeSwap V3",
  "yearn": "Yearn Finance",
  "frax": "Frax",
  "rocket-pool": "Rocket Pool",
  "eigen-layer": "EigenLayer",
  "pendle": "Pendle",
  "morpho": "Morpho",
};

function resolveProtocolName(p: MoralisProtocol): string {
  const slug = p.protocol_name ?? p.protocol_id ?? p.name ?? "";
  const friendly = PROTOCOL_NAMES[slug.toLowerCase()] ?? slug.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  return friendly || "DeFi Protocol";
}

const SHYFT_GRAPHQL = "https://programs.shyft.to/v0/graphql/accounts";
const METEORA_API = "https://dlmm-api.meteora.ag";
// Meteora DLMM program IDs (v1 and v2)
const METEORA_DLMM_PROGRAM = "LBUZKhRxPF3XUpBCjp4YzTKgLLjnZE1UKixNR7L2PFC";

async function fetchMeteoraPositionsViaRPC(
  wallet: string
): Promise<{ total: number; positions: { name: string; usd: number }[] }> {
  // owner field is at offset 40 in both Position and PositionV2 (after 8-byte discriminator + 32-byte lb_pair)
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "getProgramAccounts",
    params: [
      METEORA_DLMM_PROGRAM,
      {
        filters: [{ memcmp: { offset: 40, bytes: wallet } }],
        encoding: "base58",
        dataSlice: { offset: 0, length: 0 }, // only need pubkeys
        withContext: false,
      },
    ],
  };
  const res = await fetch(SOL_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!res.ok) return { total: 0, positions: [] };
  const json = await res.json() as { result?: Array<{ pubkey: string }> };
  const accounts = json?.result ?? [];
  if (accounts.length === 0) {
    // Try offset 8 as fallback (some position layouts differ)
    const body2 = { ...body, params: [METEORA_DLMM_PROGRAM, { ...body.params[1], filters: [{ memcmp: { offset: 8, bytes: wallet } }] }] };
    const res2 = await fetch(SOL_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body2),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    if (res2.ok) {
      const json2 = await res2.json() as { result?: Array<{ pubkey: string }> };
      accounts.push(...(json2?.result ?? []));
    }
  }
  if (accounts.length === 0) return { total: 0, positions: [] };

  // Query Meteora API for each position value
  let totalUsd = 0;
  const positionResults: { name: string; usd: number }[] = [];
  const endpoints = ["position_v2", "position"] as const;

  for (const acc of accounts.slice(0, 20)) { // cap at 20 positions
    const pubkey = acc.pubkey;
    let usd = 0;
    for (const ep of endpoints) {
      try {
        const r = await fetch(`${METEORA_API}/${ep}/${pubkey}`, {
          cache: "no-store",
          signal: AbortSignal.timeout(8_000),
        });
        if (!r.ok) continue;
        const data = await r.json() as Record<string, unknown>;
        const nested = (data.data as Record<string, unknown> | undefined) ?? {};
        usd = firstPositive(data, ["total_value_usd","liquidity_usd","position_value_usd"]) ||
              firstPositive(nested, ["total_value_usd","liquidity_usd","position_value_usd"]);
        if (usd > 0) break;
      } catch { continue; }
    }
    if (usd > 0) {
      totalUsd += usd;
      positionResults.push({ name: "Meteora DLMM", usd });
    }
  }

  // If individual position values failed, try deposits - withdraws approach
  if (totalUsd <= 0) {
    for (const acc of accounts.slice(0, 10)) {
      const pubkey = acc.pubkey;
      for (const ep of endpoints) {
        try {
          const [depRes, wdRes] = await Promise.all([
            fetch(`${METEORA_API}/${ep}/${pubkey}/deposits`, { cache: "no-store", signal: AbortSignal.timeout(8_000) }),
            fetch(`${METEORA_API}/${ep}/${pubkey}/withdraws`, { cache: "no-store", signal: AbortSignal.timeout(8_000) }),
          ]);
          if (!depRes.ok || !wdRes.ok) continue;
          const deps = await depRes.json() as Array<Record<string, unknown>>;
          const wds = await wdRes.json() as Array<Record<string, unknown>>;
          if (!Array.isArray(deps) || !Array.isArray(wds)) continue;
          const usdFrom = (d: Record<string, unknown>) =>
            firstPositive(d, ["token_x_usd_amount","token_x_value_usd"]) +
            firstPositive(d, ["token_y_usd_amount","token_y_value_usd"]);
          const net = deps.reduce((s, d) => s + usdFrom(d), 0) - wds.reduce((s, w) => s + usdFrom(w), 0);
          if (net > 0) { totalUsd += net; positionResults.push({ name: "Meteora DLMM", usd: net }); break; }
        } catch { continue; }
      }
    }
  }

  // Merge all Meteora positions into one entry
  if (totalUsd > 0) {
    return { total: totalUsd, positions: [{ name: `Meteora DLMM (${accounts.length} posição${accounts.length > 1 ? "ões" : ""})`, usd: totalUsd }] };
  }
  // Return 0 value but still flag that positions exist (so we don't show $0 falsely)
  if (accounts.length > 0) {
    return { total: 0, positions: [{ name: `Meteora DLMM (${accounts.length} posição${accounts.length > 1 ? "ões" : ""} — valor indisponível)`, usd: 0 }] };
  }
  return { total: 0, positions: [] };
}

// Known Solana DeFi protocol tokens (mint → protocol name)
const SOL_DEFI_TOKENS: Record<string, string> = {
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

const SOL_RPC = "https://api.mainnet-beta.solana.com";
const JUPITER_PRICE = "https://price.jup.ag/v6/price";
const STAKE_PROGRAM = "Stake11111111111111111111111111111111111111112";
const SOL_MINT = "So11111111111111111111111111111111111111112";

type StakeAccountParsed = {
  pubkey: string;
  account: {
    lamports: number;
    data: {
      parsed: {
        info?: {
          stake?: { delegation?: { stake?: string } };
          meta?: { authorized?: { staker?: string; withdrawer?: string } };
        };
        type?: string;
      };
    };
  };
};

async function fetchSolanaStakeAccounts(
  wallet: string
): Promise<{ total: number; positions: { name: string; usd: number }[] }> {
  // Get SOL price
  let solPrice = 0;
  try {
    const p = await fetch(`${JUPITER_PRICE}?ids=${SOL_MINT}`, {
      signal: AbortSignal.timeout(6_000),
      cache: "no-store",
    });
    if (p.ok) {
      const j = await p.json() as { data?: { [k: string]: { price?: number } } };
      solPrice = j?.data?.[SOL_MINT]?.price ?? 0;
    }
  } catch { /* ignore */ }
  if (solPrice <= 0) return { total: 0, positions: [] };

  // Find stake accounts where staker == wallet (offset 12) OR withdrawer == wallet (offset 44)
  // We try withdrawer first (more common) then staker
  const tryOffsets = [44, 12];
  let stakedLamports = 0;

  for (const offset of tryOffsets) {
    try {
      const body = {
        jsonrpc: "2.0",
        id: 1,
        method: "getProgramAccounts",
        params: [
          STAKE_PROGRAM,
          {
            filters: [{ memcmp: { offset, bytes: wallet } }],
            encoding: "jsonParsed",
          },
        ],
      };
      const res = await fetch(SOL_RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(12_000),
        cache: "no-store",
      });
      if (!res.ok) continue;
      const json = await res.json() as { result?: StakeAccountParsed[] };
      const accounts = json?.result ?? [];
      for (const acc of accounts) {
        const lamports = acc?.account?.lamports ?? 0;
        if (lamports > 0) stakedLamports += lamports;
      }
      if (stakedLamports > 0) break;
    } catch { /* try next offset */ }
  }

  if (stakedLamports <= 0) return { total: 0, positions: [] };
  const stakedSol = stakedLamports / 1e9;
  const usd = stakedSol * solPrice;
  return {
    total: usd,
    positions: [{ name: `SOL Staking Nativo (${stakedSol.toFixed(3)} SOL)`, usd }],
  };
}

async function fetchSolanaDefiFromTokenAccounts(
  wallet: string
): Promise<{ total: number; positions: { name: string; usd: number }[] }> {
  // 1. Get all SPL token accounts
  const rpcBody = {
    jsonrpc: "2.0",
    id: 1,
    method: "getTokenAccountsByOwner",
    params: [
      wallet,
      { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
      { encoding: "jsonParsed" },
    ],
  };
  const rpcRes = await fetch(SOL_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(rpcBody),
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!rpcRes.ok) return { total: 0, positions: [] };
  const rpcJson = await rpcRes.json() as {
    result?: {
      value?: Array<{
        account: { data: { parsed: { info: { mint: string; tokenAmount: { uiAmount: number } } } } };
      }>;
    };
  };
  const accounts = rpcJson?.result?.value ?? [];

  // Filter only known DeFi tokens with balance > 0
  const defiHoldings: { mint: string; name: string; amount: number }[] = [];
  for (const acc of accounts) {
    const info = acc?.account?.data?.parsed?.info;
    if (!info) continue;
    const { mint, tokenAmount } = info;
    if (!SOL_DEFI_TOKENS[mint]) continue;
    if ((tokenAmount?.uiAmount ?? 0) <= 0) continue;
    defiHoldings.push({ mint, name: SOL_DEFI_TOKENS[mint], amount: tokenAmount.uiAmount });
  }
  if (defiHoldings.length === 0) return { total: 0, positions: [] };

  // 2. Get prices from Jupiter
  const mints = defiHoldings.map((h) => h.mint).join(",");
  let prices: Record<string, number> = {};
  try {
    const priceRes = await fetch(`${JUPITER_PRICE}?ids=${mints}`, {
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    if (priceRes.ok) {
      const priceJson = await priceRes.json() as { data?: Record<string, { price?: number }> };
      for (const [mint, info] of Object.entries(priceJson?.data ?? {})) {
        prices[mint] = info?.price ?? 0;
      }
    }
  } catch { /* use fallback prices */ }

  // SOL-derived tokens: use SOL price as fallback (~1:1 ratio)
  const SOL_EQUIVALENT_TOKENS = new Set([
    "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",
    "7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj",
    "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn",
    "bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1",
    "LSTxxxnJzKDFSLr4dUkPcmCf5VyryEqzPLz5j4bpxFp",
    "5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm",
  ]);

  // Get SOL price as fallback for staking tokens
  let solPrice = 0;
  if ([...SOL_EQUIVALENT_TOKENS].some((m) => defiHoldings.find((h) => h.mint === m) && !prices[m])) {
    try {
      const solRes = await fetch(
        `${JUPITER_PRICE}?ids=So11111111111111111111111111111111111111112`,
        { signal: AbortSignal.timeout(5_000), cache: "no-store" }
      );
      if (solRes.ok) {
        const j = await solRes.json() as { data?: { So11111111111111111111111111111111111111112?: { price?: number } } };
        solPrice = j?.data?.So11111111111111111111111111111111111111112?.price ?? 0;
      }
    } catch { /* ignore */ }
  }

  // 3. Calculate USD values
  const positions: { name: string; usd: number }[] = [];
  let total = 0;
  for (const h of defiHoldings) {
    let price = prices[h.mint] ?? 0;
    if (price <= 0 && SOL_EQUIVALENT_TOKENS.has(h.mint)) price = solPrice;
    if (price <= 0) continue;
    const usd = h.amount * price;
    if (usd <= 0) continue;
    total += usd;
    positions.push({ name: h.name, usd });
  }

  return { total, positions };
}

function toNum(x: unknown): number {
  if (x == null) return 0;
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string") return parseFloat(x) || 0;
  return 0;
}

function firstPositive(obj: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    const v = toNum(obj[key]);
    if (v > 0) return v;
  }
  return 0;
}

async function fetchMeteoraPositionsViaShyft(
  wallet: string,
  shyftKey: string
): Promise<{ total: number; positions: { name: string; usd: number }[] }> {
  // Usa variáveis GraphQL para evitar injecção — nunca interpola o endereço na query
  const query = `query GetMeteoraPositions($owner: String!) {
    meteora_dlmm_Position(where:{owner:{_eq:$owner}}){pubkey id lbPair}
    meteora_dlmm_PositionV2(where:{owner:{_eq:$owner}}){pubkey id lbPair}
  }`;
  const res = await fetch(
    `${SHYFT_GRAPHQL}?api_key=${encodeURIComponent(shyftKey)}&network=mainnet-beta`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables: { owner: wallet } }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    }
  );
  if (!res.ok) return { total: 0, positions: [] };
  const json = (await res.json()) as { data?: { meteora_dlmm_Position?: Array<{ pubkey?: string; id?: string; lbPair?: string }>; meteora_dlmm_PositionV2?: Array<{ pubkey?: string; id?: string; lbPair?: string }> }; errors?: unknown[] };
  if (json.errors?.length || !json.data) return { total: 0, positions: [] };
  const positions: Array<{ pubkey: string; version: "v1" | "v2"; lbPair?: string }> = [];
  for (const p of json.data.meteora_dlmm_Position ?? []) {
    const addr = p.pubkey ?? p.id ?? "";
    if (addr) positions.push({ pubkey: addr, version: "v1", lbPair: p.lbPair });
  }
  for (const p of json.data.meteora_dlmm_PositionV2 ?? []) {
    const addr = p.pubkey ?? p.id ?? "";
    if (addr) positions.push({ pubkey: addr, version: "v2", lbPair: p.lbPair });
  }
  if (positions.length === 0) return { total: 0, positions: [] };
  let totalUsd = 0;
  for (const pos of positions) {
    try {
      const primary = pos.version === "v2" ? "position_v2" : "position";
      const secondary = pos.version === "v2" ? "position" : "position_v2";
      const [posRes, depRes, wdRes] = await Promise.all([
        fetch(`${METEORA_API}/${primary}/${pos.pubkey}`, { cache: "no-store" }),
        fetch(`${METEORA_API}/${primary}/${pos.pubkey}/deposits`, { cache: "no-store" }),
        fetch(`${METEORA_API}/${primary}/${pos.pubkey}/withdraws`, { cache: "no-store" }),
      ]);
      let posVal = 0;
      if (posRes.ok) {
        const posJson = (await posRes.json()) as Record<string, unknown>;
        const nested = (posJson.data as Record<string, unknown> | undefined) ?? {};
        posVal =
          firstPositive(posJson, [
            "liquidity_usd",
            "liquidityUsd",
            "position_value_usd",
            "positionValueUsd",
            "total_value_usd",
            "totalValueUsd",
          ]) ||
          firstPositive(nested, [
            "liquidity_usd",
            "liquidityUsd",
            "position_value_usd",
            "positionValueUsd",
            "total_value_usd",
            "totalValueUsd",
          ]);
      }
      let depJson: unknown = [];
      let wdJson: unknown = [];
      if (depRes.ok && wdRes.ok) {
        depJson = await depRes.json();
        wdJson = await wdRes.json();
      } else {
        // Algumas posições retornam dados apenas no endpoint alternativo (v1/v2).
        const [depAltRes, wdAltRes] = await Promise.all([
          fetch(`${METEORA_API}/${secondary}/${pos.pubkey}/deposits`, { cache: "no-store" }),
          fetch(`${METEORA_API}/${secondary}/${pos.pubkey}/withdraws`, { cache: "no-store" }),
        ]);
        if (depAltRes.ok && wdAltRes.ok) {
          depJson = await depAltRes.json();
          wdJson = await wdAltRes.json();
        }
      }
      const isErr = (x: unknown) => x != null && typeof x === "object" && ("error" in x || "message" in x);
      const deposits = isErr(depJson) ? [] : Array.isArray(depJson) ? depJson : [];
      const withdraws = isErr(wdJson) ? [] : Array.isArray(wdJson) ? wdJson : [];
      const usdFrom = (d: Record<string, unknown>) =>
        firstPositive(d, [
          "token_x_usd_amount",
          "tokenXUsdAmount",
          "token_x_value_usd",
          "tokenXValueUsd",
          "token_x_usd",
          "tokenXUsd",
        ]) +
        firstPositive(d, [
          "token_y_usd_amount",
          "tokenYUsdAmount",
          "token_y_value_usd",
          "tokenYValueUsd",
          "token_y_usd",
          "tokenYUsd",
        ]);
      const depUsd = deposits.reduce((s: number, d) => s + usdFrom(d as Record<string, unknown>), 0);
      const wdUsd = withdraws.reduce((s: number, w) => s + usdFrom(w as Record<string, unknown>), 0);
      const net = depUsd - wdUsd;
      const final = posVal > 0 ? posVal : net;
      if (final > 0) totalUsd += final;
    } catch {
      /* skip */
    }
  }
  if (totalUsd <= 0) {
    // Fallback final: soma fees/rewards já reclamados por par da Meteora.
    const pairs = [...new Set(positions.map((p) => p.lbPair).filter((x): x is string => !!x))];
    let earnedUsd = 0;
    for (const pair of pairs) {
      try {
        const res = await fetch(
          `${METEORA_API}/wallet/${encodeURIComponent(wallet)}/${encodeURIComponent(pair)}/earning`,
          { cache: "no-store" }
        );
        if (!res.ok) continue;
        const data = (await res.json()) as Array<Record<string, unknown>> | Record<string, unknown>;
        const rows = Array.isArray(data) ? data : [data];
        for (const row of rows) {
          earnedUsd +=
            firstPositive(row, ["total_fee_usd_claimed", "totalFeeUsdClaimed"]) +
            firstPositive(row, ["total_reward_usd_claimed", "totalRewardUsdClaimed"]);
        }
      } catch {
        continue;
      }
    }
    if (earnedUsd > 0) totalUsd = earnedUsd;
  }
  return totalUsd > 0 ? { total: totalUsd, positions: [{ name: "Meteora", usd: totalUsd }] } : { total: 0, positions: [] };
}

const EVM_L2_CHAINS = ["arbitrum", "base", "optimism", "polygon", "bsc", "avalanche", "linea", "zksync"] as const;
type EvmL2Chain = typeof EVM_L2_CHAINS[number];

// ── Uniswap V3 subgraph endpoints per chain ──────────────────────────────────
const UNISWAP_V3_SUBGRAPHS: Partial<Record<EvmL2Chain | "eth", string>> = {
  eth:       "https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3",
  arbitrum:  "https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3-arbitrum",
  optimism:  "https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3-optimism",
  base:      "https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3-base",
  polygon:   "https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3-polygon",
};

function sqrtX96toFloat(sqrtPriceX96: string): number {
  const val = BigInt(sqrtPriceX96);
  const Q96 = BigInt(2) ** BigInt(96);
  return Number(val / Q96) + Number(val % Q96) / Number(Q96);
}

function tickToSqrt(tick: number): number {
  return Math.sqrt(Math.pow(1.0001, tick));
}

function calcUniV3Amounts(
  liquidity: string,
  sqrtPriceX96: string,
  tickLower: number,
  tickUpper: number,
  decimals0: number,
  decimals1: number
): { amount0: number; amount1: number } {
  const L = parseFloat(liquidity);
  if (!L || !isFinite(L)) return { amount0: 0, amount1: 0 };
  const sqrtC = sqrtX96toFloat(sqrtPriceX96);
  const sqrtA = tickToSqrt(tickLower);
  const sqrtB = tickToSqrt(tickUpper);
  let raw0 = 0, raw1 = 0;
  if (sqrtC <= sqrtA) {
    raw0 = L * (sqrtB - sqrtA) / (sqrtA * sqrtB);
  } else if (sqrtC >= sqrtB) {
    raw1 = L * (sqrtB - sqrtA);
  } else {
    raw0 = L * (sqrtB - sqrtC) / (sqrtC * sqrtB);
    raw1 = L * (sqrtC - sqrtA);
  }
  return {
    amount0: raw0 / 10 ** decimals0,
    amount1: raw1 / 10 ** decimals1,
  };
}

interface UniV3Position {
  id: string;
  liquidity: string;
  tickLower: { tickIdx: string };
  tickUpper: { tickIdx: string };
  token0: { symbol: string; decimals: string; derivedETH: string };
  token1: { symbol: string; decimals: string; derivedETH: string };
  pool: { sqrtPrice: string };
}

async function fetchUniswapV3Total(address: string, subgraphUrl: string): Promise<{ total: number; positions: { name: string; usd: number }[] }> {
  const query = `{
    positions(where:{owner:"${address.toLowerCase()}",liquidity_gt:"0"},first:50) {
      id liquidity
      tickLower{tickIdx} tickUpper{tickIdx}
      token0{symbol decimals derivedETH}
      token1{symbol decimals derivedETH}
      pool{sqrtPrice}
    }
    bundle(id:"1"){ethPriceUSD}
  }`;
  const res = await fetch(subgraphUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
    next: { revalidate: 60 },
  });
  if (!res.ok) return { total: 0, positions: [] };
  const json = (await res.json()) as { data?: { positions?: UniV3Position[]; bundle?: { ethPriceUSD: string } } };
  const ethUSD = parseFloat(json.data?.bundle?.ethPriceUSD ?? "0");
  const posArr = json.data?.positions ?? [];
  let total = 0;
  const positions: { name: string; usd: number }[] = [];
  for (const p of posArr) {
    const { amount0, amount1 } = calcUniV3Amounts(
      p.liquidity, p.pool.sqrtPrice,
      parseInt(p.tickLower.tickIdx), parseInt(p.tickUpper.tickIdx),
      parseInt(p.token0.decimals), parseInt(p.token1.decimals)
    );
    const price0 = parseFloat(p.token0.derivedETH) * ethUSD;
    const price1 = parseFloat(p.token1.derivedETH) * ethUSD;
    const usd = amount0 * price0 + amount1 * price1;
    if (usd > 0.01) {
      total += usd;
      positions.push({ name: `Uniswap V3 ${p.token0.symbol}/${p.token1.symbol}`, usd });
    }
  }
  return { total, positions };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");
  const chain = (searchParams.get("chain") ?? "eth") as ChainId;
  const evmChain = searchParams.get("evmChain") as EvmL2Chain | null;

  if (!address?.trim()) {
    return NextResponse.json({ error: "Endereço obrigatório." }, { status: 400 });
  }

  // Handle specific EVM L2 chains (arbitrum, base, optimism, etc.)
  if (evmChain && EVM_L2_CHAINS.includes(evmChain) && isEvmAddress(address)) {
    const moralisKey = process.env.MORALIS_API_KEY;
    let moralisTotal = 0;
    let moralisPositions: { name: string; usd: number }[] = [];

    // Try Moralis first
    if (moralisKey) {
      try {
        const res = await fetch(`${MORALIS_DEFI}/${address}/defi/summary?chain=${evmChain}`, {
          headers: { Accept: "application/json", "X-API-Key": moralisKey },
          next: { revalidate: 120 },
        });
        if (res.ok) {
          const data = (await res.json()) as MoralisDefiSummary;
          moralisTotal = Math.max(0, Number(data.total_usd_value ?? 0) || 0);
          moralisPositions = (data.protocols ?? [])
            .filter((p) => Number(p.total_usd_value ?? 0) > 0)
            .map((p) => ({ name: resolveProtocolName(p), usd: Number(p.total_usd_value ?? 0) }));
        }
      } catch { /* fallthrough to Uniswap subgraph */ }
    }

    // Fallback: Uniswap V3 subgraph (catches LP positions Moralis misses)
    const subgraphUrl = UNISWAP_V3_SUBGRAPHS[evmChain];
    if (subgraphUrl) {
      try {
        const uniData = await fetchUniswapV3Total(address, subgraphUrl);
        // Merge: avoid double-counting if Moralis already detected Uniswap
        const hasUniswapInMoralis = moralisPositions.some(p => p.name.toLowerCase().includes("uniswap"));
        if (!hasUniswapInMoralis && uniData.total > 0) {
          moralisTotal += uniData.total;
          moralisPositions.push(...uniData.positions);
        }
      } catch { /* subgraph unavailable, use Moralis result */ }
    }

    return NextResponse.json({ total: moralisTotal, positions: moralisPositions });
  }

  if (!["eth", "sol", "btc", "ada"].includes(chain)) {
    return NextResponse.json({ error: "Chain inválida. Use eth, sol, btc ou ada." }, { status: 400 });
  }

  if (!validateAddressForChain(address.trim(), chain)) {
    return NextResponse.json(
      { error: `Endereço inválido para ${chain}.` },
      { status: 400 }
    );
  }

  // Moralis não suporta Bitcoin nem Cardano
  if (chain === "btc" || chain === "ada") {
    return NextResponse.json({ total: 0, positions: [] });
  }

  const moralisKey = process.env.MORALIS_API_KEY;

  // Moralis: DeFi em chains EVM (reduzido para evitar limite de créditos)
  if (moralisKey && chain === "eth" && isEvmAddress(address)) {
    const evmChains = ["eth", "polygon", "arbitrum"] as const;
    const results = await Promise.allSettled(
      evmChains.map((c) =>
        fetch(`${MORALIS_DEFI}/${address}/defi/summary?chain=${c}`, {
          headers: { Accept: "application/json", "X-API-Key": moralisKey },
          next: { revalidate: 120 },
        }).then((r) => (r.ok ? r.json() : null))
      )
    );
    let total = 0;
    const positions: { name: string; usd: number }[] = [];
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) {
        const data = r.value as MoralisDefiSummary;
        const v = Math.max(0, Number(data.total_usd_value ?? 0) || 0);
        total += v;
        (data.protocols ?? [])
          .filter((p) => Number(p.total_usd_value ?? 0) > 0)
          .forEach((p) => positions.push({ name: resolveProtocolName(p), usd: Number(p.total_usd_value ?? 0) }));
      }
    }
    if (total > 0 || results.some((r) => r.status === "fulfilled" && r.value))
      return NextResponse.json({ total, positions });
  }

  const shyftKey = process.env.SHYFT_API_KEY;

  // Solana: tenta SHYFT/Meteora se disponível, senão usa token accounts públicos
  if (chain === "sol" && isSolAddress(address)) {
    if (shyftKey) {
      try {
        const meteoraResult = await fetchMeteoraPositionsViaShyft(address.trim(), shyftKey);
        if (meteoraResult.total > 0) {
          return NextResponse.json({ total: meteoraResult.total, positions: meteoraResult.positions });
        }
      } catch { /* fallthrough to token-based detection */ }
    }
    // Fallback 1: Meteora DLMM positions via public RPC getProgramAccounts
    // Fallback 2: known protocol token holdings (mSOL, stSOL, JLP, etc.)
    // Fallback 3: native SOL staking accounts
    try {
      const [meteoraResult, tokenResult, stakeResult] = await Promise.allSettled([
        fetchMeteoraPositionsViaRPC(address.trim()),
        fetchSolanaDefiFromTokenAccounts(address.trim()),
        fetchSolanaStakeAccounts(address.trim()),
      ]);
      const meteora = meteoraResult.status === "fulfilled" ? meteoraResult.value : { total: 0, positions: [] };
      const tokenData = tokenResult.status === "fulfilled" ? tokenResult.value : { total: 0, positions: [] };
      const stakeData = stakeResult.status === "fulfilled" ? stakeResult.value : { total: 0, positions: [] };
      const total = meteora.total + tokenData.total + stakeData.total;
      const positions = [...meteora.positions, ...tokenData.positions, ...stakeData.positions];
      return NextResponse.json({ total, positions });
    } catch {
      return NextResponse.json({ total: 0, positions: [] });
    }
  }

  const urls: { url: string; headers: HeadersInit }[] = [];
  if (moralisKey && chain === "eth") {
    urls.push({
      url: `${MORALIS_DEFI}/${address}/defi/summary?chain=eth`,
      headers: { Accept: "application/json", "X-API-Key": moralisKey },
    });
  }
  // ETH DeFi: Moralis.

  let lastError: string | null = null;

  for (const { url, headers } of urls) {
    try {
      const res = await fetch(url, { headers, next: { revalidate: 120 } });
      const raw = await res.text();

      if (!res.ok) {
        let errMsg: string | null = null;
        try {
          const parsed = JSON.parse(raw) as { error?: string; message?: string };
          errMsg = parsed?.error ?? parsed?.message ?? null;
        } catch {
          // ignore
        }
        const isMoralis = url.includes("moralis.io");
        if (res.status === 401)
          lastError = isMoralis
            ? "Chave Moralis inválida. Verifica em admin.moralis.io."
            : lastError;
        else if (res.status === 403)
          lastError = isMoralis
            ? "Limite de créditos Moralis excedido. Tenta novamente mais tarde."
            : lastError;
        else if (res.status === 429) lastError = "Muitos pedidos. Espera um momento e tenta novamente.";
        else if (errMsg) lastError = errMsg;
        continue;
      }

      const isMoralisUrl = url.includes("moralis.io");
      if (isMoralisUrl) {
        try {
          const data = JSON.parse(raw) as MoralisDefiSummary & {
            native_balance?: { usd_value?: string | number; solana?: string };
            tokens?: Array<{ usd_value?: string | number; value?: number; amount?: string; price?: number }>;
          };
          let total = Math.max(0, Number(data.total_usd_value ?? 0) || 0);
          if (total <= 0 && data.native_balance?.usd_value)
            total += Number(data.native_balance.usd_value) || 0;
          if (total <= 0 && data.tokens?.length) {
            const tokenSum = (data.tokens as Array<{
              usd_value?: string | number;
              value?: number;
              amount?: string;
              price?: number;
            }>).reduce((s, t) => {
              const v = Number(t.usd_value ?? t.value ?? 0);
              if (v > 0) return s + v;
              const amt = Number(t.amount ?? 0);
              const pr = Number(t.price ?? 0);
              return s + (amt * pr || 0);
            }, 0);
            total += tokenSum;
          }
          const positions =
            data.protocols
              ?.filter((p) => Number(p.total_usd_value ?? 0) > 0)
              .map((p) => ({ name: resolveProtocolName(p as MoralisProtocol), usd: Number(p.total_usd_value ?? 0) })) ?? [];
          return NextResponse.json({ total: Math.max(0, total), positions });
        } catch {
          continue;
        }
      }

      continue;
    } catch {
      continue;
    }
  }

  const hasAnyKey = moralisKey || shyftKey;
  let fallbackMsg = hasAnyKey
    ? lastError ?? "Falha ao consultar DeFi."
    : "Para DeFi Solana: SHYFT_API_KEY (shyft.to/get-api-key). Para ETH: MORALIS_API_KEY.";

  return NextResponse.json(
    { error: fallbackMsg, total: null, positions: [] },
    { status: 503 }
  );
}
