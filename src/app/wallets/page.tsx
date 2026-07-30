"use client";

import { useCallback, useEffect, useMemo, useRef, useState, startTransition } from "react";
import { btnPrimary } from "@/lib/ui/buttons";

import AppShell from "@/components/AppShell";
import NftImage from "@/components/NftImage";
import CexSection from "@/components/wallets/CexSection";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useCurrencyFormat } from "@/lib/theme/ThemeContext";
import WalletCard from "@/components/wallets/WalletCard";
import { createClient } from "@/lib/supabase/client";
import {
  connectEvmProvider,
  connectWalletConnect,
  getEthBalance,
  getEvmBalance,
  getEvmProviderById,
  getEvmProviderLabel,
  getEvmProviderOptions,
  getEvmTokenBalance,
  isEvmWalletAvailable,
  isMetaMaskAvailable,
  switchEvmNetwork,
  STABLECOIN_TOKEN_ADDRESSES,
  type EvmNetwork,
  type EvmProviderId,
} from "@/lib/wallets/evm";
import {
  connectSolanaWallet,
  getSolBalance,
  isPhantomAvailable,
  isSolanaWalletAvailable,
} from "@/lib/wallets/solana";
import {
  connectXverse,
  getBtcBalanceFromAddress,
  getBtcBalanceFromWallet,
  getRunesBalancesForAddress,
  isBtcWalletAvailable,
  isXverseAvailable,
  type RunesBalanceEntry,
} from "@/lib/wallets/bitcoin";
import {
  connectCardanoWallet,
  getAdaBalance,
  getAdaBalanceByAddress,
  isCardanoWalletAvailable,
  isEternlAvailable,
  type CardanoWalletId,
  type EternlApi,
} from "@/lib/wallets/cardano";
import {
  loadWalletSnapshot,
  saveWalletSnapshot,
  updateWalletSnapshot,
  type StoredWalletEntry,
  type WalletSnapshot,
} from "@/lib/wallets/storage";
import { useRequireAuth } from "@/lib/auth/useRequireAuth";
import { traditionalAssets, traditionalCategories } from "@/lib/traditional/assets";
import {
  loadTraditionalHoldings,
  saveTraditionalHoldings,
  type TraditionalHoldings,
} from "@/lib/traditional/storage";
import {
  loadCryptoHoldings,
  loadStablecoinEntries,
  saveCryptoHoldings,
  saveStablecoinEntries,
  cryptoHoldingValueEur,
  type CryptoHoldings,
  type StablecoinEntry,
} from "@/lib/crypto/storage";

type TraditionalQuote = {
  symbol: string;
  price: number | null;
  changePercent: number | null;
  volume: number | null;
  updatedAt?: string;
};

type MarketRow = {
  symbol: string;
  name: string;
  priceUsd: number;
  marketCapUsd?: number | null;
};

type SubscriptionStatus = {
  status: string;
  current_period_end: string | null;
};

type SnapshotRow = {
  id: number;
  created_at: string;
  data: WalletSnapshot;
};

const isEvmAddress = (address?: string) => /^0x[a-fA-F0-9]{40}$/.test(address ?? "");
const isSolAddress = (address?: string) =>
  typeof address === "string" && address.length >= 32 && address.length <= 44;
const isBtcAddress = (address?: string) =>
  typeof address === "string" && /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,}$/.test(address);

// Sanitiza labels inseridos pelo utilizador — remove HTML e limita comprimento
const sanitizeLabel = (label: string): string =>
  label.replace(/[<>"'`]/g, "").replace(/javascript:/gi, "").trim().slice(0, 64);
const isAdaAddress = (address?: string) =>
  typeof address === "string" && /^(addr1|stake1)[0-9a-z]+$/i.test(address);
const getAllowedHosts = () =>
  (process.env.NEXT_PUBLIC_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);

const evmNetworks: EvmNetwork[] = [
  "Ethereum", "Arbitrum", "Optimism", "Base", "Polygon", "BSC",
  "Avalanche", "Fantom", "zkSync", "Linea", "Gnosis", "Celo", "Cronos", "Scroll", "Mantle", "Blast",
];
/** Mapeamento do id em "Adicionar endereço manual" para EvmNetwork (permite ler saldo por rede). */
const MANUAL_ADD_TO_EVM_NETWORK: Record<string, EvmNetwork> = {
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
const MANUAL_ADD_TO_SOL_NETWORK: Record<string, string> = {
  sol: "Solana",
  sol_l2: "Solana L2",
  raydium: "Raydium",
  orca: "Orca",
  sol_dex: "Solana DEX",
};
const ethNetworkLabelOptions: Array<{ id: EvmNetwork | "outro"; label: string; group?: string }> = [
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
const ethWalletOptions: Array<{ id: EvmProviderId; label: string }> = [
  { id: "metamask", label: "MetaMask" },
  { id: "rabby",    label: "Rabby Wallet" },
  { id: "rainbow",  label: "Rainbow Wallet" },
  { id: "coinbase", label: "Coinbase Wallet" },
  { id: "okx",      label: "OKX Wallet" },
  { id: "bybit",    label: "Bybit Wallet" },
  { id: "trust",    label: "Trust Wallet" },
  { id: "binance",  label: "Binance Chain Wallet" },
];
const solWalletOptions = [
  { id: "phantom",  label: "Phantom Wallet" },
  { id: "backpack", label: "Backpack" },
  { id: "solflare", label: "Solflare" },
  { id: "glow",     label: "Glow Wallet" },
  { id: "flint",    label: "Flint" },
] as const;
type SolanaWalletId = (typeof solWalletOptions)[number]["id"];
const solLabelOptions: Array<{ id: SolanaWalletId | "outro"; label: string }> = [
  ...solWalletOptions,
  { id: "outro", label: "Outro (qualquer endereço Solana)" },
];

/** Lista de redes para o dropdown "adicionar endereço" no card Solana. */
const solNetworkOptions: Array<{ id: string; label: string }> = [
  ...Object.entries(MANUAL_ADD_TO_SOL_NETWORK).map(([id, label]) => ({ id, label })),
  { id: "outro", label: "Outro (qualquer endereço Solana)" },
];

const adaWalletOptions: Array<{ id: CardanoWalletId; label: string }> = [
  { id: "eternl", label: "Eternl" },
  { id: "daedalus", label: "Daedalus" },
  { id: "yoroi", label: "Yoroi" },
  { id: "adalite", label: "Ada Lite" },
  { id: "lace", label: "Lace" },
];

/** Redes ADA/L2 para o dropdown ao adicionar endereço no card Cardano. */
const MANUAL_ADD_TO_ADA_NETWORK: Record<string, string> = {
  cardano: "Cardano",
  hydra: "Hydra",
  midnight: "Midnight",
  outro: "Outro (qualquer endereço Cardano/L2)",
};
const adaNetworkOptions: Array<{ id: string; label: string }> = [
  ...Object.entries(MANUAL_ADD_TO_ADA_NETWORK).map(([id, label]) => ({ id, label })),
];

const btcWalletOptions = [
  { id: "xverse", label: "Xverse" },
  { id: "electrum", label: "Electrum" },
  { id: "coinbase", label: "Coinbase Wallet" },
  { id: "exodus", label: "Exodus" },
] as const;
type BtcWalletId = (typeof btcWalletOptions)[number]["id"];

/** Redes BTC/L2 para o dropdown ao adicionar endereço no card Bitcoin. */
const MANUAL_ADD_TO_BTC_NETWORK: Record<string, string> = {
  bitcoin: "Bitcoin",
  liquid: "Liquid",
  rootstock: "Rootstock (RSK)",
  stacks: "Stacks",
  lightning: "Lightning (em breve)",
};
const btcNetworkOptions: Array<{ id: string; label: string }> = [
  ...Object.entries(MANUAL_ADD_TO_BTC_NETWORK).map(([id, label]) => ({ id, label })),
  { id: "outro", label: "Outro (qualquer endereço)" },
];

/** Redes para "Adicionar endereço manual (todas as redes)". ETH, SOL, BTC e ADA têm suporte a saldo. */
const MANUAL_ADD_NETWORKS: Array<{ id: string; label: string; group?: string }> = [
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

// Nome de carteira editável inline (✏️). O endereço nunca é mostrado — a carteira
// é identificada por este nome.
function EditableName({
  current, display, onSave, placeholder,
}: {
  current: string;
  display: React.ReactNode;
  onSave: (value: string) => void;
  placeholder: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(current);
  if (editing) {
    return (
      <span className="inline-flex items-center gap-1 align-middle">
        <input
          autoFocus
          value={draft}
          maxLength={64}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") { onSave(draft); setEditing(false); }
            if (e.key === "Escape") setEditing(false);
          }}
          className="w-36 rounded border border-slate-600 bg-slate-950 px-1.5 py-0.5 text-xs text-slate-100 outline-none focus:border-orange-400"
        />
        <button type="button" onClick={(e) => { e.stopPropagation(); onSave(draft); setEditing(false); }} className="text-[11px] text-emerald-400 hover:text-emerald-300">✓</button>
        <button type="button" onClick={(e) => { e.stopPropagation(); setEditing(false); }} className="text-[11px] text-slate-500 hover:text-slate-300">✕</button>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 align-middle">
      {display}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setDraft(current); setEditing(true); }}
        className="text-[10px] text-slate-500 transition hover:text-orange-400"
        title={placeholder}
        aria-label={placeholder}
      >
        ✏️
      </button>
    </span>
  );
}

export default function WalletsPage() {
  const supabase = useMemo(() => createClient(), []);
  useRequireAuth("/login");
  const { t } = useLanguage();
  const { format: fmtCur, symbol: curSym, currency: curCode, rate: curRate, hideBalances } = useCurrencyFormat();
  // Esconde qualquer saldo/quantidade/NFT quando a opção "esconder saldos" está ativa.
  const maskBal = (node: React.ReactNode): React.ReactNode => (hideBalances ? "••••" : node);
  const [isClient, setIsClient] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [isPro, setIsPro] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [cloudSyncError, setCloudSyncError] = useState<string | null>(null);
  const [walletMode, setWalletMode] = useState<"web3" | "tradicional">("web3");
  const [traditionalCategory, setTraditionalCategory] = useState("Todos");
  const [customTickerInput, setCustomTickerInput] = useState("");
  const [customTickerCategory, setCustomTickerCategory] = useState<"Ações" | "ETFs">("Ações");
  const [customAssets, setCustomAssets] = useState<import("@/lib/traditional/assets").TraditionalAsset[]>([]);
  const [traditionalQuotes, setTraditionalQuotes] = useState<Record<string, TraditionalQuote>>({});
  const [traditionalQuotesLoading, setTraditionalQuotesLoading] = useState(false);
  const [traditionalQuotesError, setTraditionalQuotesError] = useState<string | null>(null);
  const [traditionalQuoteLoading, setTraditionalQuoteLoading] = useState<Record<string, boolean>>(
    {}
  );
  const [traditionalHoldings, setTraditionalHoldings] = useState<TraditionalHoldings>({});
  const [traditionalPnlRange, setTraditionalPnlRange] = useState<
    Record<string, "1d" | "30d" | "60d" | "1y">
  >({});
  const [cryptoHoldings, setCryptoHoldings] = useState<CryptoHoldings>({});
  const [cryptoPrices, setCryptoPrices] = useState<Record<string, MarketRow>>({});
  const [cryptoPricesLoading, setCryptoPricesLoading] = useState(false);
  const [cryptoPricesError, setCryptoPricesError] = useState<string | null>(null);
  const [marketRows, setMarketRows] = useState<MarketRow[]>([]);
  const [cryptoSelectList, setCryptoSelectList] = useState<Array<{ symbol: string; name: string }>>([]);
  const [web3Prices, setWeb3Prices] = useState<Record<string, MarketRow>>({});
  const [web3PricesLoading, setWeb3PricesLoading] = useState(false);
  const [cryptoSortKey, setCryptoSortKey] = useState<"date" | "marketCap">("date");
  const [cryptoSortDir, setCryptoSortDir] = useState<"asc" | "desc">("desc");
  const [traditionalSortKey, setTraditionalSortKey] = useState<"date" | "marketCap">("date");
  const [traditionalSortDir, setTraditionalSortDir] = useState<"asc" | "desc">("desc");
  const traditionalHydratedRef = useRef(false);
  const cryptoHydratedRef = useRef(false);
  const walletsHydratedRef = useRef(false);
  const [availability, setAvailability] = useState({
    metamask: false,
    phantom: false,
    xverse: false,
    eternl: false,
  });
  const [ethAddress, setEthAddress] = useState<string>();
  const [ethConnectedNetwork, setEthConnectedNetwork] = useState<string>("Ethereum");
  const [ethBalance, setEthBalance] = useState<string>();
  const [ethError, setEthError] = useState<string | null>(null);
  const [ethLoading, setEthLoading] = useState(false);
  const [ethWallets, setEthWallets] = useState<StoredWalletEntry[]>([]);
  const [ethNewAddress, setEthNewAddress] = useState("");
  const [ethNewNetwork, setEthNewNetwork] = useState<EvmNetwork | "outro">("Ethereum");
  const [ethNewCustomLabel, setEthNewCustomLabel] = useState("");
  const [ethNewError, setEthNewError] = useState<string | null>(null);
  const [ethNewLoading, setEthNewLoading] = useState(false);
  const [ethShowMain, setEthShowMain] = useState(false);
  const [ethShown, setEthShown] = useState<Record<string, boolean>>({});
  const [ethBalancesByKey, setEthBalancesByKey] = useState<Record<string, string>>({});
  const [ethBalancesLoading, setEthBalancesLoading] = useState<Record<string, boolean>>({});
  const [ethBalanceErrors, setEthBalanceErrors] = useState<Record<string, string | null>>({});

  const [solAddress, setSolAddress] = useState<string>();
  const [solBalance, setSolBalance] = useState<string>();
  const [solError, setSolError] = useState<string | null>(null);
  const [solLoading, setSolLoading] = useState(false);
  const [solWallets, setSolWallets] = useState<StoredWalletEntry[]>([]);
  const [solNewAddress, setSolNewAddress] = useState("");
  const [solNewWalletId, setSolNewWalletId] = useState<string>("sol");
  const [solNewCustomLabel, setSolNewCustomLabel] = useState("");
  const [solNewError, setSolNewError] = useState<string | null>(null);
  const [solNewLoading, setSolNewLoading] = useState(false);
  const [solShowMain, setSolShowMain] = useState(false);
  const [solShown, setSolShown] = useState<Record<string, boolean>>({});
  const [showSolNetworks, setShowSolNetworks] = useState(false);
  const [selectedSolProvider, setSelectedSolProvider] = useState<(typeof solWalletOptions)[number]["id"]>("phantom");
  const [solBalancesByAddress, setSolBalancesByAddress] = useState<Record<string, string>>({});
  const [solBalancesLoading, setSolBalancesLoading] = useState<Record<string, boolean>>({});
  const [solBalanceErrors, setSolBalanceErrors] = useState<Record<string, string | null>>({});

  const [btcAddress, setBtcAddress] = useState<string>();
  const [btcBalance, setBtcBalance] = useState<number | null>(null);
  const [btcError, setBtcError] = useState<string | null>(null);
  const [btcLoading, setBtcLoading] = useState(false);
  const [btcWallets, setBtcWallets] = useState<StoredWalletEntry[]>([]);
  const [btcNewAddress, setBtcNewAddress] = useState("");
  const [btcNewLabel, setBtcNewLabel] = useState<string>("bitcoin");
  const [btcNewNetworkSelectOpen, setBtcNewNetworkSelectOpen] = useState(false);
  const [btcNewNetworkSelectFilter, setBtcNewNetworkSelectFilter] = useState("");
  const [btcNewCustomLabel, setBtcNewCustomLabel] = useState("");
  const [btcNewError, setBtcNewError] = useState<string | null>(null);
  const [btcNewLoading, setBtcNewLoading] = useState(false);
  const [btcShowMain, setBtcShowMain] = useState(false);
  const [btcShown, setBtcShown] = useState<Record<string, boolean>>({});
  const [btcBalancesByAddress, setBtcBalancesByAddress] = useState<Record<string, string>>({});
  const [btcBalancesLoading, setBtcBalancesLoading] = useState<Record<string, boolean>>({});
  const [btcBalanceErrors, setBtcBalanceErrors] = useState<Record<string, string | null>>({});
  const [btcRunesByAddress, setBtcRunesByAddress] = useState<Record<string, RunesBalanceEntry[]>>({});
  const [btcRunesLoading, setBtcRunesLoading] = useState<Record<string, boolean>>({});

  const [adaAddress, setAdaAddress] = useState<string>();
  const [adaBalance, setAdaBalance] = useState<string>();
  const [adaError, setAdaError] = useState<string | null>(null);
  const [adaLoading, setAdaLoading] = useState(false);
  const [adaApi, setAdaApi] = useState<EternlApi | null>(null);
  const [adaPeerAddress, setAdaPeerAddress] = useState<string | null>(null);
  const [adaPeerConnecting, setAdaPeerConnecting] = useState(false);
  const adaQrCanvasRef = useRef<HTMLDivElement>(null);
  const [adaWallets, setAdaWallets] = useState<StoredWalletEntry[]>([]);
  const [adaNewAddress, setAdaNewAddress] = useState("");
  const [adaNewError, setAdaNewError] = useState<string | null>(null);
  const [adaShowMain, setAdaShowMain] = useState(false);
  const [adaShown, setAdaShown] = useState<Record<string, boolean>>({});
  // Endereços escondidos por omissão (privacidade): "outras redes" e stablecoins.
  const [otherShown, setOtherShown] = useState<Record<string, boolean>>({});
  const [stableShown, setStableShown] = useState<Record<string, boolean>>({});
  const [selectedAdaProvider, setSelectedAdaProvider] = useState<CardanoWalletId>("eternl");
  const [showAdaNetworks, setShowAdaNetworks] = useState(false);
  const [adaNewNetworkId, setAdaNewNetworkId] = useState<string>("cardano");
  const [adaNewNetworkSelectOpen, setAdaNewNetworkSelectOpen] = useState(false);
  const [adaNewNetworkSelectFilter, setAdaNewNetworkSelectFilter] = useState("");
  const [adaNewCustomLabel, setAdaNewCustomLabel] = useState("");
  const [adaBalancesByAddress, setAdaBalancesByAddress] = useState<Record<string, string>>({});
  const [adaBalancesLoading, setAdaBalancesLoading] = useState<Record<string, boolean>>({});
  const [adaBalanceErrors, setAdaBalanceErrors] = useState<Record<string, string | null>>({});
  const [otherWallets, setOtherWallets] = useState<StoredWalletEntry[]>([]);
  const [defiTotals, setDefiTotals] = useState<Record<string, number | null>>({});
  const [cexHlTotalUsd, setCexHlTotalUsd] = useState(0);
  const [usdToEurRate, setUsdToEurRate] = useState(0.92);
  const [defiLoading, setDefiLoading] = useState<Record<string, boolean>>({});
  const [defiErrors, setDefiErrors] = useState<Record<string, string | null>>({});
  const [nftCounts, setNftCounts] = useState<Record<string, number>>({});
  const [nftLoading, setNftLoading] = useState<Record<string, boolean>>({});
  const [nftErrors, setNftErrors] = useState<Record<string, string | null>>({});
  const [nftsByKey, setNftsByKey] = useState<Record<string, Array<{ id: string; name: string; image?: string; tokenUri?: string; tokenAddress?: string; tokenId?: string }>>>({});
  // Tokens (ERC-20 / SPL) por endereço cold — para mostrar wETH etc. e somar ao portfólio.
  type ColdToken = { address: string; symbol: string; name: string; logo?: string; balance: string; usdValue: number; usdPrice: number; chain: string };
  const [coldTokensByAddr, setColdTokensByAddr] = useState<Record<string, ColdToken[]>>({});
  const [coldTokensLoading, setColdTokensLoading] = useState<Record<string, boolean>>({});
  const [evmProviders, setEvmProviders] = useState<Array<{ id: EvmProviderId; label: string }>>(
    []
  );
  const [selectedEvmProvider, setSelectedEvmProvider] = useState<EvmProviderId>("metamask");
  const [selectedEthConnectNetwork, setSelectedEthConnectNetwork] = useState<EvmNetwork>("Ethereum");
  const [ethNetworkSelectOpen, setEthNetworkSelectOpen] = useState(false);
  const ethNetworkSelectRef = useRef<HTMLDivElement>(null);
  const [showEthNetworks, setShowEthNetworks] = useState(false);
  const [selectedBtcProvider, setSelectedBtcProvider] = useState<BtcWalletId>("xverse");
  const [showSolWalletsList, setShowSolWalletsList] = useState(false);
  const [manualAddNetwork, setManualAddNetwork] = useState<string>("sol");
  const [manualAddNetworkOpen, setManualAddNetworkOpen] = useState(false);
  const [manualAddNetworkFilter, setManualAddNetworkFilter] = useState("");
  const manualAddNetworkRef = useRef<HTMLDivElement>(null);
  const [manualAddAddress, setManualAddAddress] = useState("");
  const [manualAddLabel, setManualAddLabel] = useState("");
  const [manualAddError, setManualAddError] = useState<string | null>(null);
  const [solWalletSelectOpen, setSolWalletSelectOpen] = useState(false);
  const [solWalletSelectFilter, setSolWalletSelectFilter] = useState("");
  const solWalletSelectRef = useRef<HTMLDivElement>(null);
  const [solNetworkSelectOpen, setSolNetworkSelectOpen] = useState(false);
  const solNetworkSelectRef = useRef<HTMLDivElement>(null);
  const [selectedSolNetwork, setSelectedSolNetwork] = useState<"Mainnet" | "Devnet">("Mainnet");
  const [solNewWalletSelectOpen, setSolNewWalletSelectOpen] = useState(false);
  const [solNewWalletSelectFilter, setSolNewWalletSelectFilter] = useState("");
  const solNewWalletSelectRef = useRef<HTMLDivElement>(null);
  const [ethWalletSelectOpen, setEthWalletSelectOpen] = useState(false);
  const [ethWalletSelectFilter, setEthWalletSelectFilter] = useState("");
  const ethWalletSelectRef = useRef<HTMLDivElement>(null);
  const [btcWalletSelectOpen, setBtcWalletSelectOpen] = useState(false);
  const [btcWalletSelectFilter, setBtcWalletSelectFilter] = useState("");
  const btcWalletSelectRef = useRef<HTMLDivElement>(null);
  const [adaWalletSelectOpen, setAdaWalletSelectOpen] = useState(false);
  const [adaWalletSelectFilter, setAdaWalletSelectFilter] = useState("");
  const adaWalletSelectRef = useRef<HTMLDivElement>(null);
  const btcNewNetworkSelectRef = useRef<HTMLDivElement>(null);
  const adaNewNetworkSelectRef = useRef<HTMLDivElement>(null);
  const [manualCryptoAssetSymbol, setManualCryptoAssetSymbol] = useState("");
  const [manualCryptoAssetDate, setManualCryptoAssetDate] = useState("");
  const [manualCryptoAssetAmountUsd, setManualCryptoAssetAmountUsd] = useState("");
  const [manualCryptoAssetQty, setManualCryptoAssetQty] = useState("");
  const [manualCryptoAssetError, setManualCryptoAssetError] = useState<string | null>(null);
  const [manualCryptoSelectOpen, setManualCryptoSelectOpen] = useState(false);
  const [manualCryptoFilter, setManualCryptoFilter] = useState("");
  const manualCryptoSelectRef = useRef<HTMLDivElement>(null);
  const [stablecoinEntries, setStablecoinEntries] = useState<StablecoinEntry[]>([]);
  const [stablecoinBalances, setStablecoinBalances] = useState<Record<string, string>>({});
  const [stablecoinBalancesLoading, setStablecoinBalancesLoading] = useState<Record<string, boolean>>({});
  const [stablecoinAddSymbol, setStablecoinAddSymbol] = useState<string>("USDT");
  const [stablecoinAddAddress, setStablecoinAddAddress] = useState("");
  const [stablecoinAddError, setStablecoinAddError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const confirmRef = useRef<{
    title: string;
    description: string;
    onConfirm: () => Promise<void> | void;
  } | null>(null);

  useEffect(() => {
    if (!manualCryptoSelectOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (manualCryptoSelectRef.current && !manualCryptoSelectRef.current.contains(e.target as Node)) {
        setManualCryptoSelectOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [manualCryptoSelectOpen]);

  useEffect(() => {
    if (!manualAddNetworkOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (manualAddNetworkRef.current && !manualAddNetworkRef.current.contains(e.target as Node)) {
        setManualAddNetworkOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [manualAddNetworkOpen]);

  useEffect(() => {
    if (!solWalletSelectOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (solWalletSelectRef.current && !solWalletSelectRef.current.contains(e.target as Node)) {
        setSolWalletSelectOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [solWalletSelectOpen]);

  useEffect(() => {
    if (!solNewWalletSelectOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (solNewWalletSelectRef.current && !solNewWalletSelectRef.current.contains(e.target as Node)) {
        setSolNewWalletSelectOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [solNewWalletSelectOpen]);

  useEffect(() => {
    if (!ethWalletSelectOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (ethWalletSelectRef.current && !ethWalletSelectRef.current.contains(e.target as Node)) {
        setEthWalletSelectOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [ethWalletSelectOpen]);

  useEffect(() => {
    if (!ethNetworkSelectOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (ethNetworkSelectRef.current && !ethNetworkSelectRef.current.contains(e.target as Node)) {
        setEthNetworkSelectOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [ethNetworkSelectOpen]);

  useEffect(() => {
    if (!solNetworkSelectOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (solNetworkSelectRef.current && !solNetworkSelectRef.current.contains(e.target as Node)) {
        setSolNetworkSelectOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [solNetworkSelectOpen]);

  useEffect(() => {
    if (!btcWalletSelectOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (btcWalletSelectRef.current && !btcWalletSelectRef.current.contains(e.target as Node)) {
        setBtcWalletSelectOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [btcWalletSelectOpen]);

  useEffect(() => {
    if (!adaWalletSelectOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (adaWalletSelectRef.current && !adaWalletSelectRef.current.contains(e.target as Node)) {
        setAdaWalletSelectOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [adaWalletSelectOpen]);

  useEffect(() => {
    if (!btcNewNetworkSelectOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (btcNewNetworkSelectRef.current && !btcNewNetworkSelectRef.current.contains(e.target as Node)) {
        setBtcNewNetworkSelectOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [btcNewNetworkSelectOpen]);

  useEffect(() => {
    if (!adaNewNetworkSelectOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (adaNewNetworkSelectRef.current && !adaNewNetworkSelectRef.current.contains(e.target as Node)) {
        setAdaNewNetworkSelectOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [adaNewNetworkSelectOpen]);

  useEffect(() => {
    setIsClient(true);
    setAvailability({
      metamask: isMetaMaskAvailable(),
      phantom: isPhantomAvailable(),
      xverse: isXverseAvailable(),
      eternl: isEternlAvailable(),
    });
    setEvmProviders(getEvmProviderOptions());
    const snapshot = loadWalletSnapshot();
    const hasLocal = snapshot.eth?.length || snapshot.sol?.length || snapshot.btc?.length || snapshot.ada?.length;

    if (hasLocal) {
      setEthWallets(snapshot.eth ?? []);
      setSolWallets(snapshot.sol ?? []);
      setBtcWallets(snapshot.btc ?? []);
      setAdaWallets(snapshot.ada ?? []);
      setOtherWallets(snapshot.other ?? []);
      walletsHydratedRef.current = true;
    } else {
      // No local data — try to restore from cloud
      fetch("/api/wallet-sync")
        .then(r => r.ok ? r.json() : null)
        .then((json: { data?: { eth?: unknown[]; sol?: unknown[]; btc?: unknown[]; ada?: unknown[]; other?: unknown[] } | null } | null) => {
          if (json?.data) {
            const d = json.data;
            saveWalletSnapshot(d as Parameters<typeof saveWalletSnapshot>[0]);
            setEthWallets((d.eth ?? []) as typeof ethWallets);
            setSolWallets((d.sol ?? []) as typeof solWallets);
            setBtcWallets((d.btc ?? []) as typeof btcWallets);
            setAdaWallets((d.ada ?? []) as typeof adaWallets);
            setOtherWallets((d.other ?? []) as typeof otherWallets);
          }
        })
        .catch(() => {})
        .finally(() => { walletsHydratedRef.current = true; });
    }
  }, []);

  useEffect(() => {
    if (!walletsHydratedRef.current) return;
    const id = window.setTimeout(() => {
      const snap = { eth: ethWallets, sol: solWallets, btc: btcWallets, ada: adaWallets, other: otherWallets };
      updateWalletSnapshot(snap);
      // Sync to cloud so other devices stay in sync
      fetch("/api/wallet-sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: snap }) }).catch(() => {});
    }, 500);
    return () => window.clearTimeout(id);
  }, [ethWallets, solWallets, btcWallets, adaWallets, otherWallets]);

  useEffect(() => {
    const loadAuth = async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) {
        setIsLoadingAuth(false);
        return;
      }

      setUserId(user.id);

      const { data: subscription } = await supabase
        .from("subscriptions")
        .select("status, current_period_end")
        .eq("user_id", user.id)
        .order("current_period_end", { ascending: false })
        .limit(1)
        .maybeSingle();

      const isActive =
        subscription?.status === "active" || subscription?.status === "trialing";
      const periodEnd = subscription?.current_period_end
        ? new Date(subscription.current_period_end).getTime()
        : null;

      const pro = isActive && (!periodEnd || periodEnd > Date.now());
      setIsPro(pro);
      setIsLoadingAuth(false);
    };

    loadAuth();
  }, [supabase]);

  useEffect(() => {
    setTraditionalHoldings(loadTraditionalHoldings());
    traditionalHydratedRef.current = true;
  }, []);

  useEffect(() => {
    setCryptoHoldings(loadCryptoHoldings());
    cryptoHydratedRef.current = true;
  }, []);

  useEffect(() => {
    const entries = loadStablecoinEntries();
    setStablecoinEntries(entries);
    setStablecoinBalances(
      entries.reduce((acc, e) => ({ ...acc, [e.id]: e.balance ?? "—" }), {} as Record<string, string>)
    );
  }, []);

  useEffect(() => {
    saveStablecoinEntries(stablecoinEntries);
  }, [stablecoinEntries]);

  useEffect(() => {
    if (!traditionalHydratedRef.current) return;
    const id = window.setTimeout(() => saveTraditionalHoldings(traditionalHoldings), 120);
    return () => window.clearTimeout(id);
  }, [traditionalHoldings]);

  useEffect(() => {
    if (!cryptoHydratedRef.current) return;
    const id = window.setTimeout(() => saveCryptoHoldings(cryptoHoldings), 120);
    return () => window.clearTimeout(id);
  }, [cryptoHoldings]);

  useEffect(() => {
    if (!userId || !isPro) return;
    const loadCloudSnapshot = async () => {
      const { data: rows } = await supabase
        .from("portfolio_snapshots")
        .select("id, created_at, data")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1);

      const latest = (rows ?? [])[0] as SnapshotRow | undefined;
      if (!latest?.data) return;

      const localSnapshot = loadWalletSnapshot();
      const localCount =
        (localSnapshot.eth?.length ?? 0) +
        (localSnapshot.sol?.length ?? 0) +
        (localSnapshot.btc?.length ?? 0) +
        (localSnapshot.ada?.length ?? 0);

      if (localCount > 0) return;

      updateWalletSnapshot(latest.data);
      setEthWallets(latest.data.eth ?? []);
      setSolWallets(latest.data.sol ?? []);
      setBtcWallets(latest.data.btc ?? []);
      setAdaWallets(latest.data.ada ?? []);
      setOtherWallets(latest.data.other ?? []);
    };

    loadCloudSnapshot();
  }, [userId, isPro, supabase]);

  useEffect(() => {
    if (!userId || !isPro) return;
    if (isLoadingAuth) return;
    const timeoutId = window.setTimeout(async () => {
      const snapshot: WalletSnapshot = {
        eth: ethWallets,
        sol: solWallets,
        btc: btcWallets,
        ada: adaWallets,
        other: otherWallets,
      };

      const { error } = await supabase
        .from("portfolio_snapshots")
        .insert({ user_id: userId, data: snapshot });

      if (error) {
        setCloudSyncError(t("wl_err_sync"));
        return;
      }
      setCloudSyncError(null);
    }, 1200);

    return () => window.clearTimeout(timeoutId);
  }, [ethWallets, solWallets, btcWallets, adaWallets, userId, isPro, isLoadingAuth, supabase]);

  type DefiChain = "eth" | "sol" | "btc" | "ada";
  const defiKey = (address: string, chain: DefiChain | string) => `${address}:${chain}`;

  /** Maps EVM network name to Moralis chain id (for L2-specific DeFi/NFT queries) */
  const networkToMoralisChain = (network: string): string => {
    const map: Record<string, string> = {
      Ethereum: "eth", Arbitrum: "arbitrum", Optimism: "optimism",
      Base: "base", Polygon: "polygon", BSC: "bsc", Avalanche: "avalanche",
      Linea: "linea", zkSync: "zksync",
    };
    return map[network] ?? "eth";
  };

  const fetchDefiForEntry = async (address: string, network: string) => {
    const moralisChain = networkToMoralisChain(network);
    const key = defiKey(address, network);
    setDefiLoading((prev) => ({ ...prev, [key]: true }));
    setDefiErrors((prev) => ({ ...prev, [key]: null }));
    try {
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const isEthMainnet = moralisChain === "eth";
      const url = isEthMainnet
        ? `${base}/api/defi-balance?address=${encodeURIComponent(address)}&chain=eth`
        : `${base}/api/defi-balance?address=${encodeURIComponent(address)}&chain=eth&evmChain=${moralisChain}`;
      const response = await fetch(url);
      const data = (await response.json()) as { total?: number; error?: string };
      const total = typeof data?.total === "number" && Number.isFinite(data.total) ? data.total : 0;
      setDefiTotals((prev) => ({ ...prev, [key]: total }));
      setDefiErrors((prev) => ({ ...prev, [key]: null }));
    } catch (error) {
      setDefiErrors((prev) => ({ ...prev, [key]: error instanceof Error ? error.message : "Erro DeFi." }));
      setDefiTotals((prev) => ({ ...prev, [key]: null }));
    } finally {
      setDefiLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  const fetchNftForEntry = async (address: string, network: string) => {
    const moralisChain = networkToMoralisChain(network);
    const key = defiKey(address, network);
    setNftLoading((prev) => ({ ...prev, [key]: true }));
    setNftErrors((prev) => ({ ...prev, [key]: null }));
    try {
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const isEthMainnet = moralisChain === "eth";
      const url = isEthMainnet
        ? `${base}/api/nft-balance?address=${encodeURIComponent(address)}&chain=eth`
        : `${base}/api/nft-balance?address=${encodeURIComponent(address)}&chain=eth&evmChain=${moralisChain}`;
      const response = await fetch(url);
      const data = (await response.json()) as { count?: number; nfts?: Array<{ id: string; name: string; image?: string; tokenUri?: string; tokenAddress?: string; tokenId?: string }>; error?: string };
      setNftCounts((prev) => ({ ...prev, [key]: data.count ?? 0 }));
      setNftsByKey((prev) => ({ ...prev, [key]: data.nfts ?? [] }));
      setNftErrors((prev) => ({ ...prev, [key]: null }));
    } catch (error) {
      setNftErrors((prev) => ({ ...prev, [key]: error instanceof Error ? error.message : "Erro NFT." }));
    } finally {
      setNftLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  const fetchDefiTotal = async (address: string, chain: DefiChain) => {
    const key = defiKey(address, chain);
    setDefiLoading((prev) => ({ ...prev, [key]: true }));
    setDefiErrors((prev) => ({ ...prev, [key]: null }));
    try {
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const response = await fetch(
        `${base}/api/defi-balance?address=${encodeURIComponent(address)}&chain=${chain}`
      );
      const data = (await response.json()) as { total?: number; error?: string };
      if (!response.ok) {
        const msg = data?.error ?? "Falha ao consultar DeFi.";
        setDefiTotals((prev) => ({ ...prev, [key]: null }));
        setDefiErrors((prev) => ({ ...prev, [key]: msg }));
        return;
      }
      const total = typeof data?.total === "number" && Number.isFinite(data.total) ? data.total : 0;
      setDefiTotals((prev) => ({ ...prev, [key]: total }));
      setDefiErrors((prev) => ({ ...prev, [key]: null }));
    } catch (error) {
      setDefiErrors((prev) => ({
        ...prev,
        [key]: error instanceof Error ? error.message : t("wl_err_defi"),
      }));
      setDefiTotals((prev) => ({ ...prev, [key]: null }));
    } finally {
      setDefiLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  const ethMainAddress = ethAddress ?? ethWallets[0]?.address;
  const solMainAddress = solAddress ?? solWallets[0]?.address;
  const btcMainAddress = btcAddress ?? btcWallets[0]?.address;
  const adaMainAddress = adaAddress ?? adaWallets[0]?.address;

  /** Todos os endereços por chain (principal + carteiras adicionadas) para DeFi e NFTs. */
  const ethAddresses = useMemo(
    () => Array.from(new Set([ethAddress, ...ethWallets.map((w) => w.address)].filter(Boolean) as string[])),
    [ethAddress, ethWallets]
  );
  const solAddresses = useMemo(
    () => Array.from(new Set([solAddress, ...solWallets.map((w) => w.address)].filter(Boolean) as string[])),
    [solAddress, solWallets]
  );
  const btcAddresses = useMemo(
    () => Array.from(new Set([btcAddress, ...btcWallets.map((w) => w.address)].filter(Boolean) as string[])),
    [btcAddress, btcWallets]
  );
  const adaAddresses = useMemo(
    () => Array.from(new Set([adaAddress, ...adaWallets.map((w) => w.address)].filter(Boolean) as string[])),
    [adaAddress, adaWallets]
  );

  useEffect(() => {
    // Fetch DeFi and NFT per wallet entry using the entry's specific network
    ethWallets.forEach((w) => {
      if (!w.address) return;
      void fetchDefiForEntry(w.address, w.network ?? "Ethereum");
      void fetchNftForEntry(w.address, w.network ?? "Ethereum");
    });
    // Also fetch for connected address on Ethereum mainnet (for main WalletCard)
    if (ethAddress) {
      void fetchDefiTotal(ethAddress, "eth");
      void fetchNftBalance(ethAddress, "eth");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ethWallets.map(w => `${w.address}:${w.network}`).join(","), ethAddress]);
  useEffect(() => {
    solAddresses.forEach((addr) => fetchDefiTotal(addr, "sol"));
  }, [solAddresses.join(",")]);
  useEffect(() => {
    btcAddresses.forEach((addr) => fetchDefiTotal(addr, "btc"));
  }, [btcAddresses.join(",")]);
  useEffect(() => {
    adaAddresses.forEach((addr) => fetchDefiTotal(addr, "ada"));
  }, [adaAddresses.join(",")]);

  const fetchNftBalance = async (address: string, chain: DefiChain) => {
    const key = defiKey(address, chain);
    setNftLoading((prev) => ({ ...prev, [key]: true }));
    setNftErrors((prev) => ({ ...prev, [key]: null }));
    try {
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const response = await fetch(
        `${base}/api/nft-balance?address=${encodeURIComponent(address)}&chain=${chain}`
      );
      const data = (await response.json()) as { count?: number; nfts?: Array<{ id: string; name: string; image?: string; tokenUri?: string; tokenAddress?: string; tokenId?: string }>; error?: string };
      if (!response.ok) {
        setNftCounts((prev) => ({ ...prev, [key]: 0 }));
        setNftErrors((prev) => ({ ...prev, [key]: data?.error ?? "Falha ao consultar NFTs." }));
        setNftsByKey((prev) => ({ ...prev, [key]: [] }));
        return;
      }
      const count = typeof data?.count === "number" ? data.count : 0;
      const nfts = Array.isArray(data?.nfts) ? data.nfts : [];
      setNftCounts((prev) => ({ ...prev, [key]: count }));
      setNftErrors((prev) => ({ ...prev, [key]: null }));
      setNftsByKey((prev) => ({ ...prev, [key]: nfts }));
    } catch (error) {
      setNftErrors((prev) => ({ ...prev, [key]: error instanceof Error ? error.message : t("wl_err_nft") }));
      setNftCounts((prev) => ({ ...prev, [key]: 0 }));
      setNftsByKey((prev) => ({ ...prev, [key]: [] }));
    } finally {
      setNftLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  useEffect(() => {
    ethAddresses.forEach((addr) => fetchNftBalance(addr, "eth"));
  }, [ethAddresses.join(",")]);
  useEffect(() => {
    solAddresses.forEach((addr) => fetchNftBalance(addr, "sol"));
  }, [solAddresses.join(",")]);
  useEffect(() => {
    btcAddresses.forEach((addr) => fetchNftBalance(addr, "btc"));
  }, [btcAddresses.join(",")]);
  useEffect(() => {
    adaAddresses.forEach((addr) => fetchNftBalance(addr, "ada"));
  }, [adaAddresses.join(",")]);

  const refreshCryptoPrices = async () => {
    const symbols = Object.keys(cryptoHoldings);
    setCryptoPricesLoading(true);
    setCryptoPricesError(null);
    try {
      const response = await fetch("/api/markets");
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Falha ao obter preços.");
      }
      const payload = (await response.json()) as {
        data?: MarketRow[];
        selectList?: Array<{ symbol: string; name: string; priceUsd?: number | null; marketCapUsd?: number | null }>;
      };
      setMarketRows(payload.data ?? []);
      setCryptoSelectList(payload.selectList ?? []);
      if (symbols.length === 0) {
        setCryptoPrices({});
      } else {
        const map: Record<string, MarketRow> = {};
        (payload.data ?? []).forEach((row) => {
          map[row.symbol] = row;
        });
        // For symbols not covered by CoinEx (e.g. BTC, ETH from selectList only),
        // fetch prices from /api/prices which always has BTC, ETH, SOL
        const missing = symbols.filter((s) => !map[s]);
        if (missing.length > 0) {
          try {
            const pricesRes = await fetch("/api/prices");
            if (pricesRes.ok) {
              const pricesData = (await pricesRes.json()) as {
                prices?: { btc_eur?: number; eth_eur?: number; sol_eur?: number; usdToEur?: number };
              };
              const rate = pricesData.prices?.usdToEur ?? 0.92;
              const fillFrom: Record<string, { priceUsd: number; name: string }> = {
                BTC: { priceUsd: (pricesData.prices?.btc_eur ?? 0) / rate, name: "Bitcoin" },
                ETH: { priceUsd: (pricesData.prices?.eth_eur ?? 0) / rate, name: "Ethereum" },
                SOL: { priceUsd: (pricesData.prices?.sol_eur ?? 0) / rate, name: "Solana" },
              };
              missing.forEach((sym) => {
                if (fillFrom[sym] && fillFrom[sym].priceUsd > 0) {
                  const info = payload.selectList?.find((r) => r.symbol === sym);
                  map[sym] = {
                    symbol: sym,
                    name: info?.name ?? fillFrom[sym].name,
                    priceUsd: fillFrom[sym].priceUsd,
                    marketCapUsd: null,
                  };
                }
              });
            }
          } catch { /* ignore, use what we have */ }
          // Fallback final: preço vindo do selectList (CoinGecko). Cobre ativos sem
          // par na CoinEx e por isso ausentes de `data` — ex.: USDT e outras estáveis.
          missing.forEach((sym) => {
            if (map[sym]) return;
            const info = payload.selectList?.find((r) => r.symbol === sym);
            if (info && typeof info.priceUsd === "number" && info.priceUsd > 0) {
              map[sym] = {
                symbol: sym,
                name: info.name,
                priceUsd: info.priceUsd,
                marketCapUsd: info.marketCapUsd ?? null,
              };
            }
          });
        }
        setCryptoPrices(map);
      }
    } catch (error) {
      setCryptoPricesError(error instanceof Error ? error.message : t("wl_err_prices"));
    } finally {
      setCryptoPricesLoading(false);
    }
  };

  const requestConfirm = (payload: {
    title: string;
    description: string;
    onConfirm: () => Promise<void> | void;
  }) => {
    const host = typeof window !== "undefined" ? window.location.hostname : "";
    const allowed = getAllowedHosts();
    if (allowed.length && !allowed.includes(host)) {
      confirmRef.current = {
        title: "Domínio não autorizado",
        description: `Este domínio (${host || "atual"}) não está autorizado para ligação.`,
        onConfirm: () => {},
      };
      setConfirmError(t("wl_blocked_security"));
      setConfirmOpen(true);
      return;
    }
    confirmRef.current = payload;
    setConfirmError(null);
    setConfirmOpen(true);
  };

  const handleConfirm = async () => {
    const current = confirmRef.current;
    if (!current) return;
    try {
      await current.onConfirm();
      setConfirmOpen(false);
      confirmRef.current = null;
    } catch (error) {
      setConfirmError(error instanceof Error ? error.message : "Erro ao confirmar.");
    }
  };

  useEffect(() => {
    if (walletMode !== "web3") return;
    refreshCryptoPrices();
    const id = window.setInterval(refreshCryptoPrices, 60000);
    return () => window.clearInterval(id);
  }, [walletMode, cryptoHoldings]);

  const refreshWeb3Prices = async () => {
    setWeb3PricesLoading(true);
    try {
      const response = await fetch("/api/markets");
      if (!response.ok) {
        throw new Error("Falha ao obter preços.");
      }
      const payload = (await response.json()) as { data?: MarketRow[] };
      const map: Record<string, MarketRow> = {};
      (payload.data ?? []).forEach((row) => {
        map[row.symbol] = row;
      });
      setWeb3Prices(map);
    } catch {
      setWeb3Prices({});
    } finally {
      setWeb3PricesLoading(false);
    }
  };

  useEffect(() => {
    if (walletMode !== "web3") return;
    refreshWeb3Prices();
    const id = window.setInterval(refreshWeb3Prices, 60000);
    // Fetch EUR/USD rate for CEX+DeFi conversion
    fetch("/api/prices", { cache: "no-store" })
      .then(r => r.json())
      .then((d: { prices?: { usdToEur?: number } }) => {
        if (d.prices?.usdToEur && d.prices.usdToEur > 0) setUsdToEurRate(d.prices.usdToEur);
      })
      .catch(() => {});
    return () => window.clearInterval(id);
  }, [walletMode]);

  const getFiatValue = (symbol: string, balanceValue?: string | number | null) => {
    const price = web3Prices[symbol]?.priceUsd ?? null;
    const amount = Number(balanceValue ?? 0);
    if (!Number.isFinite(amount) || price == null || !Number.isFinite(price)) return null;
    return amount * price;
  };

  const ethIsAvailable = isClient && !!getEvmProviderById(selectedEvmProvider);
  const solIsAvailable =
    isClient &&
    (isSolanaWalletAvailable(selectedSolProvider) || solWallets.length > 0);
  const btcIsAvailable = isClient && isBtcWalletAvailable(selectedBtcProvider);
  const adaIsAvailable = isClient && isCardanoWalletAvailable(selectedAdaProvider);

  const ethBalanceKey = (addr: string, net: string) => `${addr}-${net}`;

  // Entrada activa: o wallet da rede seleccionada no dropdown
  const ethActiveEntry = useMemo(() => {
    return ethWallets.find(w => w.network === selectedEthConnectNetwork && w.address) ?? null;
  }, [ethWallets, selectedEthConnectNetwork]);

  // Saldo da entrada activa (usa ethBalance se for a mainnet conectada via MetaMask)
  const ethActiveBalance = useMemo(() => {
    if (!ethActiveEntry) return ethBalance ?? null;
    const key = ethBalanceKey(ethActiveEntry.address!, ethActiveEntry.network!);
    return ethBalancesByKey[key] ?? ethActiveEntry.balance ?? null;
  }, [ethActiveEntry, ethBalancesByKey, ethBalance]);

  const totalEthBalance = useMemo(() => {
    // Include connected MetaMask wallet first (same pattern as SOL)
    const seen = new Set<string>();
    let sum = 0;
    if (ethAddress) {
      const connNet = ethConnectedNetwork ?? "Ethereum";
      const k = ethBalanceKey(ethAddress, connNet);
      seen.add(k);
      const b = ethBalancesByKey[k] ?? ethBalance;
      sum += typeof b === "string" && b !== "—" ? parseFloat(b) || 0 : 0;
    }
    // Add manually-added wallets, skip if same address+network already counted
    ethWallets.forEach((w) => {
      if (!w.address) return;
      const net = w.network ?? "Ethereum";
      const k = ethBalanceKey(w.address, net);
      if (seen.has(k)) return;
      seen.add(k);
      const b = ethBalancesByKey[k] ?? w.balance;
      sum += typeof b === "string" && b !== "—" ? parseFloat(b) || 0 : 0;
    });
    return sum.toFixed(4);
  }, [ethWallets, ethBalancesByKey, ethAddress, ethConnectedNetwork, ethBalance]);

  const totalSolBalance = useMemo(() => {
    let sum = parseFloat(solBalance ?? "") || 0;
    solWallets.forEach((w) => {
      if (w.address && w.address !== solAddress) {
        const b = solBalancesByAddress[w.address] ?? w.balance;
        sum += typeof b === "string" && b !== "—" ? parseFloat(b) || 0 : 0;
      }
    });
    return sum.toFixed(4);
  }, [solBalance, solWallets, solAddress, solBalancesByAddress]);

  const totalBtcBalance = useMemo(() => {
    let sum = btcBalance ?? 0;
    btcWallets.forEach((w) => {
      if (w.address && w.address !== btcAddress) {
        const b = btcBalancesByAddress[w.address] ?? w.balance;
        sum += typeof b === "string" && b !== "—" ? parseFloat(b) || 0 : 0;
      }
    });
    return sum.toFixed(8);
  }, [btcBalance, btcWallets, btcAddress, btcBalancesByAddress]);

  const btcRunesSummary = useMemo(() => {
    const l2Networks = ["Liquid", "Rootstock (RSK)", "Stacks", "Lightning (em breve)"];
    const seen = new Set<string>();
    const addresses: string[] = [];
    if (btcAddress && !seen.has(btcAddress)) {
      seen.add(btcAddress);
      addresses.push(btcAddress);
    }
    btcWallets.forEach((w) => {
      if (w.address && !l2Networks.includes(w.network ?? "") && !seen.has(w.address)) {
        seen.add(w.address);
        addresses.push(w.address);
      }
    });
    const loading = addresses.some((addr) => btcRunesLoading[addr]);
    const bySymbol: Record<string, { amount: number; displayName: string }> = {};
    addresses.forEach((addr) => {
      (btcRunesByAddress[addr] ?? []).forEach((r) => {
        const n = parseFloat(r.amount) || 0;
        if (n > 0) {
          if (!bySymbol[r.symbol]) bySymbol[r.symbol] = { amount: 0, displayName: r.displayName };
          bySymbol[r.symbol].amount += n;
        }
      });
    });
    const runes = Object.entries(bySymbol).map(([symbol, { amount, displayName }]) => ({ symbol, amount, displayName }));
    return { loading, runes };
  }, [btcAddress, btcWallets, btcRunesByAddress, btcRunesLoading]);

  const formatRuneAmount = (amount: number | string) => {
    const n = typeof amount === "string" ? parseFloat(amount) || 0 : amount;
    return n >= 1e9 ? String(amount) : n.toLocaleString("pt-PT", { maximumFractionDigits: 4 });
  };

  const totalAdaBalance = useMemo(() => {
    let sum = parseFloat(adaBalance ?? "") || 0;
    adaWallets.forEach((w) => {
      if (w.address && w.address !== adaAddress) {
        const b = adaBalancesByAddress[w.address] ?? w.balance;
        sum += typeof b === "string" && b !== "—" ? parseFloat(b) || 0 : 0;
      }
    });
    return sum.toFixed(6);
  }, [adaBalance, adaWallets, adaAddress, adaBalancesByAddress]);

  const upsertWallet = (
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

  const removeWallet = (
    list: StoredWalletEntry[],
    matcher: (item: StoredWalletEntry) => boolean
  ) => list.filter((item) => !matcher(item));

  const formatAddress = (address?: string) => {
    if (!address) return "—";
    if (address.length <= 12) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const toggleTraditional = (assetId: string) => {
    setTraditionalHoldings((prev) => {
      const next = { ...prev };
      if (next[assetId]) {
        delete next[assetId];
      } else {
        next[assetId] = {};
      }
      return next;
    });
  };

  const updateTraditionalBuy = (assetId: string, next: { buyValue?: number; buyDate?: string }) => {
    setTraditionalHoldings((prev) => {
      const nextHoldings = {
        ...prev,
        [assetId]: {
          ...prev[assetId],
          ...next,
        },
      };
      return nextHoldings;
    });
  };

  const getTraditionalPnl = (assetId: string, changePercent?: number | null) => {
    const range = traditionalPnlRange[assetId] ?? "1d";
    if (range === "1d") {
      return { label: "1D", value: changePercent ?? null };
    }
    return { label: range.toUpperCase(), value: null };
  };

  const toggleCryptoHolding = (symbol: string) => {
    setCryptoHoldings((prev) => {
      const next = { ...prev };
      if (next[symbol]) {
        delete next[symbol];
      } else {
        next[symbol] = {};
      }
      return next;
    });
  };

  const updateCryptoHolding = (
    symbol: string,
    next: { buyValue?: number; buyDate?: string; quantity?: number }
  ) => {
    setCryptoHoldings((prev) => {
      const nextHoldings = {
        ...prev,
        [symbol]: {
          ...prev[symbol],
          ...next,
        },
      };
      return nextHoldings;
    });
  };

  const allTraditionalAssets = useMemo(
    () => [...traditionalAssets, ...customAssets.filter((c) => !traditionalAssets.some((a) => a.id === c.id))],
    [customAssets]
  );

  const visibleTraditionalAssets =
    traditionalCategory === "Todos"
      ? allTraditionalAssets
      : allTraditionalAssets.filter((asset) => asset.category === traditionalCategory);

  const selectedTraditionalAssets = useMemo(
    () => allTraditionalAssets.filter((asset) => !!traditionalHoldings[asset.id]),
    [allTraditionalAssets, traditionalHoldings]
  );

  const selectedCryptoSymbols = useMemo(() => Object.keys(cryptoHoldings), [cryptoHoldings]);

  const cryptoManualTotal = useMemo(() => {
    return Object.entries(cryptoHoldings).reduce((sum, [symbol, holding]) => {
      const priceUsd = cryptoPrices[symbol]?.priceUsd;
      const priceEur = priceUsd ? priceUsd * usdToEurRate : undefined;
      return sum + cryptoHoldingValueEur(holding, priceEur);
    }, 0);
  }, [cryptoHoldings, cryptoPrices, usdToEurRate]);

  const walletsTotalUsd = useMemo(() => {
    const eth = getFiatValue("ETH", totalEthBalance) ?? 0;
    const sol = getFiatValue("SOL", totalSolBalance) ?? 0;
    const btc = getFiatValue("BTC", totalBtcBalance) ?? 0;
    const ada = getFiatValue("ADA", totalAdaBalance) ?? 0;
    return eth + sol + btc + ada;
  }, [totalEthBalance, totalSolBalance, totalBtcBalance, totalAdaBalance, web3Prices]);

  // "Ethereum" and "eth" refer to the same chain — normalize so the same address
  // fetched under different key formats isn't double-counted.
  const normalizeChain = (c: string) => {
    if (c === "Ethereum" || c === "eth") return "eth";
    return c.toLowerCase();
  };

  const totalNftCount = useMemo(() => {
    const seen = new Set<string>();
    let sum = 0;
    for (const [key, count] of Object.entries(nftCounts)) {
      const colonIdx = key.indexOf(":");
      const addr = key.slice(0, colonIdx);
      const chain = normalizeChain(key.slice(colonIdx + 1));
      const normalized = `${addr}:${chain}`;
      if (!seen.has(normalized)) {
        seen.add(normalized);
        sum += typeof count === "number" ? count : 0;
      }
    }
    return sum;
  }, [nftCounts]);

  const totalDefiUsd = useMemo((): number => {
    const seen = new Set<string>();
    let sum = 0;
    for (const [key, value] of Object.entries(defiTotals)) {
      const colonIdx = key.indexOf(":");
      const addr = key.slice(0, colonIdx);
      const chain = normalizeChain(key.slice(colonIdx + 1));
      const normalized = `${addr}:${chain}`;
      if (!seen.has(normalized)) {
        seen.add(normalized);
        if (typeof value === "number" && Number.isFinite(value)) sum += value;
      }
    }
    return sum;
  }, [defiTotals]);

  useEffect(() => {
    // Store as USD; portfolio page converts to EUR via usdToEur from /api/prices
    updateWalletSnapshot({ cexUsd: cexHlTotalUsd, defiUsd: totalDefiUsd });
  }, [cexHlTotalUsd, totalDefiUsd]);

  useEffect(() => {
    // Persistir os ativos manuais (em EUR) no snapshot, para contarem no
    // dashboard, nos snapshots da Supabase e noutros dispositivos.
    updateWalletSnapshot({ manualEur: cryptoManualTotal });
  }, [cryptoManualTotal]);

  const sortedCryptoSymbols = useMemo(() => {
    const dir = cryptoSortDir === "asc" ? 1 : -1;
    return [...selectedCryptoSymbols].sort((a, b) => {
      if (cryptoSortKey === "date") {
        const ad = cryptoHoldings[a]?.buyDate ?? "";
        const bd = cryptoHoldings[b]?.buyDate ?? "";
        return ad.localeCompare(bd) * dir;
      }
      const acap = cryptoPrices[a]?.marketCapUsd ?? 0;
      const bcap = cryptoPrices[b]?.marketCapUsd ?? 0;
      return (acap - bcap) * dir;
    });
  }, [selectedCryptoSymbols, cryptoSortDir, cryptoSortKey, cryptoHoldings, cryptoPrices]);

  const sortedTraditionalAssets = useMemo(() => {
    const dir = traditionalSortDir === "asc" ? 1 : -1;
    return [...selectedTraditionalAssets].sort((a, b) => {
      if (traditionalSortKey === "date") {
        const ad = traditionalHoldings[a.id]?.buyDate ?? "";
        const bd = traditionalHoldings[b.id]?.buyDate ?? "";
        return ad.localeCompare(bd) * dir;
      }
      const aq = a.alphaSymbol ? traditionalQuotes[a.alphaSymbol] : undefined;
      const bq = b.alphaSymbol ? traditionalQuotes[b.alphaSymbol] : undefined;
      const aCap = (aq?.price ?? 0) * (aq?.volume ?? 0);
      const bCap = (bq?.price ?? 0) * (bq?.volume ?? 0);
      return (aCap - bCap) * dir;
    });
  }, [
    selectedTraditionalAssets,
    traditionalSortDir,
    traditionalSortKey,
    traditionalHoldings,
    traditionalQuotes,
  ]);

  const selectedQuoteSymbols = useMemo(
    () =>
      selectedTraditionalAssets
        .map((asset) => asset.alphaSymbol)
        .filter((symbol): symbol is string => typeof symbol === "string" && symbol.length > 0),
    [selectedTraditionalAssets]
  );

  const refreshTraditionalQuotes = async (symbols: string[]) => {
    if (symbols.length === 0) return;
    setTraditionalQuotesLoading(true);
    setTraditionalQuotesError(null);
    try {
      const response = await fetch(
        `/api/traditional?symbols=${encodeURIComponent(symbols.join(","))}`
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Falha ao obter cotações.");
      }
      const payload = (await response.json()) as { data: TraditionalQuote[] };
      const next: Record<string, TraditionalQuote> = {};
      payload.data.forEach((quote) => {
        next[quote.symbol] = quote;
      });
      setTraditionalQuotes(next);
    } catch (error) {
      setTraditionalQuotesError(error instanceof Error ? error.message : "Erro ao obter dados.");
      setTraditionalQuotes({});
    } finally {
      setTraditionalQuotesLoading(false);
    }
  };

  useEffect(() => {
    if (walletMode !== "tradicional") return;
    if (selectedQuoteSymbols.length === 0) {
      setTraditionalQuotes({});
      setTraditionalQuotesError(null);
      return;
    }
    refreshTraditionalQuotes(selectedQuoteSymbols);
    const id = window.setInterval(() => refreshTraditionalQuotes(selectedQuoteSymbols), 60000);
    return () => window.clearInterval(id);
  }, [walletMode, selectedQuoteSymbols]);

  const refreshTraditionalQuote = async (symbol?: string) => {
    if (!symbol) return;
    setTraditionalQuoteLoading((prev) => ({ ...prev, [symbol]: true }));
    try {
      const response = await fetch(`/api/traditional?symbols=${encodeURIComponent(symbol)}`);
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Falha ao obter cotações.");
      }
      const payload = (await response.json()) as { data: TraditionalQuote[] };
      const quote = payload.data?.[0];
      if (quote) {
        setTraditionalQuotes((prev) => ({ ...prev, [quote.symbol]: quote }));
      }
    } catch (error) {
      setTraditionalQuotesError(error instanceof Error ? error.message : "Erro ao obter dados.");
    } finally {
      setTraditionalQuoteLoading((prev) => ({ ...prev, [symbol]: false }));
    }
  };

  const handleEthConnectInternal = async () => {
    try {
      setEthLoading(true);
      setEthError(null);
      const selectedProvider = getEvmProviderById(selectedEvmProvider);
      if (!selectedProvider) {
        const label = getEvmProviderLabel(selectedEvmProvider);
        throw new Error(`${label} não está disponível. Instala a extensão.`);
      }
      // Switch network BEFORE requesting accounts so MetaMask connects on the right chain
      if (selectedEthConnectNetwork !== "Ethereum") {
        await switchEvmNetwork(selectedProvider, selectedEthConnectNetwork);
      }
      const address = await connectEvmProvider(selectedProvider);
      setEthAddress(address);
      setEthConnectedNetwork(selectedEthConnectNetwork);
      const balance = await fetchEvmBalanceServerSide(address, selectedEthConnectNetwork);
      const formatted = Number(balance).toFixed(4);
      setEthBalance(formatted);
      const label = getEvmProviderLabel(selectedEvmProvider);
      const nextWallets = upsertWallet(
        ethWallets,
        { address, balance: formatted, network: selectedEthConnectNetwork, label },
        (item) => item.address === address && item.network === selectedEthConnectNetwork
      );
      setEthWallets(nextWallets);
      updateWalletSnapshot({ eth: nextWallets, sol: solWallets, btc: btcWallets, ada: adaWallets });
    } catch (error) {
      setEthError(error instanceof Error ? error.message : "Erro ao conectar.");
    } finally {
      setEthLoading(false);
    }
  };

  const handleEthConnect = () => {
    const host = typeof window !== "undefined" ? window.location.hostname : "";
    requestConfirm({
      title: "Conectar carteira Ethereum",
      description: `Vai ligar a carteira ao domínio ${host || "atual"} em modo leitura.`,
      onConfirm: handleEthConnectInternal,
    });
  };

  const handleWalletConnectInternal = async () => {
    try {
      setEthLoading(true);
      setEthError(null);
      const address = await connectWalletConnect();
      setEthAddress(address);
      const balance = await fetchEvmBalanceServerSide(address, "Ethereum");
      const formatted = Number(balance).toFixed(4);
      setEthBalance(formatted);
      const nextWallets = upsertWallet(
        ethWallets,
        { address, balance: formatted, network: "Ethereum", label: "WalletConnect" },
        (item) => item.address === address && item.network === "Ethereum"
      );
      setEthWallets(nextWallets);
      updateWalletSnapshot({ eth: nextWallets, sol: solWallets, btc: btcWallets, ada: adaWallets });
    } catch (error) {
      setEthError(error instanceof Error ? error.message : "Erro ao conectar via WalletConnect.");
    } finally {
      setEthLoading(false);
    }
  };

  const handleWalletConnect = () => {
    const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
    if (!projectId) {
      setEthError("WalletConnect não configurado. Adiciona NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ao .env.");
      return;
    }
    const host = typeof window !== "undefined" ? window.location.hostname : "";
    requestConfirm({
      title: "Conectar via WalletConnect",
      description: `Vai abrir um QR code para ligares qualquer carteira mobile ao domínio ${host || "atual"}.`,
      onConfirm: handleWalletConnectInternal,
    });
  };

  const handleEthRefresh = async () => {
    try {
      setEthLoading(true);
      setEthError(null);
      if (ethAddress) {
        const balance = await fetchEvmBalanceServerSide(ethAddress, ethConnectedNetwork);
        const formatted = Number(balance).toFixed(4);
        setEthBalance(formatted);
        const nextWallets = upsertWallet(
          ethWallets,
          { address: ethAddress, balance: formatted, network: ethConnectedNetwork },
          (item) => item.address === ethAddress && item.network === ethConnectedNetwork
        );
        setEthWallets(nextWallets);
      }
      await Promise.all(
        ethWallets
          .filter((w) => w.address && w.network && !(w.address === ethAddress && w.network === "Ethereum"))
          .map((w) => fetchEthBalanceForEntry(w.address!, w.network!))
      );
      if (ethMainAddress) {
        void fetchDefiTotal(ethMainAddress, "eth");
        void fetchNftBalance(ethMainAddress, "eth");
      }
      ethWallets.forEach((w) => {
        if (w.address) {
          void fetchDefiForEntry(w.address, w.network ?? "Ethereum");
          void fetchNftForEntry(w.address, w.network ?? "Ethereum");
        }
      });
    } catch (error) {
      setEthError(error instanceof Error ? error.message : "Erro ao atualizar saldo.");
    } finally {
      setEthLoading(false);
    }
  };

  const handleEthDisconnect = () => {
    // Only disconnect the browser wallet — keep manually saved wallets intact
    setEthAddress(undefined);
    setEthBalance(undefined);
    setEthConnectedNetwork("Ethereum");
    setEthError(null);
    updateWalletSnapshot({ eth: ethWallets, sol: solWallets, btc: btcWallets, ada: adaWallets });
  };

  const FREE_WALLET_LIMIT = 3;
  const totalWallets = ethWallets.length + solWallets.length + btcWallets.length + adaWallets.length;

  const handleAddEthWalletInternal = async () => {
    if (!isPro && totalWallets >= FREE_WALLET_LIMIT) {
      setEthNewError(`Plano Gratuito limitado a ${FREE_WALLET_LIMIT} carteiras. Faz upgrade para Pro.`);
      return;
    }
    if (!ethNewAddress.trim()) {
      setEthNewError("Insere um endereço.");
      return;
    }
    if (!isEvmAddress(ethNewAddress.trim())) {
      setEthNewError("Endereço Ethereum inválido.");
      return;
    }
    const trimmed = ethNewAddress.trim();
    const network =
      ethNewNetwork === "outro" ? (ethNewCustomLabel.trim() || "Outro") : ethNewNetwork;
    const netForFetch = ethNewNetwork === "outro" ? "Ethereum" : ethNewNetwork;
    try {
      setEthNewLoading(true);
      setEthNewError(null);
      const formatted = await fetchEvmBalanceServerSide(trimmed, netForFetch);
      const nextWallets = upsertWallet(
        ethWallets,
        { address: trimmed, balance: formatted, network },
        (item) => item.address === trimmed && item.network === network
      );
      setEthWallets(nextWallets);
      setEthNewAddress("");
      setEthNewCustomLabel("");
    } catch (error) {
      setEthNewError(
        error instanceof Error ? error.message : "Endereço inválido ou rede indisponível."
      );
    } finally {
      setEthNewLoading(false);
    }
  };

  const handleAddEthWallet = () => {
    const host = typeof window !== "undefined" ? window.location.hostname : "";
    requestConfirm({
      title: "Adicionar endereço Ethereum",
      description: `Confirma a adição do endereço ${ethNewAddress || "indefinido"} no domínio ${host || "atual"}.`,
      onConfirm: () =>
        new Promise<void>((resolve) => {
          window.setTimeout(() => {
            void handleAddEthWalletInternal().finally(() => resolve());
          }, 0);
        }),
    });
  };

  const handleSolConnectInternal = async () => {
    try {
      setSolLoading(true);
      setSolError(null);
      const address = await connectSolanaWallet(selectedSolProvider);
      const balance = await getSolBalance(address);
      const providerLabel = solWalletOptions.find((o) => o.id === selectedSolProvider)?.label ?? selectedSolProvider;
      const nextWallets = upsertWallet(
        solWallets,
        { address, balance, network: "Solana", label: providerLabel },
        (item) => item.address === address
      );
      setSolWallets(nextWallets);
      // Only replace solAddress if none set yet (allow multiple simultaneous connections)
      if (!solAddress) {
        setSolAddress(address);
        setSolBalance(balance);
      }
      updateWalletSnapshot({ eth: ethWallets, sol: nextWallets, btc: btcWallets, ada: adaWallets });
    } catch (error) {
      setSolError(error instanceof Error ? error.message : "Erro ao conectar.");
    } finally {
      setSolLoading(false);
    }
  };

  const handleSolConnect = () => {
    const host = typeof window !== "undefined" ? window.location.hostname : "";
    requestConfirm({
      title: "Conectar carteira Solana",
      description: `Vai ligar a carteira ao domínio ${host || "atual"} em modo leitura.`,
      onConfirm: handleSolConnectInternal,
    });
  };

  const handleSolRefresh = async () => {
    try {
      setSolLoading(true);
      setSolError(null);
      if (solAddress) {
        const balance = await getSolBalance(solAddress);
        setSolBalance(balance);
        const nextWallets = upsertWallet(
          solWallets,
          { address: solAddress, balance, network: "Solana" },
          (item) => item.address === solAddress && (item.network ?? "Solana") === "Solana"
        );
        setSolWallets(nextWallets);
      }
      await Promise.all(
        solWallets
          .filter((w) => w.address && w.address !== solAddress)
          .map((w) => fetchSolBalanceForAddress(w.address!))
      );
      if (solMainAddress) {
        void fetchDefiTotal(solMainAddress, "sol");
        void fetchNftBalance(solMainAddress, "sol");
      }
    } catch (error) {
      setSolError(error instanceof Error ? error.message : "Erro ao atualizar saldo.");
    } finally {
      setSolLoading(false);
    }
  };

  const handleSolDisconnect = () => {
    // Only disconnect the browser wallet — keep manually saved wallets intact
    setSolAddress(undefined);
    setSolBalance(undefined);
    setSolError(null);
    updateWalletSnapshot({ eth: ethWallets, sol: solWallets, btc: btcWallets, ada: adaWallets });
  };

  const handleAddSolWalletInternal = async () => {
    if (!isPro && totalWallets >= FREE_WALLET_LIMIT) {
      setSolNewError(`Plano Gratuito limitado a ${FREE_WALLET_LIMIT} carteiras. Faz upgrade para Pro.`);
      return;
    }
    if (!solNewAddress.trim()) {
      setSolNewError("Insere um endereço.");
      return;
    }
    if (!isSolAddress(solNewAddress.trim())) {
      setSolNewError("Endereço Solana inválido.");
      return;
    }
    const trimmed = solNewAddress.trim();
    const walletLabel =
      solNewWalletId === "outro"
        ? (solNewCustomLabel.trim() || "Solana")
        : (MANUAL_ADD_TO_SOL_NETWORK[solNewWalletId] ?? "Solana");
    try {
      setSolNewLoading(true);
      setSolNewError(null);
      const balance = await getSolBalance(trimmed);
      const nextWallets = upsertWallet(
        solWallets,
        { address: trimmed, balance, network: walletLabel },
        (item) => item.address === trimmed && (item.network ?? "Solana") === walletLabel
      );
      setSolWallets(nextWallets);
      setSolNewAddress("");
      setSolNewCustomLabel("");
      void fetchSolBalanceForAddress(trimmed);
    } catch (error) {
      setSolNewError(error instanceof Error ? error.message : "Endereço inválido.");
    } finally {
      setSolNewLoading(false);
    }
  };

  const handleAddSolWallet = () => {
    const host = typeof window !== "undefined" ? window.location.hostname : "";
    requestConfirm({
      title: "Adicionar endereço Solana",
      description: `Confirma a adição do endereço ${solNewAddress || "indefinido"} no domínio ${host || "atual"}.`,
      onConfirm: () =>
        new Promise<void>((resolve) => {
          window.setTimeout(() => {
            void handleAddSolWalletInternal().finally(() => resolve());
          }, 0);
        }),
    });
  };

  const handleBtcConnectInternal = async () => {
    try {
      setBtcLoading(true);
      setBtcError(null);
      const { payment: address, ordinals } = await connectXverse();
      const providerLabel = btcWalletOptions.find((o) => o.id === selectedBtcProvider)?.label ?? selectedBtcProvider;
      const walletBalance = await getBtcBalanceFromWallet();
      const balance = walletBalance !== null ? walletBalance : await getBtcBalanceFromAddress(address);
      let nextWallets = upsertWallet(
        btcWallets,
        { address, balance: balance.toFixed(8), network: "Bitcoin", label: providerLabel },
        (item) => item.address === address
      );
      // Capture the taproot/ordinals address too — that's where Ordinals & Runes live.
      if (ordinals && ordinals !== address) {
        const ordBalance = await getBtcBalanceFromAddress(ordinals).catch(() => 0);
        nextWallets = upsertWallet(
          nextWallets,
          { address: ordinals, balance: ordBalance.toFixed(8), network: "Bitcoin", label: `${providerLabel} (Ordinals)` },
          (item) => item.address === ordinals
        );
        void fetchRunesForAddress(ordinals);
        void fetchNftForEntry(ordinals, "Bitcoin");
      }
      setBtcWallets(nextWallets);
      if (!btcAddress) {
        setBtcAddress(address);
        setBtcBalance(balance);
      }
      updateWalletSnapshot({ eth: ethWallets, sol: solWallets, btc: nextWallets, ada: adaWallets });
    } catch (error) {
      setBtcError(error instanceof Error ? error.message : "Erro ao conectar.");
    } finally {
      setBtcLoading(false);
    }
  };

  const handleBtcConnect = () => {
    const host = typeof window !== "undefined" ? window.location.hostname : "";
    requestConfirm({
      title: "Conectar carteira Bitcoin",
      description: `Vai ligar a carteira ao domínio ${host || "atual"} em modo leitura.`,
      onConfirm: handleBtcConnectInternal,
    });
  };

  const handleBtcRefresh = async () => {
    try {
      setBtcLoading(true);
      setBtcError(null);
      if (btcAddress) {
        const walletBalance = await getBtcBalanceFromWallet();
        if (walletBalance !== null) {
          setBtcBalance(walletBalance);
          const nextWallets = upsertWallet(
            btcWallets,
            { address: btcAddress, balance: walletBalance.toFixed(8), network: "Bitcoin" },
            (item) => item.address === btcAddress
          );
          setBtcWallets(nextWallets);
        } else {
          const apiBalance = await getBtcBalanceFromAddress(btcAddress);
          setBtcBalance(apiBalance);
          const nextWallets = upsertWallet(
            btcWallets,
            { address: btcAddress, balance: apiBalance.toFixed(8), network: "Bitcoin" },
            (item) => item.address === btcAddress
          );
          setBtcWallets(nextWallets);
        }
      }
      await Promise.all(
        btcWallets
          .filter((w) => w.address && w.address !== btcAddress)
          .map((w) => fetchBtcBalanceForAddress(w.address!))
      );
      if (btcMainAddress) {
        void fetchDefiTotal(btcMainAddress, "btc");
        void fetchNftBalance(btcMainAddress, "btc");
      }
    } catch (error) {
      setBtcError(error instanceof Error ? error.message : "Erro ao atualizar saldo.");
    } finally {
      setBtcLoading(false);
    }
  };

  const handleBtcDisconnect = () => {
    setBtcWallets([]);
    setBtcAddress(undefined);
    setBtcBalance(null);
    setBtcError(null);
    updateWalletSnapshot({ eth: ethWallets, sol: solWallets, btc: [], ada: adaWallets });
  };

  const handleAddBtcWalletInternal = async () => {
    if (!isPro && totalWallets >= FREE_WALLET_LIMIT) {
      setBtcNewError(`Plano Gratuito limitado a ${FREE_WALLET_LIMIT} carteiras. Faz upgrade para Pro.`);
      return;
    }
    if (!btcNewAddress.trim()) {
      setBtcNewError("Insere um endereço.");
      return;
    }
    if (!isBtcAddress(btcNewAddress.trim())) {
      setBtcNewError("Endereço Bitcoin inválido.");
      return;
    }
    const trimmed = btcNewAddress.trim();
    const networkLabel =
      btcNewLabel === "outro"
        ? (btcNewCustomLabel.trim() || "Bitcoin")
        : (btcNetworkOptions.find((o) => o.id === btcNewLabel)?.label ?? "Bitcoin");
    /* "Outro" = qualquer endereço Bitcoin mainnet com rótulo custom; lê saldo e Runes como "Bitcoin". */
    const isMainnet = btcNewLabel === "bitcoin" || btcNewLabel === "outro";
    try {
      setBtcNewLoading(true);
      setBtcNewError(null);
      const balanceStr = isMainnet
        ? (await getBtcBalanceFromAddress(trimmed)).toFixed(8)
        : "—";
      const nextWallets = upsertWallet(
        btcWallets,
        { address: trimmed, balance: balanceStr, network: networkLabel },
        (item) => item.address === trimmed
      );
      setBtcWallets(nextWallets);
      setBtcNewAddress("");
      setBtcNewCustomLabel("");
      if (isMainnet) {
        void fetchBtcBalanceForAddress(trimmed);
        void fetchRunesForAddress(trimmed);
      }
    } catch (error) {
      setBtcNewError(error instanceof Error ? error.message : "Endereço inválido.");
    } finally {
      setBtcNewLoading(false);
    }
  };

  const handleAddBtcWallet = () => {
    const host = typeof window !== "undefined" ? window.location.hostname : "";
    requestConfirm({
      title: "Adicionar endereço Bitcoin",
      description: `Confirma a adição do endereço ${btcNewAddress || "indefinido"} no domínio ${host || "atual"}.`,
      onConfirm: () =>
        new Promise<void>((resolve) => {
          window.setTimeout(() => {
            void handleAddBtcWalletInternal().finally(() => resolve());
          }, 0);
        }),
    });
  };

  const [adaLoadingMsg, setAdaLoadingMsg] = useState<string | undefined>(undefined);

  const handleAdaConnectInternal = async () => {
    let msgTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      setAdaLoading(true);
      setAdaError(null);
      setAdaLoadingMsg("A aguardar aprovação…");
      // After 3s update message with clearer instructions
      msgTimer = setTimeout(() => {
        setAdaLoadingMsg("👉 Clica no ícone do Eternl na barra de extensões do Chrome (canto superior direito) → deverá aparecer um pedido de ligação para aprovar");
      }, 3000);
      // Timeout: if the wallet never responds (e.g. popup dismissed silently)
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 60_000)
      );
      const { api, address } = await Promise.race([
        connectCardanoWallet(selectedAdaProvider),
        timeout,
      ]);
      clearTimeout(msgTimer);
      setAdaLoadingMsg(undefined);
      setAdaApi(api);
      setAdaAddress(address);
      const balance = await getAdaBalance(api);
      setAdaBalance(balance);
      const nextWallets = upsertWallet(
        adaWallets,
        { address, balance, network: "Cardano" },
        (item) => item.address === address
      );
      setAdaWallets(nextWallets);
      updateWalletSnapshot({ eth: ethWallets, sol: solWallets, btc: btcWallets, ada: nextWallets });
    } catch (error) {
      clearTimeout(msgTimer);
      const msg = error instanceof Error ? error.message : "Erro ao conectar.";
      if (msg === "timeout") {
        setAdaError("O Eternl não respondeu em 60 segundos. Verifica: 1) Clica no ícone do Eternl na barra de extensões do Chrome → deverá aparecer um pedido pendente para aprovar. 2) Se não aparecer nada, abre o Eternl → Settings → dApp Connector → confirma que tens uma conta dApp activa. 3) Em alternativa, adiciona o endereço manualmente abaixo.");
      } else if (msg.toLowerCase().includes("user canceled") || msg.toLowerCase().includes("cancelled") || msg.toLowerCase().includes("cancel")) {
        setAdaError("Conexão cancelada pelo utilizador.");
      } else if (
        msg.toLowerCase().includes("no account set") ||
        msg.toLowerCase().includes("no daccount") ||
        msg.toLowerCase().includes("dapp account") ||
        msg.toLowerCase().includes("account") ||
        msg.toLowerCase().includes("dapp connector")
      ) {
        setAdaError("Sem conta dApp configurada no Eternl. Abre o Eternl → Settings → dApp Connector → cria/ativa uma conta. Ou adiciona o endereço manualmente abaixo.");
      } else {
        setAdaError(msg);
      }
    } finally {
      setAdaLoading(false);
      setAdaLoadingMsg(undefined);
    }
  };

  const handleAdaConnect = () => {
    void handleAdaConnectInternal();
  };

  const handleAdaPeerConnect = async () => {
    setAdaPeerConnecting(true);
    setAdaError(null);
    setAdaPeerAddress(null);
    try {
      const { DAppPeerConnect } = await import("@fabianbormann/cardano-peer-connect");
      const dAppConnect = new DAppPeerConnect({
        dAppInfo: {
          name: "ChainFolioAI",
          url: typeof window !== "undefined" ? window.location.origin : "https://chainfolioai.vercel.app",
          icon: typeof window !== "undefined" ? `${window.location.origin}/chainfolioai-icon.png` : "",
        },
        onConnect: (_address, _walletInfo) => {
          setAdaPeerConnecting(false);
        },
        onApiInject: async (name: string, _address: string) => {
          try {
            // CIP-45: the wallet API is injected at window.cardano[name.toLowerCase()]
            // as a standard CIP-30 provider that still needs enable() to be called.
            const provider = (window.cardano as Record<string, { enable: () => Promise<EternlApi> }> | undefined)?.[name.toLowerCase()];
            if (!provider) { setAdaError("Carteira ligada mas a API não foi encontrada."); return; }
            const api = await provider.enable();

            const hexToBytes = (hex: string) =>
              new Uint8Array(hex.replace(/^0x/, "").match(/.{2}/g)!.map((b) => parseInt(b, 16)));

            const changeHex = (await api.getChangeAddress?.().catch(() => "")) ?? "";
            let address = changeHex;
            if (address && !address.startsWith("addr")) {
              const CardanoWasm = await import("@emurgo/cardano-serialization-lib-browser");
              address = CardanoWasm.Address.from_bytes(hexToBytes(changeHex)).to_bech32();
            }
            if (!address) { setAdaError("Não foi possível obter o endereço da carteira."); return; }

            const balHex = await api.getBalance().catch(() => "");
            let balance = "0";
            if (balHex) {
              const CardanoWasm = await import("@emurgo/cardano-serialization-lib-browser");
              const value = CardanoWasm.Value.from_bytes(hexToBytes(balHex));
              balance = (Number(value.coin().to_str()) / 1_000_000).toFixed(6);
            }

            const nextWallets = upsertWallet(
              adaWallets,
              { address, balance, network: "Cardano" },
              (item) => item.address === address
            );
            setAdaWallets(nextWallets);
            setAdaApi(api);
            setAdaAddress(address);
            setAdaBalance(balance);
            updateWalletSnapshot({ eth: ethWallets, sol: solWallets, btc: btcWallets, ada: nextWallets });
            setAdaPeerAddress(null);
            setAdaPeerConnecting(false);
          } catch (e) {
            setAdaError(e instanceof Error ? e.message : "Erro ao ligar via peer connect.");
          }
        },
        onApiEject: (_name: string, _address: string) => {},
        onDisconnect: (_address: string) => { setAdaPeerConnecting(false); },
      });
      const peerAddr = dAppConnect.getAddress();
      setAdaPeerAddress(peerAddr);
      // Generate QR code into canvas
      setTimeout(() => {
        if (adaQrCanvasRef.current) {
          try { dAppConnect.generateQRCode(adaQrCanvasRef.current); } catch { /* ignore */ }
        }
      }, 300);
    } catch (e) {
      setAdaError(e instanceof Error ? e.message : "Erro ao iniciar peer connect.");
      setAdaPeerConnecting(false);
    }
  };

  const handleAdaRefresh = async () => {
    try {
      setAdaLoading(true);
      setAdaError(null);
      if (adaApi && adaAddress) {
        const balance = await getAdaBalance(adaApi);
        setAdaBalance(balance);
        const nextWallets = upsertWallet(
          adaWallets,
          { address: adaAddress, balance, network: "Cardano" },
          (item) => item.address === adaAddress
        );
        setAdaWallets(nextWallets);
      }
      await Promise.all(
        adaWallets
          .filter((w) => w.address && w.address !== adaAddress)
          .map((w) => fetchAdaBalanceForAddress(w.address!))
      );
      if (adaMainAddress) {
        void fetchDefiTotal(adaMainAddress, "ada");
        void fetchNftBalance(adaMainAddress, "ada");
      }
    } catch (error) {
      setAdaError(error instanceof Error ? error.message : "Erro ao atualizar saldo.");
    } finally {
      setAdaLoading(false);
    }
  };

  const handleAdaDisconnect = () => {
    setAdaWallets([]);
    setAdaAddress(undefined);
    setAdaBalance(undefined);
    setAdaError(null);
    setAdaApi(null);
    updateWalletSnapshot({ eth: ethWallets, sol: solWallets, btc: btcWallets, ada: [] });
  };

  /** Adiciona um endereço a tracking (saldo + NFTs + DeFi automáticos via useEffect).
   *  Devolve string de erro ou null em sucesso. Usado pelo form manual e pela cold wallet. */
  const renameWallet = (kind: "eth" | "sol" | "btc" | "ada" | "other", address: string | undefined, rawLabel: string) => {
    if (!address) return;
    const label = sanitizeLabel(rawLabel) || undefined;
    const apply = (list: StoredWalletEntry[]) => list.map((w) => (w.address === address ? { ...w, label } : w));
    let eth = ethWallets, sol = solWallets, btc = btcWallets, ada = adaWallets, other = otherWallets;
    if (kind === "eth") { eth = apply(ethWallets); setEthWallets(eth); }
    else if (kind === "sol") { sol = apply(solWallets); setSolWallets(sol); }
    else if (kind === "btc") { btc = apply(btcWallets); setBtcWallets(btc); }
    else if (kind === "ada") { ada = apply(adaWallets); setAdaWallets(ada); }
    else { other = apply(otherWallets); setOtherWallets(other); }
    updateWalletSnapshot({ eth, sol, btc, ada, other });
  };

  const addManualAddress = (addressArg: string, networkId: string, labelArg?: string, source: "cold" | "manual" = "manual"): string | null => {
    const trimmed = addressArg.trim();
    const label = labelArg && labelArg.trim() ? sanitizeLabel(labelArg) : undefined;
    if (!trimmed) return "Insere um endereço.";
    const evmNetwork = MANUAL_ADD_TO_EVM_NETWORK[networkId];
    if (evmNetwork) {
      if (!isEvmAddress(trimmed)) return "Endereço inválido (deve ser 0x... para redes EVM/L2).";
      const nextWallets = upsertWallet(
        ethWallets,
        { address: trimmed, network: evmNetwork, label, source },
        (item) => item.address === trimmed && item.network === evmNetwork
      );
      setEthWallets(nextWallets);
      updateWalletSnapshot({ eth: nextWallets, sol: solWallets, btc: btcWallets, ada: adaWallets });
      void fetchEthBalanceForEntry(trimmed, evmNetwork);
    } else if (MANUAL_ADD_TO_SOL_NETWORK[networkId]) {
      if (!isSolAddress(trimmed)) return "Endereço Solana inválido (base58, 32–44 caracteres).";
      const solNetwork = MANUAL_ADD_TO_SOL_NETWORK[networkId];
      const nextWallets = upsertWallet(
        solWallets,
        { address: trimmed, network: solNetwork, label, source },
        (item) => item.address === trimmed && (item.network ?? "Solana") === solNetwork
      );
      setSolWallets(nextWallets);
      updateWalletSnapshot({ eth: ethWallets, sol: nextWallets, btc: btcWallets, ada: adaWallets });
      void fetchSolBalanceForAddress(trimmed);
    } else if (networkId === "btc") {
      if (!isBtcAddress(trimmed)) return "Endereço Bitcoin inválido.";
      const nextWallets = upsertWallet(
        btcWallets,
        { address: trimmed, network: "Bitcoin", label, source },
        (item) => item.address === trimmed
      );
      setBtcWallets(nextWallets);
      updateWalletSnapshot({ eth: ethWallets, sol: solWallets, btc: nextWallets, ada: adaWallets });
      void fetchBtcBalanceForAddress(trimmed);
    } else if (networkId === "ada") {
      if (!isAdaAddress(trimmed)) return "Endereço Cardano inválido (addr1... ou stake1...).";
      const nextWallets = upsertWallet(
        adaWallets,
        { address: trimmed, network: "Cardano", label, source },
        (item) => item.address === trimmed && (item.network ?? "Cardano") === "Cardano"
      );
      setAdaWallets(nextWallets);
      updateWalletSnapshot({ eth: ethWallets, sol: solWallets, btc: btcWallets, ada: nextWallets });
      void fetchAdaBalanceForAddress(trimmed);
    } else {
      // Other networks: store address without balance (tracking only)
      if (trimmed.length < 6) return "Endereço demasiado curto.";
      const networkLabel = MANUAL_ADD_NETWORKS.find((n) => n.id === networkId)?.label ?? networkId.toUpperCase();
      const entry: StoredWalletEntry = { address: trimmed, network: networkLabel, label, source };
      const nextWallets = upsertWallet(
        otherWallets,
        entry,
        (item) => item.address === trimmed && item.network === networkLabel
      );
      setOtherWallets(nextWallets);
      updateWalletSnapshot({ eth: ethWallets, sol: solWallets, btc: btcWallets, ada: adaWallets, other: nextWallets });
    }
    return null;
  };

  const handleManualAddAddress = () => {
    setManualAddError(null);
    const err = addManualAddress(manualAddAddress, manualAddNetwork, manualAddLabel);
    if (err) { setManualAddError(err); return; }
    setManualAddAddress("");
    setManualAddLabel("");
  };

  /** Endereços adicionados via card Ledger/Trezor (source === "cold"), enriquecidos com saldo/NFTs/DeFi. */
  const coldWalletEntries = useMemo(() => {
    type Kind = "eth" | "sol" | "btc" | "ada" | "other";
    type ColdEntry = {
      address: string; networkLabel: string; kind: Kind;
      balance: string | null; symbol: string; fiatUsd: number | null;
      nftCount: number | null; defiUsd: number | null;
    };
    const out: ColdEntry[] = [];
    const isCold = (w: StoredWalletEntry) => w.source === "cold";

    ethWallets.filter(isCold).forEach((w) => {
      if (!w.address) return;
      const net = w.network ?? "Ethereum";
      const k = defiKey(w.address, net);
      const balance = ethBalancesByKey[ethBalanceKey(w.address, net)] ?? w.balance ?? null;
      out.push({ address: w.address, networkLabel: net, kind: "eth", balance, symbol: "ETH",
        fiatUsd: getFiatValue("ETH", balance), nftCount: nftCounts[k] ?? null, defiUsd: defiTotals[k] ?? null });
    });
    solWallets.filter(isCold).forEach((w) => {
      if (!w.address) return;
      const k = defiKey(w.address, "sol");
      const balance = solBalancesByAddress[w.address] ?? w.balance ?? null;
      out.push({ address: w.address, networkLabel: w.network ?? "Solana", kind: "sol", balance, symbol: "SOL",
        fiatUsd: getFiatValue("SOL", balance), nftCount: nftCounts[k] ?? null, defiUsd: defiTotals[k] ?? null });
    });
    btcWallets.filter(isCold).forEach((w) => {
      if (!w.address) return;
      const k = defiKey(w.address, "btc");
      const balance = btcBalancesByAddress[w.address] ?? w.balance ?? null;
      out.push({ address: w.address, networkLabel: w.network ?? "Bitcoin", kind: "btc", balance, symbol: "BTC",
        fiatUsd: getFiatValue("BTC", balance), nftCount: nftCounts[k] ?? null, defiUsd: defiTotals[k] ?? null });
    });
    adaWallets.filter(isCold).forEach((w) => {
      if (!w.address) return;
      const k = defiKey(w.address, "ada");
      const balance = adaBalancesByAddress[w.address] ?? w.balance ?? null;
      out.push({ address: w.address, networkLabel: w.network ?? "Cardano", kind: "ada", balance, symbol: "ADA",
        fiatUsd: getFiatValue("ADA", balance), nftCount: nftCounts[k] ?? null, defiUsd: defiTotals[k] ?? null });
    });
    otherWallets.filter(isCold).forEach((w) => {
      if (!w.address) return;
      out.push({ address: w.address, networkLabel: w.network ?? "—", kind: "other", balance: null, symbol: "",
        fiatUsd: null, nftCount: null, defiUsd: null });
    });
    return out;
  }, [ethWallets, solWallets, btcWallets, adaWallets, otherWallets, ethBalancesByKey, solBalancesByAddress, btcBalancesByAddress, adaBalancesByAddress, nftCounts, defiTotals, web3Prices]);

  // Endereços cold únicos por chain (para buscar tokens ERC-20/SPL via Moralis).
  const coldEvmAddresses = useMemo(
    () => Array.from(new Set(ethWallets.filter((w) => w.source === "cold" && w.address).map((w) => w.address as string))),
    [ethWallets]
  );
  const coldSolAddresses = useMemo(
    () => Array.from(new Set(solWallets.filter((w) => w.source === "cold" && w.address).map((w) => w.address as string))),
    [solWallets]
  );

  const fetchColdTokens = useCallback(async (address: string, chain: "eth" | "sol") => {
    const key = `${chain}:${address}`;
    setColdTokensLoading((prev) => ({ ...prev, [key]: true }));
    try {
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const res = await fetch(`${base}/api/token-balances?address=${encodeURIComponent(address)}&chain=${chain}`);
      const data = await res.json() as { tokens?: ColdToken[] };
      setColdTokensByAddr((prev) => ({ ...prev, [key]: data.tokens ?? [] }));
    } catch {
      setColdTokensByAddr((prev) => ({ ...prev, [key]: [] }));
    } finally {
      setColdTokensLoading((prev) => ({ ...prev, [key]: false }));
    }
  }, []);

  useEffect(() => {
    coldEvmAddresses.forEach((a) => void fetchColdTokens(a, "eth"));
  }, [coldEvmAddresses.join(","), fetchColdTokens]);
  useEffect(() => {
    coldSolAddresses.forEach((a) => void fetchColdTokens(a, "sol"));
  }, [coldSolAddresses.join(","), fetchColdTokens]);

  // Total USD dos tokens cold EXCLUINDO o nativo (já contado em walletsTotalUsd) — evita dupla contagem.
  const coldTokensExtraUsd = useMemo(() => {
    let sum = 0;
    for (const tokens of Object.values(coldTokensByAddr)) {
      for (const t of tokens) {
        if (t.address === "native") continue;
        if (Number.isFinite(t.usdValue)) sum += t.usdValue;
      }
    }
    return sum;
  }, [coldTokensByAddr]);

  /** Remove um endereço adicionado manualmente, da lista certa e do snapshot. */
  const removeManualAddress = (address: string, kind: "eth" | "sol" | "btc" | "ada" | "other", networkLabel: string) => {
    if (kind === "eth") {
      const next = removeWallet(ethWallets, (e) => e.address === address && (e.network ?? "Ethereum") === networkLabel);
      setEthWallets(next);
      updateWalletSnapshot({ eth: next, sol: solWallets, btc: btcWallets, ada: adaWallets, other: otherWallets });
    } else if (kind === "sol") {
      const next = removeWallet(solWallets, (e) => e.address === address && (e.network ?? "Solana") === networkLabel);
      setSolWallets(next);
      updateWalletSnapshot({ eth: ethWallets, sol: next, btc: btcWallets, ada: adaWallets, other: otherWallets });
    } else if (kind === "btc") {
      const next = removeWallet(btcWallets, (e) => e.address === address);
      setBtcWallets(next);
      updateWalletSnapshot({ eth: ethWallets, sol: solWallets, btc: next, ada: adaWallets, other: otherWallets });
    } else if (kind === "ada") {
      const next = removeWallet(adaWallets, (e) => e.address === address && (e.network ?? "Cardano") === networkLabel);
      setAdaWallets(next);
      updateWalletSnapshot({ eth: ethWallets, sol: solWallets, btc: btcWallets, ada: next, other: otherWallets });
    } else {
      const next = removeWallet(otherWallets, (e) => e.address === address && e.network === networkLabel);
      setOtherWallets(next);
      updateWalletSnapshot({ eth: ethWallets, sol: solWallets, btc: btcWallets, ada: adaWallets, other: next });
    }
  };

  const handleManualAddCryptoAsset = () => {
    setManualCryptoAssetError(null);
    const symbol = manualCryptoAssetSymbol.trim();
    const amountStr = manualCryptoAssetAmountUsd.trim();
    const amount = amountStr === "" ? NaN : Number(amountStr);
    if (!symbol) {
      setManualCryptoAssetError("Escolhe um ativo.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setManualCryptoAssetError(`Insere um valor em ${curCode} válido.`);
      return;
    }
    const qtyRaw = manualCryptoAssetQty.trim();
    const qty = qtyRaw === "" ? undefined : Number(qtyRaw);
    updateCryptoHolding(symbol, {
      buyDate: manualCryptoAssetDate || undefined,
      // Store invested value in EUR (totals are in EUR); convert from the
      // selected display currency the user typed in.
      buyValue: amount / (curRate || 1),
      // Optional: number of coins → lets the value track the current market price.
      quantity: qty != null && Number.isFinite(qty) && qty > 0 ? qty : undefined,
    });
    setManualCryptoAssetSymbol("");
    setManualCryptoAssetDate("");
    setManualCryptoAssetAmountUsd("");
    setManualCryptoAssetQty("");
  };

  const stablecoinSymbolOptions = useMemo(() => Object.keys(STABLECOIN_TOKEN_ADDRESSES), []);
  const handleAddStablecoinEntry = () => {
    setStablecoinAddError(null);
    const addr = stablecoinAddAddress.trim();
    if (!isEvmAddress(addr)) {
      setStablecoinAddError("Endereço EVM inválido (0x...).");
      return;
    }
    const id = `stable-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    setStablecoinEntries((prev) => [
      ...prev,
      { id, symbol: stablecoinAddSymbol, network: "Ethereum", address: addr },
    ]);
    setStablecoinAddAddress("");
    void fetchStablecoinBalance(id, stablecoinAddSymbol, "Ethereum", addr);
  };

  const fetchedStablecoinIds = useRef<Set<string>>(new Set());

  const fetchStablecoinBalance = useCallback(
    async (entryId: string, symbol: string, _network: EvmNetwork, address: string) => {
      setStablecoinBalancesLoading((prev) => ({ ...prev, [entryId]: true }));
      try {
        const res = await fetch(`/api/erc20-balance?address=${encodeURIComponent(address)}&token=${encodeURIComponent(symbol)}`);
        const data = (await res.json()) as { balance?: string; error?: string };
        const balance = data.balance ?? "0";
        startTransition(() => {
          setStablecoinBalances((prev) => ({ ...prev, [entryId]: balance }));
          setStablecoinBalancesLoading((prev) => ({ ...prev, [entryId]: false }));
        });
      } catch {
        startTransition(() => {
          setStablecoinBalances((prev) => ({ ...prev, [entryId]: "—" }));
          setStablecoinBalancesLoading((prev) => ({ ...prev, [entryId]: false }));
        });
      }
    },
    []
  );

  useEffect(() => {
    if (walletMode !== "web3") return;
    const toFetch = stablecoinEntries.filter(
      (e) => isEvmAddress(e.address) && !fetchedStablecoinIds.current.has(e.id)
    );
    if (toFetch.length === 0) return;
    toFetch.forEach((e) => {
      fetchedStablecoinIds.current.add(e.id);
      void fetchStablecoinBalance(e.id, e.symbol, e.network as EvmNetwork, e.address);
    });
  // stablecoinEntries.length tracks additions; not the full array to avoid re-triggering on internal updates
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletMode, stablecoinEntries.length, fetchStablecoinBalance]);

  useEffect(() => {
    if (walletMode !== "web3") return;
    if (!ethAddress && !solAddress && !btcAddress && !adaApi) return;

    const refreshAll = async () => {
      await Promise.all([
        ethAddress ? handleEthRefresh() : Promise.resolve(),
        solAddress ? handleSolRefresh() : Promise.resolve(),
        btcAddress ? handleBtcRefresh() : Promise.resolve(),
        adaApi ? handleAdaRefresh() : Promise.resolve(),
      ]);
    };

    const startId = window.setTimeout(refreshAll, 100);
    const id = window.setInterval(refreshAll, 60000);
    return () => {
      window.clearTimeout(startId);
      window.clearInterval(id);
    };
  }, [walletMode, ethAddress, solAddress, btcAddress, adaApi]);

  const fetchAdaBalanceForAddress = useCallback(async (address: string) => {
    if (!address || address === adaAddress) return;
    setAdaBalancesLoading((prev) => ({ ...prev, [address]: true }));
    setAdaBalanceErrors((prev) => ({ ...prev, [address]: null }));
    try {
      const balance = await getAdaBalanceByAddress(address);
      startTransition(() => {
        setAdaBalancesByAddress((prev) => ({ ...prev, [address]: balance }));
        setAdaBalanceErrors((prev) => ({ ...prev, [address]: null }));
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao obter saldo.";
      startTransition(() => {
        setAdaBalanceErrors((prev) => ({ ...prev, [address]: message }));
        setAdaBalancesByAddress((prev) => ({ ...prev, [address]: "—" }));
      });
    } finally {
      startTransition(() => {
        setAdaBalancesLoading((prev) => ({ ...prev, [address]: false }));
      });
    }
  }, [adaAddress]);

  useEffect(() => {
    if (walletMode !== "web3") return;
    const id = window.setTimeout(() => {
      adaWallets
        .filter(
          (w) =>
            w.address &&
            w.address !== adaAddress &&
            !["Hydra", "Midnight"].includes(w.network ?? "")
        )
        .forEach((w) => void fetchAdaBalanceForAddress(w.address!));
    }, 0);
    return () => window.clearTimeout(id);
  }, [walletMode, adaWallets, adaAddress, fetchAdaBalanceForAddress]);

  const fetchEvmBalanceServerSide = async (address: string, network: string): Promise<string> => {
    const base = typeof window !== "undefined" ? window.location.origin : "";
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch(`${base}/api/evm-balance?address=${encodeURIComponent(address)}&network=${encodeURIComponent(network)}`, { signal: controller.signal });
      const data = await res.json() as { balance?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "Falha ao obter saldo.");
      return Number(data.balance ?? 0).toFixed(4);
    } finally {
      window.clearTimeout(timer);
    }
  };

  const fetchEthBalanceForEntry = useCallback(
    async (address: string, network: string) => {
      const key = ethBalanceKey(address, network);
      setEthBalancesLoading((prev) => ({ ...prev, [key]: true }));
      setEthBalanceErrors((prev) => ({ ...prev, [key]: null }));
      try {
        const formatted = await fetchEvmBalanceServerSide(address, network);
        startTransition(() => {
          setEthBalancesByKey((prev) => ({ ...prev, [key]: formatted }));
          setEthBalanceErrors((prev) => ({ ...prev, [key]: null }));
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro ao obter saldo.";
        startTransition(() => {
          setEthBalanceErrors((prev) => ({ ...prev, [key]: msg }));
          setEthBalancesByKey((prev) => ({ ...prev, [key]: "—" }));
        });
      } finally {
        startTransition(() => {
          setEthBalancesLoading((prev) => ({ ...prev, [key]: false }));
        });
      }
    },
    []
  );

  useEffect(() => {
    if (walletMode !== "web3") return;
    const id = window.setTimeout(() => {
      ethWallets
        .filter((w) => w.address && w.network)
        .forEach((w) => void fetchEthBalanceForEntry(w.address!, w.network!));
    }, 0);
    return () => window.clearTimeout(id);
  }, [walletMode, ethWallets, ethAddress, fetchEthBalanceForEntry]);

  const fetchSolBalanceForAddress = useCallback(async (address: string) => {
    if (!address || address === solAddress) return;
    setSolBalancesLoading((prev) => ({ ...prev, [address]: true }));
    setSolBalanceErrors((prev) => ({ ...prev, [address]: null }));
    try {
      const balance = await getSolBalance(address);
      startTransition(() => {
        setSolBalancesByAddress((prev) => ({ ...prev, [address]: balance }));
        setSolBalanceErrors((prev) => ({ ...prev, [address]: null }));
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao obter saldo.";
      startTransition(() => {
        setSolBalanceErrors((prev) => ({ ...prev, [address]: msg }));
        setSolBalancesByAddress((prev) => ({ ...prev, [address]: "—" }));
      });
    } finally {
      startTransition(() => {
        setSolBalancesLoading((prev) => ({ ...prev, [address]: false }));
      });
    }
  }, [solAddress]);

  useEffect(() => {
    if (walletMode !== "web3") return;
    const id = window.setTimeout(() => {
      solWallets
        .filter((w) => w.address && w.address !== solAddress)
        .forEach((w) => void fetchSolBalanceForAddress(w.address!));
    }, 0);
    return () => window.clearTimeout(id);
  }, [walletMode, solWallets, solAddress, fetchSolBalanceForAddress]);

  const fetchBtcBalanceForAddress = useCallback(async (address: string) => {
    if (!address || address === btcAddress) return;
    setBtcBalancesLoading((prev) => ({ ...prev, [address]: true }));
    setBtcBalanceErrors((prev) => ({ ...prev, [address]: null }));
    try {
      const balance = await getBtcBalanceFromAddress(address);
      startTransition(() => {
        setBtcBalancesByAddress((prev) => ({ ...prev, [address]: balance.toFixed(8) }));
        setBtcBalanceErrors((prev) => ({ ...prev, [address]: null }));
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao obter saldo.";
      startTransition(() => {
        setBtcBalanceErrors((prev) => ({ ...prev, [address]: msg }));
        setBtcBalancesByAddress((prev) => ({ ...prev, [address]: "—" }));
      });
    } finally {
      startTransition(() => {
        setBtcBalancesLoading((prev) => ({ ...prev, [address]: false }));
      });
    }
  }, [btcAddress]);

  const fetchRunesForAddress = useCallback(async (address: string) => {
    if (!address) return;
    setBtcRunesLoading((prev) => ({ ...prev, [address]: true }));
    try {
      const runes = await getRunesBalancesForAddress(address);
      startTransition(() => {
        setBtcRunesByAddress((prev) => ({ ...prev, [address]: runes }));
        setBtcRunesLoading((prev) => ({ ...prev, [address]: false }));
      });
    } catch {
      startTransition(() => {
        setBtcRunesByAddress((prev) => ({ ...prev, [address]: [] }));
        setBtcRunesLoading((prev) => ({ ...prev, [address]: false }));
      });
    }
  }, []);

  useEffect(() => {
    if (walletMode !== "web3") return;
    const id = window.setTimeout(() => {
      btcWallets.forEach((w) => {
        if (!w.address) return;
        if (w.address !== btcAddress) void fetchBtcBalanceForAddress(w.address!);
        void fetchRunesForAddress(w.address!);
      });
    }, 0);
    return () => window.clearTimeout(id);
  }, [walletMode, btcWallets, btcAddress, fetchBtcBalanceForAddress, fetchRunesForAddress]);

  const handleAddAdaWalletInternal = () => {
    if (!isPro && totalWallets >= FREE_WALLET_LIMIT) {
      setAdaNewError(`Plano Gratuito limitado a ${FREE_WALLET_LIMIT} carteiras. Faz upgrade para Pro.`);
      return;
    }
    if (!adaNewAddress.trim()) {
      setAdaNewError("Insere um endereço.");
      return;
    }
    if (!isAdaAddress(adaNewAddress.trim())) {
      setAdaNewError("Endereço Cardano inválido (addr1... ou stake1...).");
      return;
    }
    const trimmed = adaNewAddress.trim();
    const networkLabel =
      adaNewNetworkId === "outro"
        ? (adaNewCustomLabel.trim() || "Cardano")
        : (adaNetworkOptions.find((o) => o.id === adaNewNetworkId)?.label ?? "Cardano");
    const isMainnet = adaNewNetworkId === "cardano" || adaNewNetworkId === "outro";
    const nextWallets = upsertWallet(
      adaWallets,
      { address: trimmed, network: networkLabel },
      (item) => item.address === trimmed && (item.network ?? "Cardano") === networkLabel
    );
    setAdaWallets(nextWallets);
    setAdaNewAddress("");
    setAdaNewCustomLabel("");
    setAdaNewError(null);
    if (isMainnet) void fetchAdaBalanceForAddress(trimmed);
  };

  const handleAddAdaWallet = () => {
    const host = typeof window !== "undefined" ? window.location.hostname : "";
    requestConfirm({
      title: "Adicionar endereço Cardano",
      description: `Confirma a adição do endereço ${adaNewAddress || "indefinido"} no domínio ${host || "atual"}.`,
      onConfirm: () =>
        new Promise<void>((resolve) => {
          window.setTimeout(() => {
            handleAddAdaWalletInternal();
            resolve();
          }, 0);
        }),
    });
  };

  return (
    <AppShell>
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 pb-20 pt-2">
        <div className="flex flex-col gap-4">
          <p className="text-xs uppercase tracking-[0.3em] text-orange-300/80">
            {t("nav_wallets")}
          </p>
          <h1 className="text-3xl font-semibold text-white">
            {t("port_blockchain")} · {t("port_traditional")}
          </h1>
          <p className="max-w-2xl text-sm text-slate-400">
            Liga carteiras blockchain (ETH, SOL, BTC, ADA) para ver saldos em tempo real, ou regista ativos tradicionais e cripto comprados manualmente.
          </p>
          <div className="flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-2.5 text-sm text-blue-300">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0">
              <path d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" />
            </svg>
            <span>{t("wl_readonly_banner")}</span>
          </div>
          {isLoadingAuth ? null : isPro ? (
            <p className="text-xs text-emerald-300">
              Sincronização automática ativa.
            </p>
          ) : (
            <div className="flex items-center gap-3">
              <p className="text-xs text-slate-500">
                Carteiras: <span className={totalWallets >= FREE_WALLET_LIMIT ? "text-rose-400 font-semibold" : "text-slate-300 font-semibold"}>{totalWallets}/{FREE_WALLET_LIMIT}</span>
                {" "}(Plano Gratuito){" "}
                {totalWallets >= FREE_WALLET_LIMIT && (
                  <a href="/pricing" className="text-orange-400 underline hover:text-orange-300">Upgrade para Pro →</a>
                )}
              </p>
            </div>
          )}
          {cloudSyncError ? (
            <p className="text-xs text-rose-300">{cloudSyncError}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setWalletMode("web3")}
              className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
                walletMode === "web3"
                  ? "border-orange-400 bg-orange-500 text-slate-950"
                  : "border-slate-700 bg-slate-950/60 text-slate-200 hover:border-slate-500"
              }`}
            >
              {t("port_blockchain")}
            </button>
            <button
              type="button"
              onClick={() => setWalletMode("tradicional")}
              className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
                walletMode === "tradicional"
                  ? "border-orange-400 bg-orange-500 text-slate-950"
                  : "border-slate-700 bg-slate-950/60 text-slate-200 hover:border-slate-500"
              }`}
            >
              {t("port_traditional")}
            </button>
          </div>
        </div>

        {walletMode === "web3" ? (
        <>
        {confirmOpen ? (
          <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4">
            <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-950/95 p-6 text-slate-100 shadow-2xl">
              <p className="text-xs uppercase tracking-[0.3em] text-orange-300/80">
                {confirmRef.current?.title ?? "Confirmar"}
              </p>
              <p className="mt-3 text-sm text-slate-300">
                {confirmRef.current?.description ?? "Confirma a operação."}
              </p>
              {confirmError ? (
                <p className="mt-3 text-xs text-rose-300">{confirmError}</p>
              ) : null}
              <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  className="rounded-full border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
                  onClick={() => setConfirmOpen(false)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className={`${btnPrimary} px-4 py-2 text-xs`}
                  onClick={handleConfirm}
                >
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {otherWallets.length > 0 && (
          <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="mb-3">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{t("wl_other_networks")}</p>
              <h3 className="text-base font-bold text-white mt-0.5">{t("wl_tracking")}</h3>
              <p className="text-xs text-slate-500 mt-1">{t("wl_tracking_desc")}</p>
            </div>
            <div className="space-y-2">
              {otherWallets.map((item) => (
                <div
                  key={`${item.address}-${item.network}`}
                  className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-300 flex flex-wrap items-center justify-between gap-2"
                >
                  <div className="space-y-0.5">
                    <p className="font-semibold text-white text-[11px]">
                      <EditableName
                        current={item.label && item.label !== item.network ? item.label : ""}
                        display={item.label && item.label !== item.network ? item.label : (item.network ?? "—")}
                        onSave={(v) => renameWallet("other", item.address, v)}
                        placeholder={t("wc_name_ph")}
                      />
                      <span className="ml-2 rounded-full bg-slate-600/30 px-2 py-0.5 text-[10px] text-slate-400">{item.network}</span>
                    </p>
                    <div className="flex items-center gap-2">
                      <p className="text-slate-500 font-mono text-[11px] break-all">
                        {otherShown[item.address ?? ""]
                          ? item.address
                          : <span className="tracking-widest text-slate-600 select-none">••••••••</span>}
                      </p>
                      <button
                        type="button"
                        onClick={() => setOtherShown((prev) => ({ ...prev, [item.address ?? ""]: !prev[item.address ?? ""] }))}
                        className="shrink-0 rounded-full border border-slate-700 px-2 py-0.5 text-[10px] font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
                        title={otherShown[item.address ?? ""] ? t("wc_hide_addr") : t("wc_show_addr")}
                        aria-label={otherShown[item.address ?? ""] ? t("wc_hide_addr") : t("wc_show_addr")}
                      >
                        {otherShown[item.address ?? ""] ? "🙈" : "👁️"}
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="rounded-full border border-rose-400/40 px-3 py-1 text-[11px] font-semibold text-rose-200 transition hover:border-rose-400 hover:text-white shrink-0"
                    onClick={() => {
                      const next = otherWallets.filter((w) => !(w.address === item.address && w.network === item.network));
                      setOtherWallets(next);
                      updateWalletSnapshot({ eth: ethWallets, sol: solWallets, btc: btcWallets, ada: adaWallets, other: next });
                    }}
                  >
                    Remover
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
        <div className="grid gap-6 md:grid-cols-2">
          <WalletCard
            title="Ethereum"
            description={
              ethWallets.length > 0
                ? `${selectedEthConnectNetwork === "Ethereum" ? "ETH Mainnet" : selectedEthConnectNetwork} · ${ethWallets.length} rede(s) ligada(s)`
                : "MetaMask (ETH)"
            }
            address={ethActiveEntry?.address ?? ethAddress ?? ethWallets[0]?.address}
            addressDisplay={
              ethShowMain
                ? (ethActiveEntry?.address ?? ethAddress ?? ethWallets[0]?.address)
                : formatAddress(ethActiveEntry?.address ?? ethAddress ?? ethWallets[0]?.address)
            }
            balance={ethActiveBalance}
            balanceUnit="ETH"
            fiatValueUsd={getFiatValue("ETH", ethActiveBalance)}
            defiBalanceUsd={ethMainAddress ? defiTotals[defiKey(ethMainAddress, "eth")] ?? null : null}
            defiLoading={ethMainAddress ? !!defiLoading[defiKey(ethMainAddress, "eth")] : false}
            defiError={ethMainAddress ? defiErrors[defiKey(ethMainAddress, "eth")] ?? null : null}
            nftCount={ethMainAddress ? nftCounts[defiKey(ethMainAddress, "eth")] ?? null : null}
            nftLoading={ethMainAddress ? !!nftLoading[defiKey(ethMainAddress, "eth")] : false}
            nftError={ethMainAddress ? nftErrors[defiKey(ethMainAddress, "eth")] ?? null : null}
            nfts={ethMainAddress ? nftsByKey[defiKey(ethMainAddress, "eth")] ?? [] : []}
            usdToEur={usdToEurRate}
            onRefreshDefi={ethMainAddress ? () => void fetchDefiTotal(ethMainAddress, "eth") : undefined}
            isConnected={!!ethAddress || ethWallets.length > 0}
            isAvailable={ethIsAvailable || ethWallets.length > 0}
            isLoading={ethLoading}
            error={ethError}
            onConnect={handleEthConnect}
            onConnectAnother={handleEthConnect}
            onDisconnect={handleEthDisconnect}
            onRefresh={handleEthRefresh}
            onToggleAddress={() => setEthShowMain((prev) => !prev)}
            isAddressVisible={ethShowMain}
            topContent={
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
                  Carteira ETH
                </span>
                <div className="relative min-w-[140px]" ref={ethWalletSelectRef}>
                  <button
                    type="button"
                    className="flex min-w-[140px] items-center justify-between gap-2 rounded-full border border-slate-800 bg-slate-950/60 px-3 py-1.5 text-left text-xs text-slate-200 outline-none transition focus:border-orange-400"
                    onClick={() => setEthWalletSelectOpen((o) => !o)}
                  >
                    <span className="truncate">
                      {ethWalletOptions.find((o) => o.id === selectedEvmProvider)?.label ?? selectedEvmProvider}
                    </span>
                    <span className="text-slate-500 text-[10px]">{ethWalletSelectOpen ? "▲" : "▼"}</span>
                  </button>
                  {ethWalletSelectOpen ? (
                    <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-[200px] rounded-xl border border-slate-700 bg-slate-900 shadow-xl">
                      <input
                        type="text"
                        className="w-full border-b border-slate-700 bg-slate-900/80 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 outline-none"
                        placeholder={t("wl_search_wallet")}
                        value={ethWalletSelectFilter}
                        onChange={(e) => setEthWalletSelectFilter(e.target.value)}
                        onKeyDown={(e) => e.stopPropagation()}
                      />
                      <div className="max-h-[180px] overflow-y-auto py-1">
                        {ethWalletOptions
                          .filter(
                            (opt) =>
                              !ethWalletSelectFilter.trim() ||
                              opt.label.toLowerCase().includes(ethWalletSelectFilter.trim().toLowerCase()) ||
                              opt.id.toLowerCase().includes(ethWalletSelectFilter.trim().toLowerCase())
                          )
                          .map((option) => (
                            <button
                              key={option.id}
                              type="button"
                              className="flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800"
                              onClick={() => {
                                setSelectedEvmProvider(option.id);
                                setEthWalletSelectOpen(false);
                                setEthWalletSelectFilter("");
                              }}
                            >
                              <span>{option.label}</span>
                              {isClient && isEvmWalletAvailable(option.id) ? (
                                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-300">
                                  Disponível
                                </span>
                              ) : (
                                <span className="rounded-full bg-slate-600/30 px-2 py-0.5 text-[10px] text-slate-400">
                                  Não instalada
                                </span>
                              )}
                            </button>
                          ))}
                      </div>
                    </div>
                  ) : null}
                </div>
                {/* Network dropdown */}
                <div className="relative min-w-[130px]" ref={ethNetworkSelectRef}>
                  <button
                    type="button"
                    className="flex min-w-[130px] items-center justify-between gap-2 rounded-full border border-slate-800 bg-slate-950/60 px-3 py-1.5 text-left text-xs text-slate-200 outline-none transition focus:border-orange-400"
                    onClick={() => setEthNetworkSelectOpen((o) => !o)}
                  >
                    <span className="truncate">
                      {selectedEthConnectNetwork === "Ethereum" ? "ETH Mainnet" : selectedEthConnectNetwork}
                    </span>
                    <span className="text-slate-500 text-[10px]">{ethNetworkSelectOpen ? "▲" : "▼"}</span>
                  </button>
                  {ethNetworkSelectOpen && (
                    <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-[160px] rounded-xl border border-slate-700 bg-slate-900 shadow-xl">
                      {(["Ethereum", "Arbitrum", "Optimism", "Base", "Polygon", "zkSync", "Linea", "Blast"] as EvmNetwork[]).map((net) => (
                        <button
                          key={net}
                          type="button"
                          className={`flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-slate-800 ${selectedEthConnectNetwork === net ? "text-orange-300" : "text-slate-200"}`}
                          onClick={() => { setSelectedEthConnectNetwork(net); setEthNetworkSelectOpen(false); }}
                        >
                          <span>{net === "Ethereum" ? "ETH Mainnet" : net}</span>
                          {selectedEthConnectNetwork === net && <span className="text-orange-400">✓</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            }
          >
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                Carteiras adicionais / L2
              </p>
              <div>
                <button
                  type="button"
                  onClick={() => setShowEthNetworks((prev) => !prev)}
                  className="rounded-full border border-slate-700 px-3 py-1 text-[11px] font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
                >
                  Carteiras ETH
                </button>
                {showEthNetworks ? (
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                    {ethWalletOptions.map((option) => (
                      <span
                        key={option.id}
                        className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-1 text-slate-200"
                      >
                        {option.label}{" "}
                        {isClient && isEvmWalletAvailable(option.id) ? (
                          <span className="ml-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-300">
                            Disponível
                          </span>
                        ) : (
                          <span className="ml-1 rounded-full bg-slate-600/30 px-2 py-0.5 text-[10px] text-slate-400">
                            Não instalada
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              <p className="text-xs text-slate-500">
                Conecta uma carteira e/ou adiciona endereços. O saldo total junta todas.
              </p>
              <button
                type="button"
                className="flex items-center gap-2 rounded-full border border-blue-500/40 bg-blue-950/30 px-4 py-2 text-xs font-semibold text-blue-300 transition hover:border-blue-400 hover:text-white disabled:opacity-60"
                onClick={handleWalletConnect}
                disabled={ethLoading}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 300 185" fill="currentColor">
                  <path d="M61.4 36.3c48.9-47.9 128.3-47.9 177.2 0l5.9 5.8c2.4 2.4 2.4 6.2 0 8.6l-20.2 19.8c-1.2 1.2-3.2 1.2-4.4 0l-8.1-7.9c-34.1-33.4-89.4-33.4-123.5 0l-8.7 8.5c-1.2 1.2-3.2 1.2-4.4 0L54.9 51.3c-2.4-2.4-2.4-6.2 0-8.6l6.5-6.4zm218.8 40.8l18 17.6c2.4 2.4 2.4 6.2 0 8.6l-81.2 79.5c-2.4 2.4-6.4 2.4-8.8 0l-57.6-56.4c-.6-.6-1.6-.6-2.2 0l-57.6 56.4c-2.4 2.4-6.4 2.4-8.8 0L.8 103.3c-2.4-2.4-2.4-6.2 0-8.6l18-17.6c2.4-2.4 6.4-2.4 8.8 0l57.6 56.4c.6.6 1.6.6 2.2 0l57.6-56.4c2.4-2.4 6.4-2.4 8.8 0l57.6 56.4c.6.6 1.6.6 2.2 0l57.6-56.4c2.4-2.5 6.4-2.5 8.8-.1z"/>
                </svg>
                WalletConnect (QR)
              </button>
              <div className="grid gap-3 sm:grid-cols-[1.2fr_0.8fr_auto]">
                <input
                  className="w-full rounded-full border border-slate-800 bg-slate-950/60 px-4 py-2 text-xs text-slate-200 outline-none transition focus:border-orange-400"
                  placeholder="Endereço 0x..."
                  value={ethNewAddress}
                  onChange={(event) => setEthNewAddress(event.target.value)}
                />
                <select
                  className="w-full rounded-full border border-slate-800 bg-slate-950/60 px-4 py-2 text-xs text-slate-200 outline-none"
                  value={ethNewNetwork}
                  onChange={(e) => setEthNewNetwork(e.target.value as EvmNetwork | "outro")}
                >
                  <optgroup label="── Layer 1 ──">
                    {ethNetworkLabelOptions.filter(o => o.group === "L1").map(opt => (
                      <option key={opt.id} value={opt.id}>{opt.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="── Layer 2 ──">
                    {ethNetworkLabelOptions.filter(o => o.group === "L2").map(opt => (
                      <option key={opt.id} value={opt.id}>{opt.label}</option>
                    ))}
                  </optgroup>
                  <option value="outro">{t("wl_other_evm")}</option>
                </select>
                <button
                  type="button"
                  className="rounded-full border border-orange-400/40 px-4 py-2 text-xs font-semibold text-orange-200 transition hover:border-orange-400 hover:text-white disabled:opacity-60"
                  onClick={handleAddEthWallet}
                  disabled={ethNewLoading}
                >
                  {ethNewLoading ? "A adicionar..." : "Adicionar"}
                </button>
              </div>
              {ethNewNetwork === "outro" ? (
                <input
                  className="w-full max-w-xs rounded-full border border-slate-800 bg-slate-950/60 px-4 py-2 text-xs text-slate-200 outline-none transition focus:border-orange-400"
                  placeholder="Nome (opcional, ex: L2, Exchange)"
                  value={ethNewCustomLabel}
                  onChange={(e) => setEthNewCustomLabel(e.target.value)}
                />
              ) : null}
              {ethNewError ? <p className="text-xs text-rose-300">{ethNewError}</p> : null}
              {ethWallets.length > 1 && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    className="rounded-full border border-rose-400/30 px-3 py-1 text-[11px] font-semibold text-rose-300 transition hover:border-rose-400 hover:text-white"
                    onClick={() => {
                      if (!confirm("Remover todas as carteiras ETH adicionadas por endereço?")) return;
                      setEthWallets([]);
                      setEthAddress(undefined);
                      setEthBalance(undefined);
                      setEthError(null);
                      setEthBalancesByKey({});
                      setEthBalanceErrors({});
                    }}
                  >
                    Remover todas
                  </button>
                </div>
              )}
              <div className="space-y-2">
                {ethWallets.map((item) => {
                  const isConnected = item.address === ethAddress && item.network === ethConnectedNetwork;
                  const key = ethBalanceKey(item.address ?? "", item.network ?? "Ethereum");
                  const loading = ethBalancesLoading[key];
                  const err = ethBalanceErrors[key];
                  const liveBalance = ethBalancesByKey[key];
                  const balanceDisplay = isConnected
                    ? ethBalance ?? "—"
                    : loading || liveBalance === undefined
                      ? "A carregar..."
                      : err
                        ? null
                        : liveBalance ?? "—";
                  const dk = item.address ? defiKey(item.address, item.network ?? "Ethereum") : null;
                  const itemDefi = dk ? (defiTotals[dk] ?? null) : null;
                  const itemDefiLoading = dk ? !!defiLoading[dk] : false;
                  const itemNftCount = dk ? (nftCounts[dk] ?? null) : null;
                  const itemNftLoading = dk ? !!nftLoading[dk] : false;
                  const itemNfts = dk ? (nftsByKey[dk] ?? []) : [];
                  return (
                    <div
                      key={`${item.address}-${item.network}`}
                      className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-300"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-1">
                        <p className="font-semibold text-white">
                          <EditableName
                            current={item.label ?? ""}
                            display={item.label ?? item.network ?? "Ethereum"}
                            onSave={(v) => renameWallet("eth", item.address, v)}
                            placeholder={t("wc_name_ph")}
                          />
                          {item.label && item.network && (
                            <span className="ml-1.5 text-[10px] font-normal text-slate-500">{item.network}</span>
                          )}
                          {isConnected ? (
                            <span className="ml-2 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-300">
                              Conectada
                            </span>
                          ) : (
                            <span className="ml-2 rounded-full bg-slate-600/30 px-2 py-0.5 text-[10px] text-slate-400">
                              Por endereço
                            </span>
                          )}
                        </p>
                        <div className="flex items-center gap-2">
                          <p className="text-slate-500">
                            {ethShown[item.address ?? ""] ? item.address : <span className="tracking-widest text-slate-600 select-none">••••••••</span>}
                          </p>
                          <button
                            type="button"
                            onClick={() =>
                              setEthShown((prev) => ({ ...prev, [item.address ?? ""]: !prev[item.address ?? ""] }))
                            }
                            className="rounded-full border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
                            title={ethShown[item.address ?? ""] ? "Ocultar" : "Mostrar"}
                          >
                            {ethShown[item.address ?? ""] ? "🙈" : "👁️"}
                          </button>
                        </div>
                        <p className="flex flex-wrap items-center gap-1.5 text-slate-500">
                          DeFi:{" "}
                          {itemDefiLoading
                            ? <span className="animate-pulse">{t("wl_loading")}</span>
                            : itemDefi != null
                              ? <span className={itemDefi >= 0.01 ? "text-emerald-400 font-semibold" : "text-slate-400"}>
                                  {fmtCur(itemDefi * usdToEurRate)}
                                </span>
                              : <span className="text-slate-600 text-[11px]">—</span>}
                          {item.address && (
                            <span className="inline-flex items-center gap-1.5">
                              <a href={`https://app.uniswap.org/positions`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-pink-400 hover:text-pink-300 underline underline-offset-2">Uniswap ↗</a>
                              <a href={`https://defillama.com/portfolio#${item.address}`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-violet-400 hover:text-violet-300 underline underline-offset-2">DeFiLlama ↗</a>
                              <button
                                type="button"
                                onClick={() => void fetchDefiForEntry(item.address!, item.network ?? "Ethereum")}
                                className="text-slate-600 hover:text-orange-400 transition text-[10px]"
                                title={t("wl_refresh_defi")}
                              >↻</button>
                            </span>
                          )}
                        </p>
                        <p className="text-slate-500">
                          NFT:{" "}
                          {hideBalances
                            ? "••••"
                            : itemNftLoading
                            ? "A carregar..."
                            : itemNftCount != null
                              ? `${itemNftCount} ${itemNftCount === 1 ? "item" : "itens"}`
                              : "—"}
                        </p>
                        {!hideBalances && itemNfts.length > 0 && (
                          <div className="mt-1 grid grid-cols-4 gap-1 max-w-[160px]">
                            {itemNfts.slice(0, 8).map((nft) => (
                              <a
                                key={nft.id}
                                href={nft.tokenAddress && nft.tokenId ? `https://opensea.io/assets/ethereum/${nft.tokenAddress}/${nft.tokenId}` : "#"}
                                target="_blank" rel="noopener noreferrer"
                                className="aspect-square overflow-hidden rounded border border-slate-700 bg-slate-800"
                                title={nft.name}
                              >
                                {(nft.image || nft.tokenUri)
                                  ? <NftImage src={nft.image} tokenUri={nft.tokenUri} alt={nft.name} className="h-full w-full object-cover" />
                                  : <div className="flex h-full w-full items-center justify-center text-[8px] text-slate-500">—</div>}
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        {balanceDisplay != null && (
                          <p>
                            {hideBalances ? "••••" : <>{balanceDisplay} {balanceDisplay !== "A carregar..." && balanceDisplay !== "—" ? "ETH" : ""}</>}
                          </p>
                        )}
                        {balanceDisplay != null && balanceDisplay !== "A carregar..." && balanceDisplay !== "—" && getFiatValue("ETH", balanceDisplay) != null ? (
                          <p className="text-slate-400">{fmtCur((getFiatValue("ETH", balanceDisplay) ?? 0) * usdToEurRate)}</p>
                        ) : null}
                        {err ? (
                          <p className="text-rose-300" title={err}>
                            {err.length > 40 ? `${err.slice(0, 40)}…` : err}
                          </p>
                        ) : null}
                        <div className="mt-1 flex flex-wrap justify-end gap-1">
                          {!isConnected && (err || balanceDisplay === "—") ? (
                            <button
                              type="button"
                              className="rounded-full border border-slate-600 px-3 py-1 text-[11px] font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white disabled:opacity-50"
                              onClick={() => void fetchEthBalanceForEntry(item.address!, item.network ?? "Ethereum")}
                              disabled={loading}
                            >
                              {loading ? "A carregar…" : "Tentar novamente"}
                            </button>
                          ) : null}
                          <button
                            className="rounded-full border border-rose-400/40 px-3 py-1 text-[11px] font-semibold text-rose-200 transition hover:border-rose-400 hover:text-white"
                            type="button"
                            onClick={() => {
                              const nextWallets = removeWallet(
                                ethWallets,
                                (entry) => entry.address === item.address && entry.network === item.network
                              );
                              setEthWallets(nextWallets);
                              if (item.address === ethAddress && item.network === "Ethereum") {
                                setEthAddress(undefined);
                                setEthBalance(undefined);
                                setEthError(null);
                              }
                              const k = ethBalanceKey(item.address ?? "", item.network ?? "");
                              setEthBalancesByKey((prev) => {
                                const next = { ...prev };
                                delete next[k];
                                return next;
                              });
                              setEthBalanceErrors((prev) => {
                                const next = { ...prev };
                                delete next[k];
                                return next;
                              });
                            }}
                          >
                            Remover
                          </button>
                        </div>
                      </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </WalletCard>
          <WalletCard
            title="Solana"
            description={
              solWallets.length > 0
                ? `${solWallets.length} carteira(s) · Saldo total SOL`
                : "Phantom (SOL)"
            }
            address={solAddress ?? solWallets[0]?.address}
            addressDisplay={
              solShowMain
                ? solAddress ?? solWallets[0]?.address
                : formatAddress(solAddress ?? solWallets[0]?.address)
            }
            balance={solWallets.length > 0 ? totalSolBalance : solBalance}
            balanceUnit="SOL"
            fiatValueUsd={getFiatValue("SOL", solWallets.length > 0 ? totalSolBalance : solBalance)}
            defiBalanceUsd={solMainAddress ? defiTotals[defiKey(solMainAddress, "sol")] ?? null : null}
            defiLoading={solMainAddress ? !!defiLoading[defiKey(solMainAddress, "sol")] : false}
            defiError={solMainAddress ? defiErrors[defiKey(solMainAddress, "sol")] ?? null : null}
            nftCount={solMainAddress ? nftCounts[defiKey(solMainAddress, "sol")] ?? null : null}
            nftLoading={solMainAddress ? !!nftLoading[defiKey(solMainAddress, "sol")] : false}
            nftError={solMainAddress ? nftErrors[defiKey(solMainAddress, "sol")] ?? null : null}
            nfts={solMainAddress ? nftsByKey[defiKey(solMainAddress, "sol")] ?? [] : []}
            usdToEur={usdToEurRate}
            onRefreshDefi={solMainAddress ? () => void fetchDefiTotal(solMainAddress, "sol") : undefined}
            isConnected={!!solAddress || solWallets.length > 0}
            isAvailable={solIsAvailable || solWallets.length > 0}
            isLoading={solLoading}
            error={solError}
            onConnect={handleSolConnect}
            onConnectAnother={handleSolConnect}
            onDisconnect={handleSolDisconnect}
            onRefresh={handleSolRefresh}
            onToggleAddress={() => setSolShowMain((prev) => !prev)}
            isAddressVisible={solShowMain}
            topContent={
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
                  Carteira SOL
                </span>
                {/* Wallet selector */}
                <div className="relative min-w-[160px]" ref={solWalletSelectRef}>
                  <button
                    type="button"
                    className="flex min-w-[160px] items-center justify-between gap-2 rounded-full border border-slate-800 bg-slate-950/60 px-3 py-1.5 text-left text-xs text-slate-200 outline-none transition focus:border-orange-400"
                    onClick={() => setSolWalletSelectOpen((o) => !o)}
                  >
                    <span className="truncate">
                      {solWalletOptions.find((o) => o.id === selectedSolProvider)?.label ?? selectedSolProvider}
                    </span>
                    <span className="text-slate-500 text-[10px]">{solWalletSelectOpen ? "▲" : "▼"}</span>
                  </button>
                  {solWalletSelectOpen ? (
                    <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-[220px] rounded-xl border border-slate-700 bg-slate-900 shadow-xl">
                      <input
                        type="text"
                        className="w-full border-b border-slate-700 bg-slate-900/80 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 outline-none"
                        placeholder={t("wl_search_wallet")}
                        value={solWalletSelectFilter}
                        onChange={(e) => setSolWalletSelectFilter(e.target.value)}
                        onKeyDown={(e) => e.stopPropagation()}
                      />
                      <div className="max-h-[200px] overflow-y-auto py-1">
                        {solWalletOptions
                          .filter(
                            (opt) =>
                              !solWalletSelectFilter.trim() ||
                              opt.label.toLowerCase().includes(solWalletSelectFilter.trim().toLowerCase()) ||
                              opt.id.toLowerCase().includes(solWalletSelectFilter.trim().toLowerCase())
                          )
                          .map((option) => (
                            <button
                              key={option.id}
                              type="button"
                              className="flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800"
                              onClick={() => {
                                setSelectedSolProvider(option.id);
                                setSolWalletSelectOpen(false);
                                setSolWalletSelectFilter("");
                              }}
                            >
                              <span>{option.label}</span>
                              {isClient && isSolanaWalletAvailable(option.id) ? (
                                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-300">
                                  Disponível
                                </span>
                              ) : (
                                <span className="rounded-full bg-slate-600/30 px-2 py-0.5 text-[10px] text-slate-400">
                                  Não instalada
                                </span>
                              )}
                            </button>
                          ))}
                      </div>
                    </div>
                  ) : null}
                </div>
                {/* Network selector */}
                <div className="relative min-w-[130px]" ref={solNetworkSelectRef}>
                  <button
                    type="button"
                    className="flex min-w-[130px] items-center justify-between gap-2 rounded-full border border-slate-800 bg-slate-950/60 px-3 py-1.5 text-left text-xs text-slate-200 outline-none transition focus:border-orange-400"
                    onClick={() => setSolNetworkSelectOpen((o) => !o)}
                  >
                    <span className="truncate">
                      {selectedSolNetwork === "Mainnet" ? "SOL Mainnet" : "SOL Devnet"}
                    </span>
                    <span className="text-slate-500 text-[10px]">{solNetworkSelectOpen ? "▲" : "▼"}</span>
                  </button>
                  {solNetworkSelectOpen && (
                    <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-[160px] rounded-xl border border-slate-700 bg-slate-900 shadow-xl">
                      {(["Mainnet", "Devnet"] as const).map((net) => (
                        <button
                          key={net}
                          type="button"
                          className={`flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-slate-800 ${selectedSolNetwork === net ? "text-orange-300" : "text-slate-200"}`}
                          onClick={() => { setSelectedSolNetwork(net); setSolNetworkSelectOpen(false); }}
                        >
                          <span>{net === "Mainnet" ? "SOL Mainnet" : "SOL Devnet"}</span>
                          {selectedSolNetwork === net && <span className="text-orange-400">✓</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            }
          >
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                Carteiras adicionais / L2
              </p>
              <div className="flex flex-wrap gap-2 text-[11px]">
                {solWalletOptions.map((option) => (
                  <span
                    key={option.id}
                    className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-1 text-slate-200"
                  >
                    {option.label}{" "}
                    {isClient && isSolanaWalletAvailable(option.id) ? (
                      <span className="ml-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-300">
                        Disponível
                      </span>
                    ) : (
                      <span className="ml-1 rounded-full bg-slate-600/30 px-2 py-0.5 text-[10px] text-slate-400">
                        Não instalada
                      </span>
                    )}
                  </span>
                ))}
              </div>
              <p className="text-xs text-slate-500">
                Conecta uma carteira e/ou adiciona endereços. O saldo total junta todas.
              </p>
              <div className="grid gap-3 sm:grid-cols-[1.2fr_0.8fr_auto]">
                <input
                  className="w-full rounded-full border border-slate-800 bg-slate-950/60 px-4 py-2 text-xs text-slate-200 outline-none transition focus:border-orange-400"
                  placeholder={t("wl_addr_sol")}
                  value={solNewAddress}
                  onChange={(event) => setSolNewAddress(event.target.value)}
                />
                <div className="relative min-w-0" ref={solNewWalletSelectRef}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 rounded-full border border-slate-800 bg-slate-950/60 px-4 py-2 text-left text-xs text-slate-200 outline-none transition focus:border-orange-400"
                    onClick={() => setSolNewWalletSelectOpen((o) => !o)}
                  >
                    <span className="truncate">
                      {solNetworkOptions.find((o) => o.id === solNewWalletId)?.label ?? solNewWalletId}
                    </span>
                    <span className="text-slate-500 text-[10px] shrink-0">{solNewWalletSelectOpen ? "▲" : "▼"}</span>
                  </button>
                  {solNewWalletSelectOpen ? (
                    <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-xl border border-slate-700 bg-slate-900 shadow-xl">
                      <input
                        type="text"
                        className="w-full border-b border-slate-700 bg-slate-900/80 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 outline-none"
                        placeholder={t("wl_search_network")}
                        value={solNewWalletSelectFilter}
                        onChange={(e) => setSolNewWalletSelectFilter(e.target.value)}
                        onKeyDown={(e) => e.stopPropagation()}
                      />
                      <div className="max-h-[200px] overflow-y-auto py-1">
                        {solNetworkOptions
                          .filter(
                            (opt) =>
                              !solNewWalletSelectFilter.trim() ||
                              opt.label.toLowerCase().includes(solNewWalletSelectFilter.trim().toLowerCase()) ||
                              opt.id.toLowerCase().includes(solNewWalletSelectFilter.trim().toLowerCase())
                          )
                          .map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800"
                              onClick={() => {
                                setSolNewWalletId(opt.id);
                                setSolNewWalletSelectOpen(false);
                                setSolNewWalletSelectFilter("");
                              }}
                            >
                              {opt.label}
                            </button>
                          ))}
                      </div>
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="rounded-full border border-orange-400/40 px-4 py-2 text-xs font-semibold text-orange-200 transition hover:border-orange-400 hover:text-white disabled:opacity-60"
                  onClick={handleAddSolWallet}
                  disabled={solNewLoading}
                >
                  {solNewLoading ? "A adicionar..." : "Adicionar"}
                </button>
              </div>
              {solNewWalletId === "outro" ? (
                <input
                  className="w-full max-w-xs rounded-full border border-slate-800 bg-slate-950/60 px-4 py-2 text-xs text-slate-200 outline-none transition focus:border-orange-400"
                  placeholder={t("wl_name_opt")}
                  value={solNewCustomLabel}
                  onChange={(e) => setSolNewCustomLabel(e.target.value)}
                />
              ) : null}
              {solNewError ? <p className="text-xs text-rose-300">{solNewError}</p> : null}
              <div className="space-y-2">
                {solWallets.map((item) => {
                  const isConnected = item.address === solAddress
                    || (!!item.label && solWalletOptions.some((o) => o.label === item.label));
                  const addr = item.address ?? "";
                  const loading = solBalancesLoading[addr];
                  const err = solBalanceErrors[addr];
                  const balanceDisplay = item.address === solAddress
                    ? solBalance ?? "—"
                    : loading
                      ? "A carregar..."
                      : err
                        ? null
                        : solBalancesByAddress[addr] ?? item.balance ?? "—";
                  const dk = addr ? defiKey(addr, "sol") : null;
                  const itemDefi = dk ? (defiTotals[dk] ?? null) : null;
                  const itemDefiLoading = dk ? !!defiLoading[dk] : false;
                  const itemNftCount = dk ? (nftCounts[dk] ?? null) : null;
                  const itemNftLoading = dk ? !!nftLoading[dk] : false;
                  const itemNfts = dk ? (nftsByKey[dk] ?? []) : [];
                  return (
                    <div
                      key={`${item.address}-${item.network ?? "Solana"}`}
                      className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-300"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="space-y-1">
                          <p className="font-semibold text-white">
                            <EditableName
                              current={item.label ?? ""}
                              display={item.label ?? item.network ?? "Solana"}
                              onSave={(v) => renameWallet("sol", item.address, v)}
                              placeholder={t("wc_name_ph")}
                            />
                            {isConnected ? (
                              <span className="ml-2 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-300">{t("wl_connected")}</span>
                            ) : (
                              <span className="ml-2 rounded-full bg-slate-600/30 px-2 py-0.5 text-[10px] text-slate-400">{t("wl_by_address")}</span>
                            )}
                          </p>
                          <div className="flex items-center gap-2">
                            <p className="text-slate-500">
                              {solShown[addr] ? item.address : <span className="tracking-widest text-slate-600 select-none">••••••••</span>}
                            </p>
                            <button
                              type="button"
                              onClick={() => setSolShown((prev) => ({ ...prev, [addr]: !prev[addr] }))}
                              className="rounded-full border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
                              title={solShown[addr] ? "Ocultar" : "Mostrar"}
                            >
                              {solShown[addr] ? "🙈" : "👁️"}
                            </button>
                          </div>
                          {/* DeFi */}
                          <p className="flex flex-wrap items-center gap-1.5 text-slate-500">
                            DeFi:{" "}
                            {itemDefiLoading
                              ? <span className="animate-pulse">{t("wl_loading")}</span>
                              : itemDefi != null
                                ? <span className={itemDefi >= 0.01 ? "text-emerald-400 font-semibold" : "text-slate-400"}>
                                    {fmtCur(itemDefi * usdToEurRate)}
                                  </span>
                                : <span className="text-slate-600 text-[11px]">—</span>}
                            {addr && (
                              <span className="inline-flex items-center gap-1.5">
                                <a href={`https://app.meteora.ag/dlmm?wallet=${addr}`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-violet-400 hover:text-violet-300 underline underline-offset-2">Meteora ↗</a>
                                <a href={`https://defillama.com/portfolio#${addr}`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-violet-400 hover:text-violet-300 underline underline-offset-2">DeFiLlama ↗</a>
                                <button
                                  type="button"
                                  onClick={() => { void fetchDefiTotal(addr, "sol"); void fetchNftBalance(addr, "sol"); }}
                                  className="text-slate-600 hover:text-orange-400 transition text-[10px]"
                                  title={t("wl_refresh_defi")}
                                >↻</button>
                              </span>
                            )}
                          </p>
                          {/* NFT */}
                          <p className="text-slate-500">
                            NFT:{" "}
                            {hideBalances
                              ? "••••"
                              : itemNftLoading
                              ? "A carregar..."
                              : itemNftCount != null
                                ? `${itemNftCount} ${itemNftCount === 1 ? "item" : "itens"}`
                                : "—"}
                          </p>
                          {!hideBalances && itemNfts.length > 0 && (
                            <div className="mt-1 grid grid-cols-4 gap-1 max-w-[160px]">
                              {itemNfts.slice(0, 8).map((nft) => (
                                <a
                                  key={nft.id}
                                  href={nft.tokenAddress ? `https://magiceden.io/item-details/${nft.tokenAddress}` : "#"}
                                  target="_blank" rel="noopener noreferrer"
                                  className="aspect-square overflow-hidden rounded border border-slate-700 bg-slate-800"
                                  title={nft.name}
                                >
                                  {(nft.image || nft.tokenUri)
                                    ? <NftImage src={nft.image} tokenUri={nft.tokenUri} alt={nft.name} className="h-full w-full object-cover" loading="lazy" />
                                    : <div className="h-full w-full flex items-center justify-center text-[8px] text-slate-500">{nft.name?.slice(0, 3)}</div>}
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          {balanceDisplay != null && (
                            <p>{hideBalances ? "••••" : <>{balanceDisplay}{balanceDisplay !== "A carregar..." && balanceDisplay !== "—" ? " SOL" : ""}</>}</p>
                          )}
                          {balanceDisplay != null && balanceDisplay !== "A carregar..." && balanceDisplay !== "—" && getFiatValue("SOL", balanceDisplay) != null ? (
                            <p className="text-slate-400">{fmtCur((getFiatValue("SOL", balanceDisplay) ?? 0) * usdToEurRate)}</p>
                          ) : null}
                          {err ? (
                            <p className="text-rose-300" title={err}>{err.length > 40 ? `${err.slice(0, 40)}…` : err}</p>
                          ) : null}
                          <div className="mt-1 flex flex-wrap justify-end gap-1">
                            {!isConnected && (err || balanceDisplay === "—") ? (
                              <button
                                type="button"
                                className="rounded-full border border-slate-600 px-3 py-1 text-[11px] font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white disabled:opacity-50"
                                onClick={() => void fetchSolBalanceForAddress(addr)}
                                disabled={loading}
                              >
                                {loading ? "A carregar…" : "Tentar novamente"}
                              </button>
                            ) : null}
                            <button
                              className="rounded-full border border-rose-400/40 px-3 py-1 text-[11px] font-semibold text-rose-200 transition hover:border-rose-400 hover:text-white"
                              type="button"
                              onClick={() => {
                                const nextWallets = removeWallet(solWallets, (entry) => entry.address === item.address && (entry.network ?? "Solana") === (item.network ?? "Solana"));
                                setSolWallets(nextWallets);
                                if (item.address === solAddress) { setSolAddress(undefined); setSolBalance(undefined); setSolError(null); }
                                setSolBalancesByAddress((prev) => { const next = { ...prev }; delete next[addr]; return next; });
                                setSolBalanceErrors((prev) => { const next = { ...prev }; delete next[addr]; return next; });
                              }}
                            >
                              Remover
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </WalletCard>
          <WalletCard
            title="Bitcoin"
            description={
              btcWallets.length > 0
                ? `${btcWallets.length} carteira(s) · Saldo total BTC`
                : `${btcWalletOptions.find((o) => o.id === selectedBtcProvider)?.label ?? "Xverse"} (BTC)`
            }
            address={btcAddress ?? btcWallets[0]?.address}
            addressDisplay={
              btcShowMain
                ? btcAddress ?? btcWallets[0]?.address
                : formatAddress(btcAddress ?? btcWallets[0]?.address)
            }
            balance={btcWallets.length > 0 ? totalBtcBalance : (btcBalance !== null ? btcBalance.toFixed(8) : null)}
            balanceUnit="BTC"
            fiatValueUsd={getFiatValue("BTC", btcWallets.length > 0 ? totalBtcBalance : (btcBalance ?? undefined))}
            hideDefi
            defiBalanceUsd={btcMainAddress ? defiTotals[defiKey(btcMainAddress, "btc")] ?? null : null}
            defiLoading={btcMainAddress ? !!defiLoading[defiKey(btcMainAddress, "btc")] : false}
            defiError={btcMainAddress ? defiErrors[defiKey(btcMainAddress, "btc")] ?? null : null}
            nftCount={btcMainAddress ? nftCounts[defiKey(btcMainAddress, "btc")] ?? null : null}
            nftLoading={btcMainAddress ? !!nftLoading[defiKey(btcMainAddress, "btc")] : false}
            nftError={btcMainAddress ? nftErrors[defiKey(btcMainAddress, "btc")] ?? null : null}
            nfts={btcMainAddress ? nftsByKey[defiKey(btcMainAddress, "btc")] ?? [] : []}
            usdToEur={usdToEurRate}
            isConnected={!!btcAddress || btcWallets.length > 0}
            isAvailable={btcIsAvailable}
            isLoading={btcLoading}
            error={btcError}
            onConnect={handleBtcConnect}
            onConnectAnother={handleBtcConnect}
            onDisconnect={handleBtcDisconnect}
            onRefresh={handleBtcRefresh}
            allowConnectWhenUnavailable
            onToggleAddress={() => setBtcShowMain((prev) => !prev)}
            isAddressVisible={btcShowMain}
            topContent={
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
                  Carteira BTC
                </span>
                <div className="relative min-w-[120px]" ref={btcWalletSelectRef}>
                  <button
                    type="button"
                    className="flex min-w-[120px] items-center justify-between gap-2 rounded-full border border-slate-800 bg-slate-950/60 px-3 py-1.5 text-left text-xs text-slate-200 outline-none transition focus:border-orange-400"
                    onClick={() => setBtcWalletSelectOpen((o) => !o)}
                  >
                    <span className="truncate">
                      {btcWalletOptions.find((o) => o.id === selectedBtcProvider)?.label ?? selectedBtcProvider}
                    </span>
                    <span className="text-slate-500 text-[10px]">{btcWalletSelectOpen ? "▲" : "▼"}</span>
                  </button>
                  {btcWalletSelectOpen ? (
                    <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-[200px] rounded-xl border border-slate-700 bg-slate-900 shadow-xl">
                      <input
                        type="text"
                        className="w-full border-b border-slate-700 bg-slate-900/80 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 outline-none"
                        placeholder={t("wl_search_wallet")}
                        value={btcWalletSelectFilter}
                        onChange={(e) => setBtcWalletSelectFilter(e.target.value)}
                        onKeyDown={(e) => e.stopPropagation()}
                      />
                      <div className="max-h-[180px] overflow-y-auto py-1">
                        {btcWalletOptions
                          .filter(
                            (opt) =>
                              !btcWalletSelectFilter.trim() ||
                              opt.label.toLowerCase().includes(btcWalletSelectFilter.trim().toLowerCase()) ||
                              opt.id.toLowerCase().includes(btcWalletSelectFilter.trim().toLowerCase())
                          )
                          .map((option) => (
                            <button
                              key={option.id}
                              type="button"
                              className="flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800"
                              onClick={() => {
                                setSelectedBtcProvider(option.id);
                                setBtcWalletSelectOpen(false);
                                setBtcWalletSelectFilter("");
                              }}
                            >
                              <span>{option.label}</span>
                              {isClient && isBtcWalletAvailable(option.id) ? (
                                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-300">
                                  Disponível
                                </span>
                              ) : (
                                <span className="rounded-full bg-slate-600/30 px-2 py-0.5 text-[10px] text-slate-400">
                                  Não instalada
                                </span>
                              )}
                            </button>
                          ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            }
            extraBalance={{
              label: "Saldo dos RUNES:",
              content:
                !btcAddress && btcWallets.length === 0 ? (
                  <span className="text-slate-500">—</span>
                ) : btcRunesSummary.loading ? (
                  <span className="text-slate-400">{t("wl_loading")}</span>
                ) : btcRunesSummary.runes.length > 0 ? (
                  <div className="mt-1 space-y-1 text-amber-200/90">
                    {btcRunesSummary.runes.map((r) => (
                      <div key={r.symbol} className="flex justify-between gap-3 text-xs">
                        <span className="truncate" title={r.displayName}>{r.displayName}</span>
                        <span className="shrink-0 tabular-nums">{formatRuneAmount(r.amount)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-slate-500">—</span>
                ),
            }}
          >
            <div className="space-y-3">
              <p className="text-xs text-slate-500">
                Conecta uma carteira e/ou adiciona endereços. O saldo total junta todas.
              </p>
              <div className="grid gap-3 sm:grid-cols-[1.2fr_0.8fr_auto]">
                <input
                  className="w-full rounded-full border border-slate-800 bg-slate-950/60 px-4 py-2 text-xs text-slate-200 outline-none transition focus:border-orange-400"
                  placeholder={t("wl_addr_btc")}
                  value={btcNewAddress}
                  onChange={(event) => setBtcNewAddress(event.target.value)}
                />
                <div className="relative" ref={btcNewNetworkSelectRef}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-full border border-slate-800 bg-slate-950/60 px-4 py-2 text-xs text-slate-200 outline-none transition hover:border-slate-600"
                    onClick={() => setBtcNewNetworkSelectOpen((prev) => !prev)}
                  >
                    <span>{btcNetworkOptions.find((o) => o.id === btcNewLabel)?.label ?? "Bitcoin"}</span>
                    <span className="text-slate-500 text-[10px] shrink-0">{btcNewNetworkSelectOpen ? "▲" : "▼"}</span>
                  </button>
                  {btcNewNetworkSelectOpen ? (
                    <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-xl border border-slate-700 bg-slate-900 shadow-xl">
                      <input
                        type="text"
                        className="w-full border-b border-slate-700 bg-slate-900/80 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 outline-none"
                        placeholder={t("wl_search_network")}
                        value={btcNewNetworkSelectFilter}
                        onChange={(e) => setBtcNewNetworkSelectFilter(e.target.value)}
                        onKeyDown={(e) => e.stopPropagation()}
                      />
                      <div className="max-h-[200px] overflow-y-auto py-1">
                        {btcNetworkOptions
                          .filter(
                            (opt) =>
                              !btcNewNetworkSelectFilter.trim() ||
                              opt.label.toLowerCase().includes(btcNewNetworkSelectFilter.trim().toLowerCase()) ||
                              opt.id.toLowerCase().includes(btcNewNetworkSelectFilter.trim().toLowerCase())
                          )
                          .map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800"
                              onClick={() => {
                                setBtcNewLabel(opt.id);
                                setBtcNewNetworkSelectOpen(false);
                                setBtcNewNetworkSelectFilter("");
                              }}
                            >
                              {opt.label}
                            </button>
                          ))}
                      </div>
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="rounded-full border border-orange-400/40 px-4 py-2 text-xs font-semibold text-orange-200 transition hover:border-orange-400 hover:text-white disabled:opacity-60"
                  onClick={handleAddBtcWallet}
                  disabled={btcNewLoading}
                >
                  {btcNewLoading ? "A adicionar..." : "Adicionar"}
                </button>
              </div>
              {btcNewLabel === "outro" ? (
                <input
                  className="w-full max-w-xs rounded-full border border-slate-800 bg-slate-950/60 px-4 py-2 text-xs text-slate-200 outline-none transition focus:border-orange-400"
                  placeholder={t("wl_name_opt")}
                  value={btcNewCustomLabel}
                  onChange={(e) => setBtcNewCustomLabel(e.target.value)}
                />
              ) : null}
              {btcNewError ? <p className="text-xs text-rose-300">{btcNewError}</p> : null}
              <div className="space-y-2">
                {btcWallets.map((item) => {
                  const isConnected = item.address === btcAddress ||
                    (!!item.label && btcWalletOptions.some((o) => o.label === item.label));
                  const addr = item.address ?? "";
                  const loading = btcBalancesLoading[addr];
                  const err = btcBalanceErrors[addr];
                  const balanceDisplay = isConnected && item.address === btcAddress
                    ? (btcBalance != null ? btcBalance.toFixed(8) : "—")
                    : loading
                      ? "A carregar..."
                      : err
                        ? null
                        : btcBalancesByAddress[addr] ?? item.balance ?? "—";
                  // NFT/Runes counts are stored under the "btc" chain key (see fetchNftBalance(addr, "btc")),
                  // so look them up with "btc" — not item.network ("Bitcoin") — or they never match.
                  const dk = addr ? defiKey(addr, "btc") : null;
                  const itemDefi = dk ? (defiTotals[dk] ?? null) : null;
                  const itemDefiLoading = dk ? !!defiLoading[dk] : false;
                  const itemNftCount = dk ? (nftCounts[dk] ?? null) : null;
                  const itemNftLoading = dk ? !!nftLoading[dk] : false;
                  const itemNfts = dk ? (nftsByKey[dk] ?? []) : [];
                  const isBtcNative = !(item.network && ["Liquid", "Rootstock (RSK)", "Stacks", "Lightning (em breve)"].includes(item.network));
                  return (
                    <div
                      key={item.address}
                      className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-300"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-1">
                        <p className="font-semibold text-white">
                          <EditableName
                            current={item.label ?? ""}
                            display={item.label ?? item.network ?? "Bitcoin"}
                            onSave={(v) => renameWallet("btc", item.address, v)}
                            placeholder={t("wc_name_ph")}
                          />
                          {isConnected ? (
                            <span className="ml-2 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-300">
                              Conectada
                            </span>
                          ) : (
                            <span className="ml-2 rounded-full bg-slate-600/30 px-2 py-0.5 text-[10px] text-slate-400">
                              Por endereço
                            </span>
                          )}
                        </p>
                        <div className="flex items-center gap-2">
                          <p className="text-slate-500">
                            {btcShown[addr] ? item.address : <span className="tracking-widest text-slate-600 select-none">••••••••</span>}
                          </p>
                          <button
                            type="button"
                            onClick={() => setBtcShown((prev) => ({ ...prev, [addr]: !prev[addr] }))}
                            className="rounded-full border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
                            title={btcShown[addr] ? "Ocultar" : "Mostrar"}
                          >
                            {btcShown[addr] ? "🙈" : "👁️"}
                          </button>
                        </div>
                        {isBtcNative && (
                          <>
                            <p className="text-slate-500">
                              NFT (Ordinals):{" "}
                              {hideBalances
                                ? "••••"
                                : itemNftLoading
                                ? "A carregar..."
                                : itemNftCount != null
                                  ? `${itemNftCount} ${itemNftCount === 1 ? "item" : "itens"}`
                                  : "—"}
                            </p>
                            {!hideBalances && itemNfts.length > 0 && (
                              <div className="mt-1 grid grid-cols-4 gap-1 max-w-[160px]">
                                {itemNfts.slice(0, 8).map((nft) => (
                                  <a
                                    key={nft.id}
                                    href={nft.tokenAddress ? `https://magiceden.us/ordinals/item-details/${nft.tokenAddress}` : "#"}
                                    target="_blank" rel="noopener noreferrer"
                                    className="aspect-square rounded overflow-hidden bg-slate-800 border border-slate-700 hover:border-orange-400 transition"
                                    title={nft.name}
                                  >
                                    {(nft.image || nft.tokenUri) ? (
                                      <NftImage src={nft.image} tokenUri={nft.tokenUri} alt={nft.name} className="w-full h-full object-cover" />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center text-[8px] text-slate-500 p-0.5 text-center leading-tight">{nft.name}</div>
                                    )}
                                  </a>
                                ))}
                              </div>
                            )}
                          </>
                        )}
                        {isBtcNative && !hideBalances && (
                          <>
                            {btcRunesLoading[addr] ? (
                              <p className="text-[10px] text-slate-500">{t("wl_runes_loading")}</p>
                            ) : (btcRunesByAddress[addr]?.length ?? 0) > 0 ? (
                              <div className="space-y-0.5 text-[10px] text-amber-200/90">
                                {btcRunesByAddress[addr]!.map((r) => (
                                  <div key={r.symbol} className="flex gap-2">
                                    <span className="truncate max-w-[120px]" title={r.displayName}>{r.displayName}</span>
                                    <span className="shrink-0 tabular-nums">{formatRuneAmount(r.amount)}</span>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </>
                        )}
                      </div>
                      <div className="text-right">
                        {balanceDisplay != null && (
                          <p>
                            {hideBalances ? "••••" : <>{balanceDisplay} {balanceDisplay !== "A carregar..." && balanceDisplay !== "—" ? "BTC" : ""}</>}
                          </p>
                        )}
                        {balanceDisplay != null && balanceDisplay !== "A carregar..." && balanceDisplay !== "—" && getFiatValue("BTC", balanceDisplay) != null ? (
                          <p className="text-slate-400">{fmtCur((getFiatValue("BTC", balanceDisplay) ?? 0) * usdToEurRate)}</p>
                        ) : null}
                        {err ? (
                          <p className="text-rose-300" title={err}>
                            {err.length > 40 ? `${err.slice(0, 40)}…` : err}
                          </p>
                        ) : null}
                        <div className="mt-1 flex flex-wrap justify-end gap-1">
                          {!isConnected && (err || balanceDisplay === "—") ? (
                            <button
                              type="button"
                              className="rounded-full border border-slate-600 px-3 py-1 text-[11px] font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white disabled:opacity-50"
                              onClick={() => void fetchBtcBalanceForAddress(addr)}
                              disabled={loading}
                            >
                              {loading ? "A carregar…" : "Tentar novamente"}
                            </button>
                          ) : null}
                          <button
                            className="rounded-full border border-rose-400/40 px-3 py-1 text-[11px] font-semibold text-rose-200 transition hover:border-rose-400 hover:text-white"
                            type="button"
                            onClick={() => {
                              const nextWallets = removeWallet(
                                btcWallets,
                                (entry) => entry.address === item.address
                              );
                              setBtcWallets(nextWallets);
                              if (item.address === btcAddress) {
                                setBtcAddress(undefined);
                                setBtcBalance(null);
                                setBtcError(null);
                              }
                              setBtcBalancesByAddress((prev) => {
                                const next = { ...prev };
                                delete next[addr];
                                return next;
                              });
                              setBtcBalanceErrors((prev) => {
                                const next = { ...prev };
                                delete next[addr];
                                return next;
                              });
                              setBtcRunesByAddress((prev) => {
                                const next = { ...prev };
                                delete next[addr];
                                return next;
                              });
                              setBtcRunesLoading((prev) => {
                                const next = { ...prev };
                                delete next[addr];
                                return next;
                              });
                            }}
                          >
                            Remover
                          </button>
                        </div>
                      </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </WalletCard>
          <WalletCard
            title="Cardano"
            description={
              adaWallets.length > 0
                ? `${adaWallets.length} carteira(s) · Saldo total ADA`
                : `${adaWalletOptions.find((o) => o.id === selectedAdaProvider)?.label ?? "Eternl"} (ADA)`
            }
            address={adaAddress ?? adaWallets[0]?.address}
            addressDisplay={
              adaShowMain
                ? adaAddress ?? adaWallets[0]?.address
                : formatAddress(adaAddress ?? adaWallets[0]?.address)
            }
            balance={adaWallets.length > 0 ? totalAdaBalance : adaBalance}
            balanceUnit="ADA"
            fiatValueUsd={getFiatValue("ADA", adaWallets.length > 0 ? totalAdaBalance : adaBalance)}
            defiBalanceUsd={adaMainAddress ? defiTotals[defiKey(adaMainAddress, "ada")] ?? null : null}
            defiLoading={adaMainAddress ? !!defiLoading[defiKey(adaMainAddress, "ada")] : false}
            defiError={adaMainAddress ? defiErrors[defiKey(adaMainAddress, "ada")] ?? null : null}
            nftCount={adaMainAddress ? nftCounts[defiKey(adaMainAddress, "ada")] ?? null : null}
            nftLoading={adaMainAddress ? !!nftLoading[defiKey(adaMainAddress, "ada")] : false}
            nftError={adaMainAddress ? nftErrors[defiKey(adaMainAddress, "ada")] ?? null : null}
            nfts={adaMainAddress ? nftsByKey[defiKey(adaMainAddress, "ada")] ?? [] : []}
            usdToEur={usdToEurRate}
            isConnected={!!adaAddress || adaWallets.length > 0}
            isAvailable={adaIsAvailable || adaWallets.length > 0}
            isLoading={adaLoading}
            loadingMessage={adaLoadingMsg}
            error={adaError}
            onConnect={handleAdaConnect}
            onConnectAnother={handleAdaConnect}
            onDisconnect={handleAdaDisconnect}
            onRefresh={handleAdaRefresh}
            onToggleAddress={() => setAdaShowMain((prev) => !prev)}
            isAddressVisible={adaShowMain}
          >
            <div className="space-y-3">
              {/* Eternl setup guide — shown when not connected */}
              {!adaAddress && adaWallets.length === 0 && (
                <details className="rounded-xl border border-slate-800 bg-slate-900/40">
                  <summary className="cursor-pointer px-4 py-2.5 text-xs text-slate-400 hover:text-slate-200 transition select-none">
                    ℹ️ Como ligar o Eternl pela primeira vez
                  </summary>
                  <div className="px-4 pb-4 pt-2 space-y-1.5 text-xs text-slate-400">
                    <p className="font-semibold text-slate-300 mb-2">{t("wl_eternl_before")}</p>
                    <p>1. {t("wl_et_s1")} <strong className="text-slate-200">Settings</strong> {t("wl_et_s1b")}</p>
                    <p>2. {t("wl_et_s2")} <strong className="text-slate-200">dApp Connector</strong></p>
                    <p>3. {t("wl_et_s3")}</p>
                    <p>4. {t("wl_et_s4")}</p>
                    <p className="font-semibold text-slate-300 mt-3 mb-1">{t("wl_eternl_after")}</p>
                    <p>5. {t("wl_et_s5")} <strong className="text-slate-200">{t("wl_et_icon")}</strong> {t("wl_et_s5b")}</p>
                    <p>6. {t("wl_et_s6")} <strong className="text-slate-200">Approve</strong></p>
                  </div>
                </details>
              )}
              {/* CIP-45 Peer Connect — for Eternl companion/mobile */}
              {!adaAddress && adaWallets.length === 0 && (
                <div className="space-y-2">
                  {!adaPeerAddress && !adaPeerConnecting && (
                    <button
                      type="button"
                      onClick={() => void handleAdaPeerConnect()}
                      className="w-full rounded-xl border border-slate-700 py-2 text-xs text-slate-400 hover:border-orange-500/40 hover:text-orange-300 transition"
                    >
                      📱 Ligar via Código / QR (Eternl mobile)
                    </button>
                  )}
                  {adaPeerConnecting && !adaPeerAddress && (
                    <p className="text-xs text-slate-400 animate-pulse">{t("wl_gen_code")}</p>
                  )}
                  {adaPeerAddress && (
                    <div className="rounded-xl border border-orange-500/20 bg-slate-900/60 p-4 space-y-3">
                      <p className="text-xs font-semibold text-orange-400">{t("wl_cip45_code")}</p>
                      <div ref={adaQrCanvasRef} className="flex justify-center" />
                      <p className="text-[10px] text-slate-500 break-all font-mono bg-slate-950 rounded p-2 select-all">{adaPeerAddress}</p>
                      <p className="text-[11px] text-slate-400">No Eternl: abre o menu → <strong className="text-slate-200">Ligar DApp</strong> → cola o código acima ou aponta a câmara ao QR.</p>
                      <button type="button" onClick={() => { setAdaPeerAddress(null); setAdaPeerConnecting(false); }} className="text-xs text-slate-500 hover:text-slate-300">✕ Cancelar</button>
                    </div>
                  )}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
                  Carteira ADA
                </span>
                <div className="relative min-w-[120px]" ref={adaWalletSelectRef}>
                  <button
                    type="button"
                    className="flex min-w-[120px] items-center justify-between gap-2 rounded-full border border-slate-800 bg-slate-950/60 px-3 py-1.5 text-left text-xs text-slate-200 outline-none transition focus:border-orange-400"
                    onClick={() => setAdaWalletSelectOpen((o) => !o)}
                  >
                    <span className="truncate">
                      {adaWalletOptions.find((o) => o.id === selectedAdaProvider)?.label ?? selectedAdaProvider}
                    </span>
                    <span className="text-slate-500 text-[10px]">{adaWalletSelectOpen ? "▲" : "▼"}</span>
                  </button>
                  {adaWalletSelectOpen ? (
                    <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-[200px] rounded-xl border border-slate-700 bg-slate-900 shadow-xl">
                      <input
                        type="text"
                        className="w-full border-b border-slate-700 bg-slate-900/80 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 outline-none"
                        placeholder={t("wl_search_wallet")}
                        value={adaWalletSelectFilter}
                        onChange={(e) => setAdaWalletSelectFilter(e.target.value)}
                        onKeyDown={(e) => e.stopPropagation()}
                      />
                      <div className="max-h-[180px] overflow-y-auto py-1">
                        {adaWalletOptions
                          .filter(
                            (opt) =>
                              !adaWalletSelectFilter.trim() ||
                              opt.label.toLowerCase().includes(adaWalletSelectFilter.trim().toLowerCase()) ||
                              opt.id.toLowerCase().includes(adaWalletSelectFilter.trim().toLowerCase())
                          )
                          .map((option) => (
                            <button
                              key={option.id}
                              type="button"
                              className="flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800"
                              onClick={() => {
                                setSelectedAdaProvider(option.id);
                                setAdaWalletSelectOpen(false);
                                setAdaWalletSelectFilter("");
                              }}
                            >
                              <span>{option.label}</span>
                              {isClient && isCardanoWalletAvailable(option.id) ? (
                                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-300">
                                  Disponível
                                </span>
                              ) : (
                                <span className="rounded-full bg-slate-600/30 px-2 py-0.5 text-[10px] text-slate-400">
                                  Não instalada
                                </span>
                              )}
                            </button>
                          ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                Carteiras adicionais / L2
              </p>
              <div>
                <button
                  type="button"
                  onClick={() => setShowAdaNetworks((prev) => !prev)}
                  className="rounded-full border border-slate-700 px-3 py-1 text-[11px] font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
                >
                  Carteiras ADA
                </button>
                {showAdaNetworks ? (
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                    {adaWalletOptions.map((option) => (
                      <span
                        key={option.id}
                        className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-1 text-slate-200"
                      >
                        {option.label}{" "}
                        {isClient && isCardanoWalletAvailable(option.id) ? (
                          <span className="ml-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-300">
                            Disponível
                          </span>
                        ) : (
                          <span className="ml-1 rounded-full bg-slate-600/30 px-2 py-0.5 text-[10px] text-slate-400">
                            Não instalada
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="grid gap-3 sm:grid-cols-[1.2fr_0.8fr_auto]">
                <input
                  className="w-full rounded-full border border-slate-800 bg-slate-950/60 px-4 py-2 text-xs text-slate-200 outline-none transition focus:border-orange-400"
                  placeholder={t("wl_addr_ada")}
                  value={adaNewAddress}
                  onChange={(event) => setAdaNewAddress(event.target.value)}
                />
                <div className="relative" ref={adaNewNetworkSelectRef}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-full border border-slate-800 bg-slate-950/60 px-4 py-2 text-xs text-slate-200 outline-none transition hover:border-slate-600"
                    onClick={() => setAdaNewNetworkSelectOpen((prev) => !prev)}
                  >
                    <span>{adaNetworkOptions.find((o) => o.id === adaNewNetworkId)?.label ?? "Cardano"}</span>
                    <span className="text-slate-500 text-[10px] shrink-0">{adaNewNetworkSelectOpen ? "▲" : "▼"}</span>
                  </button>
                  {adaNewNetworkSelectOpen ? (
                    <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-xl border border-slate-700 bg-slate-900 shadow-xl">
                      <input
                        type="text"
                        className="w-full border-b border-slate-700 bg-slate-900/80 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 outline-none"
                        placeholder={t("wl_search_network")}
                        value={adaNewNetworkSelectFilter}
                        onChange={(e) => setAdaNewNetworkSelectFilter(e.target.value)}
                        onKeyDown={(e) => e.stopPropagation()}
                      />
                      <div className="max-h-[200px] overflow-y-auto py-1">
                        {adaNetworkOptions
                          .filter(
                            (opt) =>
                              !adaNewNetworkSelectFilter.trim() ||
                              opt.label.toLowerCase().includes(adaNewNetworkSelectFilter.trim().toLowerCase()) ||
                              opt.id.toLowerCase().includes(adaNewNetworkSelectFilter.trim().toLowerCase())
                          )
                          .map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800"
                              onClick={() => {
                                setAdaNewNetworkId(opt.id);
                                setAdaNewNetworkSelectOpen(false);
                                setAdaNewNetworkSelectFilter("");
                              }}
                            >
                              {opt.label}
                            </button>
                          ))}
                      </div>
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="rounded-full border border-orange-400/40 px-4 py-2 text-xs font-semibold text-orange-200 transition hover:border-orange-400 hover:text-white"
                  onClick={handleAddAdaWallet}
                >
                  Adicionar
                </button>
              </div>
              {adaNewNetworkId === "outro" ? (
                <input
                  className="w-full max-w-xs rounded-full border border-slate-800 bg-slate-950/60 px-4 py-2 text-xs text-slate-200 outline-none transition focus:border-orange-400"
                  placeholder="Nome (opcional, ex: Exchange)"
                  value={adaNewCustomLabel}
                  onChange={(e) => setAdaNewCustomLabel(e.target.value)}
                />
              ) : null}
              {adaNewError ? <p className="text-xs text-rose-300">{adaNewError}</p> : null}
              <p className="text-xs text-slate-500">
                Conecta uma carteira e/ou adiciona endereços. O saldo total junta todas.
              </p>
              <div className="space-y-2">
                {adaWallets.map((item) => {
                  const isConnected = item.address === adaAddress;
                  const addr = item.address ?? "";
                  const loading = adaBalancesLoading[addr];
                  const error = adaBalanceErrors[addr];
                  const balanceDisplay =
                    isConnected
                      ? adaBalance ?? "—"
                      : loading
                        ? "A carregar..."
                        : error
                          ? null
                          : adaBalancesByAddress[addr] ?? "—";
                  return (
                    <div
                      key={`${item.address}-${item.network ?? "Cardano"}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-300"
                    >
                      <div className="space-y-1">
                        <p className="font-semibold text-white">
                          <EditableName
                            current={item.label ?? ""}
                            display={item.label ?? item.network ?? "Cardano"}
                            onSave={(v) => renameWallet("ada", item.address, v)}
                            placeholder={t("wc_name_ph")}
                          />
                          {isConnected ? (
                            <span className="ml-2 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-300">
                              Conectada
                            </span>
                          ) : (
                            <span className="ml-2 rounded-full bg-slate-600/30 px-2 py-0.5 text-[10px] text-slate-400">
                              Por endereço
                            </span>
                          )}
                        </p>
                        <div className="flex items-center gap-2">
                          <p className="text-slate-500">
                            {adaShown[addr] ? item.address : <span className="tracking-widest text-slate-600 select-none">••••••••</span>}
                          </p>
                          <button
                            type="button"
                            onClick={() =>
                              setAdaShown((prev) => ({ ...prev, [addr]: !prev[addr] }))
                            }
                            className="rounded-full border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
                            title={adaShown[addr] ? "Ocultar" : "Mostrar"}
                          >
                            {adaShown[addr] ? "🙈" : "👁️"}
                          </button>
                        </div>
                      </div>
                      <div className="text-right">
                        {balanceDisplay != null && (
                          <p>
                            {hideBalances ? "••••" : <>
                            {balanceDisplay}{" "}
                            {balanceDisplay !== "A carregar..." && balanceDisplay !== "—"
                              ? "ADA"
                              : ""}
                            </>}
                          </p>
                        )}
                        {balanceDisplay != null && balanceDisplay !== "A carregar..." && balanceDisplay !== "—" && getFiatValue("ADA", balanceDisplay) != null ? (
                          <p className="text-slate-400">{fmtCur((getFiatValue("ADA", balanceDisplay) ?? 0) * usdToEurRate)}</p>
                        ) : null}
                        {error ? (
                          <p className="text-rose-300" title={error}>
                            {error.length > 40 ? `${error.slice(0, 40)}…` : error}
                          </p>
                        ) : null}
                        <div className="mt-1 flex flex-wrap justify-end gap-1">
                          {!isConnected && !["Hydra", "Midnight"].includes(item.network ?? "") && (error || balanceDisplay === "—") ? (
                            <button
                              type="button"
                              className="rounded-full border border-slate-600 px-3 py-1 text-[11px] font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white disabled:opacity-50"
                              onClick={() => void fetchAdaBalanceForAddress(addr)}
                              disabled={loading}
                            >
                              {loading ? "A carregar…" : "Tentar novamente"}
                            </button>
                          ) : null}
                          <button
                            className="rounded-full border border-rose-400/40 px-3 py-1 text-[11px] font-semibold text-rose-200 transition hover:border-rose-400 hover:text-white"
                            type="button"
                            onClick={() => {
                              const nextWallets = removeWallet(
                                adaWallets,
                                (entry) => entry.address === item.address
                              );
                              setAdaWallets(nextWallets);
                              if (item.address === adaAddress) {
                                setAdaAddress(undefined);
                                setAdaBalance(undefined);
                                setAdaApi(null);
                              }
                              setAdaBalancesByAddress((prev) => {
                                const next = { ...prev };
                                delete next[addr];
                                return next;
                              });
                              setAdaBalanceErrors((prev) => {
                                const next = { ...prev };
                                delete next[addr];
                                return next;
                              });
                            }}
                          >
                            Remover
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </WalletCard>
        </div>
        <section className="order-last rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">{t("wl_crypto_wallet")}</h2>
              <p className="text-sm text-slate-400">
                Regista cripto comprada fora de carteiras (ex: numa exchange). Define o valor de compra para calcular o PNL.
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                Total (carteiras + DeFi + CEX/HL + manuais)
              </p>
              <p className="text-lg font-semibold text-white">
                {fmtCur((walletsTotalUsd + totalDefiUsd + cexHlTotalUsd + coldTokensExtraUsd) * usdToEurRate + cryptoManualTotal)}
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-slate-700/80 bg-slate-950/50 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Saldos das carteiras e NFTs
            </p>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-300">
              <span>
                <span className="text-slate-500">ETH:</span>{" "}
                {getFiatValue("ETH", totalEthBalance) != null
                  ? fmtCur((getFiatValue("ETH", totalEthBalance) ?? 0) * usdToEurRate)
                  : "—"}
              </span>
              <span>
                <span className="text-slate-500">SOL:</span>{" "}
                {getFiatValue("SOL", totalSolBalance) != null
                  ? fmtCur((getFiatValue("SOL", totalSolBalance) ?? 0) * usdToEurRate)
                  : "—"}
              </span>
              <span>
                <span className="text-slate-500">BTC:</span>{" "}
                {getFiatValue("BTC", totalBtcBalance) != null
                  ? fmtCur((getFiatValue("BTC", totalBtcBalance) ?? 0) * usdToEurRate)
                  : "—"}
              </span>
              <span>
                <span className="text-slate-500">ADA:</span>{" "}
                {getFiatValue("ADA", totalAdaBalance) != null
                  ? fmtCur((getFiatValue("ADA", totalAdaBalance) ?? 0) * usdToEurRate)
                  : "—"}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
              <span>
                <span className="text-slate-500">{t("wl_total_wallets")}</span>{" "}
                <span className="font-semibold text-white">
                  {fmtCur((walletsTotalUsd + cexHlTotalUsd) * usdToEurRate)}
                </span>
              </span>
              <span>
                <span className="text-slate-500">DeFi:</span>{" "}
                <span className="font-semibold text-white">
                  {fmtCur(totalDefiUsd * usdToEurRate)}
                </span>
              </span>
              {cexHlTotalUsd > 0 && (
                <span>
                  <span className="text-slate-500">CEX / HL:</span>{" "}
                  <span className="font-semibold text-white">
                    {fmtCur(cexHlTotalUsd * usdToEurRate)}
                  </span>
                </span>
              )}
              <span>
                <span className="text-slate-500">NFTs:</span>{" "}
                <span className="font-semibold text-white">
                  {hideBalances ? "••••" : <>{totalNftCount} {totalNftCount === 1 ? "item" : "itens"}</>}
                </span>
              </span>
            </div>
          </div>

          {cryptoPricesError ? (
            <p className="mt-3 text-xs text-rose-300">{cryptoPricesError}</p>
          ) : null}


          <div className="mt-4 space-y-3">
            {/* Carteiras conectadas — uma linha por carteira */}
            {(() => {
              type WEntry = { key: string; symbol: string; label: string; network: string; balance: string | null; source: string; onRemove: () => void };
              const entries: WEntry[] = [];

              // ETH — cada carteira separada
              ethWallets.forEach((w, i) => {
                const k = ethBalanceKey(w.address ?? "", w.network ?? "Ethereum");
                const bal = ethBalancesLoading[k] || ethBalancesByKey[k] === undefined ? null : (ethBalancesByKey[k] ?? null);
                entries.push({
                  key: `eth-${i}-${w.address}`,
                  symbol: "ETH",
                  label: w.label ?? w.network ?? "Ethereum",
                  network: w.network ?? "Ethereum",
                  balance: bal,
                  source: "Carteira ETH",
                  onRemove: () => {
                    const next = ethWallets.filter((_, j) => j !== i);
                    setEthWallets(next);
                    updateWalletSnapshot({ eth: next, sol: solWallets, btc: btcWallets, ada: adaWallets });
                  },
                });
              });

              // SOL — cada carteira separada
              solWallets.forEach((w, i) => {
                const bal = w.address ? (solBalancesByAddress[w.address] ?? w.balance ?? null) : null;
                entries.push({
                  key: `sol-${i}-${w.address}`,
                  symbol: "SOL",
                  label: w.label ?? w.network ?? "Solana",
                  network: w.network ?? "Solana",
                  balance: bal,
                  source: "Carteira SOL",
                  onRemove: () => {
                    const next = solWallets.filter((_, j) => j !== i);
                    setSolWallets(next);
                    updateWalletSnapshot({ eth: ethWallets, sol: next, btc: btcWallets, ada: adaWallets });
                  },
                });
              });

              // BTC — cada carteira separada
              btcWallets.forEach((w, i) => {
                const bal = w.address ? (btcBalancesByAddress[w.address] ?? w.balance ?? null) : null;
                entries.push({
                  key: `btc-${i}-${w.address}`,
                  symbol: "BTC",
                  label: w.label ?? "Bitcoin",
                  network: "Bitcoin",
                  balance: bal,
                  source: "Carteira BTC",
                  onRemove: () => {
                    const next = btcWallets.filter((_, j) => j !== i);
                    setBtcWallets(next);
                    updateWalletSnapshot({ eth: ethWallets, sol: solWallets, btc: next, ada: adaWallets });
                  },
                });
              });

              // ADA — cada carteira separada
              adaWallets.forEach((w, i) => {
                const bal = w.address ? (adaBalancesByAddress[w.address] ?? w.balance ?? null) : null;
                entries.push({
                  key: `ada-${i}-${w.address}`,
                  symbol: "ADA",
                  label: w.label ?? "Cardano",
                  network: "Cardano",
                  balance: bal,
                  source: "Carteira ADA",
                  onRemove: () => {
                    const next = adaWallets.filter((_, j) => j !== i);
                    setAdaWallets(next);
                    updateWalletSnapshot({ eth: ethWallets, sol: solWallets, btc: btcWallets, ada: next });
                  },
                });
              });

              if (entries.length === 0) return null;
              return entries.map(({ key, symbol, label, network, balance, source, onRemove }) => {
                const market = cryptoPrices[symbol];
                const balNum = balance !== null && balance !== "—" ? parseFloat(balance) || 0 : 0;
                const fiatUsd = getFiatValue(symbol, balance);
                const fiatEur = fiatUsd != null ? fiatUsd * usdToEurRate : null;
                return (
                  <div
                    key={key}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-700/60 bg-slate-900/40 px-4 py-3 text-xs text-slate-100"
                  >
                    <div>
                      <p className="font-semibold text-white">{symbol}</p>
                      <p className="text-slate-500">{label !== network ? label : network}</p>
                      <p className="mt-0.5 text-[10px] text-slate-600 uppercase tracking-wide">{network !== label ? `${source} · ${network}` : source}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-right">
                      <div>
                        {hideBalances
                          ? <p className="text-slate-300 tabular-nums">••••</p>
                          : balance === null
                          ? <p className="text-slate-500 italic">{t("wl_loading")}</p>
                          : <p className="text-slate-300 tabular-nums">{balNum > 0 ? balNum.toFixed(symbol === "BTC" ? 8 : 4) : "—"} {symbol}</p>
                        }
                        {fiatEur != null && fiatEur > 0 && (
                          <p className="text-slate-500">{fmtCur(fiatEur)}</p>
                        )}
                      </div>
                      <span className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-200">
                        Preço atual:{" "}
                        <span className="font-semibold text-white">
                          {market
                            ? market.priceUsd.toLocaleString("en-US", {
                                style: "currency",
                                currency: "USD",
                                minimumFractionDigits: market.priceUsd < 1 ? 6 : 2,
                                maximumFractionDigits: market.priceUsd < 1 ? 6 : 2,
                              })
                            : "—"}
                        </span>
                      </span>
                      <button
                        onClick={onRemove}
                        title={t("wl_remove_wallet")}
                        className="rounded-full border border-rose-800/40 bg-rose-950/30 p-2 text-rose-400 transition hover:bg-rose-900/50 hover:text-rose-300"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                          <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              });
            })()}
            {/* Stablecoins por endereço */}
            {stablecoinEntries.map((e) => {
              const market = cryptoPrices[e.symbol];
              const bal = stablecoinBalances[e.id];
              const balNum = bal ? parseFloat(bal) : 0;
              const fiatEur = balNum > 0 && market ? balNum * market.priceUsd * usdToEurRate : null;
              return (
                <div
                  key={`stable-${e.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-700/60 bg-slate-900/40 px-4 py-3 text-xs text-slate-100"
                >
                  <div>
                    <p className="font-semibold text-white">{e.symbol}</p>
                    <p className="text-slate-500">{e.network}</p>
                    <p className="mt-0.5 text-[10px] text-slate-600 uppercase tracking-wide">{t("wl_by_address")}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-right">
                    <div>
                      <p className="text-slate-300 tabular-nums">{hideBalances ? "••••" : <>{bal ?? "—"} {e.symbol}</>}</p>
                      {fiatEur != null && (
                        <p className="text-slate-500">{fmtCur(fiatEur)}</p>
                      )}
                    </div>
                    <span className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-200">
                      Preço atual:{" "}
                      <span className="font-semibold text-white">
                        {market ? market.priceUsd.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 }) : "—"}
                      </span>
                    </span>
                    <span className="rounded-full border border-slate-700/40 bg-slate-800/40 px-3 py-2 text-[10px] text-slate-500">{t("wl_stablecoin")}</span>
                    <button
                      onClick={() => setStablecoinEntries((prev) => prev.filter((x) => x.id !== e.id))}
                      title={t("wl_remove")}
                      className="rounded-full border border-rose-800/40 bg-rose-950/30 p-2 text-rose-400 transition hover:bg-rose-900/50 hover:text-rose-300"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                        <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
            {/* Outras redes — tracking */}
            {otherWallets.map((item) => {
              const addr = item.address ?? "";
              return (
                <div
                  key={`other-${addr}-${item.network}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-700/60 bg-slate-900/40 px-4 py-3 text-xs text-slate-100"
                >
                  <div>
                    <p className="font-semibold text-white">{item.label ?? item.network ?? addr}</p>
                    <p className="text-slate-500 font-mono text-[10px]">{addr.length > 20 ? `${addr.slice(0, 10)}…${addr.slice(-6)}` : addr}</p>
                    <p className="mt-0.5 text-[10px] text-slate-600 uppercase tracking-wide">Tracking · {item.network}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-right">
                    <span className="rounded-full border border-slate-700/40 bg-slate-800/40 px-3 py-2 text-[10px] text-slate-500">{t("wl_no_price")}</span>
                    <button
                      onClick={() => {
                        const next = otherWallets.filter((w) => !(w.address === item.address && w.network === item.network));
                        setOtherWallets(next);
                        updateWalletSnapshot({ eth: ethWallets, sol: solWallets, btc: btcWallets, ada: adaWallets, other: next });
                      }}
                      title={t("wl_remove")}
                      className="rounded-full border border-rose-800/40 bg-rose-950/30 p-2 text-rose-400 transition hover:bg-rose-900/50 hover:text-rose-300"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                        <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
            {/* Adicionar ativo manual */}
            <div className="flex items-center gap-2 pt-1">
              <select
                value=""
                onChange={(e) => { const s = e.target.value; if (s) toggleCryptoHolding(s); }}
                className="rounded-full border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs font-semibold text-slate-200 outline-none hover:border-orange-400 transition cursor-pointer"
              >
                <option value="">+ Adicionar ativo manual</option>
                {marketRows.filter((r) => !cryptoHoldings[r.symbol]).slice(0, 50).map((r) => (
                  <option key={r.symbol} value={r.symbol}>{r.symbol} · {r.name}</option>
                ))}
              </select>
              <span className="text-[10px] text-slate-600">{t("wl_reg_no_wallet")}</span>
            </div>
            {sortedCryptoSymbols.length === 0 && !(ethWallets.length > 0 || ethAddress || solWallets.length > 0 || solAddress || btcWallets.length > 0 || btcAddress || adaWallets.length > 0 || adaAddress) && stablecoinEntries.length === 0 && otherWallets.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-700 p-4 text-center">
                <p className="text-sm text-slate-500">{t("wl_no_asset_added")}</p>
                <p className="text-xs text-slate-600 mt-1">{t("wl_use_selector")}</p>
              </div>
            ) : (
              sortedCryptoSymbols.map((symbol) => {
                const holding = cryptoHoldings[symbol] ?? {};
                const market = cryptoPrices[symbol];
                const priceEur = market?.priceUsd ? market.priceUsd * usdToEurRate : undefined;
                const qty = Number(holding.quantity ?? 0);
                const marketValueEur = qty > 0 && priceEur ? qty * priceEur : undefined;
                const investedEur = Number(holding.buyValue ?? 0);
                const pnlEur =
                  marketValueEur != null && investedEur > 0 ? marketValueEur - investedEur : undefined;
                const pnlPct =
                  pnlEur != null && investedEur > 0 ? (pnlEur / investedEur) * 100 : undefined;
                return (
                  <div
                    key={symbol}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-xs text-slate-100"
                  >
                    <div>
                      <p className="font-semibold text-white">{symbol}</p>
                      <p className="text-slate-500">{market?.name ?? "—"}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex flex-col gap-0.5">
                        <label className="text-[10px] text-slate-600 px-1">{t("wl_invested_eur")}</label>
                        <input
                          type={hideBalances ? "password" : "number"}
                          inputMode="decimal"
                          min="0"
                          step="0.01"
                          placeholder="Ex: 200"
                          value={holding.buyValue ?? ""}
                          onChange={(event) => {
                            const value = event.target.value;
                            updateCryptoHolding(symbol, {
                              buyValue: value === "" ? undefined : Number(value),
                            });
                          }}
                          className="w-36 rounded-full border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-100 outline-none transition focus:border-orange-400"
                        />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <label className="text-[10px] text-slate-600 px-1" title={t("wl_qty_hint")}>{t("wl_quantity")}</label>
                        <input
                          type={hideBalances ? "password" : "number"}
                          inputMode="decimal"
                          min="0"
                          step="any"
                          placeholder="Ex: 0.5"
                          title={t("wl_qty_hint")}
                          value={holding.quantity ?? ""}
                          onChange={(event) => {
                            const value = event.target.value;
                            updateCryptoHolding(symbol, {
                              quantity: value === "" ? undefined : Number(value),
                            });
                          }}
                          className="w-28 rounded-full border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-100 outline-none transition focus:border-orange-400"
                        />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <label className="text-[10px] text-slate-600 px-1">{t("wl_buy_date")}</label>
                        <input
                          type="date"
                          value={holding.buyDate ?? ""}
                          onChange={(event) =>
                            updateCryptoHolding(symbol, { buyDate: event.target.value })
                          }
                          className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-100 outline-none transition focus:border-orange-400"
                        />
                      </div>
                      <span className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-200">
                        Preço atual:{" "}
                        <span className="font-semibold text-white">
                          {market
                            ? market.priceUsd.toLocaleString("en-US", {
                                style: "currency",
                                currency: "USD",
                                minimumFractionDigits: market.priceUsd < 1 ? 6 : 2,
                                maximumFractionDigits: market.priceUsd < 1 ? 6 : 2,
                              })
                            : "—"}
                        </span>
                      </span>
                      {marketValueEur != null ? (
                        <span className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-200">
                          {t("wl_market_value")}:{" "}
                          <span className="font-semibold text-white">{fmtCur(marketValueEur)}</span>
                        </span>
                      ) : null}
                      {pnlEur != null ? (
                        <span
                          className={`rounded-full border px-3 py-2 text-xs font-semibold ${
                            pnlEur >= 0
                              ? "border-emerald-800/50 bg-emerald-950/30 text-emerald-300"
                              : "border-rose-800/50 bg-rose-950/30 text-rose-300"
                          }`}
                        >
                          {t("wl_pnl")}: {pnlEur >= 0 ? "+" : ""}
                          {fmtCur(pnlEur)}
                          {pnlPct != null ? ` (${pnlEur >= 0 ? "+" : ""}${pnlPct.toFixed(1)}%)` : ""}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => toggleCryptoHolding(symbol)}
                        className="rounded-full border border-slate-700 px-3 py-2 text-[11px] font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          {cryptoPricesLoading ? (
            <p className="mt-3 text-xs text-slate-500">{t("wl_updating_prices")}</p>
          ) : null}

          {/* Histórico de compras e vendas */}
          <div className="mt-6 rounded-2xl border border-slate-700/60 bg-slate-900/40 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-0.5">{t("wl_manual_record")}</p>
              <p className="text-sm font-bold text-white">{t("wl_tx_history")}</p>
              <p className="text-xs text-slate-500 mt-1">{t("wl_tx_history_desc")}</p>
            </div>
            <a
              href="/historico"
              className="shrink-0 rounded-xl border border-orange-500/40 bg-orange-500/10 px-5 py-2.5 text-sm font-semibold text-orange-300 hover:bg-orange-500/20 transition"
            >
              Ver histórico →
            </a>
          </div>
        </section>
        </>
        ) : (
          <div className="rounded-3xl border border-slate-800 bg-slate-950/60 p-6">
            <div className="flex flex-col gap-3">
              <p className="text-xs uppercase tracking-[0.3em] text-orange-300/80">
                Carteiras Mercado Tradicional
              </p>
              <h2 className="text-xl font-semibold text-white">
                Seleciona vários ativos e mercados
              </h2>
              <p className="text-sm text-slate-400">
                Escolhe ouro, prata e outros mercados que queres acompanhar.
              </p>
            </div>

            {/* Adicionar ação/ETF manual */}
            <div className="mt-5 rounded-xl border border-slate-700 bg-slate-900/40 p-4 space-y-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("wl_add_stock")}</p>
              <div className="flex flex-wrap gap-2">
                {(["Ações", "ETFs"] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCustomTickerCategory(cat)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                      customTickerCategory === cat
                        ? "border-orange-400 bg-orange-500/20 text-orange-200"
                        : "border-slate-700 text-slate-400 hover:border-slate-500"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Ticker (ex: AMZN, VTI, PLTR...)"
                  value={customTickerInput}
                  onChange={(e) => setCustomTickerInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const ticker = customTickerInput.trim().toUpperCase();
                      if (!ticker) return;
                      const newAsset: import("@/lib/traditional/assets").TraditionalAsset = {
                        id: ticker,
                        label: `${ticker}`,
                        category: customTickerCategory,
                        alphaSymbol: ticker,
                      };
                      setCustomAssets((prev) => prev.some((a) => a.id === ticker) ? prev : [...prev, newAsset]);
                      setCustomTickerInput("");
                    }
                  }}
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-orange-500 font-mono uppercase"
                />
                <button
                  type="button"
                  onClick={() => {
                    const ticker = customTickerInput.trim().toUpperCase();
                    if (!ticker) return;
                    const newAsset: import("@/lib/traditional/assets").TraditionalAsset = {
                      id: ticker,
                      label: `${ticker}`,
                      category: customTickerCategory,
                      alphaSymbol: ticker,
                    };
                    setCustomAssets((prev) => prev.some((a) => a.id === ticker) ? prev : [...prev, newAsset]);
                    setCustomTickerInput("");
                  }}
                  className={`${btnPrimary} px-4 py-2 text-sm`}
                >
                  Adicionar
                </button>
              </div>
              {customAssets.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {customAssets.map((a) => (
                    <span key={a.id} className="flex items-center gap-1 rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-xs text-orange-200">
                      {a.id} <span className="text-slate-500">({a.category})</span>
                      <button
                        type="button"
                        onClick={() => {
                          setCustomAssets((prev) => prev.filter((x) => x.id !== a.id));
                          if (traditionalHoldings[a.id]) {
                            const next = { ...traditionalHoldings };
                            delete next[a.id];
                            void saveTraditionalHoldings(next);
                            setTraditionalHoldings(next);
                          }
                        }}
                        className="ml-1 text-slate-500 hover:text-rose-400"
                      >×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {traditionalCategories.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setTraditionalCategory(category)}
                  className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
                    traditionalCategory === category
                      ? "border-orange-400 bg-orange-500 text-slate-950"
                      : "border-slate-700 bg-slate-950/60 text-slate-200 hover:border-slate-500"
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {visibleTraditionalAssets.map((asset) => {
                const checked = !!traditionalHoldings[asset.id];
                return (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => toggleTraditional(asset.id)}
                    aria-pressed={checked}
                    className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left text-sm transition ${
                      checked
                        ? "border-orange-400/60 bg-orange-500/10 text-orange-100"
                        : "border-slate-800 bg-slate-950/60 text-slate-200 hover:border-slate-600"
                    }`}
                  >
                    <div className="flex flex-col">
                      <span className="font-semibold">{asset.label}</span>
                      <span className="text-xs text-slate-500">{asset.category}</span>
                    </div>
                    <span
                      className={`grid h-6 w-6 place-items-center rounded-full border text-xs font-semibold ${
                        checked
                          ? "border-orange-400 bg-orange-500/20 text-orange-100"
                          : "border-slate-700 text-slate-400"
                      }`}
                    >
                      {checked ? "✓" : "+"}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-6">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                  Selecionados
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setTraditionalHoldings({});
                  }}
                  className="rounded-full border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
                >
                  Limpar seleção
                </button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <select
                  value={traditionalSortKey}
                  onChange={(event) =>
                    setTraditionalSortKey(event.target.value as "date" | "marketCap")
                  }
                  className="rounded-full border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs font-semibold text-slate-200 outline-none"
                >
                  <option value="date">{t("wl_buy_date")}</option>
                  <option value="marketCap">Market cap</option>
                </select>
                <button
                  type="button"
                  onClick={() =>
                    setTraditionalSortDir((prev) => (prev === "asc" ? "desc" : "asc"))
                  }
                  className="rounded-full border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
                >
                  {traditionalSortDir === "asc" ? "Asc" : "Desc"}
                </button>
              </div>

              {sortedTraditionalAssets.length === 0 ? (
                <span className="mt-3 block text-sm text-slate-500">
                  Nenhum ativo selecionado.
                </span>
              ) : (
                <div className="mt-3 grid gap-3">
                  {sortedTraditionalAssets.map((asset) => {
                    const buy = traditionalHoldings[asset.id] ?? {};
                    const quote = asset.alphaSymbol
                      ? traditionalQuotes[asset.alphaSymbol]
                      : undefined;
                    const isQuoteLoading = asset.alphaSymbol
                      ? !!traditionalQuoteLoading[asset.alphaSymbol]
                      : false;
                    return (
                      <div
                        key={asset.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-xs text-slate-100"
                      >
                        <div>
                          <p className="font-semibold text-white">{asset.label}</p>
                          <p className="text-slate-500">{asset.category}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.01"
                            placeholder="Valor de compra"
                            value={buy.buyValue ?? ""}
                            onChange={(event) => {
                              const value = event.target.value;
                              updateTraditionalBuy(asset.id, {
                                buyValue: value === "" ? undefined : Number(value),
                              });
                            }}
                            className="w-40 rounded-full border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-100 outline-none transition focus:border-orange-400"
                          />
                          <input
                            type="date"
                            value={buy.buyDate ?? ""}
                            onChange={(event) =>
                              updateTraditionalBuy(asset.id, { buyDate: event.target.value })
                            }
                            className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-100 outline-none transition focus:border-orange-400"
                          />
                          <span className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-200">
                            Preço atual:{" "}
                            <span className="font-semibold text-white">
                              {quote?.price != null ? quote.price.toFixed(2) : "—"}
                            </span>
                          </span>
                          <div className="flex items-center gap-2 rounded-full border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-200">
                            <select
                              value={traditionalPnlRange[asset.id] ?? "1d"}
                              onChange={(event) =>
                                setTraditionalPnlRange((prev) => ({
                                  ...prev,
                                  [asset.id]: event.target.value as "1d" | "30d" | "60d" | "1y",
                                }))
                              }
                              className="bg-transparent text-xs text-slate-200 outline-none"
                            >
                              <option value="1d">Diário</option>
                              <option value="30d">30 dias</option>
                              <option value="60d">60 dias</option>
                              <option value="1y">{t("wl_annual")}</option>
                            </select>
                            {(() => {
                              const pnl = getTraditionalPnl(asset.id, quote?.changePercent ?? null);
                              const value = pnl.value;
                              return (
                                <span
                                  className={
                                    value == null
                                      ? "text-slate-400"
                                      : value >= 0
                                        ? "text-emerald-300"
                                        : "text-rose-300"
                                  }
                                >
                                  {value == null ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`}
                                </span>
                              );
                            })()}
                          </div>
                          <button
                            type="button"
                            onClick={() => refreshTraditionalQuote(asset.alphaSymbol)}
                            disabled={!asset.alphaSymbol || isQuoteLoading}
                            className="rounded-full border border-orange-400/40 px-3 py-2 text-[11px] font-semibold text-orange-200 transition hover:border-orange-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isQuoteLoading ? "A atualizar..." : "Atualizar preço"}
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleTraditional(asset.id)}
                            className="rounded-full border border-slate-700 px-3 py-2 text-[11px] font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
                            title={t("wl_remove")}
                          >
                            Remover
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                  Dados Alpha Vantage
                </p>
                {traditionalQuotesLoading ? (
                  <span className="text-xs text-slate-400">{t("wl_loading2")}</span>
                ) : null}
              </div>
              {traditionalQuotesError ? (
                <p className="mt-2 text-xs text-rose-300">{traditionalQuotesError}</p>
              ) : null}
              <div className="mt-3 space-y-2">
                {selectedTraditionalAssets.length === 0 ? (
                  <p className="text-sm text-slate-500">{t("wl_select_quotes")}</p>
                ) : (
                  selectedTraditionalAssets.map((asset) => {
                    const quote = asset.alphaSymbol
                      ? traditionalQuotes[asset.alphaSymbol]
                      : undefined;
                    return (
                      <div
                        key={asset.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-300"
                      >
                        <div>
                          <p className="font-semibold text-white">{asset.label}</p>
                          <p className="text-slate-500">{asset.category}</p>
                        </div>
                        {quote ? (
                          <div className="text-right">
                            <p className="text-white">
                              {quote.price != null ? quote.price.toFixed(2) : "—"}
                            </p>
                            <p
                              className={
                                quote.changePercent != null && quote.changePercent < 0
                                  ? "text-rose-300"
                                  : "text-emerald-300"
                              }
                            >
                              {quote.changePercent != null
                                ? `${quote.changePercent.toFixed(2)}%`
                                : "—"}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              Vol: {quote.volume != null ? quote.volume.toLocaleString("pt-PT") : "—"}
                            </p>
                          </div>
                        ) : (
                          <p className="text-xs text-slate-500">
                            Sem dados (Alpha Vantage).
                          </p>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
        {walletMode === "web3" && (<>
        <section id="manual-address-section" className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 scroll-mt-24">
          <h3 className="text-sm font-semibold text-white">{t("wl_add_manual")}</h3>
          <p className="mt-1 text-xs text-slate-500">
            Escolhe a rede e insere o endereço. ETH, SOL, BTC e ADA mostram saldo. Outras redes ficam em tracking.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div className="relative min-w-[200px]" ref={manualAddNetworkRef}>
              <button
                type="button"
                className="flex w-full min-w-[200px] items-center justify-between gap-2 rounded-full border border-slate-800 bg-slate-950/60 px-4 py-2 text-left text-xs text-slate-200 outline-none transition focus:border-orange-400"
                onClick={() => setManualAddNetworkOpen((o) => !o)}
              >
                <span className="truncate">
                  {MANUAL_ADD_NETWORKS.find((n) => n.id === manualAddNetwork)?.label ?? manualAddNetwork}
                </span>
                <span className="text-slate-500">{manualAddNetworkOpen ? "▲" : "▼"}</span>
              </button>
              {manualAddNetworkOpen ? (
                <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-[260px] rounded-xl border border-slate-700 bg-slate-900 shadow-xl">
                  <input
                    type="text"
                    className="w-full border-b border-slate-700 bg-slate-900/80 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 outline-none"
                    placeholder={t("wl_search_network")}
                    value={manualAddNetworkFilter}
                    onChange={(e) => setManualAddNetworkFilter(e.target.value)}
                    onKeyDown={(e) => e.stopPropagation()}
                  />
                  <div className="max-h-[300px] overflow-y-auto py-1">
                    {(() => {
                      const filtered = MANUAL_ADD_NETWORKS.filter(
                        (net) =>
                          !manualAddNetworkFilter.trim() ||
                          net.label.toLowerCase().includes(manualAddNetworkFilter.trim().toLowerCase()) ||
                          net.id.toLowerCase().includes(manualAddNetworkFilter.trim().toLowerCase())
                      );
                      const groups: string[] = [];
                      return filtered.map((net) => {
                        const showGroup = net.group && !groups.includes(net.group) && !manualAddNetworkFilter.trim();
                        if (showGroup && net.group) groups.push(net.group);
                        return (
                          <div key={net.id}>
                            {showGroup && (
                              <p className="px-3 pt-2 pb-1 text-[9px] font-bold uppercase tracking-widest text-slate-600">{net.group}</p>
                            )}
                            <button
                              type="button"
                              className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-200 hover:bg-slate-800 transition-colors"
                              onClick={() => {
                                setManualAddNetwork(net.id);
                                setManualAddNetworkOpen(false);
                                setManualAddNetworkFilter("");
                              }}
                            >
                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{
                                background: net.group === "EVM L1" ? "#f97316" :
                                            net.group === "EVM L2" ? "#3b82f6" :
                                            net.group === "Bitcoin" ? "#eab308" :
                                            net.group === "Solana" ? "#a855f7" :
                                            net.group === "Cardano" ? "#06b6d4" : "#64748b"
                              }} />
                              {net.label}
                            </button>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              ) : null}
            </div>
            <input
              className="min-w-[200px] flex-1 rounded-full border border-slate-800 bg-slate-950/60 px-4 py-2 text-xs text-slate-200 outline-none transition focus:border-orange-400"
              placeholder={
                MANUAL_ADD_TO_EVM_NETWORK[manualAddNetwork]
                  ? "Endereço 0x... (EVM/L2)"
                  : MANUAL_ADD_TO_SOL_NETWORK[manualAddNetwork]
                    ? "Endereço Solana (base58)"
                    : manualAddNetwork === "btc"
                      ? "Endereço BTC"
                      : manualAddNetwork === "ada"
                        ? "Endereço addr1... ou stake1..."
                        : "Endereço (suporte em breve)"
              }
              value={manualAddAddress}
              onChange={(e) => setManualAddAddress(e.target.value)}
            />
            <input
              className="w-32 rounded-full border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-200 outline-none placeholder:text-slate-500"
              placeholder={t("wl_name_opt")}
              value={manualAddLabel}
              onChange={(e) => setManualAddLabel(e.target.value)}
            />
            <button
              type="button"
              className="rounded-full border border-orange-400/40 px-4 py-2 text-xs font-semibold text-orange-200 transition hover:border-orange-400 hover:text-white"
              onClick={handleManualAddAddress}
            >
              Adicionar
            </button>
          </div>
          {manualAddError ? (
            <p className="mt-2 text-xs text-rose-300">{manualAddError}</p>
          ) : null}
        </section>
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="text-sm font-semibold text-white">{t("wl_manual_crypto")}</h3>
          <p className="mt-1 text-xs text-slate-500">
            Escolhe o ativo, data de compra e valor investido em <span className="text-slate-300 font-medium">{curCode} ({curSym})</span>. O ativo aparece na Carteira Cripto em baixo.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px]" ref={manualCryptoSelectRef}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 rounded-full border border-slate-800 bg-slate-950/60 px-4 py-2 text-left text-xs text-slate-200 outline-none transition focus:border-orange-400"
                onClick={() => setManualCryptoSelectOpen((o) => !o)}
              >
                <span className="truncate">
                  {manualCryptoAssetSymbol
                    ? (() => {
                        const list = cryptoSelectList.length > 0 ? cryptoSelectList : marketRows.map((r) => ({ symbol: r.symbol, name: r.name }));
                        const name = list.find((r) => r.symbol === manualCryptoAssetSymbol)?.name;
                        return name ? `${manualCryptoAssetSymbol} · ${name}` : manualCryptoAssetSymbol;
                      })()
                    : "Selecionar cripto"}
                </span>
                <span className="text-slate-500">{manualCryptoSelectOpen ? "▲" : "▼"}</span>
              </button>
              {manualCryptoSelectOpen ? (
                <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-[280px] rounded-xl border border-slate-700 bg-slate-900 shadow-xl">
                  <input
                    type="text"
                    className="w-full border-b border-slate-700 bg-slate-900/80 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 outline-none"
                    placeholder={t("wl_search_symbol")}
                    value={manualCryptoFilter}
                    onChange={(e) => setManualCryptoFilter(e.target.value)}
                    onKeyDown={(e) => e.stopPropagation()}
                  />
                  <div className="max-h-[280px] overflow-y-auto py-1">
                    {cryptoPricesLoading && cryptoSelectList.length === 0 && marketRows.length === 0 ? (
                      <p className="px-3 py-4 text-center text-xs text-slate-500">{t("wl_loading_api")}</p>
                    ) : (() => {
                      const list = cryptoSelectList.length > 0 ? cryptoSelectList : marketRows.map((r) => ({ symbol: r.symbol, name: r.name }));
                      const filtered = list.filter(
                        (row) =>
                          !manualCryptoFilter.trim() ||
                          row.symbol.toLowerCase().includes(manualCryptoFilter.trim().toLowerCase()) ||
                          (row.name && row.name.toLowerCase().includes(manualCryptoFilter.trim().toLowerCase()))
                      );
                      if (filtered.length === 0) {
                        return (
                          <p className="px-3 py-4 text-center text-xs text-slate-500">
                            {list.length === 0 ? "A carregar lista da API..." : "Nenhum ativo encontrado"}
                          </p>
                        );
                      }
                      return filtered.map((row) => (
                        <button
                          key={row.symbol}
                          type="button"
                          className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800"
                          onClick={() => {
                            setManualCryptoAssetSymbol(row.symbol);
                            setManualCryptoSelectOpen(false);
                            setManualCryptoFilter("");
                          }}
                        >
                          <span className="font-medium">{row.symbol}</span>
                          {row.name ? <span className="text-slate-500">{row.name}</span> : null}
                        </button>
                      ));
                    })()}
                  </div>
                </div>
              ) : null}
            </div>
            <input
              type="date"
              className="rounded-full border border-slate-800 bg-slate-950/60 px-4 py-2 text-xs text-slate-200 outline-none transition focus:border-orange-400"
              value={manualCryptoAssetDate}
              onChange={(e) => setManualCryptoAssetDate(e.target.value)}
            />
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">{curSym}</span>
              <input
                type="number"
                min={0}
                step={0.01}
                className="w-36 rounded-full border border-slate-800 bg-slate-950/60 pl-7 pr-12 py-2 text-xs text-slate-200 outline-none placeholder:text-slate-500 transition focus:border-orange-400"
                placeholder={t("wl_value")}
                value={manualCryptoAssetAmountUsd}
                onChange={(e) => setManualCryptoAssetAmountUsd(e.target.value)}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-slate-500">{curCode}</span>
            </div>
            <input
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              title={t("wl_qty_hint")}
              className="w-32 rounded-full border border-slate-800 bg-slate-950/60 px-4 py-2 text-xs text-slate-200 outline-none placeholder:text-slate-500 transition focus:border-orange-400"
              placeholder={`${t("wl_quantity")} (opc.)`}
              value={manualCryptoAssetQty}
              onChange={(e) => setManualCryptoAssetQty(e.target.value)}
            />
            <button
              type="button"
              className="rounded-full border border-orange-400/40 px-4 py-2 text-xs font-semibold text-orange-200 transition hover:border-orange-400 hover:text-white"
              onClick={handleManualAddCryptoAsset}
            >
              Adicionar
            </button>
          </div>
          {manualCryptoAssetError ? (
            <p className="mt-2 text-xs text-rose-300">{manualCryptoAssetError}</p>
          ) : null}
        </section>
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="text-sm font-semibold text-white">{t("wl_stablecoins_addr")}</h3>
          <p className="mt-1 text-xs text-slate-500">
            Escolhe uma ou várias stablecoins e adiciona um endereço EVM. O saldo aparece aqui e no Portfolio. (Saldo por endereço disponível em Ethereum.)
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-[auto_1fr_auto] sm:items-center">
            <select
              className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-200 outline-none focus:border-orange-400"
              value={stablecoinAddSymbol}
              onChange={(e) => setStablecoinAddSymbol(e.target.value)}
            >
              {stablecoinSymbolOptions.map((sym) => (
                <option key={sym} value={sym}>{sym}</option>
              ))}
            </select>
            <input
              type="text"
              className="min-w-0 rounded-full border border-slate-800 bg-slate-950/60 px-4 py-2 text-xs text-slate-200 placeholder:text-slate-500 outline-none focus:border-orange-400"
              placeholder={`Endereço de ${stablecoinAddSymbol} (0x...)`}
              value={stablecoinAddAddress}
              onChange={(e) => setStablecoinAddAddress(e.target.value)}
            />
            <button
              type="button"
              className="rounded-full border border-orange-400/40 px-4 py-2 text-xs font-semibold text-orange-200 transition hover:border-orange-400 hover:text-white"
              onClick={handleAddStablecoinEntry}
            >
              Adicionar
            </button>
          </div>
          {stablecoinAddError ? (
            <p className="mt-2 text-xs text-rose-300">{stablecoinAddError}</p>
          ) : null}
          {stablecoinEntries.length > 0 ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[320px] text-left text-xs text-slate-300">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-500">
                    <th className="py-2 pr-2 font-medium">{t("wl_stablecoin")}</th>
                    <th className="py-2 pr-2 font-medium">{t("wl_address")}</th>
                    <th className="py-2 pr-2 text-right font-medium">{t("wl_balance")}</th>
                    <th className="w-20 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {stablecoinEntries.map((e) => (
                    <tr key={e.id} className="border-b border-slate-800/80">
                      <td className="py-2 pr-2 font-medium text-white">{e.symbol}</td>
                      <td className="max-w-[170px] py-2 pr-2 font-mono text-slate-400">
                        <span className="inline-flex items-center gap-1.5">
                          {stableShown[e.id]
                            ? <span className="truncate">{e.address.slice(0, 6)}…{e.address.slice(-4)}</span>
                            : <span className="tracking-widest text-slate-600 select-none">••••••••</span>}
                          <button
                            type="button"
                            onClick={() => setStableShown((prev) => ({ ...prev, [e.id]: !prev[e.id] }))}
                            className="shrink-0 rounded-full border border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-200 transition hover:border-slate-500 hover:text-white"
                            title={stableShown[e.id] ? t("wc_hide_addr") : t("wc_show_addr")}
                            aria-label={stableShown[e.id] ? t("wc_hide_addr") : t("wc_show_addr")}
                          >
                            {stableShown[e.id] ? "🙈" : "👁️"}
                          </button>
                        </span>
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums">
                        {stablecoinBalancesLoading[e.id] ? "A carregar…" : (stablecoinBalances[e.id] ?? "—")}
                      </td>
                      <td className="py-2">
                        <button
                          type="button"
                          className="rounded-full border border-rose-400/40 px-2 py-1 text-[11px] font-semibold text-rose-200 transition hover:border-rose-400 hover:text-white"
                          onClick={() => {
                            setStablecoinEntries((prev) => prev.filter((x) => x.id !== e.id));
                            setStablecoinBalances((prev) => {
                              const next = { ...prev };
                              delete next[e.id];
                              return next;
                            });
                            setStablecoinBalancesLoading((prev) => {
                              const next = { ...prev };
                              delete next[e.id];
                              return next;
                            });
                          }}
                        >
                          Remover
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
        {/* ── CEX + Hyperliquid + Ledger ── */}
        {isPro ? (
          <CexSection
            onTotalChange={setCexHlTotalUsd}
            usdToEur={usdToEurRate}
            onAddColdWalletAddress={(addr, net, label) => addManualAddress(addr, net, label, "cold")}
            coldWalletNetworks={MANUAL_ADD_NETWORKS}
            addedAddresses={coldWalletEntries}
            onRemoveAddress={removeManualAddress}
            tokensByAddress={coldTokensByAddr}
          />
        ) : (
          <div className="mx-auto w-full max-w-5xl px-4 pb-8">
            <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-6 flex flex-col sm:flex-row items-center gap-5">
              <div className="text-4xl">🔒</div>
              <div className="flex-1 text-center sm:text-left">
                <p className="text-base font-bold text-white mb-1">{t("wl_cex_hw_pro")}</p>
                <p className="text-sm text-slate-400">{t("wl_cex_hw_desc")}</p>
              </div>
              <a href="/pricing" className={`${btnPrimary} shrink-0 px-5 py-2.5 text-sm`}>
                Upgrade para Pro →
              </a>
            </div>
          </div>
        )}
        </>)}
      </main>
    </div>
    </AppShell>
  );
}
