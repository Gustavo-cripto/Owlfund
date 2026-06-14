import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, parseAbi, formatUnits } from "viem";
import { mainnet } from "viem/chains";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ERC20_ABI = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
]);

const TOKEN_ADDRESSES: Record<string, `0x${string}`> = {
  USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  DAI:  "0x6B175474E89094C44Da98b954EedeAC495271d0F",
  BUSD: "0x4Fabb145d64652a948d72533023f6E7A623C7C53",
  TUSD: "0x0000000000085d4780B73119b644AE5ecd22b376",
};

const ETH_RPCS = [
  "https://ethereum.publicnode.com",
  "https://cloudflare-eth.com",
  "https://eth.drpc.org",
  "https://1rpc.io/eth",
];

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address")?.trim();
  const token = req.nextUrl.searchParams.get("token")?.toUpperCase();

  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({ error: "Endereço EVM inválido." }, { status: 400 });
  }
  if (!token || !TOKEN_ADDRESSES[token]) {
    return NextResponse.json({ error: `Token não suportado: ${token}` }, { status: 400 });
  }

  const tokenAddress = TOKEN_ADDRESSES[token];

  for (const rpc of ETH_RPCS) {
    try {
      const client = createPublicClient({
        chain: mainnet,
        transport: http(rpc, { timeout: 8_000 }),
      });
      const [balance, decimals] = await Promise.all([
        client.readContract({ address: tokenAddress, abi: ERC20_ABI, functionName: "balanceOf", args: [address as `0x${string}`] }),
        client.readContract({ address: tokenAddress, abi: ERC20_ABI, functionName: "decimals" }),
      ]);
      const formatted = formatUnits(balance, decimals);
      return NextResponse.json({ balance: formatted, token });
    } catch {
      continue;
    }
  }

  return NextResponse.json({ error: "Falha ao obter saldo ERC-20." }, { status: 502 });
}
