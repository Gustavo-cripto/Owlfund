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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");
  const chain = (searchParams.get("chain") ?? "eth") as ChainId;

  if (!address?.trim()) {
    return NextResponse.json({ error: "Endereço obrigatório." }, { status: 400 });
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

  // Solana: fonte única de DeFi = SHYFT (Meteora DLMM)
  if (chain === "sol" && isSolAddress(address)) {
    if (!shyftKey) {
      return NextResponse.json(
        { error: "Configura SHYFT_API_KEY para consultar DeFi Solana (Meteora).", total: null, positions: [] },
        { status: 503 }
      );
    }
    try {
      const meteoraResult = await fetchMeteoraPositionsViaShyft(address.trim(), shyftKey);
      return NextResponse.json({ total: meteoraResult.total, positions: meteoraResult.positions });
    } catch {
      return NextResponse.json(
        { error: "Falha ao consultar SHYFT/Meteora.", total: null, positions: [] },
        { status: 503 }
      );
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

  // Sem posições DeFi: retorna 0. O saldo da carteira vai em "Saldo"/"Valor", não em DeFi.
  if (chain === "sol" && isSolAddress(address)) {
    return NextResponse.json({ total: 0, positions: [] });
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
