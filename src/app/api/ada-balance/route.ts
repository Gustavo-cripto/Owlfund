import { NextResponse } from "next/server";

const BLOCKFROST_URL = "https://cardano-mainnet.blockfrost.io/api/v0";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");
  const projectId = process.env.BLOCKFROST_PROJECT_ID;

  if (!address || !/^addr1[a-z0-9]+$/i.test(address)) {
    return NextResponse.json(
      { error: "Endereço Cardano inválido." },
      { status: 400 }
    );
  }

  if (!projectId) {
    return NextResponse.json(
      { error: "Serviço de saldo por endereço não configurado." },
      { status: 503 }
    );
  }

  try {
    const res = await fetch(
      `${BLOCKFROST_URL}/addresses/${encodeURIComponent(address)}/extended`,
      {
        headers: { project_id: projectId },
        next: { revalidate: 60 },
      }
    );

    if (!res.ok) {
      if (res.status === 404) {
        return NextResponse.json({ balance: "0", lovelace: "0" });
      }
      const err = await res.json().catch(() => ({}));
      return NextResponse.json(
        { error: (err as { message?: string }).message ?? "Erro ao obter saldo." },
        { status: res.status >= 500 ? 503 : res.status }
      );
    }

    const data = (await res.json()) as {
      amount?: Array<{ unit: string; quantity: string }>;
    };
    const lovelace = data.amount?.find((a) => a.unit === "lovelace")?.quantity ?? "0";
    const ada = (Number(lovelace) / 1_000_000).toFixed(6);
    return NextResponse.json({ balance: ada, lovelace });
  } catch (e) {
    console.error("[ada-balance]", e);
    return NextResponse.json(
      { error: "Erro ao consultar saldo." },
      { status: 503 }
    );
  }
}
