"use client";

import { useCallback, useEffect, useMemo, useRef, useState, startTransition } from "react";

import AppHeader from "@/components/AppHeader";
import WalletCard from "@/components/wallets/WalletCard";
import { createClient } from "@/lib/supabase/client";
import {
  connectEvmProvider,
  getEthBalance,
  getEvmBalance,
  getEvmProviderById,
  getEvmProviderLabel,
  getEvmProviderOptions,
  getEvmTokenBalance,
  isEvmWalletAvailable,
  isMetaMaskAvailable,
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
  connectEternl,
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
const isAdaAddress = (address?: string) =>
  typeof address === "string" && /^(addr1|stake1)[0-9a-z]+$/i.test(address);
const getAllowedHosts = () =>
  (process.env.NEXT_PUBLIC_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);

const evmNetworks: EvmNetwork[] = ["Ethereum", "Arbitrum", "Optimism", "Base", "Polygon", "BSC"];
/** Mapeamento do id em "Adicionar endereço manual" para EvmNetwork (permite ler saldo por rede). */
const MANUAL_ADD_TO_EVM_NETWORK: Record<string, EvmNetwork> = {
  eth: "Ethereum",
  optimism: "Optimism",
  arbitrum: "Arbitrum",
  base: "Base",
  matic: "Polygon",
  bsc: "BSC",
};
/** Redes que usam endereço Solana (base58). Permite ler saldo SOL. */
const MANUAL_ADD_TO_SOL_NETWORK: Record<string, string> = {
  sol: "Solana",
  sol_l2: "Solana L2",
  raydium: "Raydium",
  orca: "Orca",
  sol_dex: "Solana DEX",
};
const ethNetworkLabelOptions: Array<{ id: EvmNetwork | "outro"; label: string }> = [
  ...evmNetworks.map((n) => ({ id: n, label: n })),
  { id: "outro", label: "Outro (qualquer rede EVM/L2)" },
];
const ethWalletOptions: Array<{ id: EvmProviderId; label: string }> = [
  { id: "metamask", label: "MetaMask" },
  { id: "coinbase", label: "Coinbase Wallet" },
  { id: "trust", label: "Trust Wallet" },
  { id: "binance", label: "Binance Chain Wallet" },
];
const solWalletOptions = [
  { id: "phantom", label: "Phantom Wallet" },
  { id: "backpack", label: "Backpack" },
  { id: "solflare", label: "Solflare" },
  { id: "glow", label: "Glow Wallet" },
  { id: "flint", label: "Flint" },
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
const MANUAL_ADD_NETWORKS: Array<{ id: string; label: string }> = [
  { id: "eth", label: "Ethereum (ETH)" },
  { id: "optimism", label: "Optimism" },
  { id: "arbitrum", label: "Arbitrum" },
  { id: "base", label: "Base" },
  { id: "matic", label: "Polygon (ex-Matic)" },
  { id: "bsc", label: "Binance Smart Chain (BSC)" },
  { id: "btc", label: "Bitcoin (BTC)" },
  { id: "sol", label: "Solana (SOL)" },
  { id: "sol_l2", label: "Solana L2" },
  { id: "raydium", label: "Raydium" },
  { id: "orca", label: "Orca" },
  { id: "sol_dex", label: "Solana DEX" },
  { id: "bnb", label: "BNB (BNB)" },
  { id: "xrp", label: "XRP (XRP)" },
  { id: "ada", label: "Cardano (ADA)" },
  { id: "doge", label: "Dogecoin (DOGE)" },
  { id: "trx", label: "TRON (TRX)" },
  { id: "avax", label: "Avalanche (AVAX)" },
  { id: "link", label: "Chainlink (LINK)" },
  { id: "ltc", label: "Litecoin (LTC)" },
  { id: "bch", label: "Bitcoin Cash (BCH)" },
  { id: "xlm", label: "Stellar (XLM)" },
  { id: "uni", label: "Uniswap (UNI)" },
  { id: "xmr", label: "Monero (XMR)" },
  { id: "etc", label: "Ethereum Classic (ETC)" },
  { id: "hbar", label: "Hedera (HBAR)" },
];

export default function WalletsPage() {
  const supabase = useMemo(() => createClient(), []);
  useRequireAuth("/login");
  const [isClient, setIsClient] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [isPro, setIsPro] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [cloudSyncError, setCloudSyncError] = useState<string | null>(null);
  const [walletMode, setWalletMode] = useState<"web3" | "tradicional">("web3");
  const [traditionalCategory, setTraditionalCategory] = useState("Todos");
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
  const [adaWallets, setAdaWallets] = useState<StoredWalletEntry[]>([]);
  const [adaNewAddress, setAdaNewAddress] = useState("");
  const [adaNewError, setAdaNewError] = useState<string | null>(null);
  const [adaShowMain, setAdaShowMain] = useState(false);
  const [adaShown, setAdaShown] = useState<Record<string, boolean>>({});
  const [selectedAdaProvider, setSelectedAdaProvider] = useState<CardanoWalletId>("eternl");
  const [showAdaNetworks, setShowAdaNetworks] = useState(false);
  const [adaNewNetworkId, setAdaNewNetworkId] = useState<string>("cardano");
  const [adaNewNetworkSelectOpen, setAdaNewNetworkSelectOpen] = useState(false);
  const [adaNewNetworkSelectFilter, setAdaNewNetworkSelectFilter] = useState("");
  const [adaNewCustomLabel, setAdaNewCustomLabel] = useState("");
  const [adaBalancesByAddress, setAdaBalancesByAddress] = useState<Record<string, string>>({});
  const [adaBalancesLoading, setAdaBalancesLoading] = useState<Record<string, boolean>>({});
  const [adaBalanceErrors, setAdaBalanceErrors] = useState<Record<string, string | null>>({});
  const [defiTotals, setDefiTotals] = useState<Record<string, number | null>>({});
  const [defiLoading, setDefiLoading] = useState<Record<string, boolean>>({});
  const [defiErrors, setDefiErrors] = useState<Record<string, string | null>>({});
  const [nftCounts, setNftCounts] = useState<Record<string, number>>({});
  const [nftLoading, setNftLoading] = useState<Record<string, boolean>>({});
  const [nftErrors, setNftErrors] = useState<Record<string, string | null>>({});
  const [nftsByKey, setNftsByKey] = useState<Record<string, Array<{ id: string; name: string; image?: string; tokenAddress?: string; tokenId?: string }>>>({});
  const [evmProviders, setEvmProviders] = useState<Array<{ id: EvmProviderId; label: string }>>(
    []
  );
  const [selectedEvmProvider, setSelectedEvmProvider] = useState<EvmProviderId>("metamask");
  const [showEthNetworks, setShowEthNetworks] = useState(false);
  const [selectedBtcProvider, setSelectedBtcProvider] = useState<BtcWalletId>("xverse");
  const [showBtcWalletsList, setShowBtcWalletsList] = useState(false);
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
    setEthWallets(snapshot.eth ?? []);
    setSolWallets(snapshot.sol ?? []);
    setBtcWallets(snapshot.btc ?? []);
    setAdaWallets(snapshot.ada ?? []);
    walletsHydratedRef.current = true;
  }, []);

  useEffect(() => {
    if (!walletsHydratedRef.current) return;
    const id = window.setTimeout(
      () =>
        updateWalletSnapshot({
          eth: ethWallets,
          sol: solWallets,
          btc: btcWallets,
          ada: adaWallets,
        }),
      150
    );
    return () => window.clearTimeout(id);
  }, [ethWallets, solWallets, btcWallets, adaWallets]);

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
        .maybeSingle<SubscriptionStatus>();

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
      };

      const { error } = await supabase
        .from("portfolio_snapshots")
        .insert({ user_id: userId, data: snapshot });

      if (error) {
        setCloudSyncError("Não foi possível sincronizar a carteira na nuvem.");
        return;
      }
      setCloudSyncError(null);
    }, 1200);

    return () => window.clearTimeout(timeoutId);
  }, [ethWallets, solWallets, btcWallets, adaWallets, userId, isPro, isLoadingAuth, supabase]);

  type DefiChain = "eth" | "sol" | "btc" | "ada";
  const defiKey = (address: string, chain: DefiChain) => `${address}:${chain}`;

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
        [key]: error instanceof Error ? error.message : "Erro ao carregar DeFi.",
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

  useEffect(() => {
    if (!ethMainAddress) return;
    fetchDefiTotal(ethMainAddress, "eth");
  }, [ethMainAddress]);
  useEffect(() => {
    if (!solMainAddress) return;
    fetchDefiTotal(solMainAddress, "sol");
  }, [solMainAddress]);
  useEffect(() => {
    if (!btcMainAddress) return;
    fetchDefiTotal(btcMainAddress, "btc");
  }, [btcMainAddress]);
  useEffect(() => {
    if (!adaMainAddress) return;
    fetchDefiTotal(adaMainAddress, "ada");
  }, [adaMainAddress]);

  const fetchNftBalance = async (address: string, chain: DefiChain) => {
    const key = defiKey(address, chain);
    setNftLoading((prev) => ({ ...prev, [key]: true }));
    setNftErrors((prev) => ({ ...prev, [key]: null }));
    try {
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const response = await fetch(
        `${base}/api/nft-balance?address=${encodeURIComponent(address)}&chain=${chain}`
      );
      const data = (await response.json()) as { count?: number; nfts?: Array<{ id: string; name: string; image?: string; tokenAddress?: string; tokenId?: string }>; error?: string };
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
      setNftErrors((prev) => ({ ...prev, [key]: error instanceof Error ? error.message : "Erro ao carregar NFTs." }));
      setNftCounts((prev) => ({ ...prev, [key]: 0 }));
      setNftsByKey((prev) => ({ ...prev, [key]: [] }));
    } finally {
      setNftLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  useEffect(() => {
    if (!ethMainAddress) return;
    fetchNftBalance(ethMainAddress, "eth");
  }, [ethMainAddress]);
  useEffect(() => {
    if (!solMainAddress) return;
    fetchNftBalance(solMainAddress, "sol");
  }, [solMainAddress]);
  useEffect(() => {
    if (!btcMainAddress) return;
    fetchNftBalance(btcMainAddress, "btc");
  }, [btcMainAddress]);
  useEffect(() => {
    if (!adaMainAddress) return;
    fetchNftBalance(adaMainAddress, "ada");
  }, [adaMainAddress]);

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
        selectList?: Array<{ symbol: string; name: string }>;
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
        setCryptoPrices(map);
      }
    } catch (error) {
      setCryptoPricesError(error instanceof Error ? error.message : "Erro ao obter preços.");
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
      setConfirmError("Ligação bloqueada por segurança.");
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
  const totalEthBalance = useMemo(() => {
    let sum = parseFloat(ethBalance ?? "") || 0;
    ethWallets.forEach((w) => {
      if (w.address && w.network && !(w.address === ethAddress && w.network === "Ethereum")) {
        const b = ethBalancesByKey[ethBalanceKey(w.address, w.network)] ?? w.balance;
        sum += typeof b === "string" && b !== "—" ? parseFloat(b) || 0 : 0;
      }
    });
    return sum.toFixed(4);
  }, [ethBalance, ethWallets, ethAddress, ethBalancesByKey]);

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
    next: { buyValue?: number; buyDate?: string }
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

  const visibleTraditionalAssets =
    traditionalCategory === "Todos"
      ? traditionalAssets
      : traditionalAssets.filter((asset) => asset.category === traditionalCategory);

  const selectedTraditionalAssets = useMemo(
    () => traditionalAssets.filter((asset) => !!traditionalHoldings[asset.id]),
    [traditionalHoldings]
  );

  const selectedCryptoSymbols = useMemo(() => Object.keys(cryptoHoldings), [cryptoHoldings]);

  const cryptoManualTotal = useMemo(() => {
    return Object.values(cryptoHoldings).reduce((sum, holding) => {
      const value = Number(holding.buyValue ?? 0);
      return Number.isFinite(value) ? sum + value : sum;
    }, 0);
  }, [cryptoHoldings]);

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
      const address = await connectEvmProvider(selectedProvider);
      setEthAddress(address);
      const balance = await getEthBalance(address);
      const formatted = Number(balance).toFixed(4);
      setEthBalance(formatted);
      const label = getEvmProviderLabel(selectedEvmProvider);
      const nextWallets = upsertWallet(
        ethWallets,
        { address, balance: formatted, network: "Ethereum", label },
        (item) => item.address === address
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

  const handleEthRefresh = async () => {
    try {
      setEthLoading(true);
      setEthError(null);
      if (ethAddress) {
        const balance = await getEthBalance(ethAddress as `0x${string}`);
        const formatted = Number(balance).toFixed(4);
        setEthBalance(formatted);
        const nextWallets = upsertWallet(
          ethWallets,
          { address: ethAddress, balance: formatted, network: "Ethereum", label: "MetaMask" },
          (item) => item.address === ethAddress && item.network === "Ethereum"
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
    } catch (error) {
      setEthError(error instanceof Error ? error.message : "Erro ao atualizar saldo.");
    } finally {
      setEthLoading(false);
    }
  };

  const handleEthDisconnect = () => {
    if (!ethAddress) return;
    const nextWallets = removeWallet(
      ethWallets,
      (item) => item.address === ethAddress && item.network === "Ethereum"
    );
    setEthWallets(nextWallets);
    setEthAddress(undefined);
    setEthBalance(undefined);
    setEthError(null);
  };

  const handleAddEthWalletInternal = async () => {
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
      const balance = await getEvmBalance(trimmed as `0x${string}`, netForFetch);
      const formatted = Number(balance).toFixed(4);
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
      setSolAddress(address);
      const balance = await getSolBalance(address);
      setSolBalance(balance);
      const nextWallets = upsertWallet(
        solWallets,
        { address, balance, network: "Solana" },
        (item) => item.address === address
      );
      setSolWallets(nextWallets);
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
    if (!solAddress) return;
    const nextWallets = removeWallet(
      solWallets,
      (item) => item.address === solAddress && (item.network ?? "Solana") === "Solana"
    );
    setSolWallets(nextWallets);
    setSolAddress(undefined);
    setSolBalance(undefined);
    setSolError(null);
  };

  const handleAddSolWalletInternal = async () => {
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
      const address = await connectXverse();
      setBtcAddress(address);
      const walletBalance = await getBtcBalanceFromWallet();
      if (walletBalance !== null) {
        setBtcBalance(walletBalance);
        const nextWallets = upsertWallet(
          btcWallets,
          { address, balance: walletBalance.toFixed(8), network: "Bitcoin" },
          (item) => item.address === address
        );
        setBtcWallets(nextWallets);
        updateWalletSnapshot({ eth: ethWallets, sol: solWallets, btc: nextWallets, ada: adaWallets });
        return;
      }
      const apiBalance = await getBtcBalanceFromAddress(address);
      setBtcBalance(apiBalance);
      const nextWallets = upsertWallet(
        btcWallets,
        { address, balance: apiBalance.toFixed(8), network: "Bitcoin" },
        (item) => item.address === address
      );
      setBtcWallets(nextWallets);
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
    if (!btcAddress) return;
    const nextWallets = removeWallet(btcWallets, (item) => item.address === btcAddress);
    setBtcWallets(nextWallets);
    setBtcAddress(undefined);
    setBtcBalance(null);
    setBtcError(null);
  };

  const handleAddBtcWalletInternal = async () => {
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

  const handleAdaConnectInternal = async () => {
    try {
      setAdaLoading(true);
      setAdaError(null);
      const { api, address } = await connectCardanoWallet(selectedAdaProvider);
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
      setAdaError(error instanceof Error ? error.message : "Erro ao conectar.");
    } finally {
      setAdaLoading(false);
    }
  };

  const handleAdaConnect = () => {
    const host = typeof window !== "undefined" ? window.location.hostname : "";
    requestConfirm({
      title: "Conectar carteira Cardano",
      description: `Vai ligar a carteira ao domínio ${host || "atual"} em modo leitura.`,
      onConfirm: handleAdaConnectInternal,
    });
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
    if (!adaAddress) return;
    const nextWallets = removeWallet(adaWallets, (item) => item.address === adaAddress);
    setAdaWallets(nextWallets);
    setAdaAddress(undefined);
    setAdaBalance(undefined);
    setAdaError(null);
    setAdaApi(null);
  };

  const handleManualAddAddress = () => {
    const trimmed = manualAddAddress.trim();
    const label = manualAddLabel.trim() || undefined;
    setManualAddError(null);
    if (!trimmed) {
      setManualAddError("Insere um endereço.");
      return;
    }
    const evmNetwork = MANUAL_ADD_TO_EVM_NETWORK[manualAddNetwork];
    if (evmNetwork) {
      if (!isEvmAddress(trimmed)) {
        setManualAddError("Endereço inválido (deve ser 0x... para redes EVM/L2).");
        return;
      }
      const network = label ?? evmNetwork;
      const nextWallets = upsertWallet(
        ethWallets,
        { address: trimmed, network },
        (item) => item.address === trimmed && item.network === network
      );
      setEthWallets(nextWallets);
      updateWalletSnapshot({ eth: nextWallets, sol: solWallets, btc: btcWallets, ada: adaWallets });
      void fetchEthBalanceForEntry(trimmed, network);
    } else if (MANUAL_ADD_TO_SOL_NETWORK[manualAddNetwork]) {
      if (!isSolAddress(trimmed)) {
        setManualAddError("Endereço Solana inválido (base58, 32–44 caracteres).");
        return;
      }
      const network = label ?? MANUAL_ADD_TO_SOL_NETWORK[manualAddNetwork];
      const nextWallets = upsertWallet(
        solWallets,
        { address: trimmed, network },
        (item) => item.address === trimmed && (item.network ?? "Solana") === network
      );
      setSolWallets(nextWallets);
      updateWalletSnapshot({ eth: ethWallets, sol: nextWallets, btc: btcWallets, ada: adaWallets });
      void fetchSolBalanceForAddress(trimmed);
    } else if (manualAddNetwork === "btc") {
      if (!isBtcAddress(trimmed)) {
        setManualAddError("Endereço Bitcoin inválido.");
        return;
      }
      const network = label ?? "Bitcoin";
      const nextWallets = upsertWallet(
        btcWallets,
        { address: trimmed, network },
        (item) => item.address === trimmed
      );
      setBtcWallets(nextWallets);
      updateWalletSnapshot({ eth: ethWallets, sol: solWallets, btc: nextWallets, ada: adaWallets });
      void fetchBtcBalanceForAddress(trimmed);
    } else if (manualAddNetwork === "ada") {
      if (!isAdaAddress(trimmed)) {
        setManualAddError("Endereço Cardano inválido (addr1... ou stake1...).");
        return;
      }
      const network = label ?? "Cardano";
      const nextWallets = upsertWallet(
        adaWallets,
        { address: trimmed, network },
        (item) => item.address === trimmed && (item.network ?? "Cardano") === network
      );
      setAdaWallets(nextWallets);
      updateWalletSnapshot({ eth: ethWallets, sol: solWallets, btc: btcWallets, ada: nextWallets });
      void fetchAdaBalanceForAddress(trimmed);
    } else {
      setManualAddError("Suporte para esta rede em breve. Por agora usa ETH, SOL, BTC ou ADA.");
      return;
    }
    setManualAddAddress("");
    setManualAddLabel("");
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
      setManualCryptoAssetError("Insere uma quantidade em USD válida.");
      return;
    }
    updateCryptoHolding(symbol, {
      buyDate: manualCryptoAssetDate || undefined,
      buyValue: amount,
    });
    setManualCryptoAssetSymbol("");
    setManualCryptoAssetDate("");
    setManualCryptoAssetAmountUsd("");
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

  const fetchStablecoinBalance = useCallback(
    async (entryId: string, symbol: string, network: EvmNetwork, address: string) => {
      setStablecoinBalancesLoading((prev) => ({ ...prev, [entryId]: true }));
      try {
        const balance = await getEvmTokenBalance(address as `0x${string}`, symbol, network);
        startTransition(() => {
          setStablecoinBalances((prev) => ({ ...prev, [entryId]: balance }));
          setStablecoinBalancesLoading((prev) => ({ ...prev, [entryId]: false }));
          setStablecoinEntries((prev) =>
            prev.map((e) => (e.id === entryId ? { ...e, balance } : e))
          );
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
    const id = window.setTimeout(() => {
      stablecoinEntries.forEach((e) => {
        if (isEvmAddress(e.address)) void fetchStablecoinBalance(e.id, e.symbol, e.network as EvmNetwork, e.address);
      });
    }, 0);
    return () => window.clearTimeout(id);
  }, [walletMode, stablecoinEntries, fetchStablecoinBalance]);

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

  const fetchEthBalanceForEntry = useCallback(
    async (address: string, network: string) => {
      if (address === ethAddress && network === "Ethereum") return;
      const key = ethBalanceKey(address, network);
      setEthBalancesLoading((prev) => ({ ...prev, [key]: true }));
      setEthBalanceErrors((prev) => ({ ...prev, [key]: null }));
      try {
        const net = evmNetworks.includes(network as EvmNetwork) ? (network as EvmNetwork) : "Ethereum";
        const balance = await getEvmBalance(address as `0x${string}`, net);
        const formatted = Number(balance).toFixed(4);
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
    [ethAddress]
  );

  useEffect(() => {
    if (walletMode !== "web3") return;
    const id = window.setTimeout(() => {
      ethWallets
        .filter((w) => w.address && w.network && !(w.address === ethAddress && w.network === "Ethereum"))
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
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <AppHeader variant="app" subtitle="Carteiras" />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 pb-20 pt-2">
        <div className="flex flex-col gap-4">
          <p className="text-xs uppercase tracking-[0.3em] text-orange-300/80">
            Carteiras
          </p>
          <h1 className="text-3xl font-semibold text-white">
            Escolhe entre Web3 ou Mercado Tradicional
          </h1>
          <p className="max-w-2xl text-sm text-slate-400">
            Alterna entre carteiras on-chain e seleção de ativos do mercado tradicional.
          </p>
          {isLoadingAuth ? null : isPro ? (
            <p className="text-xs text-emerald-300">
              Sincronização automática ativa (Plano Pro).
            </p>
          ) : (
            <p className="text-xs text-slate-500">
              Sincronização entre dispositivos disponível apenas no Plano Pro.
            </p>
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
              Carteiras Web3
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
              Carteiras Mercado Tradicional
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
                  className="rounded-full bg-orange-500 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-orange-400"
                  onClick={handleConfirm}
                >
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        ) : null}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="text-sm font-semibold text-white">Adicionar endereço manual (todas as redes)</h3>
          <p className="mt-1 text-xs text-slate-500">
            Escolhe a rede e insere o endereço. O saldo aparece no card da respetiva rede.
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
                    placeholder="Pesquisar rede..."
                    value={manualAddNetworkFilter}
                    onChange={(e) => setManualAddNetworkFilter(e.target.value)}
                    onKeyDown={(e) => e.stopPropagation()}
                  />
                  <div className="max-h-[240px] overflow-y-auto py-1">
                    {MANUAL_ADD_NETWORKS.filter(
                      (net) =>
                        !manualAddNetworkFilter.trim() ||
                        net.label.toLowerCase().includes(manualAddNetworkFilter.trim().toLowerCase()) ||
                        net.id.toLowerCase().includes(manualAddNetworkFilter.trim().toLowerCase())
                    ).map((net) => (
                      <button
                        key={net.id}
                        type="button"
                        className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800"
                        onClick={() => {
                          setManualAddNetwork(net.id);
                          setManualAddNetworkOpen(false);
                          setManualAddNetworkFilter("");
                        }}
                      >
                        {net.label}
                      </button>
                    ))}
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
              placeholder="Nome (opcional)"
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
          <h3 className="text-sm font-semibold text-white">Por ativos cripto manual</h3>
          <p className="mt-1 text-xs text-slate-500">
            Escolhe o ativo, data de compra e quantidade em USD. O ativo aparece na Carteira Cripto em baixo.
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
                    placeholder="Pesquisar (símbolo ou nome)..."
                    value={manualCryptoFilter}
                    onChange={(e) => setManualCryptoFilter(e.target.value)}
                    onKeyDown={(e) => e.stopPropagation()}
                  />
                  <div className="max-h-[280px] overflow-y-auto py-1">
                    {cryptoPricesLoading && cryptoSelectList.length === 0 && marketRows.length === 0 ? (
                      <p className="px-3 py-4 text-center text-xs text-slate-500">A carregar lista da API...</p>
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
            <input
              type="number"
              min={0}
              step={0.01}
              className="w-32 rounded-full border border-slate-800 bg-slate-950/60 px-4 py-2 text-xs text-slate-200 outline-none placeholder:text-slate-500 transition focus:border-orange-400"
              placeholder="Quantidade (USD)"
              value={manualCryptoAssetAmountUsd}
              onChange={(e) => setManualCryptoAssetAmountUsd(e.target.value)}
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
          <h3 className="text-sm font-semibold text-white">Stablecoins (por endereço)</h3>
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
                    <th className="py-2 pr-2 font-medium">Stablecoin</th>
                    <th className="py-2 pr-2 font-medium">Endereço</th>
                    <th className="py-2 pr-2 text-right font-medium">Saldo</th>
                    <th className="w-20 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {stablecoinEntries.map((e) => (
                    <tr key={e.id} className="border-b border-slate-800/80">
                      <td className="py-2 pr-2 font-medium text-white">{e.symbol}</td>
                      <td className="max-w-[140px] truncate py-2 pr-2 font-mono text-slate-400" title={e.address}>
                        {e.address.slice(0, 6)}…{e.address.slice(-4)}
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
        <div className="grid gap-6 md:grid-cols-2">
          <WalletCard
            title="Ethereum"
            description={
              ethWallets.length > 0
                ? `${ethWallets.length} carteira(s) · Saldo total ETH`
                : "MetaMask (ETH)"
            }
            address={ethAddress ?? ethWallets[0]?.address}
            addressDisplay={
              ethShowMain
                ? ethAddress ?? ethWallets[0]?.address
                : formatAddress(ethAddress ?? ethWallets[0]?.address)
            }
            balance={ethWallets.length > 0 ? totalEthBalance : ethBalance}
            balanceUnit="ETH"
            fiatValueUsd={getFiatValue("ETH", ethWallets.length > 0 ? totalEthBalance : ethBalance)}
            defiBalanceUsd={ethMainAddress ? defiTotals[defiKey(ethMainAddress, "eth")] ?? null : null}
            defiLoading={ethMainAddress ? !!defiLoading[defiKey(ethMainAddress, "eth")] : false}
            defiError={ethMainAddress ? defiErrors[defiKey(ethMainAddress, "eth")] ?? null : null}
            nftCount={ethMainAddress ? nftCounts[defiKey(ethMainAddress, "eth")] ?? null : null}
            nftLoading={ethMainAddress ? !!nftLoading[defiKey(ethMainAddress, "eth")] : false}
            nftError={ethMainAddress ? nftErrors[defiKey(ethMainAddress, "eth")] ?? null : null}
            nfts={ethMainAddress ? nftsByKey[defiKey(ethMainAddress, "eth")] ?? [] : []}
            isConnected={!!ethAddress || ethWallets.length > 0}
            isAvailable={ethIsAvailable || ethWallets.length > 0}
            isLoading={ethLoading}
            error={ethError}
            onConnect={handleEthConnect}
            onDisconnect={handleEthDisconnect}
            onRefresh={handleEthRefresh}
            onToggleAddress={() => setEthShowMain((prev) => !prev)}
            isAddressVisible={ethShowMain}
          >
            <div className="space-y-3">
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
                        placeholder="Pesquisar carteira..."
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
              </div>
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
                  {ethNetworkLabelOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
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
              <div className="space-y-2">
                {ethWallets.map((item) => {
                  const isConnected = item.address === ethAddress && item.network === "Ethereum";
                  const key = ethBalanceKey(item.address ?? "", item.network ?? "");
                  const loading = ethBalancesLoading[key];
                  const err = ethBalanceErrors[key];
                  const balanceDisplay = isConnected
                    ? ethBalance ?? "—"
                    : loading
                      ? "A carregar..."
                      : err
                        ? null
                        : ethBalancesByKey[key] ?? item.balance ?? "—";
                  return (
                    <div
                      key={`${item.address}-${item.network}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-300"
                    >
                      <div className="space-y-1">
                        <p className="font-semibold text-white">
                          {item.network ?? "Ethereum"}
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
                            {ethShown[item.address ?? ""] ? item.address : formatAddress(item.address)}
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
                      </div>
                      <div className="text-right">
                        {balanceDisplay != null && (
                          <p>
                            {balanceDisplay} {balanceDisplay !== "A carregar..." && balanceDisplay !== "—" ? "ETH" : ""}
                          </p>
                        )}
                        {balanceDisplay != null && balanceDisplay !== "A carregar..." && balanceDisplay !== "—" && getFiatValue("ETH", balanceDisplay) != null ? (
                          <p className="text-slate-400">${getFiatValue("ETH", balanceDisplay)!.toFixed(2)}</p>
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
            isConnected={!!solAddress || solWallets.length > 0}
            isAvailable={solIsAvailable || solWallets.length > 0}
            isLoading={solLoading}
            error={solError}
            onConnect={handleSolConnect}
            onDisconnect={handleSolDisconnect}
            onRefresh={handleSolRefresh}
            onToggleAddress={() => setSolShowMain((prev) => !prev)}
            isAddressVisible={solShowMain}
          >
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
                  Carteira SOL
                </span>
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
                        placeholder="Pesquisar carteira..."
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
              </div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                Carteiras adicionais / L2
              </p>
              <div>
                <button
                  type="button"
                  className="rounded-full border border-slate-700 px-3 py-1 text-[11px] font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
                  onClick={() => setShowSolWalletsList((prev) => !prev)}
                >
                  Carteiras Solana
                </button>
                {showSolWalletsList ? (
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
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
                ) : null}
              </div>
              <p className="text-xs text-slate-500">
                Conecta uma carteira e/ou adiciona endereços. O saldo total junta todas.
              </p>
              <div className="grid gap-3 sm:grid-cols-[1.2fr_0.8fr_auto]">
                <input
                  className="w-full rounded-full border border-slate-800 bg-slate-950/60 px-4 py-2 text-xs text-slate-200 outline-none transition focus:border-orange-400"
                  placeholder="Endereço Solana"
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
                        placeholder="Pesquisar rede..."
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
                  placeholder="Nome (opcional)"
                  value={solNewCustomLabel}
                  onChange={(e) => setSolNewCustomLabel(e.target.value)}
                />
              ) : null}
              {solNewError ? <p className="text-xs text-rose-300">{solNewError}</p> : null}
              <div className="space-y-2">
                {solWallets.map((item) => {
                  const isConnected = item.address === solAddress && (item.network ?? "Solana") === "Solana";
                  const addr = item.address ?? "";
                  const loading = solBalancesLoading[addr];
                  const err = solBalanceErrors[addr];
                  const balanceDisplay = isConnected
                    ? solBalance ?? "—"
                    : loading
                      ? "A carregar..."
                      : err
                        ? null
                        : solBalancesByAddress[addr] ?? item.balance ?? "—";
                  return (
                    <div
                      key={`${item.address}-${item.network ?? "Solana"}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-300"
                    >
                      <div className="space-y-1">
                        <p className="font-semibold text-white">
                          {item.network ?? "Solana"}
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
                            {solShown[addr] ? item.address : formatAddress(item.address)}
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
                      </div>
                      <div className="text-right">
                        {balanceDisplay != null && (
                          <p>
                            {balanceDisplay} {balanceDisplay !== "A carregar..." && balanceDisplay !== "—" ? "SOL" : ""}
                          </p>
                        )}
                        {balanceDisplay != null && balanceDisplay !== "A carregar..." && balanceDisplay !== "—" && getFiatValue("SOL", balanceDisplay) != null ? (
                          <p className="text-slate-400">${getFiatValue("SOL", balanceDisplay)!.toFixed(2)}</p>
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
                              const nextWallets = removeWallet(
                                solWallets,
                                (entry) => entry.address === item.address && (entry.network ?? "Solana") === (item.network ?? "Solana")
                              );
                              setSolWallets(nextWallets);
                              if (item.address === solAddress) {
                                setSolAddress(undefined);
                                setSolBalance(undefined);
                                setSolError(null);
                              }
                              setSolBalancesByAddress((prev) => {
                                const next = { ...prev };
                                delete next[addr];
                                return next;
                              });
                              setSolBalanceErrors((prev) => {
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
            defiBalanceUsd={btcMainAddress ? defiTotals[defiKey(btcMainAddress, "btc")] ?? null : null}
            defiLoading={btcMainAddress ? !!defiLoading[defiKey(btcMainAddress, "btc")] : false}
            defiError={btcMainAddress ? defiErrors[defiKey(btcMainAddress, "btc")] ?? null : null}
            nftCount={btcMainAddress ? nftCounts[defiKey(btcMainAddress, "btc")] ?? null : null}
            nftLoading={btcMainAddress ? !!nftLoading[defiKey(btcMainAddress, "btc")] : false}
            nftError={btcMainAddress ? nftErrors[defiKey(btcMainAddress, "btc")] ?? null : null}
            nfts={btcMainAddress ? nftsByKey[defiKey(btcMainAddress, "btc")] ?? [] : []}
            isConnected={!!btcAddress || btcWallets.length > 0}
            isAvailable={btcIsAvailable}
            isLoading={btcLoading}
            error={btcError}
            onConnect={handleBtcConnect}
            onDisconnect={handleBtcDisconnect}
            onRefresh={handleBtcRefresh}
            allowConnectWhenUnavailable
            onToggleAddress={() => setBtcShowMain((prev) => !prev)}
            isAddressVisible={btcShowMain}
            extraBalance={{
              label: "Saldo dos RUNES:",
              content:
                !btcAddress && btcWallets.length === 0 ? (
                  <span className="text-slate-500">—</span>
                ) : btcRunesSummary.loading ? (
                  <span className="text-slate-400">A carregar…</span>
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
                        placeholder="Pesquisar carteira..."
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
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                Carteiras adicionais / L2
              </p>
              <div>
                <button
                  type="button"
                  className="rounded-full border border-slate-700 px-3 py-1 text-[11px] font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
                  onClick={() => setShowBtcWalletsList((prev) => !prev)}
                >
                  Carteiras BTC
                </button>
                {showBtcWalletsList ? (
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                    {btcWalletOptions.map((option) => (
                      <span
                        key={option.id}
                        className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-1 text-slate-200"
                      >
                        {option.label}{" "}
                        {isBtcWalletAvailable(option.id) ? (
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
              <div className="grid gap-3 sm:grid-cols-[1.2fr_0.8fr_auto]">
                <input
                  className="w-full rounded-full border border-slate-800 bg-slate-950/60 px-4 py-2 text-xs text-slate-200 outline-none transition focus:border-orange-400"
                  placeholder="Endereço BTC"
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
                        placeholder="Pesquisar rede..."
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
                  placeholder="Nome (opcional)"
                  value={btcNewCustomLabel}
                  onChange={(e) => setBtcNewCustomLabel(e.target.value)}
                />
              ) : null}
              {btcNewError ? <p className="text-xs text-rose-300">{btcNewError}</p> : null}
              <div className="space-y-2">
                {btcWallets.map((item) => {
                  const isConnected = item.address === btcAddress;
                  const addr = item.address ?? "";
                  const loading = btcBalancesLoading[addr];
                  const err = btcBalanceErrors[addr];
                  const balanceDisplay = isConnected
                    ? (btcBalance != null ? btcBalance.toFixed(8) : "—")
                    : loading
                      ? "A carregar..."
                      : err
                        ? null
                        : btcBalancesByAddress[addr] ?? item.balance ?? "—";
                  return (
                    <div
                      key={item.address}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-300"
                    >
                      <div className="space-y-1">
                        <p className="font-semibold text-white">
                          {item.network ?? "Bitcoin"}
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
                            {btcShown[addr] ? item.address : formatAddress(item.address)}
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
                      </div>
                      <div className="text-right">
                        {balanceDisplay != null && (
                          <p>
                            {balanceDisplay} {balanceDisplay !== "A carregar..." && balanceDisplay !== "—" ? "BTC" : ""}
                          </p>
                        )}
                        {balanceDisplay != null && balanceDisplay !== "A carregar..." && balanceDisplay !== "—" && getFiatValue("BTC", balanceDisplay) != null ? (
                          <p className="text-slate-400">${getFiatValue("BTC", balanceDisplay)!.toFixed(2)}</p>
                        ) : null}
                        {!(item.network && ["Liquid", "Rootstock (RSK)", "Stacks", "Lightning (em breve)"].includes(item.network)) ? (
                          <>
                            {btcRunesLoading[addr] ? (
                              <p className="mt-1 text-[10px] text-slate-500">Runes: a carregar…</p>
                            ) : (btcRunesByAddress[addr]?.length ?? 0) > 0 ? (
                              <div className="mt-1 space-y-0.5 text-right text-[10px] text-amber-200/90">
                                {btcRunesByAddress[addr]!.map((r) => (
                                  <div key={r.symbol} className="flex justify-end gap-2">
                                    <span className="truncate max-w-[120px]" title={r.displayName}>{r.displayName}</span>
                                    <span className="shrink-0 tabular-nums">{formatRuneAmount(r.amount)}</span>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </>
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
            isConnected={!!adaAddress || adaWallets.length > 0}
            isAvailable={adaIsAvailable || adaWallets.length > 0}
            isLoading={adaLoading}
            error={adaError}
            onConnect={handleAdaConnect}
            onDisconnect={handleAdaDisconnect}
            onRefresh={handleAdaRefresh}
            onToggleAddress={() => setAdaShowMain((prev) => !prev)}
            isAddressVisible={adaShowMain}
          >
            <div className="space-y-3">
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
                        placeholder="Pesquisar carteira..."
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
                  placeholder="Endereço Cardano"
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
                        placeholder="Pesquisar rede..."
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
                          {item.network ?? "Cardano"}
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
                            {adaShown[addr] ? item.address : formatAddress(item.address)}
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
                            {balanceDisplay}{" "}
                            {balanceDisplay !== "A carregar..." && balanceDisplay !== "—"
                              ? "ADA"
                              : ""}
                          </p>
                        )}
                        {balanceDisplay != null && balanceDisplay !== "A carregar..." && balanceDisplay !== "—" && getFiatValue("ADA", balanceDisplay) != null ? (
                          <p className="text-slate-400">${getFiatValue("ADA", balanceDisplay)!.toFixed(2)}</p>
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
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">Carteira Cripto</h2>
              <p className="text-sm text-slate-400">
                Define o valor de compra e a data por ativo selecionado.
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Total</p>
              <p className="text-lg font-semibold text-white">
                €{" "}
                {cryptoManualTotal.toLocaleString("pt-PT", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
            </div>
          </div>

          {cryptoPricesError ? (
            <p className="mt-3 text-xs text-rose-300">{cryptoPricesError}</p>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <select
              value={cryptoSortKey}
              onChange={(event) => setCryptoSortKey(event.target.value as "date" | "marketCap")}
              className="rounded-full border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs font-semibold text-slate-200 outline-none"
            >
              <option value="date">Data de compra</option>
              <option value="marketCap">Market cap</option>
            </select>
            <button
              type="button"
              onClick={() => setCryptoSortDir((prev) => (prev === "asc" ? "desc" : "asc"))}
              className="rounded-full border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
            >
              {cryptoSortDir === "asc" ? "Asc" : "Desc"}
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <select
              value=""
              onChange={(event) => {
                const symbol = event.target.value;
                if (!symbol) return;
                toggleCryptoHolding(symbol);
              }}
              className="rounded-full border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs font-semibold text-slate-200 outline-none"
            >
              <option value="">Adicionar ativo</option>
              {marketRows
                .filter((row) => !cryptoHoldings[row.symbol])
                .slice(0, 50)
                .map((row) => (
                  <option key={row.symbol} value={row.symbol}>
                    {row.symbol} · {row.name}
                  </option>
                ))}
            </select>
          </div>

          <div className="mt-4 space-y-3">
            {sortedCryptoSymbols.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhum ativo selecionado.</p>
            ) : (
              sortedCryptoSymbols.map((symbol) => {
                const holding = cryptoHoldings[symbol] ?? {};
                const market = cryptoPrices[symbol];
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
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        placeholder="Valor de compra"
                        value={holding.buyValue ?? ""}
                        onChange={(event) => {
                          const value = event.target.value;
                          updateCryptoHolding(symbol, {
                            buyValue: value === "" ? undefined : Number(value),
                          });
                        }}
                        className="w-40 rounded-full border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-100 outline-none transition focus:border-orange-400"
                      />
                      <input
                        type="date"
                        value={holding.buyDate ?? ""}
                        onChange={(event) =>
                          updateCryptoHolding(symbol, { buyDate: event.target.value })
                        }
                        className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-100 outline-none transition focus:border-orange-400"
                      />
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
            <p className="mt-3 text-xs text-slate-500">A atualizar preços...</p>
          ) : null}
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
                  <option value="date">Data de compra</option>
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
                              <option value="1y">Anual</option>
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
                            title="Remover"
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
                  <span className="text-xs text-slate-400">A carregar...</span>
                ) : null}
              </div>
              {traditionalQuotesError ? (
                <p className="mt-2 text-xs text-rose-300">{traditionalQuotesError}</p>
              ) : null}
              <div className="mt-3 space-y-2">
                {selectedTraditionalAssets.length === 0 ? (
                  <p className="text-sm text-slate-500">Seleciona ativos para ver cotações.</p>
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
      </main>
    </div>
  );
}
