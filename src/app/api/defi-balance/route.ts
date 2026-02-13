import { NextResponse } from "next/server";

const DEBANK_PRO = "https://pro-openapi.debank.com/v1/user/all_simple_protocol_list";
const MORALIS_DEFI = "https://deep-index.moralis.io/api/v2.2/wallets";
const MORALIS_SOLANA = "https://solana-gateway.moralis.io/account/mainnet";

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

type ProtocolItem = { net_usd_value?: number; name?: string; id?: string };
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

  const accessKey = process.env.DEBANK_ACCESS_KEY;
  const moralisKey = process.env.MORALIS_API_KEY;
  const chainIds = chain === "eth" ? undefined : chain === "sol" ? "sol" : undefined;
  const chainParam = chainIds ? `&chain_ids=${chainIds}` : "";

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

  // Para Solana: Jupiter Portfolio (gratuito em portal.jup.ag) → DeBank → Moralis
  const jupiterKey = process.env.JUPITER_API_KEY;
  const urls: { url: string; headers: HeadersInit }[] = [];
  if (chain === "sol" && isSolAddress(address) && jupiterKey) {
    urls.push({
      url: `https://api.jup.ag/portfolio/v1/positions/${encodeURIComponent(address.trim())}`,
      headers: { Accept: "application/json", "x-api-key": jupiterKey },
    });
  }
  if (accessKey) {
    urls.push({
      url: `${DEBANK_PRO}?id=${encodeURIComponent(address)}${chainParam}`,
      headers: { Accept: "application/json", AccessKey: accessKey },
    });
  }
  if (moralisKey && chain === "eth") {
    urls.push({
      url: `${MORALIS_DEFI}/${address}/defi/summary?chain=eth`,
      headers: { Accept: "application/json", "X-API-Key": moralisKey },
    });
  }
  // DeBank falhou ou sem chave: Moralis portfolio (tokens + SOL) como fallback para Solana
  if (moralisKey && chain === "sol" && isSolAddress(address)) {
    urls.push({
      url: `${MORALIS_SOLANA}/${address}/portfolio?nftMetadata=false&excludeSpam=true`,
      headers: { Accept: "application/json", "X-API-Key": moralisKey },
    });
  }

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
              : "Chave DeBank inválida ou expirada. Verifica em cloud.debank.com.";
        else if (res.status === 403)
          lastError = isMoralis
            ? "Limite de créditos Moralis excedido. Tenta novamente mais tarde."
            : isJupiter
              ? "Limite de créditos Jupiter excedido."
              : "Limite de créditos DeBank excedido.";
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
              data?: {
                assets?: Array<{ value?: number; data?: { price?: number; amount?: number } }>;
                value?: number;
              };
            }>;
          };
          let total = 0;
          const positions: { name: string; usd: number }[] = [];
          for (const el of data.elements ?? []) {
            const val = Number(el.data?.value ?? 0);
            const assets = el.data?.assets ?? [];
            const sum = assets.reduce((s, a) => {
              const v = Number(a.value ?? 0);
              if (v > 0) return s + v;
              const price = Number(a.data?.price ?? 0);
              const amount = Number(a.data?.amount ?? 0);
              return s + (price * amount || 0);
            }, 0);
            const elTotal = val > 0 ? val : sum;
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

      let payload: ProtocolItem[] = [];
      try {
        payload = JSON.parse(raw) as ProtocolItem[];
      } catch {
        continue;
      }

      const list = Array.isArray(payload) ? payload : [];
      const total = list.reduce((sum, item) => {
        const value = Number(item?.net_usd_value ?? 0);
        return Number.isFinite(value) && value > 0 ? sum + value : sum;
      }, 0);

      const positions = list
        .filter((p) => Number(p?.net_usd_value ?? 0) > 0)
        .map((p) => ({ name: p.name ?? p.id ?? "—", usd: Number(p.net_usd_value ?? 0) }));

      return NextResponse.json({ total, positions });
    } catch {
      continue;
    }
  }

  const hasAnyKey = accessKey || moralisKey || jupiterKey;
  let fallbackMsg = hasAnyKey
    ? lastError ?? "Falha ao consultar DeFi."
    : "Para DeFi Solana (Meteora): JUPITER_API_KEY (gratuito em portal.jup.ag). Para ETH: MORALIS_API_KEY.";
  if (chain === "sol" && jupiterKey && lastError?.includes("Jupiter"))
    fallbackMsg += " Chaves novas demoram 2-5 min a ativar. Verifica .env.local (local) ou variáveis do deploy.";

  return NextResponse.json(
    { error: fallbackMsg, total: null, positions: [] },
    { status: 503 }
  );
}
