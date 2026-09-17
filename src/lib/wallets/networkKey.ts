// Etiqueta de rede que a pessoa escolheu ("Arbitrum One", "Polygon (POL)",
// "Ethereum") → chave curta que as APIs usam ("arbitrum", "polygon", "eth").
// Serve para saber se o token nativo que a API devolve para uma rede ja esta
// contado no saldo da carteira (mesma rede) ou e dinheiro a mais (outra rede).

const KEYS: Array<[RegExp, string]> = [
  [/arbitrum/i, "arbitrum"],
  [/optimism|\bop\b/i, "optimism"],
  [/\bbase\b/i, "base"],
  [/polygon|matic/i, "polygon"],
  [/bnb|bsc|binance/i, "bsc"],
  [/avalanche|avax/i, "avalanche"],
  [/linea/i, "linea"],
  [/zksync/i, "zksync"],
  [/gnosis|xdai/i, "gnosis"],
  [/celo/i, "celo"],
  [/fantom|\bftm\b/i, "fantom"],
  [/cronos/i, "cronos"],
  [/scroll/i, "scroll"],
  [/mantle|\bmnt\b/i, "mantle"],
  [/blast/i, "blast"],
  [/ethereum|\beth\b/i, "eth"],
];

export function networkKey(label: string | undefined | null): string {
  const l = (label ?? "Ethereum").trim();
  for (const [re, key] of KEYS) if (re.test(l)) return key;
  return l.toLowerCase();
}

/** Moeda nativa de cada rede EVM. O saldo "nativo" de uma carteira na Polygon
 *  e POL, nao ETH — valoriza-lo ao preco do ETH inflava o portefolio. */
export const NATIVE_SYMBOL: Record<string, string> = {
  eth: "ETH", arbitrum: "ETH", optimism: "ETH", base: "ETH", linea: "ETH", zksync: "ETH", scroll: "ETH", blast: "ETH",
  polygon: "POL", bsc: "BNB", avalanche: "AVAX", fantom: "FTM", cronos: "CRO", gnosis: "XDAI", celo: "CELO", mantle: "MNT",
};

export function nativeSymbolOf(label: string | undefined | null): string {
  return NATIVE_SYMBOL[networkKey(label)] ?? "ETH";
}

/** Nome curto para mostrar ao lado de um token de outra rede. */
export const NETWORK_SHORT: Record<string, string> = {
  eth: "Ethereum", arbitrum: "Arbitrum", optimism: "Optimism", base: "Base", polygon: "Polygon",
  bsc: "BSC", avalanche: "Avalanche", linea: "Linea", zksync: "zkSync",
};
