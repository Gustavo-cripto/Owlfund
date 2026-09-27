// Helpers puros da pagina de carteiras (chaves, enderecos, valores).
// Extraidos de src/app/(pt)/wallets/page.tsx sem alteracoes de comportamento;
// testes em scripts/testes/formatarCarteiras.test.ts.
import type { StoredWalletEntry } from "@/lib/wallets/storage";

export type DefiChain = "eth" | "sol" | "btc" | "ada";

/** Chave dos mapas de DeFi/NFT: "<endereco>:<cadeia>". */
export const defiKey = (address: string, chain: DefiChain | string) => `${address}:${chain}`;

/** Chave dos saldos EVM por endereco e rede: "<endereco>-<rede>". */
export const ethBalanceKey = (addr: string, net: string) => `${addr}-${net}`;

/** Endereco encurtado (0x1234...abcd); "—" quando nao ha endereco. */
export const formatAddress = (address?: string) => {
  if (!address) return "—";
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

export const upsertWallet = (
  list: StoredWalletEntry[],
  entry: StoredWalletEntry,
  matcher: (item: StoredWalletEntry) => boolean
) => {
  const index = list.findIndex(matcher);
  if (index === -1) return [...list, entry];
  const next = [...list];
  next[index] = { ...next[index], ...entry };
  return next;
};

export const removeWallet = (
  list: StoredWalletEntry[],
  matcher: (item: StoredWalletEntry) => boolean
) => list.filter((item) => !matcher(item));

/** Quantidade de um Rune: ate 4 casas no formato de numeros do utilizador; valores
 *  enormes (>= 1e9) ficam como vieram para nao perder digitos. */
export const formatRuneAmount = (amount: number | string, numberFormat: string) => {
  const n = typeof amount === "string" ? parseFloat(amount) || 0 : amount;
  return n >= 1e9 ? String(amount) : n.toLocaleString(numberFormat, { maximumFractionDigits: 4 });
};

/** Valor em USD de um saldo nativo, a partir da tabela de precos.
 *  null se faltar preco ou o saldo nao for numero. */
export const fiatValue = (
  prices: Record<string, { priceUsd: number } | undefined>,
  symbol: string,
  balanceValue?: string | number | null,
) => {
  const price = prices[symbol]?.priceUsd ?? null;
  const amount = Number(balanceValue ?? 0);
  if (!Number.isFinite(amount) || price == null || !Number.isFinite(price)) return null;
  return amount * price;
};

/** Nome da rede EVM -> id de cadeia da Moralis (DeFi/NFT por L2). Desconhecida -> "eth". */
export const networkToMoralisChain = (network: string): string => {
  const map: Record<string, string> = {
    Ethereum: "eth", Arbitrum: "arbitrum", Optimism: "optimism",
    Base: "base", Polygon: "polygon", BSC: "bsc", Avalanche: "avalanche",
    Linea: "linea", zkSync: "zksync",
  };
  return map[network] ?? "eth";
};

/** "Ethereum" e "eth" sao a mesma cadeia — normaliza para o mesmo endereco,
 *  lido com chaves em formatos diferentes, nao contar duas vezes. */
export const normalizeChain = (c: string) => {
  if (c === "Ethereum" || c === "eth") return "eth";
  return c.toLowerCase();
};

export type NftItem ={ id: string; name: string; image?: string; tokenUri?: string; tokenAddress?: string; tokenId?: string };

/** Mapas de DeFi/NFT por chave defiKey(endereco, cadeia) — so leitura. */
export type DefiNftMaps = {
  defiTotals: Record<string, number | null>;
  defiLoading: Record<string, boolean>;
  defiPartial: Record<string, boolean>;
  defiErrors: Record<string, string | null>;
  nftCounts: Record<string, number>;
  nftLoading: Record<string, boolean>;
  nftErrors: Record<string, string | null>;
  nftsByKey: Record<string, NftItem[]>;
  nftPartial: Record<string, boolean>;
};

/** As 8 props de DeFi/NFT do WalletCard para o endereco principal de uma cadeia
 *  (valores "vazios" enquanto nao ha endereco). */
export const propsDefiNftCartao = (maps: DefiNftMaps, mainAddress: string | undefined | null, chain: DefiChain) => ({
  defiBalanceUsd: mainAddress ? maps.defiTotals[defiKey(mainAddress, chain)] ?? null : null,
  defiPartial: mainAddress ? !!maps.defiPartial[defiKey(mainAddress, chain)] : false,
  defiLoading: mainAddress ? !!maps.defiLoading[defiKey(mainAddress, chain)] : false,
  defiError: mainAddress ? maps.defiErrors[defiKey(mainAddress, chain)] ?? null : null,
  nftCount: mainAddress ? maps.nftCounts[defiKey(mainAddress, chain)] ?? null : null,
  nftLoading: mainAddress ? !!maps.nftLoading[defiKey(mainAddress, chain)] : false,
  nftError: mainAddress ? maps.nftErrors[defiKey(mainAddress, chain)] ?? null : null,
  nfts: mainAddress ? maps.nftsByKey[defiKey(mainAddress, chain)] ?? [] : [],
});
