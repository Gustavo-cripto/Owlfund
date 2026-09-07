// Helius (Solana) — DAS API `getAssetsByOwner`: tokens SPL com preços, saldo
// nativo e NFTs numa chamada. Já usado para os movimentos das baleias SOL;
// aqui substitui a Moralis (plano gratuito terminado) nos saldos/NFTs Solana.
// Só servidor.

const key = () => (process.env.HELIUS_API_KEY ?? "").trim();
export const hasHelius = () => key().length > 0;

export class HeliusError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

type DasItem = {
  interface?: string;
  id?: string;
  content?: {
    json_uri?: string;
    metadata?: { name?: string; symbol?: string };
    links?: { image?: string };
    files?: Array<{ uri?: string; cdn_uri?: string }>;
  };
  token_info?: {
    balance?: number;
    decimals?: number;
    symbol?: string;
    price_info?: { price_per_token?: number; total_price?: number; currency?: string };
  };
};

type DasResponse = {
  result?: {
    items?: DasItem[];
    nativeBalance?: { lamports?: number; price_per_sol?: number; total_price?: number };
    total?: number;
  };
  error?: { message?: string };
};

export type HeliusFungible = { mint: string; symbol: string; name: string; logo?: string; balance: number; usdPrice: number; usdValue: number };
export type HeliusNft = { id: string; name: string; image?: string; tokenAddress?: string };

const FUNGIBLE = new Set(["FungibleToken", "FungibleAsset"]);

export async function heliusAssetsByOwner(address: string): Promise<{
  fungibles: HeliusFungible[];
  nfts: HeliusNft[];
  native: { sol: number; usdPrice: number; usdValue: number } | null;
}> {
  const res = await fetch(`https://mainnet.helius-rpc.com/?api-key=${key()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: "1", method: "getAssetsByOwner",
      params: {
        ownerAddress: address, page: 1, limit: 200,
        options: { showFungible: true, showNativeBalance: true, showZeroBalance: false },
      },
    }),
    signal: AbortSignal.timeout(12000),
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new HeliusError(`Helius ${res.status}`, res.status);
  const json = (await res.json()) as DasResponse;
  if (json.error) throw new HeliusError(`Helius: ${json.error.message ?? "erro"}`, 502);

  const fungibles: HeliusFungible[] = [];
  const nfts: HeliusNft[] = [];
  for (const it of json.result?.items ?? []) {
    const iface = it.interface ?? "";
    if (FUNGIBLE.has(iface)) {
      const ti = it.token_info;
      const decimals = Number(ti?.decimals ?? 0);
      const balance = Number(ti?.balance ?? 0) / Math.pow(10, decimals);
      if (!(balance > 0)) continue;
      const usdPrice = Number(ti?.price_info?.price_per_token ?? 0) || 0;
      const sym = (ti?.symbol ?? it.content?.metadata?.symbol ?? "?").toUpperCase();
      fungibles.push({
        mint: it.id ?? "",
        symbol: sym,
        name: it.content?.metadata?.name ?? sym,
        logo: it.content?.links?.image,
        balance,
        usdPrice,
        usdValue: Number(ti?.price_info?.total_price ?? balance * usdPrice) || balance * usdPrice,
      });
    } else if (iface) {
      const image = it.content?.links?.image ?? it.content?.files?.[0]?.cdn_uri ?? it.content?.files?.[0]?.uri;
      nfts.push({ id: it.id ?? `sol-${nfts.length}`, name: it.content?.metadata?.name ?? "NFT", image, tokenAddress: it.id });
    }
  }
  const nb = json.result?.nativeBalance;
  const native = nb && nb.lamports != null
    ? { sol: Number(nb.lamports) / 1e9, usdPrice: Number(nb.price_per_sol ?? 0) || 0, usdValue: Number(nb.total_price ?? 0) || 0 }
    : null;
  return { fungibles, nfts, native };
}
