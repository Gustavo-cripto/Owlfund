import { NextResponse } from "next/server";

const DEBANK_OPEN = "https://openapi.debank.com/v1/user/all_simple_protocol_list";
const DEBANK_PRO = "https://pro-openapi.debank.com/v1/user/all_simple_protocol_list";

function isEvmAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

type ProtocolItem = { net_usd_value?: number; name?: string; id?: string };

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");

  if (!address || !isEvmAddress(address)) {
    return NextResponse.json(
      { error: "Endereço Ethereum inválido." },
      { status: 400 }
    );
  }

  const accessKey = process.env.DEBANK_ACCESS_KEY;
  const urls: { url: string; headers: HeadersInit }[] = [];
  if (accessKey) {
    urls.push({
      url: `${DEBANK_PRO}?id=${encodeURIComponent(address)}`,
      headers: { Accept: "application/json", AccessKey: accessKey },
    });
  }
  urls.push(
    { url: `${DEBANK_OPEN}?id=${encodeURIComponent(address)}`, headers: { Accept: "application/json" } },
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
