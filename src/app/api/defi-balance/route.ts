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

type MoralisDefiSummary = {
  total_usd_value?: string;
  protocols?: Array<{ total_usd_value?: string; positions?: string }>;
};

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

  // Para Solana: Jupiter Portfolio (Meteora, Raydium, Orca, etc.). Só posições em protocolos, não saldo da carteira.
  const jupiterKey = process.env.JUPITER_API_KEY;
  const urls: { url: string; headers: HeadersInit }[] = [];
  if (chain === "sol" && isSolAddress(address) && jupiterKey) {
    urls.push({
      url: `https://api.jup.ag/portfolio/v1/positions/${encodeURIComponent(address.trim())}`,
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
                assets?: Array<{
                  value?: number | string;
                  data?: { price?: number | string; amount?: number | string };
                }>;
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
            const val = toNum(el.value ?? el.data?.value ?? el.data?.valueUsd ?? el.data?.totalValue ?? 0);
            const assets = el.data?.assets ?? [];
            const sum = assets.reduce((s, a) => {
              const v = toNum(a.value);
              if (v > 0) return s + v;
              const price = toNum(a.data?.price);
              const amount = toNum(a.data?.amount);
              return s + (price * amount || 0);
            }, 0);
            const elTotal = val > 0 ? val : sum;
            if (elTotal > 0) {
              total += elTotal;
              const label = el.name ?? el.platformId ?? "DeFi";
              positions.push({ name: label, usd: elTotal });
            }
          }
          // Se Jupiter retornou 0 para Solana, tentar fallback: saldo da carteira (SOL + SPL) via RPC + Jupiter Price
          if (chain === "sol" && total === 0 && jupiterKey) {
            const rpcUrl =
              process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://solana.publicnode.com";
            try {
              const [balanceRes, tokenRes] = await Promise.all([
                fetch(rpcUrl, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    jsonrpc: "2.0",
                    id: 1,
                    method: "getBalance",
                    params: [address.trim()],
                  }),
                  next: { revalidate: 60 },
                }),
                fetch(rpcUrl, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    jsonrpc: "2.0",
                    id: 2,
                    method: "getTokenAccountsByOwner",
                    params: [
                      address.trim(),
                      { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
                      { encoding: "jsonParsed" },
                    ],
                  }),
                  next: { revalidate: 60 },
                }),
              ]);
              const balanceData = (await balanceRes.json()) as { result?: { value?: number } };
              const tokenData = (await tokenRes.json()) as {
                result?: { value?: Array<{
                  account?: { data?: { parsed?: { info?: { mint?: string; tokenAmount?: { amount: string; decimals: number } } } } };
                }> };
              };
              const lamports = balanceData?.result?.value ?? 0;
              const solAmount = lamports / 1e9;
              const mints = new Map<string, number>();
              mints.set("So11111111111111111111111111111111111111112", solAmount);
              for (const acc of tokenData?.result?.value ?? []) {
                const info = acc?.account?.data?.parsed?.info;
                const mint = info?.mint;
                const ta = info?.tokenAmount;
                if (mint && ta && Number(ta.amount) > 0) {
                  const human = Number(ta.amount) / Math.pow(10, ta.decimals);
                  mints.set(mint, (mints.get(mint) ?? 0) + human);
                }
              }
              const ids = [...mints.keys()];
              if (ids.length > 0) {
                const priceRes = await fetch(
                  `https://api.jup.ag/price/v3?ids=${ids.slice(0, 50).join(",")}`,
                  { headers: { "x-api-key": jupiterKey }, next: { revalidate: 60 } }
                );
                if (priceRes.ok) {
                  const priceData = (await priceRes.json()) as { data?: Record<string, { price?: number | string }> };
                  let walletTotal = 0;
                  for (const [mint, amount] of mints) {
                    const pRaw = priceData?.data?.[mint]?.price;
                    const p = typeof pRaw === "number" ? pRaw : parseFloat(String(pRaw ?? 0)) || 0;
                    walletTotal += amount * p;
                  }
                  if (walletTotal > 0)
                    return NextResponse.json({
                      total: walletTotal,
                      positions: [{ name: "Carteira", usd: walletTotal }],
                    });
                }
              }
            } catch {
              // ignorar fallback
            }
          }
          return NextResponse.json({ total, positions });
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

  const hasAnyKey = moralisKey || jupiterKey;
  let fallbackMsg = hasAnyKey
    ? lastError ?? "Falha ao consultar DeFi."
    : "Para DeFi Solana (Meteora, Raydium, Orca): JUPITER_API_KEY (gratuito em portal.jup.ag). Para ETH: MORALIS_API_KEY.";
  if (chain === "sol" && jupiterKey && lastError?.includes("Jupiter"))
    fallbackMsg += " Chaves novas demoram 2-5 min a ativar. Verifica .env.local (local) ou variáveis do deploy.";

  return NextResponse.json(
    { error: fallbackMsg, total: null, positions: [] },
    { status: 503 }
  );
}
