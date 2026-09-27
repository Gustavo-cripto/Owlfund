// Opcoes fixas da pagina de carteiras: redes, carteiras suportadas e listas
// dos menus. So dados — extraido de src/app/(pt)/wallets/page.tsx sem alteracoes.
import type { EvmNetwork, EvmProviderId } from "@/lib/wallets/evm";
import type { CardanoWalletId } from "@/lib/wallets/cardano";

export const evmNetworks: EvmNetwork[] = [
  "Ethereum", "Arbitrum", "Optimism", "Base", "Polygon", "BSC",
  "Avalanche", "Fantom", "zkSync", "Linea", "Gnosis", "Celo", "Cronos", "Scroll", "Mantle", "Blast",
];
/** Mapeamento do id em "Adicionar endereço manual" para EvmNetwork (permite ler saldo por rede). */
export const MANUAL_ADD_TO_EVM_NETWORK: Record<string, EvmNetwork> = {
  eth:       "Ethereum",
  optimism:  "Optimism",
  arbitrum:  "Arbitrum",
  base:      "Base",
  matic:     "Polygon",
  bsc:       "BSC",
  avalanche: "Avalanche",
  fantom:    "Fantom",
  zksync:    "zkSync",
  linea:     "Linea",
  gnosis:    "Gnosis",
  celo:      "Celo",
  cronos:    "Cronos",
  scroll:    "Scroll",
  mantle:    "Mantle",
  blast:     "Blast",
};
/** Redes que usam endereço Solana (base58). Permite ler saldo SOL. */
export const MANUAL_ADD_TO_SOL_NETWORK: Record<string, string> = {
  sol: "Solana",
  sol_l2: "Solana L2",
  raydium: "Raydium",
  orca: "Orca",
  sol_dex: "Solana DEX",
};
export const ethNetworkLabelOptions: Array<{ id: EvmNetwork | "outro"; label: string; group?: string }> = [
  { id: "Ethereum",  label: "Ethereum",         group: "L1" },
  { id: "BSC",       label: "BNB Smart Chain",  group: "L1" },
  { id: "Avalanche", label: "Avalanche C-Chain", group: "L1" },
  { id: "Fantom",    label: "Fantom",           group: "L1" },
  { id: "Cronos",    label: "Cronos",           group: "L1" },
  { id: "Gnosis",    label: "Gnosis",           group: "L1" },
  { id: "Celo",      label: "Celo",             group: "L1" },
  { id: "Arbitrum",  label: "Arbitrum One",     group: "L2" },
  { id: "Optimism",  label: "Optimism",         group: "L2" },
  { id: "Base",      label: "Base",             group: "L2" },
  { id: "Polygon",   label: "Polygon",          group: "L2" },
  { id: "zkSync",    label: "zkSync Era",       group: "L2" },
  { id: "Linea",     label: "Linea",            group: "L2" },
  { id: "Scroll",    label: "Scroll",           group: "L2" },
  { id: "Mantle",    label: "Mantle",           group: "L2" },
  { id: "Blast",     label: "Blast",            group: "L2" },
  { id: "outro",     label: "Outro (qualquer EVM/L2)" },
];
export const ethWalletOptions: Array<{ id: EvmProviderId; label: string }> = [
  { id: "metamask", label: "MetaMask" },
  { id: "rabby",    label: "Rabby Wallet" },
  { id: "rainbow",  label: "Rainbow Wallet" },
  { id: "coinbase", label: "Coinbase Wallet" },
  { id: "okx",      label: "OKX Wallet" },
  { id: "bybit",    label: "Bybit Wallet" },
  { id: "trust",    label: "Trust Wallet" },
  { id: "binance",  label: "Binance Chain Wallet" },
];
export const solWalletOptions = [
  { id: "phantom",  label: "Phantom Wallet" },
  { id: "backpack", label: "Backpack" },
  { id: "solflare", label: "Solflare" },
  { id: "glow",     label: "Glow Wallet" },
  { id: "flint",    label: "Flint" },
] as const;
export type SolanaWalletId = (typeof solWalletOptions)[number]["id"];
export const solLabelOptions: Array<{ id: SolanaWalletId | "outro"; label: string }> = [
  ...solWalletOptions,
  { id: "outro", label: "Outro (qualquer endereço Solana)" },
];

/** Lista de redes para o dropdown "adicionar endereço" no card Solana. */
export const solNetworkOptions: Array<{ id: string; label: string }> = [
  ...Object.entries(MANUAL_ADD_TO_SOL_NETWORK).map(([id, label]) => ({ id, label })),
  { id: "outro", label: "Outro (qualquer endereço Solana)" },
];

export const adaWalletOptions: Array<{ id: CardanoWalletId; label: string }> = [
  { id: "eternl", label: "Eternl" },
  { id: "daedalus", label: "Daedalus" },
  { id: "yoroi", label: "Yoroi" },
  { id: "adalite", label: "Ada Lite" },
  { id: "lace", label: "Lace" },
];

/** Redes ADA/L2 para o dropdown ao adicionar endereço no card Cardano. */
export const MANUAL_ADD_TO_ADA_NETWORK: Record<string, string> = {
  cardano: "Cardano",
  hydra: "Hydra",
  midnight: "Midnight",
  outro: "Outro (qualquer endereço Cardano/L2)",
};
export const adaNetworkOptions: Array<{ id: string; label: string }> = [
  ...Object.entries(MANUAL_ADD_TO_ADA_NETWORK).map(([id, label]) => ({ id, label })),
];

export const btcWalletOptions = [
  { id: "xverse", label: "Xverse" },
  { id: "electrum", label: "Electrum" },
  { id: "coinbase", label: "Coinbase Wallet" },
  { id: "exodus", label: "Exodus" },
] as const;
export type BtcWalletId = (typeof btcWalletOptions)[number]["id"];

/** Redes BTC/L2 para o dropdown ao adicionar endereço no card Bitcoin. */
export const MANUAL_ADD_TO_BTC_NETWORK: Record<string, string> = {
  bitcoin: "Bitcoin",
  liquid: "Liquid",
  rootstock: "Rootstock (RSK)",
  stacks: "Stacks",
  lightning: "Lightning",
};
export const btcNetworkOptions: Array<{ id: string; label: string }> = [
  ...Object.entries(MANUAL_ADD_TO_BTC_NETWORK).map(([id, label]) => ({ id, label })),
  { id: "outro", label: "Outro (qualquer endereço)" },  // traduzido na apresentacao por btcNetLabel
];

/** Redes para "Adicionar endereço manual (todas as redes)". ETH, SOL, BTC e ADA têm suporte a saldo. */
export const MANUAL_ADD_NETWORKS: Array<{ id: string; label: string; group?: string }> = [
  // ── EVM Layer 1 ──
  { id: "eth",       label: "Ethereum (ETH)",           group: "EVM L1" },
  { id: "bsc",       label: "BNB Smart Chain (BSC)",    group: "EVM L1" },
  { id: "avalanche", label: "Avalanche C-Chain (AVAX)", group: "EVM L1" },
  { id: "fantom",    label: "Fantom (FTM)",             group: "EVM L1" },
  { id: "cronos",    label: "Cronos (CRO)",             group: "EVM L1" },
  { id: "gnosis",    label: "Gnosis Chain (xDAI)",      group: "EVM L1" },
  { id: "celo",      label: "Celo (CELO)",              group: "EVM L1" },
  // ── EVM Layer 2 ──
  { id: "arbitrum",  label: "Arbitrum One",             group: "EVM L2" },
  { id: "optimism",  label: "Optimism (OP)",            group: "EVM L2" },
  { id: "base",      label: "Base (Coinbase)",          group: "EVM L2" },
  { id: "matic",     label: "Polygon (POL)",            group: "EVM L2" },
  { id: "zksync",    label: "zkSync Era",               group: "EVM L2" },
  { id: "linea",     label: "Linea (MetaMask)",         group: "EVM L2" },
  { id: "scroll",    label: "Scroll",                   group: "EVM L2" },
  { id: "mantle",    label: "Mantle (MNT)",             group: "EVM L2" },
  { id: "blast",     label: "Blast",                    group: "EVM L2" },
  // ── Bitcoin & L2 ──
  { id: "btc",       label: "Bitcoin (BTC)",            group: "Bitcoin" },
  { id: "liquid",    label: "Liquid Network",           group: "Bitcoin" },
  { id: "stacks",    label: "Stacks (STX)",             group: "Bitcoin" },
  { id: "rootstock", label: "Rootstock (RSK)",          group: "Bitcoin" },
  // ── Solana ──
  { id: "sol",       label: "Solana (SOL)",             group: "Solana" },
  { id: "sol_l2",    label: "Solana L2",                group: "Solana" },
  { id: "raydium",   label: "Raydium",                  group: "Solana" },
  { id: "orca",      label: "Orca",                     group: "Solana" },
  // ── Cardano ──
  { id: "ada",       label: "Cardano (ADA)",            group: "Cardano" },
  { id: "hydra",     label: "Hydra",                    group: "Cardano" },
  // ── Outros ──
  { id: "xrp",       label: "XRP Ledger (XRP)",         group: "Outros" },
  { id: "doge",      label: "Dogecoin (DOGE)",          group: "Outros" },
  { id: "trx",       label: "TRON (TRX)",               group: "Outros" },
  { id: "ltc",       label: "Litecoin (LTC)",           group: "Outros" },
  { id: "bch",       label: "Bitcoin Cash (BCH)",       group: "Outros" },
  { id: "xlm",       label: "Stellar (XLM)",            group: "Outros" },
  { id: "xmr",       label: "Monero (XMR)",             group: "Outros" },
  { id: "hbar",      label: "Hedera (HBAR)",            group: "Outros" },
  { id: "dot",       label: "Polkadot (DOT)",           group: "Outros" },
  { id: "atom",      label: "Cosmos (ATOM)",            group: "Outros" },
  { id: "ton",       label: "TON (Telegram)",           group: "Outros" },
  { id: "sui",       label: "SUI",                      group: "Outros" },
  { id: "apt",       label: "Aptos (APT)",              group: "Outros" },
  { id: "near",      label: "NEAR Protocol",            group: "Outros" },
  { id: "algo",      label: "Algorand (ALGO)",          group: "Outros" },
  { id: "icp",       label: "Internet Computer (ICP)",  group: "Outros" },
];
