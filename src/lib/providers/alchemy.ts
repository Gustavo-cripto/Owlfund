// Alchemy — fornecedor principal de dados EVM (saldos de tokens com preços,
// NFTs e transferências). Plano gratuito generoso; substitui a Moralis, cujo
// plano gratuito acabou em set 2026. A Moralis continua no código como
// alternativa quando ALCHEMY_API_KEY não está definida (ver cada rota).
//
// Só servidor: lê env vars. Nunca importar em componentes de cliente.

export type EvmChainKey =
  | "eth" | "polygon" | "arbitrum" | "base" | "optimism" | "bsc" | "avalanche" | "linea" | "zksync";

const key = () => (process.env.ALCHEMY_API_KEY ?? "").trim();
export const hasAlchemy = () => key().length > 0;

// A Portfolio API usa "matic-mainnet" para Polygon; os subdomínios RPC/NFT usam "polygon-mainnet".
const PORTFOLIO_NETWORK: Record<EvmChainKey, string> = {
  eth: "eth-mainnet", polygon: "matic-mainnet", arbitrum: "arb-mainnet", base: "base-mainnet",
  optimism: "opt-mainnet", bsc: "bnb-mainnet", avalanche: "avax-mainnet", linea: "linea-mainnet", zksync: "zksync-mainnet",
};
const SUBDOMAIN: Record<EvmChainKey, string> = {
  eth: "eth-mainnet", polygon: "polygon-mainnet", arbitrum: "arb-mainnet", base: "base-mainnet",
  optimism: "opt-mainnet", bsc: "bnb-mainnet", avalanche: "avax-mainnet", linea: "linea-mainnet", zksync: "zksync-mainnet",
};
const chainFromPortfolioNetwork = (net: string): EvmChainKey =>
  (Object.entries(PORTFOLIO_NETWORK).find(([, v]) => v === net)?.[0] as EvmChainKey | undefined) ?? "eth";

export class AlchemyError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

const hexToNumber = (hex: string | number | null | undefined, decimals: number): number => {
  if (hex == null) return 0;
  if (typeof hex === "number") return hex / Math.pow(10, decimals);
  const s = String(hex);
  try {
    const big = s.startsWith("0x") ? BigInt(s) : BigInt(s);
    // Divide com BigInt até 6 casas para não perder precisão em 18 decimais.
    const shift = Math.max(0, decimals - 6);
    const whole = big / BigInt(10) ** BigInt(shift);
    return Number(whole) / Math.pow(10, Math.min(decimals, 6));
  } catch {
    return Number(s) / Math.pow(10, decimals) || 0;
  }
};

export type AlchemyToken = {
  chain: EvmChainKey;
  tokenAddress: string | null; // null = nativo (ETH, MATIC…)
  symbol: string;
  name: string;
  logo?: string;
  decimals: number;
  balance: number;
  usdPrice: number; // 0 = sem preço conhecido
  usdValue: number;
};

type PortfolioResponse = {
  data?: {
    tokens?: Array<{
      address?: string;
      network?: string;
      tokenAddress?: string | null;
      tokenBalance?: string | number | null;
      tokenMetadata?: { decimals?: number | null; logo?: string | null; name?: string | null; symbol?: string | null } | null;
      tokenPrices?: Array<{ currency?: string; value?: string | number }> | null;
      error?: string | null;
    }>;
  };
  error?: { message?: string };
};

/**
 * Saldos de tokens (nativo + ERC-20) com preços USD, em até 5 redes numa só
 * chamada. Lança AlchemyError em falha HTTP (a rota decide o que mostrar).
 */
export async function alchemyTokensByWallet(address: string, chains: EvmChainKey[]): Promise<AlchemyToken[]> {
  const networks = chains.slice(0, 5).map((c) => PORTFOLIO_NETWORK[c]);
  const res = await fetch(`https://api.g.alchemy.com/data/v1/${key()}/assets/tokens/by-address`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      addresses: [{ address, networks }],
      withMetadata: true,
      withPrices: true,
      includeNativeTokens: true,
      includeErc20Tokens: true,
    }),
    signal: AbortSignal.timeout(12000),
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new AlchemyError(`Alchemy tokens ${res.status}`, res.status);
  const json = (await res.json()) as PortfolioResponse;
  const out: AlchemyToken[] = [];
  for (const t of json.data?.tokens ?? []) {
    if (t.error) continue;
    const decimals = Number(t.tokenMetadata?.decimals ?? 18);
    const balance = hexToNumber(t.tokenBalance, Number.isFinite(decimals) ? decimals : 18);
    if (balance <= 0) continue;
    const usd = (t.tokenPrices ?? []).find((p) => (p.currency ?? "").toLowerCase() === "usd");
    const usdPrice = usd ? Number(usd.value ?? 0) || 0 : 0;
    const chain = chainFromPortfolioNetwork(t.network ?? "eth-mainnet");
    const isNative = !t.tokenAddress;
    const fallbackSym = isNative ? (chain === "polygon" ? "POL" : chain === "bsc" ? "BNB" : chain === "avalanche" ? "AVAX" : "ETH") : "?";
    out.push({
      chain,
      tokenAddress: t.tokenAddress ?? null,
      symbol: (t.tokenMetadata?.symbol ?? fallbackSym).toUpperCase(),
      name: t.tokenMetadata?.name ?? t.tokenMetadata?.symbol ?? fallbackSym,
      logo: t.tokenMetadata?.logo ?? undefined,
      decimals,
      balance,
      usdPrice,
      usdValue: balance * usdPrice,
    });
  }
  return out;
}

export type AlchemyNft = {
  id: string;
  name: string;
  image?: string;
  tokenUri?: string;
  tokenAddress?: string;
  tokenId?: string;
};

type NftV3Response = {
  ownedNfts?: Array<{
    contract?: { address?: string; name?: string; isSpam?: boolean };
    tokenId?: string;
    name?: string | null;
    tokenUri?: string | null;
    image?: { cachedUrl?: string | null; thumbnailUrl?: string | null; pngUrl?: string | null; originalUrl?: string | null } | null;
    raw?: { tokenUri?: string | null; metadata?: { image?: string; name?: string } | null } | null;
    collection?: { name?: string | null } | null;
  }>;
  totalCount?: number;
};

/** NFTs de um endereço numa rede (sem spam). Lança AlchemyError em falha HTTP. */
export async function alchemyNftsForOwner(address: string, chain: EvmChainKey, pageSize = 50): Promise<{ nfts: AlchemyNft[]; total: number }> {
  const url = new URL(`https://${SUBDOMAIN[chain]}.g.alchemy.com/nft/v3/${key()}/getNFTsForOwner`);
  url.searchParams.set("owner", address);
  url.searchParams.set("withMetadata", "true");
  url.searchParams.set("pageSize", String(pageSize));
  url.searchParams.append("excludeFilters[]", "SPAM");
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12000), next: { revalidate: 300 } });
  if (!res.ok) throw new AlchemyError(`Alchemy NFT ${res.status}`, res.status);
  const json = (await res.json()) as NftV3Response;
  const nfts: AlchemyNft[] = (json.ownedNfts ?? [])
    .filter((n) => n.contract?.isSpam !== true)
    .map((n, i) => {
      const image = n.image?.cachedUrl ?? n.image?.pngUrl ?? n.image?.thumbnailUrl ?? n.image?.originalUrl ?? n.raw?.metadata?.image ?? undefined;
      const tokenUri = n.tokenUri ?? n.raw?.tokenUri ?? undefined;
      return {
        id: `${n.contract?.address ?? "nft"}-${n.tokenId ?? i}`,
        name: n.name ?? n.raw?.metadata?.name ?? n.collection?.name ?? n.contract?.name ?? "NFT",
        image: image ?? undefined,
        tokenUri: image ? undefined : tokenUri ?? undefined,
        tokenAddress: n.contract?.address,
        tokenId: n.tokenId,
      };
    });
  return { nfts, total: json.totalCount ?? nfts.length };
}

export type AlchemyTransfer = {
  hash?: string;
  from: string;
  to: string | null;
  value: number | null;
  asset: string | null;
  decimals: number;
  timestamp: number; // ms
  direction: "in" | "out";
};

type TransfersRpc = {
  result?: {
    transfers?: Array<{
      hash?: string; from?: string; to?: string | null; value?: number | null; asset?: string | null;
      rawContract?: { value?: string | null; decimal?: string | null } | null;
      metadata?: { blockTimestamp?: string } | null;
    }>;
  };
  error?: { message?: string };
};

/** Últimas transferências ERC-20 (entradas e saídas) de um endereço na mainnet. */
export async function alchemyErc20Transfers(address: string, maxPerDirection = 5): Promise<AlchemyTransfer[]> {
  const call = async (dir: "in" | "out") => {
    const res = await fetch(`https://${SUBDOMAIN.eth}.g.alchemy.com/v2/${key()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "alchemy_getAssetTransfers",
        params: [{
          fromBlock: "0x0", toBlock: "latest",
          ...(dir === "in" ? { toAddress: address } : { fromAddress: address }),
          category: ["erc20"], withMetadata: true, order: "desc", excludeZeroValue: true,
          maxCount: `0x${maxPerDirection.toString(16)}`,
        }],
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new AlchemyError(`Alchemy transfers ${res.status}`, res.status);
    const json = (await res.json()) as TransfersRpc;
    if (json.error) throw new AlchemyError(`Alchemy transfers: ${json.error.message ?? "erro"}`, 502);
    return (json.result?.transfers ?? []).map<AlchemyTransfer>((t) => ({
      hash: t.hash,
      from: t.from ?? "",
      to: t.to ?? null,
      value: typeof t.value === "number" ? t.value : null,
      asset: t.asset ?? null,
      decimals: t.rawContract?.decimal ? parseInt(t.rawContract.decimal, 16) : 18,
      timestamp: t.metadata?.blockTimestamp ? new Date(t.metadata.blockTimestamp).getTime() : Date.now(),
      direction: dir,
    }));
  };
  const [inn, out] = await Promise.all([call("in"), call("out")]);
  return [...inn, ...out].sort((a, b) => b.timestamp - a.timestamp);
}
