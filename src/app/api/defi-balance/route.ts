import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";

const MORALIS_DEFI = "https://deep-index.moralis.io/api/v2.2/wallets";
const RPC_SOL =
  (process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "").trim().startsWith("http")
    ? process.env.NEXT_PUBLIC_SOLANA_RPC_URL!
    : "https://solana.publicnode.com";

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

type MoralisDefiSummary = {
  total_usd_value?: string;
  protocols?: Array<{ total_usd_value?: string; positions?: string }>;
};

const SHYFT_GRAPHQL = "https://programs.shyft.to/v0/graphql/accounts";
const METEORA_API = "https://dlmm-api.meteora.ag";

async function fetchMeteoraPositionsViaShyft(
  wallet: string,
  shyftKey: string,
  jupiterKey?: string
): Promise<{ total: number; positions: { name: string; usd: number }[] }> {
  const query = `query { meteora_dlmm_Position(where:{owner:{_eq:"${wallet}"}}){pubkey id lbPair} meteora_dlmm_PositionV2(where:{owner:{_eq:"${wallet}"}}){pubkey id lbPair} }`;
  const res = await fetch(
    `${SHYFT_GRAPHQL}?api_key=${encodeURIComponent(shyftKey)}&network=mainnet-beta`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }), cache: "no-store" }
  );
  if (!res.ok) return { total: 0, positions: [] };
  const json = (await res.json()) as { data?: { meteora_dlmm_Position?: Array<{ pubkey?: string; id?: string; lbPair?: string }>; meteora_dlmm_PositionV2?: Array<{ pubkey?: string; id?: string; lbPair?: string }> }; errors?: unknown[] };
  if (json.errors?.length || !json.data) return { total: 0, positions: [] };
  const positions: Array<{ pubkey: string; lbPair: string }> = [];
  for (const p of [...(json.data.meteora_dlmm_Position ?? []), ...(json.data.meteora_dlmm_PositionV2 ?? [])]) {
    const addr = p.pubkey ?? p.id ?? "";
    if (addr && p.lbPair) positions.push({ pubkey: addr, lbPair: p.lbPair });
  }
  if (positions.length === 0) return { total: 0, positions: [] };
  let totalUsd = 0;
  for (const pos of positions) {
    try {
      const [depRes, wdRes] = await Promise.all([
        fetch(`${METEORA_API}/position/${pos.pubkey}/deposits`, { cache: "no-store" }),
        fetch(`${METEORA_API}/position/${pos.pubkey}/withdraws`, { cache: "no-store" }),
      ]);
      if (!depRes.ok || !wdRes.ok) continue;
      const depJson = (await depRes.json()) as unknown;
      const wdJson = (await wdRes.json()) as unknown;
      const isErr = (x: unknown) => x != null && typeof x === "object" && ("error" in x || "message" in x);
      const deposits = isErr(depJson) ? [] : Array.isArray(depJson) ? depJson : [];
      const withdraws = isErr(wdJson) ? [] : Array.isArray(wdJson) ? wdJson : [];
      const depUsd = deposits.reduce((s: number, d: { token_x_usd_amount?: number; token_y_usd_amount?: number }) => s + (d.token_x_usd_amount ?? 0) + (d.token_y_usd_amount ?? 0), 0);
      const wdUsd = withdraws.reduce((s: number, w: { token_x_usd_amount?: number; token_y_usd_amount?: number }) => s + (w.token_x_usd_amount ?? 0) + (w.token_y_usd_amount ?? 0), 0);
      const net = depUsd - wdUsd;
      if (net > 0) totalUsd += net;
    } catch {
      /* skip */
    }
  }
  return totalUsd > 0 ? { total: totalUsd, positions: [{ name: "Meteora", usd: totalUsd }] } : { total: 0, positions: [] };
}

async function fetchSolWalletBalanceUsd(address: string): Promise<number> {
  try {
    const conn = new Connection(RPC_SOL, "confirmed");
    const pubkey = new PublicKey(address);
    const lamports = await conn.getBalance(pubkey);
    const solBalance = lamports / LAMPORTS_PER_SOL;
    if (solBalance <= 0) return 0;
    const priceRes = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
      { cache: "no-store" }
    );
    if (!priceRes.ok) return 0;
    const priceData = (await priceRes.json()) as { solana?: { usd?: number } };
    const price = priceData?.solana?.usd ?? 0;
    return solBalance * price;
  } catch {
    return 0;
  }
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
          .forEach((p) => positions.push({ name: "Protocol", usd: Number(p.total_usd_value ?? 0) }));
      }
    }
    if (total > 0 || results.some((r) => r.status === "fulfilled" && r.value))
      return NextResponse.json({ total, positions });
  }

  // Para Solana: Jupiter Portfolio (Meteora, Raydium, Orca, etc.). Shyft fallback para Meteora.
  const jupiterKey = process.env.JUPITER_API_KEY;
  const shyftKey = process.env.SHYFT_API_KEY;
  const urls: { url: string; headers: HeadersInit }[] = [];
  if (chain === "sol" && isSolAddress(address) && jupiterKey) {
    urls.push({
      url: `https://api.jup.ag/portfolio/v1/positions/${encodeURIComponent(address.trim())}`,
      headers: { Accept: "application/json", "x-api-key": jupiterKey },
    });
    urls.push({
      url: `https://api.jup.ag/portfolio/v1/positions/${encodeURIComponent(address.trim())}?platforms=meteora-dlmm,meteora,raydium,orca,jupiter-exchange`,
      headers: { Accept: "application/json", "x-api-key": jupiterKey },
    });
  }
  if (moralisKey && chain === "eth") {
    urls.push({
      url: `${MORALIS_DEFI}/${address}/defi/summary?chain=eth`,
      headers: { Accept: "application/json", "X-API-Key": moralisKey },
    });
  }
  // Solana DeFi: só Jupiter (Meteora, Raydium, Orca, etc.). ETH: Moralis.

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
        const isJupiter = url.includes("jup.ag");
        if (res.status === 401)
          lastError = isMoralis
            ? "Chave Moralis inválida. Verifica em admin.moralis.io."
            : isJupiter
              ? "Chave Jupiter inválida. Verifica em portal.jup.ag."
              : lastError;
        else if (res.status === 403)
          lastError = isMoralis
            ? "Limite de créditos Moralis excedido. Tenta novamente mais tarde."
            : isJupiter
              ? "Limite de créditos Jupiter excedido."
              : lastError;
        else if (res.status === 429) lastError = "Muitos pedidos. Espera um momento e tenta novamente.";
        else if (errMsg) lastError = errMsg;
        continue;
      }

      const isJupiterUrl = url.includes("jup.ag");
      if (isJupiterUrl) {
        try {
          const data = JSON.parse(raw) as {
            elements?: Array<{
              type?: string;
              name?: string;
              platformId?: string;
              value?: number | string;
              data?: {
                value?: number | string;
                valueUsd?: number | string;
                totalValue?: number | string;
                poolValue?: number | string;
                positionValue?: number | string;
                assets?: Array<{
                  value?: number | string;
                  data?: { price?: number | string; amount?: number | string };
                }>;
                reserves?: Array<{ value?: number | string; amount?: number | string; price?: number | string }>;
              };
            }>;
          };
          const toNum = (x: unknown): number => {
            if (x == null) return 0;
            if (typeof x === "number" && Number.isFinite(x)) return x;
            if (typeof x === "string") return parseFloat(x) || 0;
            return 0;
          };
          let total = 0;
          const positions: { name: string; usd: number }[] = [];
          for (const el of data.elements ?? []) {
            const val = toNum(
              el.value ??
                el.data?.value ??
                el.data?.valueUsd ??
                el.data?.totalValue ??
                el.data?.poolValue ??
                el.data?.positionValue ??
                0
            );
            const assets = el.data?.assets ?? [];
            const reserves = el.data?.reserves ?? [];
            const sumAssets = assets.reduce((s, a) => {
              const v = toNum(a.value);
              if (v > 0) return s + v;
              const price = toNum(a.data?.price);
              const amount = toNum(a.data?.amount);
              return s + (price * amount || 0);
            }, 0);
            const sumReserves = reserves.reduce((s, r) => {
              const v = toNum(r.value);
              if (v > 0) return s + v;
              return s + (toNum(r.price) * toNum(r.amount) || 0);
            }, 0);
            const elTotal = val > 0 ? val : sumAssets || sumReserves;
            if (elTotal > 0) {
              total += elTotal;
              const label = el.name ?? el.platformId ?? "DeFi";
              positions.push({ name: label, usd: elTotal });
            }
          }
          if (total > 0) return NextResponse.json({ total, positions });
          continue;
        } catch {
          continue;
        }
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
              .map((p) => ({ name: "Protocol", usd: Number(p.total_usd_value ?? 0) })) ?? [];
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

  // Fallback Solana DeFi: Shyft + Meteora (posições LP) quando Jupiter falhou ou retornou 0
  if (chain === "sol" && isSolAddress(address) && shyftKey) {
    try {
      const meteoraResult = await fetchMeteoraPositionsViaShyft(address.trim(), shyftKey, jupiterKey);
      if (meteoraResult.total > 0) {
        return NextResponse.json({ total: meteoraResult.total, positions: meteoraResult.positions });
      }
    } catch {
      // continua para fallback carteira
    }
  }

  // Fallback Solana: quando não há posições DeFi, usa saldo da carteira em USD
  if (chain === "sol" && isSolAddress(address)) {
    const walletUsd = await fetchSolWalletBalanceUsd(address.trim());
    if (walletUsd > 0) {
      return NextResponse.json({
        total: walletUsd,
        positions: [{ name: "Carteira", usd: walletUsd }],
      });
    }
    return NextResponse.json({ total: 0, positions: [] });
  }

  const hasAnyKey = moralisKey || jupiterKey || shyftKey;
  let fallbackMsg = hasAnyKey
    ? lastError ?? "Falha ao consultar DeFi."
    : "Para DeFi Solana: JUPITER_API_KEY (portal.jup.ag) e/ou SHYFT_API_KEY (shyft.to/get-api-key). Para ETH: MORALIS_API_KEY.";
  if (chain === "sol" && (jupiterKey || shyftKey) && lastError?.includes("Jupiter"))
    fallbackMsg += " Chaves novas demoram 2-5 min a ativar. Verifica .env.local ou variáveis do deploy.";

  return NextResponse.json(
    { error: fallbackMsg, total: null, positions: [] },
    { status: 503 }
  );
}
