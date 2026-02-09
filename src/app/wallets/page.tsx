"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import AppHeader from "@/components/AppHeader";
import WalletCard from "@/components/wallets/WalletCard";
import { createClient } from "@/lib/supabase/client";
import {
  connectEvmProvider,
  connectMetaMask,
  getEthBalance,
  getEvmBalance,
  getEvmProviderById,
  getEvmProviderLabel,
  getEvmProviderOptions,
  isMetaMaskAvailable,
  type EvmNetwork,
  type EvmProviderId,
} from "@/lib/wallets/evm";
import { connectPhantom, getSolBalance, isPhantomAvailable } from "@/lib/wallets/solana";
import {
  connectXverse,
  getBtcBalanceFromAddress,
  getBtcBalanceFromWallet,
  isXverseAvailable,
} from "@/lib/wallets/bitcoin";
import {
  connectEternl,
  getAdaBalance,
  isEternlAvailable,
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
  saveCryptoHoldings,
  type CryptoHoldings,
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

const evmNetworks: EvmNetwork[] = ["Ethereum", "Arbitrum", "Optimism", "Base", "Polygon"];

export default function WalletsPage() {
  const supabase = createClient();
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
  const [web3Prices, setWeb3Prices] = useState<Record<string, MarketRow>>({});
  const [web3PricesLoading, setWeb3PricesLoading] = useState(false);
  const [cryptoSortKey, setCryptoSortKey] = useState<"date" | "marketCap">("date");
  const [cryptoSortDir, setCryptoSortDir] = useState<"asc" | "desc">("desc");
  const [traditionalSortKey, setTraditionalSortKey] = useState<"date" | "marketCap">("date");
  const [traditionalSortDir, setTraditionalSortDir] = useState<"asc" | "desc">("desc");
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
  const [ethNewNetwork, setEthNewNetwork] = useState<EvmNetwork>("Ethereum");
  const [ethNewError, setEthNewError] = useState<string | null>(null);
  const [ethNewLoading, setEthNewLoading] = useState(false);
  const [ethShowMain, setEthShowMain] = useState(false);
  const [ethShown, setEthShown] = useState<Record<string, boolean>>({});

  const [solAddress, setSolAddress] = useState<string>();
  const [solBalance, setSolBalance] = useState<string>();
  const [solError, setSolError] = useState<string | null>(null);
  const [solLoading, setSolLoading] = useState(false);
  const [solWallets, setSolWallets] = useState<StoredWalletEntry[]>([]);
  const [solNewAddress, setSolNewAddress] = useState("");
  const [solNewError, setSolNewError] = useState<string | null>(null);
  const [solNewLoading, setSolNewLoading] = useState(false);
  const [solShowMain, setSolShowMain] = useState(false);
  const [solShown, setSolShown] = useState<Record<string, boolean>>({});

  const [btcAddress, setBtcAddress] = useState<string>();
  const [btcBalance, setBtcBalance] = useState<number | null>(null);
  const [btcError, setBtcError] = useState<string | null>(null);
  const [btcLoading, setBtcLoading] = useState(false);
  const [btcWallets, setBtcWallets] = useState<StoredWalletEntry[]>([]);
  const [btcNewAddress, setBtcNewAddress] = useState("");
  const [btcNewError, setBtcNewError] = useState<string | null>(null);
  const [btcNewLoading, setBtcNewLoading] = useState(false);
  const [btcShowMain, setBtcShowMain] = useState(false);
  const [btcShown, setBtcShown] = useState<Record<string, boolean>>({});

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
  const [defiTotals, setDefiTotals] = useState<Record<string, number | null>>({});
  const [defiLoading, setDefiLoading] = useState<Record<string, boolean>>({});
  const [defiErrors, setDefiErrors] = useState<Record<string, string | null>>({});
  const [evmProviders, setEvmProviders] = useState<Array<{ id: EvmProviderId; label: string }>>(
    []
  );
  const [selectedEvmProvider, setSelectedEvmProvider] = useState<EvmProviderId>("metamask");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const confirmRef = useRef<{
    title: string;
    description: string;
    onConfirm: () => Promise<void> | void;
  } | null>(null);

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
  }, []);

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
  }, []);

  useEffect(() => {
    setCryptoHoldings(loadCryptoHoldings());
  }, []);

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

  const fetchDefiTotal = async (address: string) => {
    if (!isEvmAddress(address)) {
      setDefiTotals((prev) => ({ ...prev, [address]: null }));
      return;
    }
    setDefiLoading((prev) => ({ ...prev, [address]: true }));
    setDefiErrors((prev) => ({ ...prev, [address]: null }));
    try {
      const response = await fetch(
        `https://openapi.debank.com/v1/user/protocol_list?id=${address}`
      );
      if (!response.ok) {
        throw new Error("Falha ao consultar DeFi.");
      }
      const payload = (await response.json()) as Array<{ net_usd_value?: number }>;
      const total = (payload ?? []).reduce((sum, item) => {
        const value = Number(item?.net_usd_value ?? 0);
        return Number.isFinite(value) ? sum + value : sum;
      }, 0);
      setDefiTotals((prev) => ({ ...prev, [address]: total }));
    } catch (error) {
      setDefiErrors((prev) => ({
        ...prev,
        [address]: error instanceof Error ? error.message : "Erro ao carregar DeFi.",
      }));
      setDefiTotals((prev) => ({ ...prev, [address]: null }));
    } finally {
      setDefiLoading((prev) => ({ ...prev, [address]: false }));
    }
  };

  useEffect(() => {
    if (!ethAddress) return;
    fetchDefiTotal(ethAddress);
  }, [ethAddress]);

  const refreshCryptoPrices = async () => {
    const symbols = Object.keys(cryptoHoldings);
    if (symbols.length === 0) {
      setCryptoPrices({});
      setCryptoPricesError(null);
      return;
    }
    setCryptoPricesLoading(true);
    setCryptoPricesError(null);
    try {
      const response = await fetch("/api/markets");
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Falha ao obter preços.");
      }
      const payload = (await response.json()) as { data?: MarketRow[] };
      setMarketRows(payload.data ?? []);
      const map: Record<string, MarketRow> = {};
      (payload.data ?? []).forEach((row) => {
        map[row.symbol] = row;
      });
      setCryptoPrices(map);
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

  const ethIsAvailable = isClient && (availability.metamask || ethWallets.length > 0);
  const solIsAvailable = isClient && (availability.phantom || solWallets.length > 0);
  const btcIsAvailable = isClient && (availability.xverse || btcWallets.length > 0);
  const adaIsAvailable = isClient && (availability.eternl || adaWallets.length > 0);

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
      saveTraditionalHoldings(next);
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
      saveTraditionalHoldings(nextHoldings);
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
      saveCryptoHoldings(next);
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
      saveCryptoHoldings(nextHoldings);
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
      const address = selectedProvider
        ? await connectEvmProvider(selectedProvider)
        : await connectMetaMask();
      setEthAddress(address);
      const balance = await getEthBalance(address);
      const formatted = Number(balance).toFixed(4);
      setEthBalance(formatted);
      const label = getEvmProviderLabel(selectedEvmProvider);
      const nextWallets = upsertWallet(
        ethWallets,
        { address, balance: formatted, network: "Ethereum", label },
        (item) => item.address === address && item.network === "Ethereum"
      );
      setEthWallets(nextWallets);
      updateWalletSnapshot({ eth: nextWallets });
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
    if (!ethAddress) return;
    try {
      setEthLoading(true);
      const balance = await getEthBalance(ethAddress as `0x${string}`);
      const formatted = Number(balance).toFixed(4);
      setEthBalance(formatted);
      const nextWallets = upsertWallet(
        ethWallets,
        { address: ethAddress, balance: formatted, network: "Ethereum", label: "MetaMask" },
        (item) => item.address === ethAddress && item.network === "Ethereum"
      );
      setEthWallets(nextWallets);
      updateWalletSnapshot({ eth: nextWallets });
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
    updateWalletSnapshot({ eth: nextWallets });
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
    try {
      setEthNewLoading(true);
      setEthNewError(null);
      const balance = await getEvmBalance(ethNewAddress as `0x${string}`, ethNewNetwork);
      const formatted = Number(balance).toFixed(4);
      const nextWallets = upsertWallet(
        ethWallets,
        { address: ethNewAddress, balance: formatted, network: ethNewNetwork },
        (item) => item.address === ethNewAddress && item.network === ethNewNetwork
      );
      setEthWallets(nextWallets);
      updateWalletSnapshot({ eth: nextWallets });
      setEthNewAddress("");
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
      const address = await connectPhantom();
      setSolAddress(address);
      const balance = await getSolBalance(address);
      setSolBalance(balance);
      const nextWallets = upsertWallet(
        solWallets,
        { address, balance, network: "Solana" },
        (item) => item.address === address
      );
      setSolWallets(nextWallets);
      updateWalletSnapshot({ sol: nextWallets });
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
    if (!solAddress) return;
    try {
      setSolLoading(true);
      const balance = await getSolBalance(solAddress);
      setSolBalance(balance);
      const nextWallets = upsertWallet(
        solWallets,
        { address: solAddress, balance, network: "Solana" },
        (item) => item.address === solAddress
      );
      setSolWallets(nextWallets);
      updateWalletSnapshot({ sol: nextWallets });
    } catch (error) {
      setSolError(error instanceof Error ? error.message : "Erro ao atualizar saldo.");
    } finally {
      setSolLoading(false);
    }
  };

  const handleSolDisconnect = () => {
    if (!solAddress) return;
    const nextWallets = removeWallet(solWallets, (item) => item.address === solAddress);
    setSolWallets(nextWallets);
    setSolAddress(undefined);
    setSolBalance(undefined);
    setSolError(null);
    updateWalletSnapshot({ sol: nextWallets });
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
    try {
      setSolNewLoading(true);
      setSolNewError(null);
      const balance = await getSolBalance(solNewAddress);
      const nextWallets = upsertWallet(
        solWallets,
        { address: solNewAddress, balance, network: "Solana" },
        (item) => item.address === solNewAddress
      );
      setSolWallets(nextWallets);
      updateWalletSnapshot({ sol: nextWallets });
      setSolNewAddress("");
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
        updateWalletSnapshot({ btc: nextWallets });
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
      updateWalletSnapshot({ btc: nextWallets });
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
    if (!btcAddress) return;
    try {
      setBtcLoading(true);
      const walletBalance = await getBtcBalanceFromWallet();
      if (walletBalance !== null) {
        setBtcBalance(walletBalance);
        const nextWallets = upsertWallet(
          btcWallets,
          { address: btcAddress, balance: walletBalance.toFixed(8), network: "Bitcoin" },
          (item) => item.address === btcAddress
        );
        setBtcWallets(nextWallets);
        updateWalletSnapshot({ btc: nextWallets });
        return;
      }
      const apiBalance = await getBtcBalanceFromAddress(btcAddress);
      setBtcBalance(apiBalance);
      const nextWallets = upsertWallet(
        btcWallets,
        { address: btcAddress, balance: apiBalance.toFixed(8), network: "Bitcoin" },
        (item) => item.address === btcAddress
      );
      setBtcWallets(nextWallets);
      updateWalletSnapshot({ btc: nextWallets });
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
    updateWalletSnapshot({ btc: nextWallets });
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
    try {
      setBtcNewLoading(true);
      setBtcNewError(null);
      const balance = await getBtcBalanceFromAddress(btcNewAddress);
      const nextWallets = upsertWallet(
        btcWallets,
        { address: btcNewAddress, balance: balance.toFixed(8), network: "Bitcoin" },
        (item) => item.address === btcNewAddress
      );
      setBtcWallets(nextWallets);
      updateWalletSnapshot({ btc: nextWallets });
      setBtcNewAddress("");
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
      const { api, address } = await connectEternl();
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
      updateWalletSnapshot({ ada: nextWallets });
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
    if (!adaApi) return;
    try {
      setAdaLoading(true);
      const balance = await getAdaBalance(adaApi);
      setAdaBalance(balance);
      if (adaAddress) {
        const nextWallets = upsertWallet(
          adaWallets,
          { address: adaAddress, balance, network: "Cardano" },
          (item) => item.address === adaAddress
        );
        setAdaWallets(nextWallets);
        updateWalletSnapshot({ ada: nextWallets });
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
    updateWalletSnapshot({ ada: nextWallets });
  };

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

    refreshAll();
    const id = window.setInterval(refreshAll, 60000);
    return () => window.clearInterval(id);
  }, [walletMode, ethAddress, solAddress, btcAddress, adaApi]);

  const handleAddAdaWalletInternal = () => {
    if (!adaNewAddress.trim()) {
      setAdaNewError("Insere um endereço.");
      return;
    }
    if (!isAdaAddress(adaNewAddress.trim())) {
      setAdaNewError("Endereço Cardano inválido.");
      return;
    }
    const nextWallets = upsertWallet(
      adaWallets,
      { address: adaNewAddress, network: "Cardano" },
      (item) => item.address === adaNewAddress
    );
    setAdaWallets(nextWallets);
    updateWalletSnapshot({ ada: nextWallets });
    setAdaNewAddress("");
    setAdaNewError("Saldo só disponível via carteira conectada.");
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
        <div className="grid gap-6 md:grid-cols-2">
          <WalletCard
            title="Ethereum"
            description="MetaMask (ETH)"
            address={ethAddress}
            addressDisplay={ethShowMain ? ethAddress : formatAddress(ethAddress)}
            balance={ethBalance}
            balanceUnit="ETH"
            fiatValueUsd={getFiatValue("ETH", ethBalance)}
            defiBalanceUsd={ethAddress ? defiTotals[ethAddress] ?? null : null}
            defiLoading={ethAddress ? !!defiLoading[ethAddress] : false}
            defiError={ethAddress ? defiErrors[ethAddress] ?? null : null}
            isConnected={!!ethAddress}
            isAvailable={ethIsAvailable}
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
                <select
                  className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-1 text-xs text-slate-200 outline-none"
                  value={selectedEvmProvider}
                  onChange={(event) => setSelectedEvmProvider(event.target.value as EvmProviderId)}
                >
                  {(evmProviders.length ? evmProviders : [{ id: "metamask", label: "MetaMask" }]).map(
                    (option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    )
                  )}
                </select>
              </div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                Carteiras adicionais / L2
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
                  onChange={(event) => setEthNewNetwork(event.target.value as EvmNetwork)}
                >
                  {evmNetworks.map((network) => (
                    <option key={network} value={network}>
                      {network}
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
              {ethNewError ? <p className="text-xs text-rose-300">{ethNewError}</p> : null}
              <div className="space-y-2">
                {ethWallets
                  .filter((item) => item.address !== ethAddress || item.network !== "Ethereum")
                  .map((item) => (
                    <div
                      key={`${item.address}-${item.network}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-300"
                    >
                      <div className="space-y-1">
                        <p className="font-semibold text-white">
                          {item.network ?? "Ethereum"}
                        </p>
                        <div className="flex items-center gap-2">
                          <p className="text-slate-500">
                            {ethShown[item.address ?? ""] ? item.address : formatAddress(item.address)}
                          </p>
                          <button
                            type="button"
                            onClick={() =>
                              setEthShown((prev) => ({
                                ...prev,
                                [item.address ?? ""]: !prev[item.address ?? ""],
                              }))
                            }
                            className="rounded-full border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
                            title={ethShown[item.address ?? ""] ? "Ocultar" : "Mostrar"}
                          >
                            {ethShown[item.address ?? ""] ? "🙈" : "👁️"}
                          </button>
                        </div>
                      </div>
                      <div className="text-right">
                        <p>
                          {item.balance ?? "—"} {item.balance ? "ETH" : ""}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-2">
                          <button
                            className="rounded-full border border-slate-700 px-3 py-1 text-[11px] font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
                            type="button"
                            onClick={async () => {
                              if (!item.address) return;
                              const balance = await getEvmBalance(
                                item.address as `0x${string}`,
                                (item.network as EvmNetwork) ?? "Ethereum"
                              );
                              const formatted = Number(balance).toFixed(4);
                              const nextWallets = upsertWallet(
                                ethWallets,
                                { ...item, balance: formatted },
                                (entry) =>
                                  entry.address === item.address &&
                                  entry.network === item.network
                              );
                              setEthWallets(nextWallets);
                              updateWalletSnapshot({ eth: nextWallets });
                            }}
                          >
                            Atualizar
                          </button>
                          <button
                            className="rounded-full border border-rose-400/40 px-3 py-1 text-[11px] font-semibold text-rose-200 transition hover:border-rose-400 hover:text-white"
                            type="button"
                            onClick={() => {
                              const nextWallets = removeWallet(
                                ethWallets,
                                (entry) =>
                                  entry.address === item.address &&
                                  entry.network === item.network
                              );
                              setEthWallets(nextWallets);
                              updateWalletSnapshot({ eth: nextWallets });
                            }}
                          >
                            Remover
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </WalletCard>
          <WalletCard
            title="Solana"
            description="Phantom (SOL)"
            address={solAddress}
            addressDisplay={solShowMain ? solAddress : formatAddress(solAddress)}
            balance={solBalance}
            balanceUnit="SOL"
            fiatValueUsd={getFiatValue("SOL", solBalance)}
            isConnected={!!solAddress}
            isAvailable={solIsAvailable}
            isLoading={solLoading}
            error={solError}
            onConnect={handleSolConnect}
            onDisconnect={handleSolDisconnect}
            onRefresh={handleSolRefresh}
            onToggleAddress={() => setSolShowMain((prev) => !prev)}
            isAddressVisible={solShowMain}
          >
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                Carteiras adicionais
              </p>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <input
                  className="w-full rounded-full border border-slate-800 bg-slate-950/60 px-4 py-2 text-xs text-slate-200 outline-none transition focus:border-orange-400"
                  placeholder="Endereço Solana"
                  value={solNewAddress}
                  onChange={(event) => setSolNewAddress(event.target.value)}
                />
                <button
                  type="button"
                  className="rounded-full border border-orange-400/40 px-4 py-2 text-xs font-semibold text-orange-200 transition hover:border-orange-400 hover:text-white disabled:opacity-60"
                  onClick={handleAddSolWallet}
                  disabled={solNewLoading}
                >
                  {solNewLoading ? "A adicionar..." : "Adicionar"}
                </button>
              </div>
              {solNewError ? <p className="text-xs text-rose-300">{solNewError}</p> : null}
              <div className="space-y-2">
                {solWallets
                  .filter((item) => item.address !== solAddress)
                  .map((item) => (
                    <div
                      key={item.address}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-300"
                    >
                      <div className="space-y-1">
                        <p className="font-semibold text-white">Solana</p>
                        <div className="flex items-center gap-2">
                          <p className="text-slate-500">
                            {solShown[item.address ?? ""] ? item.address : formatAddress(item.address)}
                          </p>
                          <button
                            type="button"
                            onClick={() =>
                              setSolShown((prev) => ({
                                ...prev,
                                [item.address ?? ""]: !prev[item.address ?? ""],
                              }))
                            }
                            className="rounded-full border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
                            title={solShown[item.address ?? ""] ? "Ocultar" : "Mostrar"}
                          >
                            {solShown[item.address ?? ""] ? "🙈" : "👁️"}
                          </button>
                        </div>
                      </div>
                      <div className="text-right">
                        <p>
                          {item.balance ?? "—"} {item.balance ? "SOL" : ""}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-2">
                          <button
                            className="rounded-full border border-slate-700 px-3 py-1 text-[11px] font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
                            type="button"
                            onClick={async () => {
                              if (!item.address) return;
                              const balance = await getSolBalance(item.address);
                              const nextWallets = upsertWallet(
                                solWallets,
                                { ...item, balance },
                                (entry) => entry.address === item.address
                              );
                              setSolWallets(nextWallets);
                              updateWalletSnapshot({ sol: nextWallets });
                            }}
                          >
                            Atualizar
                          </button>
                          <button
                            className="rounded-full border border-rose-400/40 px-3 py-1 text-[11px] font-semibold text-rose-200 transition hover:border-rose-400 hover:text-white"
                            type="button"
                            onClick={() => {
                              const nextWallets = removeWallet(
                                solWallets,
                                (entry) => entry.address === item.address
                              );
                              setSolWallets(nextWallets);
                              updateWalletSnapshot({ sol: nextWallets });
                            }}
                          >
                            Remover
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </WalletCard>
          <WalletCard
            title="Bitcoin"
            description="Xverse (BTC)"
            address={btcAddress}
            addressDisplay={btcShowMain ? btcAddress : formatAddress(btcAddress)}
            balance={btcBalance !== null ? btcBalance.toFixed(8) : null}
            balanceUnit="BTC"
            fiatValueUsd={getFiatValue("BTC", btcBalance)}
            isConnected={!!btcAddress}
            isAvailable={btcIsAvailable}
            isLoading={btcLoading}
            error={btcError}
            onConnect={handleBtcConnect}
            onDisconnect={handleBtcDisconnect}
            onRefresh={handleBtcRefresh}
            allowConnectWhenUnavailable
            onToggleAddress={() => setBtcShowMain((prev) => !prev)}
            isAddressVisible={btcShowMain}
          >
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                Carteiras adicionais
              </p>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <input
                  className="w-full rounded-full border border-slate-800 bg-slate-950/60 px-4 py-2 text-xs text-slate-200 outline-none transition focus:border-orange-400"
                  placeholder="Endereço BTC"
                  value={btcNewAddress}
                  onChange={(event) => setBtcNewAddress(event.target.value)}
                />
                <button
                  type="button"
                  className="rounded-full border border-orange-400/40 px-4 py-2 text-xs font-semibold text-orange-200 transition hover:border-orange-400 hover:text-white disabled:opacity-60"
                  onClick={handleAddBtcWallet}
                  disabled={btcNewLoading}
                >
                  {btcNewLoading ? "A adicionar..." : "Adicionar"}
                </button>
              </div>
              {btcNewError ? <p className="text-xs text-rose-300">{btcNewError}</p> : null}
              <div className="space-y-2">
                {btcWallets
                  .filter((item) => item.address !== btcAddress)
                  .map((item) => (
                    <div
                      key={item.address}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-300"
                    >
                      <div className="space-y-1">
                        <p className="font-semibold text-white">Bitcoin</p>
                        <div className="flex items-center gap-2">
                          <p className="text-slate-500">
                            {btcShown[item.address ?? ""] ? item.address : formatAddress(item.address)}
                          </p>
                          <button
                            type="button"
                            onClick={() =>
                              setBtcShown((prev) => ({
                                ...prev,
                                [item.address ?? ""]: !prev[item.address ?? ""],
                              }))
                            }
                            className="rounded-full border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
                            title={btcShown[item.address ?? ""] ? "Ocultar" : "Mostrar"}
                          >
                            {btcShown[item.address ?? ""] ? "🙈" : "👁️"}
                          </button>
                        </div>
                      </div>
                      <div className="text-right">
                        <p>
                          {item.balance ?? "—"} {item.balance ? "BTC" : ""}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-2">
                          <button
                            className="rounded-full border border-slate-700 px-3 py-1 text-[11px] font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
                            type="button"
                            onClick={async () => {
                              if (!item.address) return;
                              const balance = await getBtcBalanceFromAddress(item.address);
                              const nextWallets = upsertWallet(
                                btcWallets,
                                { ...item, balance: balance.toFixed(8) },
                                (entry) => entry.address === item.address
                              );
                              setBtcWallets(nextWallets);
                              updateWalletSnapshot({ btc: nextWallets });
                            }}
                          >
                            Atualizar
                          </button>
                          <button
                            className="rounded-full border border-rose-400/40 px-3 py-1 text-[11px] font-semibold text-rose-200 transition hover:border-rose-400 hover:text-white"
                            type="button"
                            onClick={() => {
                              const nextWallets = removeWallet(
                                btcWallets,
                                (entry) => entry.address === item.address
                              );
                              setBtcWallets(nextWallets);
                              updateWalletSnapshot({ btc: nextWallets });
                            }}
                          >
                            Remover
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </WalletCard>
          <WalletCard
            title="Cardano"
            description="Eternl (ADA)"
            address={adaAddress}
            addressDisplay={adaShowMain ? adaAddress : formatAddress(adaAddress)}
            balance={adaBalance}
            balanceUnit="ADA"
            fiatValueUsd={getFiatValue("ADA", adaBalance)}
            isConnected={!!adaAddress}
            isAvailable={adaIsAvailable}
            isLoading={adaLoading}
            error={adaError}
            onConnect={handleAdaConnect}
            onDisconnect={handleAdaDisconnect}
            onRefresh={handleAdaRefresh}
            onToggleAddress={() => setAdaShowMain((prev) => !prev)}
            isAddressVisible={adaShowMain}
          >
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                Carteiras adicionais
              </p>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <input
                  className="w-full rounded-full border border-slate-800 bg-slate-950/60 px-4 py-2 text-xs text-slate-200 outline-none transition focus:border-orange-400"
                  placeholder="Endereço Cardano"
                  value={adaNewAddress}
                  onChange={(event) => setAdaNewAddress(event.target.value)}
                />
                <button
                  type="button"
                  className="rounded-full border border-orange-400/40 px-4 py-2 text-xs font-semibold text-orange-200 transition hover:border-orange-400 hover:text-white"
                  onClick={handleAddAdaWallet}
                >
                  Adicionar
                </button>
              </div>
              {adaNewError ? <p className="text-xs text-rose-300">{adaNewError}</p> : null}
              <div className="space-y-2">
                {adaWallets
                  .filter((item) => item.address !== adaAddress)
                  .map((item) => (
                    <div
                      key={item.address}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-300"
                    >
                      <div className="space-y-1">
                        <p className="font-semibold text-white">Cardano</p>
                        <div className="flex items-center gap-2">
                          <p className="text-slate-500">
                            {adaShown[item.address ?? ""] ? item.address : formatAddress(item.address)}
                          </p>
                          <button
                            type="button"
                            onClick={() =>
                              setAdaShown((prev) => ({
                                ...prev,
                                [item.address ?? ""]: !prev[item.address ?? ""],
                              }))
                            }
                            className="rounded-full border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
                            title={adaShown[item.address ?? ""] ? "Ocultar" : "Mostrar"}
                          >
                            {adaShown[item.address ?? ""] ? "🙈" : "👁️"}
                          </button>
                        </div>
                      </div>
                      <div className="text-right">
                        <p>{item.balance ?? "—"} {item.balance ? "ADA" : ""}</p>
                        <button
                          className="mt-1 rounded-full border border-rose-400/40 px-3 py-1 text-[11px] font-semibold text-rose-200 transition hover:border-rose-400 hover:text-white"
                          type="button"
                          onClick={() => {
                            const nextWallets = removeWallet(
                              adaWallets,
                              (entry) => entry.address === item.address
                            );
                            setAdaWallets(nextWallets);
                            updateWalletSnapshot({ ada: nextWallets });
                          }}
                        >
                          Remover
                        </button>
                      </div>
                    </div>
                  ))}
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
                    saveTraditionalHoldings({});
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
