import { NextResponse } from "next/server";

const DEBANK_URL = "https://openapi.debank.com/v1/user/protocol_list";

function isEvmAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");

  if (!address || !isEvmAddress(address)) {
    return NextResponse.json(
      { error: "Endereço Ethereum inválido." },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(`${DEBANK_URL}?id=${encodeURIComponent(address)}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 120 },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Falha ao consultar DeFi.", total: null },
        { status: res.status >= 500 ? 503 : res.status }
      );
    }

    const payload = (await res.json()) as Array<{ net_usd_value?: number }>;
    const total = (payload ?? []).reduce((sum, item) => {
      const value = Number(item?.net_usd_value ?? 0);
      return Number.isFinite(value) ? sum + value : sum;
    }, 0);

    return NextResponse.json({ total });
  } catch {
    return NextResponse.json(
      { error: "Falha ao consultar DeFi.", total: null },
      { status: 503 }
    );
  }
}
