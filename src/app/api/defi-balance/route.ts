import { NextResponse } from "next/server";

const DEBANK_OPEN = "https://openapi.debank.com/v1/user/all_simple_protocol_list";
const DEBANK_PRO = "https://pro-openapi.debank.com/v1/user/all_simple_protocol_list";

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

  // DeBank não suporta Bitcoin nem Cardano
  if (chain === "btc" || chain === "ada") {
    return NextResponse.json({ total: 0, positions: [] });
  }

  const accessKey = process.env.DEBANK_ACCESS_KEY;
  const chainIds = chain === "eth" ? undefined : chain === "sol" ? "sol" : undefined;
  const chainParam = chainIds ? `&chain_ids=${chainIds}` : "";
  const urls: { url: string; headers: HeadersInit }[] = [];
  if (accessKey) {
    urls.push({
      url: `${DEBANK_PRO}?id=${encodeURIComponent(address)}${chainParam}`,
      headers: { Accept: "application/json", AccessKey: accessKey },
    });
  }
  urls.push(
    {
      url: `${DEBANK_OPEN}?id=${encodeURIComponent(address)}${chainParam}`,
      headers: { Accept: "application/json" },
    },
    {
      url: `https://openapi.debank.com/v1/user/protocol_list?id=${encodeURIComponent(address)}`,
      headers: { Accept: "application/json" },
    }
  );

  for (const { url, headers } of urls) {
    try {
      const res = await fetch(url, { headers, next: { revalidate: 120 } });
      const raw = await res.text();
      if (!res.ok) continue;

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

  return NextResponse.json(
    {
      error: accessKey
        ? "Falha ao consultar DeFi."
        : "Configura DEBANK_ACCESS_KEY para ver posições DeFi (cloud.debank.com).",
      total: null,
      positions: [],
    },
    { status: 503 }
  );
}
