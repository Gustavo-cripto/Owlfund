import { NextResponse } from "next/server";
import { createPublicClient, formatEther, http } from "viem";
import {
  arbitrum, avalanche, base, bsc, celo, cronos, fantom, gnosis,
  linea, mainnet, optimism, polygon, zkSync,
} from "viem/chains";

const scroll = { id: 534352, name: "Scroll", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: ["https://rpc.scroll.io"] } } } as const;
const mantle = { id: 5000, name: "Mantle", nativeCurrency: { name: "Mantle", symbol: "MNT", decimals: 18 }, rpcUrls: { default: { http: ["https://rpc.mantle.xyz"] } } } as const;
const blast = { id: 81457, name: "Blast", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: ["https://rpc.blast.io"] } } } as const;

const chainMap = {
  Ethereum:  { chain: mainnet,   rpcs: ["https://ethereum.publicnode.com", "https://cloudflare-eth.com", "https://eth.drpc.org"] },
  Arbitrum:  { chain: arbitrum,  rpcs: ["https://arb1.arbitrum.io/rpc", "https://arbitrum.llamarpc.com", "https://1rpc.io/arb", "https://rpc.ankr.com/arbitrum"] },
  Optimism:  { chain: optimism,  rpcs: ["https://mainnet.optimism.io", "https://1rpc.io/op", "https://rpc.ankr.com/optimism", "https://optimism.drpc.org"] },
  Base:      { chain: base,      rpcs: ["https://mainnet.base.org", "https://1rpc.io/base", "https://rpc.ankr.com/base", "https://base.drpc.org"] },
  Polygon:   { chain: polygon,   rpcs: ["https://polygon-rpc.com", "https://1rpc.io/matic", "https://rpc.ankr.com/polygon", "https://polygon.drpc.org"] },
  BSC:       { chain: bsc,       rpcs: ["https://bsc-dataseed.binance.org", "https://bsc.publicnode.com"] },
  Avalanche: { chain: avalanche, rpcs: ["https://api.avax.network/ext/bc/C/rpc", "https://avalanche-c-chain.publicnode.com"] },
  Fantom:    { chain: fantom,    rpcs: ["https://rpcapi.fantom.network", "https://fantom.publicnode.com"] },
  zkSync:    { chain: zkSync,    rpcs: ["https://mainnet.era.zksync.io"] },
  Linea:     { chain: linea,     rpcs: ["https://rpc.linea.build", "https://linea.publicnode.com"] },
  Gnosis:    { chain: gnosis,    rpcs: ["https://rpc.gnosischain.com", "https://gnosis.publicnode.com"] },
  Celo:      { chain: celo,      rpcs: ["https://forno.celo.org"] },
  Cronos:    { chain: cronos,    rpcs: ["https://evm.cronos.org"] },
  Scroll:    { chain: scroll,    rpcs: ["https://rpc.scroll.io"] },
  Mantle:    { chain: mantle,    rpcs: ["https://rpc.mantle.xyz"] },
  Blast:     { chain: blast,     rpcs: ["https://rpc.blast.io"] },
} as const;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address")?.trim();
  const network = (searchParams.get("network") ?? "Ethereum") as keyof typeof chainMap;

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: "Endereço inválido." }, { status: 400 });
  }

  const entry = chainMap[network] ?? chainMap["Ethereum"];

  for (const rpc of entry.rpcs) {
    try {
      const client = createPublicClient({
        chain: entry.chain as Parameters<typeof createPublicClient>[0]["chain"],
        transport: http(rpc, { timeout: 8_000 }),
      });
      const balance = await client.getBalance({ address: address as `0x${string}` });
      return NextResponse.json({ balance: formatEther(balance), network });
    } catch {
      continue;
    }
  }

  return NextResponse.json({ error: "Falha ao obter saldo." }, { status: 502 });
}
