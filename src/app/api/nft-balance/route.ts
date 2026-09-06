import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/requireUser";

const MORALIS_EVM = "https://deep-index.moralis.io/api/v2.2";
const MORALIS_SOLANA = "https://solana-gateway.moralis.io/account/mainnet";
const SOLANA_TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const SOLANA_TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

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
  token_uri?: string;
  normalized_metadata?: { image?: string; name?: string };
  media?: { media_collection?: { low?: { url?: string }; medium?: { url?: string }; high?: { url?: string } } };
  metadata?: string;
};

type SolanaNftItem = {
  mint?: string;
  name?: string;
  image?: string;
  metadata_uri?: string;
  metadata?: { image?: string; image_url?: string };
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

function getSolanaRpcCandidates(): string[] {
  const fromEnv = fallbackSolanaRpcUrl();
  const candidates = [
    fromEnv,
    "https://api.mainnet-beta.solana.com",
    "https://solana-rpc.publicnode.com",
    "https://rpc.ankr.com/solana",
  ];
  return [...new Set(candidates.filter(Boolean))];
}

const EVM_L2_CHAINS_NFT = ["arbitrum", "base", "optimism", "polygon", "bsc", "avalanche"] as const;
type EvmL2ChainNFT = typeof EVM_L2_CHAINS_NFT[number];

// Gateways for fetching metadata JSON server-side. Pinata reliably serves the
// content that gotas.social (and many others) pin there.
const META_GATEWAYS = [
  "https://gateway.pinata.cloud/ipfs/",
  "https://ipfs.io/ipfs/",
  "https://dweb.link/ipfs/",
];

function extractIpfsCid(url: string): string | undefined {
  if (url.startsWith("ipfs://")) return url.slice(7).replace(/^ipfs\//, "");
  const m = url.match(/\/ipfs\/(.+)/);
  return m?.[1];
}

/**
 * Turns any image reference into a stable URL. IPFS content is routed through
 * our own /api/ipfs-image proxy (which races gateways + edge-caches the bytes),
 * so the browser always receives one reliable URL. Plain https images (e.g.
 * Moralis CDN, spam NFTs) are passed through unchanged.
 */
function toImageUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const cid = extractIpfsCid(url);
  if (cid) return `/api/ipfs-image?cid=${encodeURIComponent(cid)}`;
  return url; // already a usable http(s) url
}

function getEvmNftImageSync(item: EvmNftItem): string | undefined {
  const nm = item.normalized_metadata;
  if (nm?.image) return toImageUrl(nm.image);
  const m = item.media?.media_collection;
  if (m?.high?.url) return toImageUrl(m.high.url);
  if (m?.medium?.url) return toImageUrl(m.medium.url);
  if (m?.low?.url) return toImageUrl(m.low.url);
  try {
    const meta = typeof item.metadata === "string" ? JSON.parse(item.metadata || "{}") : item.metadata;
    const raw = (meta as { image?: string; image_url?: string } | null)?.image ?? (meta as { image?: string; image_url?: string } | null)?.image_url;
    return toImageUrl(raw);
  } catch { return undefined; }
}

async function fetchMetadataFromGateways(cid: string): Promise<{ image?: string; image_url?: string } | undefined> {
  for (const gw of META_GATEWAYS) {
    try {
      const res = await fetch(`${gw}${cid}`, { signal: AbortSignal.timeout(8000) });
      if (res.ok) return (await res.json()) as { image?: string; image_url?: string };
    } catch { continue; }
  }
  return undefined;
}

async function resolveEvmNftImage(item: EvmNftItem): Promise<string | undefined> {
  const image = getEvmNftImageSync(item);
  if (image) return image;
  if (!item.token_uri) return undefined;
  const cid = extractIpfsCid(item.token_uri);
  if (cid) {
    const meta = await fetchMetadataFromGateways(cid);
    if (meta) return toImageUrl(meta.image ?? meta.image_url);
  } else {
    // Non-IPFS token_uri (e.g. https metadata)
    try {
      const res = await fetch(item.token_uri, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const meta = (await res.json()) as { image?: string; image_url?: string };
        return toImageUrl(meta.image ?? meta.image_url);
      }
    } catch { /* ignore */ }
  }
  return undefined;
}

export async function GET(request: Request) {
  // Moralis é pago por chamada: só com sessão e limite por utilizador.
  const auth = await requireUser(request, { route: "nft-balance", limit: 60 });
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");
  const chain = (searchParams.get("chain") ?? "eth") as ChainId;
  const evmChain = searchParams.get("evmChain") as EvmL2ChainNFT | null;

  if (!address?.trim()) {
    return NextResponse.json({ error: "Endereço obrigatório." }, { status: 400 });
  }

  // Handle specific EVM L2 chains
  if (evmChain && EVM_L2_CHAINS_NFT.includes(evmChain) && isEvmAddress(address)) {
    const moralisKey = process.env.MORALIS_API_KEY;
    if (!moralisKey) return NextResponse.json({ count: 0, nfts: [] });
    try {
      const res = await fetch(
        `${MORALIS_EVM}/${address}/nft?chain=${evmChain}&format=decimal&limit=50&exclude_spam=true&normalizeMetadata=true&media_items=true`,
        { headers: { Accept: "application/json", "X-API-Key": moralisKey }, next: { revalidate: 120 } }
      );
      if (!res.ok) return NextResponse.json({ count: 0, nfts: [] });
      const data = (await res.json()) as { result?: EvmNftItem[] };
      const nfts = await Promise.all(
        (data.result ?? []).map(async (item) => {
          const image = await resolveEvmNftImage(item);
          return {
            id: `${item.token_address}-${item.token_id}`,
            name: item.normalized_metadata?.name ?? item.name ?? "NFT",
            image,
            tokenUri: image ? undefined : (item.token_uri ? toImageUrl(item.token_uri) ?? item.token_uri : undefined),
            tokenAddress: item.token_address,
            tokenId: item.token_id,
          };
        })
      );
      return NextResponse.json({ count: nfts.length, nfts });
    } catch {
      return NextResponse.json({ count: 0, nfts: [] });
    }
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
            onchain_metadata?: { name?: string | string[]; image?: string | string[] };
          };
          const rawName = asset.onchain_metadata?.name;
          const name =
            (Array.isArray(rawName) ? rawName.join("") : rawName) ??
            (asset.asset_name ? (Buffer.from(asset.asset_name, "hex").toString("utf8") || undefined) : undefined) ??
            "NFT";
          let image: string | undefined;
          const imgRaw = asset.onchain_metadata?.image;
          // CIP-25: image can be a string or an array of strings (concatenated)
          const img = Array.isArray(imgRaw) ? imgRaw.join("") : imgRaw;
          if (typeof img === "string") {
            if (img.startsWith("ipfs://") || img.includes("/ipfs/")) image = toImageUrl(img);
            else if (img.startsWith("http")) image = img;
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
      // Sem chave: mostrar 0 sem erro
      return NextResponse.json({ count: 0, nfts: [] });
    }
    try {
      const res = await fetch(
        `https://open-api.unisat.io/v1/indexer/address/${encodeURIComponent(address.trim())}/inscription-utxo-data?cursor=0&size=50`,
        {
          headers: { Accept: "application/json", Authorization: `Bearer ${unisatKey}` },
          next: { revalidate: 120 },
        }
      );
      if (!res.ok) {
        // API falhou — mostrar 0 sem erro visível ao utilizador
        console.warn("[nft-balance] UniSat returned", res.status);
        return NextResponse.json({ count: 0, nfts: [] });
      }
      const data = (await res.json()) as {
        data?: { total?: number; utxo?: Array<{ inscriptions?: Array<{ inscriptionId?: string; contentType?: string; inscriptionNumber?: number }> }> };
      };
      const utxos = data.data?.utxo ?? [];
      const total = data.data?.total ?? 0;
      const nfts: Array<{ id: string; name: string; image?: string; tokenAddress?: string; tokenId?: string }> = [];
      let i = 0;
      for (const utxo of utxos) {
        for (const insc of utxo.inscriptions ?? []) {
          const id = insc.inscriptionId ?? `btc-${i}`;
          // Route content through our proxy (races CDNs + edge-caches), so the
          // browser doesn't hit a rate-limited CDN 37× at once. Image/SVG render;
          // pure-text/JSON ones fail gracefully to a placeholder.
          const image = insc.inscriptionId
            ? `/api/ord-content?id=${encodeURIComponent(insc.inscriptionId)}`
            : undefined;
          nfts.push({
            id,
            name: insc.inscriptionNumber != null ? `#${insc.inscriptionNumber}` : `Ordinal #${i + 1}`,
            image,
            tokenAddress: insc.inscriptionId,
            tokenId: insc.inscriptionId,
          });
          i++;
        }
      }
      return NextResponse.json({ count: total, nfts });
    } catch (e) {
      console.error("[nft-balance] Bitcoin:", e);
      // Falha silenciosa — não mostrar erro ao utilizador
      return NextResponse.json({ count: 0, nfts: [] });
    }
  }

  const moralisKey = process.env.MORALIS_API_KEY;

  if (chain === "eth" && isEvmAddress(address)) {
    if (!moralisKey) {
      return NextResponse.json(
        { error: "Configura MORALIS_API_KEY para ver NFTs EVM.", count: 0, nfts: [] },
        { status: 503 }
      );
    }
    const evmChains = ["eth", "polygon"] as const;
    const allItems: EvmNftItem[] = [];
    for (const c of evmChains) {
      try {
        const res = await fetch(
          `${MORALIS_EVM}/${address}/nft?chain=${c}&format=decimal&limit=50&exclude_spam=true&normalizeMetadata=true&media_items=true`,
          { headers: { Accept: "application/json", "X-API-Key": moralisKey }, next: { revalidate: 120 } }
        );
        if (!res.ok) continue;
        const data = (await res.json()) as { result?: EvmNftItem[] };
        allItems.push(...(data.result ?? []));
      } catch {
        continue;
      }
    }
    const allNfts = await Promise.all(
      allItems.map(async (item) => {
        const image = await resolveEvmNftImage(item);
        return {
          id: `${item.token_address}-${item.token_id}`,
          name: item.normalized_metadata?.name ?? item.name ?? "NFT",
          image,
          tokenUri: image ? undefined : (item.token_uri ? toImageUrl(item.token_uri) ?? item.token_uri : undefined),
          tokenAddress: item.token_address,
          tokenId: item.token_id,
        };
      })
    );
    return NextResponse.json({ count: allNfts.length, nfts: allNfts });
  }

  if (chain === "sol" && isSolAddress(address)) {
    // 1. Shyft primeiro — tem cached_image_uri confiável (CDN) para Solana NFTs
    const shyftKey = process.env.SHYFT_API_KEY;
    if (shyftKey) {
      try {
        const shyftRes = await fetch(
          `https://api.shyft.to/sol/v2/nft/read_all?network=mainnet-beta&address=${encodeURIComponent(address.trim())}&page=1&size=50`,
          { headers: { Accept: "application/json", "x-api-key": shyftKey }, cache: "no-store" }
        );
        if (shyftRes.ok) {
          const payload = (await shyftRes.json()) as {
            success?: boolean;
            result?: {
              nfts?: Array<{
                mint?: string;
                name?: string;
                image_uri?: string;
                cached_image_uri?: string;
              }>;
            };
          };
          const list = payload.result?.nfts ?? [];
          if (list.length > 0) {
            const nfts = list.map((item, i) => ({
              id: item.mint ?? `sol-shyft-${i}`,
              name: item.name ?? "NFT",
              image: toImageUrl(item.cached_image_uri ?? item.image_uri),
              tokenAddress: item.mint,
            }));
            return NextResponse.json({ count: nfts.length, nfts });
          }
        }
      } catch { /* fallback */ }
    }

    // 2. Moralis — com resolução de metadata_uri para imagens em falta
    if (moralisKey) {
      try {
        const res = await fetch(
          `${MORALIS_SOLANA}/${address}/nft?nftMetadata=true&mediaItems=true&excludeSpam=true`,
          { headers: { Accept: "application/json", "X-API-Key": moralisKey }, cache: "no-store" }
        );
        if (res.ok) {
          const data = (await res.json()) as { nfts?: SolanaNftItem[] } | SolanaNftItem[];
          const list = Array.isArray(data) ? data : (data as { nfts?: SolanaNftItem[] }).nfts ?? [];
          if (list.length > 0) {
            // Resolve metadata_uri for NFTs without images (up to 20 in parallel)
            const nfts = await Promise.all(
              list.slice(0, 50).map(async (item, i) => {
                let image = toImageUrl(
                  item.image ?? item.metadata?.image ?? item.metadata?.image_url
                );
                if (!image && item.metadata_uri) {
                  try {
                    const metaCid = extractIpfsCid(item.metadata_uri);
                    const metaUrl = metaCid ? `${META_GATEWAYS[0]}${metaCid}` : item.metadata_uri;
                    const metaRes = await fetch(metaUrl, { signal: AbortSignal.timeout(5000) });
                    if (metaRes.ok) {
                      const meta = (await metaRes.json()) as { image?: string; image_url?: string };
                      image = toImageUrl(meta.image ?? meta.image_url);
                    }
                  } catch { /* ignore */ }
                }
                return {
                  id: item.mint ?? `sol-${i}`,
                  name: item.name ?? "NFT",
                  image,
                  tokenAddress: item.mint,
                };
              })
            );
            return NextResponse.json({ count: nfts.length, nfts });
          }
        }
      } catch { /* fallback para RPC */ }
    }

    // Fallback sem Moralis: conta NFTs SPL (amount=1 e decimals=0) via RPC.
    try {
      const seen = new Set<string>();
      const nfts: Array<{ id: string; name: string; image?: string; tokenAddress?: string; tokenId?: string }> = [];
      const rpcUrls = getSolanaRpcCandidates();
      const programs = [SOLANA_TOKEN_PROGRAM, SOLANA_TOKEN_2022_PROGRAM];
      let lastRpcError: string | null = null;

      for (const rpcUrl of rpcUrls) {
        try {
          for (const programId of programs) {
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
                    { programId },
                    { encoding: "jsonParsed", commitment: "confirmed" },
                  ],
                }),
                next: { revalidate: 120 },
              }
            );
            if (!res.ok) {
              lastRpcError = `RPC ${new URL(rpcUrl).hostname} respondeu ${res.status}.`;
              continue;
            }
            const data = (await res.json()) as {
              result?: { value?: SolanaRpcParsedToken[] };
              error?: { message?: string };
            };
            if (data.error?.message) {
              lastRpcError = data.error.message;
              continue;
            }
            const values = data.result?.value ?? [];
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
          }
          // Se um RPC respondeu, já devolvemos (mesmo que 0 NFTs).
          return NextResponse.json({ count: seen.size, nfts: nfts.slice(0, 30) });
        } catch (rpcErr) {
          lastRpcError = rpcErr instanceof Error ? rpcErr.message : "Falha RPC.";
          continue;
        }
      }
      return NextResponse.json(
        { error: lastRpcError ?? "Falha ao consultar NFTs Solana via RPC.", count: 0, nfts: [] },
        { status: 503 }
      );
    } catch {
      return NextResponse.json(
        { error: "Falha ao consultar NFTs.", count: 0, nfts: [] },
        { status: 503 }
      );
    }
  }

  return NextResponse.json({ count: 0, nfts: [] });
}
