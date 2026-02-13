import { NextResponse } from "next/server";

const DEBANK_PRO = "https://pro-openapi.debank.com/v1/user/all_simple_protocol_list";
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

  // DeBank/Moralis não suportam Bitcoin nem Cardano para DeFi
  if (chain === "btc" || chain === "ada") {
    return NextResponse.json({ total: 0, positions: [] });
  }

  const accessKey = process.env.DEBANK_ACCESS_KEY;
  const moralisKey = process.env.MORALIS_API_KEY;
  const chainIds = chain === "eth" ? undefined : chain === "sol" ? "sol" : undefined;
  const chainParam = chainIds ? `&chain_ids=${chainIds}` : "";

  const urls: { url: string; headers: HeadersInit }[] = [];
  if (accessKey) {
    urls.push({
      url: `${DEBANK_PRO}?id=${encodeURIComponent(address)}${chainParam}`,
      headers: { Accept: "application/json", AccessKey: accessKey },
    });
  }
  // Moralis: gratuito, só EVM (eth)
  if (moralisKey && chain === "eth") {
    urls.push({
      url: `${MORALIS_DEFI}/${address}/defi/summary?chain=eth`,
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
        if (res.status === 401)
          lastError = isMoralis
            ? "Chave Moralis inválida. Verifica em admin.moralis.io."
            : "Chave DeBank inválida ou expirada. Verifica em cloud.debank.com.";
        else if (res.status === 403)
          lastError = "Limite de créditos excedido.";
        else if (res.status === 429) lastError = "Muitos pedidos. Espera um momento e tenta novamente.";
        else if (errMsg) lastError = errMsg;
        continue;
      }

      const isMoralisUrl = url.includes("moralis.io");
      if (isMoralisUrl) {
        try {
          const data = JSON.parse(raw) as MoralisDefiSummary;
          const total = Math.max(0, Number(data.total_usd_value ?? 0) || 0);
          const positions =
            data.protocols
              ?.filter((p) => Number(p.total_usd_value ?? 0) > 0)
              .map((p) => ({ name: "Protocol", usd: Number(p.total_usd_value ?? 0) })) ?? [];
          return NextResponse.json({ total, positions });
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

  const hasAnyKey = accessKey || moralisKey;
  const fallbackMsg = hasAnyKey
    ? lastError ?? "Falha ao consultar DeFi."
    : "Configura MORALIS_API_KEY (gratuito em moralis.io) ou DEBANK_ACCESS_KEY para ver posições DeFi.";

  return NextResponse.json(
    { error: fallbackMsg, total: null, positions: [] },
    { status: 503 }
  );
}
