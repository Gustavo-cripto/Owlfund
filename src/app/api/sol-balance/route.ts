import { NextResponse } from "next/server";

const RPCS = [
  "https://api.mainnet-beta.solana.com",
  "https://solana.publicnode.com",
  "https://solana-rpc.publicnode.com",
];

async function fetchBalance(rpc: string, address: string): Promise<number> {
  const res = await fetch(rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getBalance",
      params: [address, { commitment: "confirmed" }],
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`RPC ${res.status}`);
  const data = (await res.json()) as { result?: { value?: number }; error?: { message?: string } };
  if (data.error) throw new Error(data.error.message ?? "rpc error");
  return (data.result?.value ?? 0) / 1e9;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");
  if (!address) return NextResponse.json({ error: "address required" }, { status: 400 });

  for (const rpc of RPCS) {
    try {
      const balance = await fetchBalance(rpc, address);
      return NextResponse.json({ balance });
    } catch { /* try next */ }
  }
  return NextResponse.json({ error: "All SOL RPCs failed" }, { status: 502 });
}
