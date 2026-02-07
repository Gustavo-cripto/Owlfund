"use client";

import { useEffect, useMemo, useState } from "react";

import AppHeader from "@/components/AppHeader";
import WalletCard from "@/components/wallets/WalletCard";
import {
  connectMetaMask,
  getEthBalance,
  getEvmBalance,
  isMetaMaskAvailable,
  type EvmNetwork,
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
} from "@/lib/wallets/storage";
import { useRequireAuth } from "@/lib/auth/useRequireAuth";

type TraditionalQuote = {
  symbol: string;
  price: number | null;
  changePercent: number | null;
  volume: number | null;
  updatedAt?: string;
};

const evmNetworks: EvmNetwork[] = ["Ethereum", "Arbitrum", "Optimism", "Base", "Polygon"];
const traditionalCategories = ["Todos", "Ações", "ETFs", "Futuros", "Dívidas"];
const traditionalAssets = [
  { id: "AAPL", label: "Apple (AAPL)", category: "Ações", alphaSymbol: "AAPL" },
  { id: "MSFT", label: "Microsoft (MSFT)", category: "Ações", alphaSymbol: "MSFT" },
  { id: "NVDA", label: "Nvidia (NVDA)", category: "Ações", alphaSymbol: "NVDA" },
  { id: "TSLA", label: "Tesla (TSLA)", category: "Ações", alphaSymbol: "TSLA" },
  { id: "SPY", label: "S&P 500 (SPY)", category: "ETFs", alphaSymbol: "SPY" },
  { id: "QQQ", label: "Nasdaq 100 (QQQ)", category: "ETFs", alphaSymbol: "QQQ" },
  { id: "ARKK", label: "ARK Innovation (ARKK)", category: "ETFs", alphaSymbol: "ARKK" },
  { id: "GLD", label: "Ouro (GLD)", category: "ETFs", alphaSymbol: "GLD" },
  { id: "SLV", label: "Prata (SLV)", category: "ETFs", alphaSymbol: "SLV" },
  { id: "WTI", label: "Petróleo (WTI)", category: "Futuros" },
  { id: "BRENT", label: "Petróleo (Brent)", category: "Futuros" },
  { id: "NATGAS", label: "Gás natural", category: "Futuros" },
  { id: "UST10Y", label: "Treasuries 10Y", category: "Dívidas" },
  { id: "UST30Y", label: "Treasuries 30Y", category: "Dívidas" },
];

export default function WalletsPage() {
  useRequireAuth("/login");
  const [isClient, setIsClient] = useState(false);
  const [walletMode, setWalletMode] = useState<"web3" | "tradicional">("web3");
  const [traditionalSelection, setTraditionalSelection] = useState<string[]>([]);
  const [traditionalCategory, setTraditionalCategory] = useState("Todos");
  const [traditionalQuotes, setTraditionalQuotes] = useState<Record<string, TraditionalQuote>>({});
  const [traditionalQuotesLoading, setTraditionalQuotesLoading] = useState(false);
  const [traditionalQuotesError, setTraditionalQuotesError] = useState<string | null>(null);
  const [traditionalBuys, setTraditionalBuys] = useState<
    Record<string, { price?: string; date?: string }>
  >({});
  const [availability, setAvailability] = useState({
    metamask: false,
    phantom: false,
    xverse: false,
    eternl: false,
  });

  useEffect(() => {
    setIsClient(true);
    setAvailability({
      metamask: isMetaMaskAvailable(),
      phantom: isPhantomAvailable(),
      xverse: isXverseAvailable(),
      eternl: isEternlAvailable(),
    });
    const snapshot = loadWalletSnapshot();
    setEthWallets(snapshot.eth ?? []);
    setSolWallets(snapshot.sol ?? []);
    setBtcWallets(snapshot.btc ?? []);
    setAdaWallets(snapshot.ada ?? []);
  }, []);
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
    setTraditionalSelection((prev) =>
      prev.includes(assetId)
        ? prev.filter((item) => item !== assetId)
        : [...prev, assetId]
    );
  };

  const updateTraditionalBuy = (assetId: string, next: { price?: string; date?: string }) => {
    setTraditionalBuys((prev) => ({
      ...prev,
      [assetId]: {
        ...prev[assetId],
        ...next,
      },
    }));
  };

  const visibleTraditionalAssets =
    traditionalCategory === "Todos"
      ? traditionalAssets
      : traditionalAssets.filter((asset) => asset.category === traditionalCategory);

  const selectedTraditionalAssets = useMemo(
    () => traditionalAssets.filter((asset) => traditionalSelection.includes(asset.id)),
    [traditionalSelection]
  );

  const selectedQuoteSymbols = useMemo(
    () =>
      selectedTraditionalAssets
        .map((asset) => asset.alphaSymbol)
        .filter((symbol): symbol is string => typeof symbol === "string" && symbol.length > 0),
    [selectedTraditionalAssets]
  );

  useEffect(() => {
    if (walletMode !== "tradicional") return;
    if (selectedQuoteSymbols.length === 0) {
      setTraditionalQuotes({});
      setTraditionalQuotesError(null);
      return;
    }
    const symbols = selectedQuoteSymbols.join(",");
    setTraditionalQuotesLoading(true);
    setTraditionalQuotesError(null);
    fetch(`/api/traditional?symbols=${encodeURIComponent(symbols)}`)
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error ?? "Falha ao obter cotações.");
        }
        return response.json() as Promise<{ data: TraditionalQuote[] }>;
      })
      .then((payload) => {
        const next: Record<string, TraditionalQuote> = {};
        payload.data.forEach((quote) => {
          next[quote.symbol] = quote;
        });
        setTraditionalQuotes(next);
      })
      .catch((error) => {
        setTraditionalQuotesError(error instanceof Error ? error.message : "Erro ao obter dados.");
        setTraditionalQuotes({});
      })
      .finally(() => setTraditionalQuotesLoading(false));
  }, [walletMode, selectedQuoteSymbols]);

  const handleEthConnect = async () => {
    try {
      setEthLoading(true);
      setEthError(null);
      const address = await connectMetaMask();
      setEthAddress(address);
      const balance = await getEthBalance(address);
      const formatted = Number(balance).toFixed(4);
      setEthBalance(formatted);
      const nextWallets = upsertWallet(
        ethWallets,
        { address, balance: formatted, network: "Ethereum", label: "MetaMask" },
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

  const handleAddEthWallet = async () => {
    if (!ethNewAddress.trim()) {
      setEthNewError("Insere um endereço.");
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

  const handleSolConnect = async () => {
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

  const handleAddSolWallet = async () => {
    if (!solNewAddress.trim()) {
      setSolNewError("Insere um endereço.");
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

  const handleBtcConnect = async () => {
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

  const handleAddBtcWallet = async () => {
    if (!btcNewAddress.trim()) {
      setBtcNewError("Insere um endereço.");
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

  const handleAdaConnect = async () => {
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

  const handleAddAdaWallet = () => {
    if (!adaNewAddress.trim()) {
      setAdaNewError("Insere um endereço.");
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
          <div className="grid gap-6 md:grid-cols-2">
          <WalletCard
            title="Ethereum"
            description="MetaMask (ETH)"
            address={ethAddress}
            addressDisplay={ethShowMain ? ethAddress : formatAddress(ethAddress)}
            balance={ethBalance}
            balanceUnit="ETH"
            isConnected={!!ethAddress}
            isAvailable={ethIsAvailable}
            isLoading={ethLoading}
            error={ethError}
            onConnect={handleEthConnect}
            onRefresh={handleEthRefresh}
            onToggleAddress={() => setEthShowMain((prev) => !prev)}
            isAddressVisible={ethShowMain}
          >
            <div className="space-y-3">
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
            isConnected={!!solAddress}
            isAvailable={solIsAvailable}
            isLoading={solLoading}
            error={solError}
            onConnect={handleSolConnect}
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
            isConnected={!!btcAddress}
            isAvailable={btcIsAvailable}
            isLoading={btcLoading}
            error={btcError}
            onConnect={handleBtcConnect}
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
            isConnected={!!adaAddress}
            isAvailable={adaIsAvailable}
            isLoading={adaLoading}
            error={adaError}
            onConnect={handleAdaConnect}
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
                const checked = traditionalSelection.includes(asset.id);
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
                  onClick={() => setTraditionalSelection([])}
                  className="rounded-full border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
                >
                  Limpar seleção
                </button>
              </div>
              {selectedTraditionalAssets.length === 0 ? (
                <span className="mt-3 block text-sm text-slate-500">
                  Nenhum ativo selecionado.
                </span>
              ) : (
                <div className="mt-3 grid gap-3">
                  {selectedTraditionalAssets.map((asset) => {
                    const buy = traditionalBuys[asset.id] ?? {};
                    const quote = asset.alphaSymbol
                      ? traditionalQuotes[asset.alphaSymbol]
                      : undefined;
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
                            value={buy.price ?? ""}
                            onChange={(event) =>
                              updateTraditionalBuy(asset.id, { price: event.target.value })
                            }
                            className="w-40 rounded-full border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-100 outline-none transition focus:border-orange-400"
                          />
                          <input
                            type="date"
                            value={buy.date ?? ""}
                            onChange={(event) =>
                              updateTraditionalBuy(asset.id, { date: event.target.value })
                            }
                            className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-100 outline-none transition focus:border-orange-400"
                          />
                          <span className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-200">
                            Preço atual:{" "}
                            <span className="font-semibold text-white">
                              {quote?.price != null ? quote.price.toFixed(2) : "—"}
                            </span>
                          </span>
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
