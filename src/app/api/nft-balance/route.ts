import { NextResponse } from "next/server";

const MORALIS_EVM = "https://deep-index.moralis.io/api/v2.2";
const MORALIS_SOLANA = "https://solana-gateway.moralis.io/account/mainnet";
const SOLANA_TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

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

type SolanaRpcParsedToken = {
  account?: {
    data?: {
      parsed?: {
        info?: {
          mint?: string;
          tokenAmount?: { amount?: string; decimals?: number; uiAmount?: number };
        };
      };
    };
  };
};

function fallbackSolanaRpcUrl(): string {
  return (
    process.env.SOLANA_RPC_URL ??
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ??
    "https://api.mainnet-beta.solana.com"
  );
}

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

  if (chain === "ada" && address.trim().startsWith("addr1")) {
    const projectId = process.env.BLOCKFROST_PROJECT_ID;
    if (!projectId) {
      return NextResponse.json(
        { error: "Configura BLOCKFROST_PROJECT_ID para ver NFTs Cardano.", count: 0, nfts: [] },
        { status: 503 }
      );
    }
    try {
      const res = await fetch(
        `https://cardano-mainnet.blockfrost.io/api/v0/addresses/${encodeURIComponent(address.trim())}/extended`,
        { headers: { project_id: projectId }, next: { revalidate: 120 } }
      );
      if (!res.ok) {
        if (res.status === 404) return NextResponse.json({ count: 0, nfts: [] });
        const err = (await res.json().catch(() => ({}))) as { message?: string };
        return NextResponse.json(
          { error: err?.message ?? "Falha ao consultar NFTs Cardano.", count: 0, nfts: [] },
          { status: res.status >= 500 ? 503 : res.status }
        );
      }
      const data = (await res.json()) as { amount?: Array<{ unit: string; quantity: string }> };
      const nftUnits = (data.amount ?? []).filter(
        (a) => a.unit !== "lovelace" && a.quantity === "1"
      );
      const nfts: Array<{ id: string; name: string; image?: string; tokenAddress?: string; tokenId?: string }> = [];
      for (let i = 0; i < Math.min(nftUnits.length, 30); i++) {
        try {
          const ar = await fetch(
            `https://cardano-mainnet.blockfrost.io/api/v0/assets/${encodeURIComponent(nftUnits[i].unit)}`,
            { headers: { project_id: projectId }, next: { revalidate: 300 } }
          );
          if (!ar.ok) continue;
          const asset = (await ar.json()) as {
            asset_name?: string;
            onchain_metadata?: { name?: string; image?: string };
          };
          const name =
            asset.onchain_metadata?.name ??
            (asset.asset_name ? (Buffer.from(asset.asset_name, "hex").toString("utf8") || undefined) : undefined) ??
            "NFT";
          let image: string | undefined;
          const img = asset.onchain_metadata?.image;
          if (typeof img === "string") {
            if (img.startsWith("http")) image = img;
            else if (img.startsWith("ipfs://")) image = `https://ipfs.io/ipfs/${img.slice(7)}`;
            else if (img.startsWith("/ipfs/")) image = `https://ipfs.io${img}`;
            else if (img.startsWith("/")) image = `https://cardano-mainnet.blockfrost.io/api/v0/ipfs/gateway${img}`;
          }
          nfts.push({
            id: nftUnits[i].unit,
            name: name || "NFT",
            image,
            tokenAddress: nftUnits[i].unit,
          });
        } catch {
          nfts.push({ id: nftUnits[i].unit, name: "NFT", tokenAddress: nftUnits[i].unit });
        }
      }
      return NextResponse.json({ count: nftUnits.length, nfts });
    } catch (e) {
      console.error("[nft-balance] Cardano:", e);
      return NextResponse.json(
        { error: "Falha ao consultar NFTs Cardano.", count: 0, nfts: [] },
        { status: 503 }
      );
    }
  }

  if (chain === "btc" && isBtcAddress(address)) {
    const unisatKey = process.env.UNISAT_API_KEY;
    if (!unisatKey) {
      return NextResponse.json({ count: 0, nfts: [] });
    }
    try {
      const res = await fetch(
        `https://open-api.unisat.io/v1/indexer/address/${encodeURIComponent(address.trim())}/inscriptions?start=0&limit=50`,
        {
          headers: { Accept: "application/json", Authorization: `Bearer ${unisatKey}` },
          next: { revalidate: 120 },
        }
      );
      if (!res.ok) {
        return NextResponse.json(
          { error: "Falha ao consultar Ordinals.", count: 0, nfts: [] },
          { status: res.status >= 500 ? 503 : res.status }
        );
      }
      const data = (await res.json()) as {
        data?: { total?: number; list?: Array<{ inscriptionId?: string; content?: string; contentType?: string }> };
      };
      const list = data.data?.list ?? [];
      const total = data.data?.total ?? list.length;
      const nfts: Array<{ id: string; name: string; image?: string; tokenAddress?: string; tokenId?: string }> = list.map(
        (item, i) => {
          const id = item.inscriptionId ?? `btc-${i}`;
          let image: string | undefined;
          if (item.contentType?.startsWith("image/") && typeof item.content === "string" && item.content.startsWith("http")) {
            image = item.content;
          }
          return {
            id,
            name: `Ordinal #${i + 1}`,
            image,
            tokenAddress: item.inscriptionId,
            tokenId: item.inscriptionId,
          };
        }
      );
      return NextResponse.json({ count: total, nfts });
    } catch (e) {
      console.error("[nft-balance] Bitcoin:", e);
      return NextResponse.json(
        { error: "Falha ao consultar Ordinals.", count: 0, nfts: [] },
        { status: 503 }
      );
    }
  }

  const moralisKey = process.env.MORALIS_API_KEY;

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
    if (!moralisKey) {
      return NextResponse.json(
        { error: "Configura MORALIS_API_KEY para ver NFTs EVM.", count: 0, nfts: [] },
        { status: 503 }
      );
    }
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
    if (moralisKey) {
      try {
        const res = await fetch(
          `${MORALIS_SOLANA}/${address}/nft?nftMetadata=true&mediaItems=true&excludeSpam=true`,
          { headers: { Accept: "application/json", "X-API-Key": moralisKey }, next: { revalidate: 120 } }
        );
        if (res.ok) {
          const data = (await res.json()) as { nfts?: SolanaNftItem[] } | SolanaNftItem[];
          const list = Array.isArray(data) ? data : (data as { nfts?: SolanaNftItem[] }).nfts ?? [];
          if (list.length > 0) {
            const nfts: Array<{ id: string; name: string; image?: string; tokenAddress?: string; tokenId?: string }> = list.map((item, i) => ({
              id: item.mint ?? `sol-${i}`,
              name: item.name ?? "NFT",
              image: item.image ?? item.metadata?.image,
              tokenAddress: item.mint,
            }));
            return NextResponse.json({ count: nfts.length, nfts });
          }
        }
      } catch {
        // fallback para RPC abaixo
      }
    }

    // Fallback sem Moralis: conta NFTs SPL (amount=1 e decimals=0) via RPC.
    try {
      const rpcUrl = fallbackSolanaRpcUrl();
      const res = await fetch(
        rpcUrl,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "getParsedTokenAccountsByOwner",
            params: [
              address.trim(),
              { programId: SOLANA_TOKEN_PROGRAM },
              { encoding: "jsonParsed", commitment: "confirmed" },
            ],
          }),
          next: { revalidate: 120 },
        }
      );
      if (!res.ok) {
        return NextResponse.json(
          { error: "Falha ao consultar NFTs Solana via RPC.", count: 0, nfts: [] },
          { status: res.status }
        );
      }
      const data = (await res.json()) as {
        result?: { value?: SolanaRpcParsedToken[] };
      };
      const values = data.result?.value ?? [];
      const seen = new Set<string>();
      const nfts: Array<{ id: string; name: string; image?: string; tokenAddress?: string; tokenId?: string }> = [];

      for (const row of values) {
        const info = row.account?.data?.parsed?.info;
        const mint = info?.mint;
        const amount = info?.tokenAmount?.amount;
        const decimals = info?.tokenAmount?.decimals;
        const uiAmount = info?.tokenAmount?.uiAmount;
        if (!mint || seen.has(mint)) continue;
        if (decimals !== 0) continue;
        if (!(amount === "1" || uiAmount === 1)) continue;
        seen.add(mint);
        nfts.push({
          id: mint,
          name: `NFT ${mint.slice(0, 4)}...${mint.slice(-4)}`,
          tokenAddress: mint,
        });
      }

      return NextResponse.json({ count: seen.size, nfts: nfts.slice(0, 30) });
    } catch {
      return NextResponse.json(
        { error: "Falha ao consultar NFTs.", count: 0, nfts: [] },
        { status: 503 }
      );
    }
  }

  return NextResponse.json({ count: 0, nfts: [] });
}
