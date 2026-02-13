import { NextResponse } from "next/server";

const MORALIS_EVM = "https://deep-index.moralis.io/api/v2.2";
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

type EvmNftItem = {
  token_address?: string;
  token_id?: string;
  name?: string;
  normalized_metadata?: { image?: string };
  media?: { media_collection?: { low?: { url?: string }; medium?: { url?: string }; high?: { url?: string } } };
  metadata?: string;
};

type SolanaNftItem = {
  mint?: string;
  name?: string;
  image?: string;
  metadata?: { image?: string };
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");
  const chain = (searchParams.get("chain") ?? "eth") as ChainId;

  if (!address?.trim()) {
    return NextResponse.json({ error: "Endereço obrigatório." }, { status: 400 });
  }

  if (!["eth", "sol", "btc", "ada"].includes(chain)) {
    return NextResponse.json({ error: "Chain inválida." }, { status: 400 });
  }

  if (!validateAddressForChain(address.trim(), chain)) {
    return NextResponse.json({ error: `Endereço inválido para ${chain}.` }, { status: 400 });
  }

  const moralisKey = process.env.MORALIS_API_KEY;
  if (!moralisKey) {
    return NextResponse.json(
      { error: "Configura MORALIS_API_KEY para ver NFTs.", count: 0, nfts: [] },
      { status: 503 }
    );
  }

  if (chain === "btc" || chain === "ada") {
    return NextResponse.json({ count: 0, nfts: [] });
  }

  const getImage = (item: EvmNftItem): string | undefined => {
    const nm = item.normalized_metadata;
    if (nm?.image) return nm.image;
    const m = item.media?.media_collection;
    if (m?.high?.url) return m.high.url;
    if (m?.medium?.url) return m.medium.url;
    if (m?.low?.url) return m.low.url;
    try {
      const meta = typeof item.metadata === "string" ? JSON.parse(item.metadata || "{}") : item.metadata;
      return meta?.image ?? meta?.image_url;
    } catch {
      return undefined;
    }
  };

  if (chain === "eth" && isEvmAddress(address)) {
    const evmChains = ["eth", "polygon"] as const;
    const allNfts: Array<{ id: string; name: string; image?: string; tokenAddress?: string; tokenId?: string }> = [];
    for (const c of evmChains) {
      try {
        const res = await fetch(
          `${MORALIS_EVM}/${address}/nft?chain=${c}&format=decimal&limit=50&exclude_spam=true&normalizeMetadata=true&media_items=true`,
          { headers: { Accept: "application/json", "X-API-Key": moralisKey }, next: { revalidate: 120 } }
        );
        if (!res.ok) continue;
        const data = (await res.json()) as { result?: EvmNftItem[] };
        const list = data.result ?? [];
        for (const item of list) {
          allNfts.push({
            id: `${item.token_address}-${item.token_id}`,
            name: item.name ?? "NFT",
            image: getImage(item),
            tokenAddress: item.token_address,
            tokenId: item.token_id,
          });
        }
      } catch {
        continue;
      }
    }
    return NextResponse.json({ count: allNfts.length, nfts: allNfts });
  }

  if (chain === "sol" && isSolAddress(address)) {
    try {
      const res = await fetch(
        `${MORALIS_SOLANA}/${address}/nft?nftMetadata=true&mediaItems=true&excludeSpam=true`,
        { headers: { Accept: "application/json", "X-API-Key": moralisKey }, next: { revalidate: 120 } }
      );
      if (!res.ok) {
        const raw = await res.text();
        return NextResponse.json(
          { error: "Falha ao consultar NFTs Solana.", count: 0, nfts: [] },
          { status: res.status }
        );
      }
      const data = (await res.json()) as { nfts?: SolanaNftItem[] } | SolanaNftItem[];
      const list = Array.isArray(data) ? data : (data as { nfts?: SolanaNftItem[] }).nfts ?? [];
      const nfts: Array<{ id: string; name: string; image?: string; tokenAddress?: string; tokenId?: string }> = list.map((item, i) => ({
        id: item.mint ?? `sol-${i}`,
        name: item.name ?? "NFT",
        image: item.image ?? item.metadata?.image,
        tokenAddress: item.mint,
      }));
      return NextResponse.json({ count: nfts.length, nfts });
    } catch (e) {
      return NextResponse.json(
        { error: "Falha ao consultar NFTs.", count: 0, nfts: [] },
        { status: 503 }
      );
    }
  }

  return NextResponse.json({ count: 0, nfts: [] });
}
