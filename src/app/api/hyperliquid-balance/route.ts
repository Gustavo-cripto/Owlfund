import { NextResponse } from "next/server";

export interface HlBalance {
  coin: string;
  total: number;
  hold: number;
  free: number;
}

export async function POST(request: Request) {
  const body = await request.json() as { address: string };
  const { address } = body;

  if (!address || !address.startsWith("0x")) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  try {
    // Spot balances
    const spotRes = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "spotClearinghouseState", user: address }),
    });
    const spotData = await spotRes.json() as { balances: { coin: string; total: string; hold: string }[] };

    // Perp account value
    const perpRes = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "clearinghouseState", user: address }),
    });
    const perpData = await perpRes.json() as {
      marginSummary?: { accountValue: string };
      crossMarginSummary?: { accountValue: string };
    };

    const spotBalances: HlBalance[] = (spotData.balances ?? [])
      .map((b) => ({
        coin: b.coin,
        total: parseFloat(b.total),
        hold: parseFloat(b.hold),
        free: parseFloat(b.total) - parseFloat(b.hold),
      }))
      .filter((b) => b.total > 0);

    const perpValue =
      parseFloat(perpData.marginSummary?.accountValue ?? perpData.crossMarginSummary?.accountValue ?? "0");

    return NextResponse.json({ address, spotBalances, perpValue });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
