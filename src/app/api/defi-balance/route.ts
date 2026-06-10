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
    const body2 = { ...body, params: [METEORA_DLMM_PROGRAM, { ...(body.params[1] as object), filters: [{ memcmp: { offset: 8, bytes: wallet } }] }] };
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

// ── Uniswap V3 + V4 via contracts ────────────────────────────────────────────
const UNI_V3_NPM    = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88"; // V3 NonfungiblePositionManager (all chains)
const UNI_V3_FACTORY = "0x1F98431c8aD98523631AE4a59f267346ea31F984"; // V3 Factory (all chains)

// V4 PositionManager addresses (chain-specific, from @uniswap/sdk-core)
const UNI_V4_NPM: Record<string, string> = {
  eth:      "0xbd216513d74c8cf14cf4747e6aaa6420ff64ee9e",
  arbitrum: "0xd88f38f930b7952f2db2432cb002e7abbf3dd869",
  base:     "0x7c5f5a4bbd8fd63184577525326123b519429bdc",
  optimism: "0x3c3ea4b57a46241e54610e5f022e5c45859a1017",
  polygon:  "0x1ec2ebf4f37e7363fdfe3551602425af0b3ceef9",
};

const EVM_RPC: Record<string, string> = {
  eth:      "https://cloudflare-eth.com",
  arbitrum: "https://arb1.arbitrum.io/rpc",
  base:     "https://mainnet.base.org",
  optimism: "https://mainnet.optimism.io",
  polygon:  "https://polygon-rpc.com",
  bsc:      "https://bsc-dataseed1.binance.org",
};
const EVM_RPC_FALLBACK: Record<string, string> = {
  eth:      "https://rpc.ankr.com/eth",
  arbitrum: "https://rpc.ankr.com/arbitrum",
  base:     "https://rpc.ankr.com/base",
  optimism: "https://rpc.ankr.com/optimism",
};

const CHAINLINK_ETH_USD: Record<string, string> = {
  eth:      "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
  arbitrum: "0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612",
  base:     "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70",
  optimism: "0x13e3Ee699D1909E989722E753853AE30b17e08c5",
  polygon:  "0xF9680D99D6C9589e2a93a78A04A279e509205945",
};

const CHAINLINK_BTC_USD: Record<string, string> = {
  eth:      "0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c",
  arbitrum: "0x6ce185539AD4EFd0E2F98F0E28F5ff84D0E87c37",
  base:     "0xCCADC697c55bbB68dc5bCdf8d3CBe83CdD4E071E",
  optimism: "0xD702DD976Fb76Fffc2D3963D037dfDae5b04E593",
  polygon:  "0xc907E116054Ad103354f2D350FD2514433D57F6f",
};

const WETH_ADDR: Record<string, string> = {
  eth:      "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
  arbitrum: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
  base:     "0x4200000000000000000000000000000000000006",
  optimism: "0x4200000000000000000000000000000000000006",
  polygon:  "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619",
};

const WBTC_ADDR: Record<string, string> = {
  eth:      "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599",
  arbitrum: "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f",
  base:     "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf",
  optimism: "0x68f180fcce6836688e9084f035309e29bf0a2095",
  polygon:  "0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6",
};

const TOKEN_SYMBOLS: Record<string, string> = {
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": "WETH",
  "0x82af49447d8a07e3bd95bd0d56f35241523fbab1": "WETH",
  "0x4200000000000000000000000000000000000006": "WETH",
  "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619": "WETH",
  "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599": "WBTC",
  "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f": "WBTC",
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": "USDC",
  "0xaf88d065e77c8cc2239327c5edb3a432268e5831": "USDC",
  "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8": "USDC.e",
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": "USDC",
  "0x7f5c764cbc14f9669b88837ca1490cca17c31607": "USDC.e",
  "0x0b2c639c533813f4aa9d7837caf62653d097ff85": "USDC",
  "0x2791bca1f2de4661ed88a30c99a7a9449aa84174": "USDC.e",
  "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359": "USDC",
  "0xdac17f958d2ee523a2206206994597c13d831ec7": "USDT",
  "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9": "USDT",
  "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58": "USDT",
  "0xc2132d05d31c914a87c6611c10748aeb04b58e8f": "USDT",
  "0x6b175474e89094c44da98b954eedeac495271d0f": "DAI",
  "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1": "DAI",
  "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063": "DAI",
};

const STABLECOINS = new Set([
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48","0xaf88d065e77c8cc2239327c5edb3a432268e5831",
  "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8","0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  "0x7f5c764cbc14f9669b88837ca1490cca17c31607","0x0b2c639c533813f4aa9d7837caf62653d097ff85",
  "0x2791bca1f2de4661ed88a30c99a7a9449aa84174","0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
  "0xdac17f958d2ee523a2206206994597c13d831ec7","0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9",
  "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58","0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
  "0x6b175474e89094c44da98b954eedeac495271d0f","0xda10009cbd5d07dd0cecc66161fc93d7c9000da1",
  "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063","0x50c5725949a6f0c72e6c4a641f24049a917db0cb",
]);

async function ethCallRpc(rpc: string, to: string, data: string): Promise<string> {
  try {
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) return "0x";
    const json = await res.json() as { result?: string };
    return json.result ?? "0x";
  } catch { return "0x"; }
}

async function chainlinkPrice(rpc: string, feed: string): Promise<number> {
  const r = await ethCallRpc(rpc, feed, "0xfeaf968c"); // latestRoundData()
  if (r === "0x" || r.length < 130) return 0;
  return Number(BigInt("0x" + r.slice(66, 130))) / 1e8; // answer at offset 32
}

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
  return { amount0: raw0 / 10 ** decimals0, amount1: raw1 / 10 ** decimals1 };
}

function decodeInt24(hex64: string): number {
  // int24 is stored in last 3 bytes (6 hex chars) of the 32-byte ABI slot
  const raw = parseInt(hex64.slice(-6), 16);
  return raw >= 0x800000 ? raw - 0x1000000 : raw;
}


// ── Uniswap V2 LP positions via direct contract calls ──────────────────────
const UNI_V2_FACTORY: Record<string, string> = {
  eth:      "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
  arbitrum: "0xf1D7CC64Fb4452F05c498126312eBE29f30Fbcf9",
  base:     "0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6",
  polygon:  "0x9e5A52f57b3038F1B8EeE45F28b3C1967e22799C",
  optimism: "0x0c3c1c532F1e39EdF36BE9Fe0bE1410313E074Bf",
};

async function fetchUniswapV2ViaContracts(
  address: string,
  chain: string,
  ethPrice: number
): Promise<{ total: number; positions: { name: string; usd: number }[] }> {
  const factory = UNI_V2_FACTORY[chain];
  const rpc = EVM_RPC[chain];
  if (!factory || !rpc || ethPrice === 0) return { total: 0, positions: [] };

  const weth = (WETH_ADDR[chain] ?? "").toLowerCase();
  const stables = [...STABLECOINS];
  // Check LP positions for common WETH+stable pairs + top pairs
  const commonTokens = [
    ...stables.slice(0, 3), // USDC, USDT, DAI
    (WBTC_ADDR[chain] ?? "").toLowerCase(),
  ].filter(t => t && t !== "0x");

  const pairCalls = commonTokens.map(async (tok) => {
    if (!tok || tok.length < 10) return null;
    // getPair(weth, tok) selector: 0xe6a43905
    const t0 = weth.slice(2).padStart(64, "0");
    const t1 = tok.slice(2).padStart(64, "0");
    const pairHex = await ethCallRpc(rpc, factory, `0xe6a43905${t0}${t1}`);
    if (pairHex === "0x" || pairHex === "0x" + "0".repeat(64)) return null;
    const pair = "0x" + pairHex.slice(-40);
    if (pair === "0x0000000000000000000000000000000000000000") return null;

    const paddedOwner = address.toLowerCase().slice(2).padStart(64, "0");
    const [lpBalHex, totalSupplyHex, reservesHex] = await Promise.all([
      ethCallRpc(rpc, pair, `0x70a08231${paddedOwner}`),
      ethCallRpc(rpc, pair, "0x18160ddd"),
      ethCallRpc(rpc, pair, "0x0902f1ac"),
    ]);
    if (lpBalHex === "0x" || totalSupplyHex === "0x" || reservesHex === "0x") return null;

    const lpBal = BigInt("0x" + lpBalHex.slice(2));
    if (lpBal === BigInt(0)) return null;

    const totalSupply = BigInt("0x" + totalSupplyHex.slice(2));
    if (totalSupply === BigInt(0)) return null;

    const r = reservesHex.slice(2);
    const reserve0 = BigInt("0x" + r.slice(0, 64));
    const reserve1 = BigInt("0x" + r.slice(64, 128));

    // ETH share in the pool
    const share = Number(lpBal) / Number(totalSupply);
    const wethReserve = Number(reserve0) / 1e18; // assume WETH is token0 (order may differ)
    const ethValue = wethReserve * share * ethPrice * 2; // ×2 = both sides
    if (ethValue < 0.01) return null;

    const symMap: Record<string, string> = { ...TOKEN_SYMBOLS };
    const sym = symMap[tok] ?? tok.slice(0, 6) + "…";
    return { name: `Uniswap V2 WETH/${sym}`, usd: ethValue };
  });

  const results = await Promise.all(pairCalls);
  const positions = results.filter((p): p is { name: string; usd: number } => p !== null);
  const total = positions.reduce((s, p) => s + p.usd, 0);
  return { total, positions };
}

async function fetchUniswapV3ViaContracts(
  address: string,
  chain: string
): Promise<{ total: number; positions: { name: string; usd: number }[] }> {
  const primaryRpc = EVM_RPC[chain];
  if (!primaryRpc) return { total: 0, positions: [] };

  const paddedOwner = address.toLowerCase().slice(2).padStart(64, "0");

  // 1. balanceOf — try primary RPC, fallback on failure
  let balHex = await ethCallRpc(primaryRpc, UNI_V3_NPM, `0x70a08231${paddedOwner}`);
  const rpc = (balHex === "0x" && EVM_RPC_FALLBACK[chain])
    ? EVM_RPC_FALLBACK[chain]
    : primaryRpc;
  if (balHex === "0x" && rpc !== primaryRpc) {
    balHex = await ethCallRpc(rpc, UNI_V3_NPM, `0x70a08231${paddedOwner}`);
  }
  if (balHex === "0x") return { total: 0, positions: [] };
  const balance = Number(BigInt("0x" + balHex.slice(2)));
  if (balance === 0 || balance > 100) return { total: 0, positions: [] };
  const cap = Math.min(balance, 30);

  // 2. tokenIds + ethPrice — all parallel
  const [tokenIdResults, ethPrice] = await Promise.all([
    Promise.all(Array.from({ length: cap }, (_, i) => {
      const idx = BigInt(i).toString(16).padStart(64, "0");
      return ethCallRpc(rpc, UNI_V3_NPM, `0x2f745c59${paddedOwner}${idx}`);
    })),
    (async () => { const f = CHAINLINK_ETH_USD[chain]; return f ? chainlinkPrice(rpc, f) : 0; })(),
  ]);

  const tokenIds = tokenIdResults
    .map(r => r !== "0x" ? BigInt("0x" + r.slice(2)) : null)
    .filter((id): id is bigint => id !== null);
  if (tokenIds.length === 0) return { total: 0, positions: [] };

  // 3. positions data — all parallel
  const posData = await Promise.all(
    tokenIds.map(id => ethCallRpc(rpc, UNI_V3_NPM, `0x99fbab88${id.toString(16).padStart(64, "0")}`))
  );

  // 4. Decode positions, collect unique tokens and pool keys
  type Decoded = { token0: string; token1: string; fee: number; tickLower: number; tickUpper: number; liquidity: bigint; owed0: bigint; owed1: bigint };
  const decoded: Decoded[] = [];
  const uniqueTokens = new Set<string>();
  const uniquePools  = new Set<string>();

  for (const raw of posData) {
    if (raw === "0x" || raw.length < 2 + 12 * 64) continue;
    const d = raw.slice(2);
    // ABI fields (32 bytes = 64 hex chars each):
    // nonce(0) operator(64) token0(128) token1(192) fee(256)
    // tickLower(320) tickUpper(384) liquidity(448)
    // feeGrowth0(512) feeGrowth1(576) tokensOwed0(640) tokensOwed1(704)
    const token0    = ("0x" + d.slice(152, 192)).toLowerCase();
    const token1    = ("0x" + d.slice(216, 256)).toLowerCase();
    const fee       = Number(BigInt("0x" + d.slice(256, 320)));
    const tickLower = decodeInt24(d.slice(320, 384));
    const tickUpper = decodeInt24(d.slice(384, 448));
    const liquidity = BigInt("0x" + d.slice(448, 512));
    const owed0     = d.length >= 768 ? BigInt("0x" + d.slice(640, 704)) : BigInt(0);
    const owed1     = d.length >= 768 ? BigInt("0x" + d.slice(704, 768)) : BigInt(0);
    // Skip only if truly empty (no liquidity AND no unclaimed fees)
    if (liquidity === BigInt(0) && owed0 === BigInt(0) && owed1 === BigInt(0)) continue;
    decoded.push({ token0, token1, fee, tickLower, tickUpper, liquidity, owed0, owed1 });
    uniqueTokens.add(token0);
    uniqueTokens.add(token1);
    if (liquidity > BigInt(0)) uniquePools.add(`${token0}:${token1}:${fee}`);
  }
  if (decoded.length === 0) return { total: 0, positions: [] };

  // 5. All decimals + all pool sqrtPrices — fully parallel
  const decimalsMap = new Map<string, number>();
  const sqrtMap     = new Map<string, string>();

  const needsBtc = decoded.some(p => p.token0 === (WBTC_ADDR[chain] ?? "x").toLowerCase() || p.token1 === (WBTC_ADDR[chain] ?? "x").toLowerCase());

  await Promise.all([
    ...[...uniqueTokens].map(async (tok) => {
      const r = await ethCallRpc(rpc, tok, "0x313ce567");
      decimalsMap.set(tok, r === "0x" ? 18 : Number(BigInt("0x" + r.slice(2, 66))));
    }),
    ...[...uniquePools].map(async (pk) => {
      const [t0, t1, fs] = pk.split(":");
      const poolHex = await ethCallRpc(rpc, UNI_V3_FACTORY,
        `0x1698ee82${t0.slice(2).padStart(64,"0")}${t1.slice(2).padStart(64,"0")}${parseInt(fs).toString(16).padStart(64,"0")}`);
      if (poolHex === "0x") return;
      const slot0 = await ethCallRpc(rpc, "0x" + poolHex.slice(26), "0x3850c7bd");
      if (slot0 !== "0x") sqrtMap.set(pk, slot0.slice(2, 66));
    }),
    needsBtc
      ? (async () => { const f = CHAINLINK_BTC_USD[chain]; if (f) { /* fetched later */ } })()
      : Promise.resolve(),
  ]);

  let btcPrice = 0;
  if (needsBtc) {
    const f = CHAINLINK_BTC_USD[chain];
    if (f) btcPrice = await chainlinkPrice(rpc, f);
  }

  // 6. Compute USD values
  const wethAddr = (WETH_ADDR[chain] ?? "").toLowerCase();
  const wbtcAddr = (WBTC_ADDR[chain] ?? "").toLowerCase();
  let total = 0;
  const positions: { name: string; usd: number }[] = [];

  for (const p of decoded) {
    const dec0 = decimalsMap.get(p.token0) ?? 18;
    const dec1 = decimalsMap.get(p.token1) ?? 18;
    const price0 = STABLECOINS.has(p.token0) ? 1 : p.token0 === wethAddr ? ethPrice : p.token0 === wbtcAddr ? btcPrice : 0;
    const price1 = STABLECOINS.has(p.token1) ? 1 : p.token1 === wethAddr ? ethPrice : p.token1 === wbtcAddr ? btcPrice : 0;

    // Active liquidity value
    let usd = 0;
    const sqrtHex = sqrtMap.get(`${p.token0}:${p.token1}:${p.fee}`);
    if (sqrtHex && p.liquidity > BigInt(0)) {
      const { amount0, amount1 } = calcUniV3Amounts(
        p.liquidity.toString(), "0x" + sqrtHex, p.tickLower, p.tickUpper, dec0, dec1
      );
      const liqUsd = amount0 * price0 + amount1 * price1;
      const liqUsdAdj = price0 > 0 && price1 === 0 && amount1 < 0.001 ? amount0 * price0 * 2
        : price1 > 0 && price0 === 0 && amount0 < 0.001 ? amount1 * price1 * 2
        : liqUsd;
      usd += liqUsdAdj;
    }

    // Unclaimed fees (tokensOwed) — value even on closed positions
    if (p.owed0 > BigInt(0) || p.owed1 > BigInt(0)) {
      const fee0 = Number(p.owed0) / Math.pow(10, dec0);
      const fee1 = Number(p.owed1) / Math.pow(10, dec1);
      usd += fee0 * price0 + fee1 * price1;
    }

    if (usd < 0.01) continue;
    const sym0 = TOKEN_SYMBOLS[p.token0] ?? p.token0.slice(0, 8) + "…";
    const sym1 = TOKEN_SYMBOLS[p.token1] ?? p.token1.slice(0, 8) + "…";
    total += usd;
    positions.push({ name: `Uniswap V3 ${sym0}/${sym1}`, usd });
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

    // Fallback: Uniswap V2+V3 via direct contract calls (no external API needed)
    const hasUniswapInMoralis = moralisPositions.some(p => p.name.toLowerCase().includes("uniswap"));
    if (!hasUniswapInMoralis) {
      const ethPriceLocal = await (async () => {
        const f = CHAINLINK_ETH_USD[evmChain];
        const r = EVM_RPC[evmChain];
        return f && r ? chainlinkPrice(r, f) : 0;
      })().catch(() => 0);
      const [v3Data, v2Data] = await Promise.allSettled([
        fetchUniswapV3ViaContracts(address, evmChain),
        fetchUniswapV2ViaContracts(address, evmChain, ethPriceLocal),
      ]);
      if (v3Data.status === "fulfilled" && v3Data.value.total > 0) {
        moralisTotal += v3Data.value.total;
        moralisPositions.push(...v3Data.value.positions);
      }
      if (v2Data.status === "fulfilled" && v2Data.value.total > 0) {
        moralisTotal += v2Data.value.total;
        moralisPositions.push(...v2Data.value.positions);
      }
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
    // Fallback: Uniswap V2+V3 contracts for chains Moralis may miss
    const uniChains = ["eth", "arbitrum", "base", "optimism", "polygon"] as const;
    const hasUniswapInMoralis = positions.some(p => p.name.toLowerCase().includes("uniswap"));
    if (!hasUniswapInMoralis) {
      for (const uc of uniChains) {
        try {
          const ethPriceLocal = await (async () => {
            const f = CHAINLINK_ETH_USD[uc]; const r = EVM_RPC[uc];
            return f && r ? chainlinkPrice(r, f) : 0;
          })().catch(() => 0);
          const [v3, v2] = await Promise.allSettled([
            fetchUniswapV3ViaContracts(address, uc),
            fetchUniswapV2ViaContracts(address, uc, ethPriceLocal),
          ]);
          const v3ok = v3.status === "fulfilled" && v3.value.total > 0;
          const v2ok = v2.status === "fulfilled" && v2.value.total > 0;
          if (v3ok) { total += v3.value.total; positions.push(...v3.value.positions); }
          if (v2ok) { total += v2.value.total; positions.push(...v2.value.positions); }
          if (v3ok || v2ok) break;
        } catch { /* skip chain */ }
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
