"use client";

import { useCallback, useEffect, useMemo, useRef, useState, startTransition } from "react";
import { repetirVisivel, DOIS_MIN, TRES_MIN } from "@/lib/polling";
import { userError } from "@/lib/ui/userError";
import ErrorNote from "@/components/ErrorNote";
import { parseDecimal } from "@/lib/format/decimal";
import { FREE_WALLET_LIMIT } from "@/lib/plans";
import { detetarRede } from "@/lib/wallets/detetarRede";

import AppShell from "@/components/AppShell";
import { nativeSymbolOf, networkKey } from "@/lib/wallets/networkKey";
import { useConfirm } from "@/components/ConfirmDialog";
import CexSection from "@/components/wallets/CexSection";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useCurrencyFormat } from "@/lib/theme/ThemeContext";
import WalletCard from "@/components/wallets/WalletCard";
import { propsCartaoAda, propsCartaoBtc, propsCartaoEth, propsCartaoSol } from "@/lib/wallets/cartoes";
import { criarMoneyField, criarQtyField } from "@/components/wallets/camposNumero";
import { remocaoEth, remocaoPorEndereco, remocaoSol, semChave } from "@/lib/wallets/remover";
import { aposFalha, leituraRecente, valorDoSaldo } from "@/lib/wallets/saldos";
// Blocos de apresentacao da pagina (fase 1 da divisao): recebem tudo por props.
import CabecalhoCarteiras from "@/components/wallets/CabecalhoCarteiras";
import ConfirmacaoModal from "@/components/wallets/ConfirmacaoModal";
import OutrasRedesSecao from "@/components/wallets/OutrasRedesSecao";
import EthSeletores from "@/components/wallets/EthSeletores";
import EthAdicionar from "@/components/wallets/EthAdicionar";
import EthCarteirasLista from "@/components/wallets/EthCarteirasLista";
import SolSeletores from "@/components/wallets/SolSeletores";
import SolAdicionar from "@/components/wallets/SolAdicionar";
import SolCarteirasLista from "@/components/wallets/SolCarteirasLista";
import BtcSeletor from "@/components/wallets/BtcSeletor";
import BtcRunesResumo from "@/components/wallets/BtcRunesResumo";
import BtcAdicionar from "@/components/wallets/BtcAdicionar";
import BtcCarteirasLista from "@/components/wallets/BtcCarteirasLista";
import AdaAjudaLigacao from "@/components/wallets/AdaAjudaLigacao";
import AdaSeletor from "@/components/wallets/AdaSeletor";
import AdaAdicionar from "@/components/wallets/AdaAdicionar";
import AdaCarteirasLista from "@/components/wallets/AdaCarteirasLista";
import CriptoResumoTotais from "@/components/wallets/CriptoResumoTotais";
import CarteirasLigadasLinhas from "@/components/wallets/CarteirasLigadasLinhas";
import StablecoinLinhas from "@/components/wallets/StablecoinLinhas";
import OutrasRedesLinhas from "@/components/wallets/OutrasRedesLinhas";
import AtivosManuaisLista from "@/components/wallets/AtivosManuaisLista";
import HistoricoTransacoesCta from "@/components/wallets/HistoricoTransacoesCta";
import AdicionarTickerManual from "@/components/wallets/AdicionarTickerManual";
import TradicionalCabecalho from "@/components/wallets/TradicionalCabecalho";
import CategoriasTradicionais from "@/components/wallets/CategoriasTradicionais";
import TradicionaisSelecionados from "@/components/wallets/TradicionaisSelecionados";
import DadosMercadoTradicional from "@/components/wallets/DadosMercadoTradicional";
import EnderecoManualSecao from "@/components/wallets/EnderecoManualSecao";
import AtivoCriptoManualSecao from "@/components/wallets/AtivoCriptoManualSecao";
import StablecoinsSecao from "@/components/wallets/StablecoinsSecao";
import CexHardwareProAviso from "@/components/wallets/CexHardwareProAviso";
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
  CARDANO_LABELS,
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
} from "@/lib/wallets/storage";
import { pushWalletCloud, pullWalletCloud } from "@/lib/portfolios/cloudSync";
import { useRequireAuth } from "@/lib/auth/useRequireAuth";
import { traditionalAssets } from "@/lib/traditional/assets";
import {
  hasQuantity,
  loadTraditionalHoldings,
  saveTraditionalHoldings,
  traditionalHoldingValueEur,
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
import { getAllowedHosts, isAdaAddress, isBtcAddress, isEvmAddress, isSolAddress, sanitizeLabel } from "@/lib/wallets/validar";
import {
  adaNetworkOptions,
  btcNetworkOptions,
  btcWalletOptions,
  MANUAL_ADD_NETWORKS,
  MANUAL_ADD_TO_EVM_NETWORK,
  MANUAL_ADD_TO_SOL_NETWORK,
  solWalletOptions,
  type BtcWalletId,
} from "@/lib/wallets/opcoes";
import {
  defiKey,
  ethBalanceKey,
  fiatValue,
  formatRuneAmount as formatRuneAmountIn,
  networkToMoralisChain,
  normalizeChain,
  removeWallet,
  upsertWallet,
  type DefiChain,
} from "@/lib/wallets/formatar";
import { quotePriceEurFrom } from "@/lib/wallets/totais";
import type { MarketRow, TraditionalQuote } from "@/lib/wallets/tipos";
import type { PosicaoDefi } from "@/lib/defi/posicoes";

type SubscriptionStatus = {
  status: string;
  current_period_end: string | null;
};

export default function WalletsPage() {
  const supabase = useMemo(() => createClient(), []);
  useRequireAuth("/login");
  const { t } = useLanguage();
  // Erros das libs de carteiras (codigo estavel) → texto traduzido; ver src/lib/wallets/errors.ts
  const walletCodes = useMemo(() => ({ provider_missing: t("wl_e_provider_missing"), no_account: t("wl_e_no_account"), not_found: t("wl_e_not_found"), not_configured: t("wl_e_not_configured") }), [t]);
  // Os rotulos das redes BTC sao tambem o nome com que a carteira fica guardada,
  // por isso a traducao acontece so na apresentacao.
  const btcNetLabel = (id: string) =>
    id === "lightning" ? `Lightning (${t("wl_soon")})`
      : id === "outro" ? t("wl_btc_other")
        : btcNetworkOptions.find((o) => o.id === id)?.label ?? "Bitcoin";
  const askConfirm = useConfirm();
  const { currency: curCode, rate: curRate, hideBalances, rates: fxRates, numberFormat } = useCurrencyFormat();
  // Esconde qualquer saldo/quantidade/NFT quando a opção "esconder saldos" está ativa.
  const maskBal = (node: React.ReactNode): React.ReactNode => (hideBalances ? "••••" : node);
  const [isClient, setIsClient] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [isPro, setIsPro] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
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
  // O mesmo que a ref, mas como estado: os efeitos que gravam totais no
  // snapshot tem de voltar a correr quando a hidratacao (pull da nuvem) acaba.
  const [hidratado, setHidratado] = useState(false);
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
  // Posições DeFi de cada carteira (protocolo, par, intervalo, abertas e fechadas).
  const [defiPosicoes, setDefiPosicoes] = useState<Record<string, PosicaoDefi[]>>({});
  // Marca os totais que só cobrem os protocolos lidos na cadeia (a Moralis está
  // parada): um €0 com esta marca quer dizer "não vimos nada no que conseguimos ler".
  const [defiPartial, setDefiPartial] = useState<Record<string, boolean>>({});
  const [nftPartial, setNftPartial] = useState<Record<string, boolean>>({});
  const [cexHlTotalUsd, setCexHlTotalUsd] = useState(0);
  const [usdToEurRate, setUsdToEurRate] = useState(0.92);
  const [defiLoading, setDefiLoading] = useState<Record<string, boolean>>({});
  const [defiErrors, setDefiErrors] = useState<Record<string, string | null>>({});
  const [nftCounts, setNftCounts] = useState<Record<string, number>>({});
  const [nftLoading, setNftLoading] = useState<Record<string, boolean>>({});
  const [nftErrors, setNftErrors] = useState<Record<string, string | null>>({});
  const [nftsByKey, setNftsByKey] = useState<Record<string, Array<{ id: string; name: string; image?: string; tokenUri?: string; tokenAddress?: string; tokenId?: string }>>>({});
  // Tokens (ERC-20 / SPL) por endereço cold — para mostrar wETH etc. e somar ao portefólio.
  type ColdToken = { address: string; symbol: string; name: string; logo?: string; balance: string; usdValue: number; usdPrice: number; chain: string; network?: string };
  const [coldTokensByAddr, setColdTokensByAddr] = useState<Record<string, ColdToken[]>>({});
  const [coldTokensLoading, setColdTokensLoading] = useState<Record<string, boolean>>({});
  // Erro por carteira ao ler tokens (Alchemy/Helius 429/503, sessao a expirar).
  // Antes era engolido e a carteira aparecia "sem tokens" — logo depois de a
  // demonstracao os ter mostrado. O resultado anterior fica; so se marca o erro.
  const [coldTokensError, setColdTokensError] = useState<Record<string, string>>({});
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
  // Ethereum por omissao (era Solana); e a rede muda sozinha quando se cola um endereco.
  const [manualAddNetwork, setManualAddNetwork] = useState<string>("eth");
  // Campo rapido do topo (so para quem ainda nao tem carteiras).
  const [quickAddr, setQuickAddr] = useState("");
  const [quickMsg, setQuickMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [manualAddNetworkOpen, setManualAddNetworkOpen] = useState(false);
  const [manualAddNetworkFilter, setManualAddNetworkFilter] = useState("");
  const manualAddNetworkRef = useRef<HTMLDivElement>(null);
  const [manualAddAddress, setManualAddAddress] = useState("");
  const [manualAddLabel, setManualAddLabel] = useState("");
  const [manualAddError, setManualAddError] = useState<string | null>(null);
  const [manualAddOk, setManualAddOk] = useState<string | null>(null);
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
    const computeAvailability = () => {
      setAvailability({
        metamask: isMetaMaskAvailable(),
        phantom: isPhantomAvailable(),
        xverse: isXverseAvailable(),
        eternl: isEternlAvailable(),
      });
      setEvmProviders(getEvmProviderOptions());
    };
    computeAvailability();
    // As extensões injetam-se muitas vezes DEPOIS do mount do React → sem isto
    // o card ficava "Indisponível" até um refresh com sorte. Re-verificamos
    // quando a carteira se anuncia (EIP-6963/MetaMask), ao focar a janela e
    // nuns retries curtos.
    window.addEventListener("eip6963:announceProvider", computeAvailability);
    window.addEventListener("ethereum#initialized", computeAvailability);
    window.addEventListener("focus", computeAvailability);
    try { window.dispatchEvent(new Event("eip6963:requestProvider")); } catch { /* ignore */ }
    const retries = [500, 1500, 3500].map((ms) => setTimeout(computeAvailability, ms));
    // Sincroniza SEMPRE com a nuvem (funde o registo de contas + preenche dados
    // em falta, sem sobrescrever os locais) ANTES de hidratar — para as contas
    // aparecerem em todos os dispositivos e não fazer push antes do merge.
    pullWalletCloud()
      .catch(() => false)
      .then((restored) => {
        const d = loadWalletSnapshot();
        setEthWallets((d.eth ?? []) as typeof ethWallets);
        setSolWallets((d.sol ?? []) as typeof solWallets);
        setBtcWallets((d.btc ?? []) as typeof btcWallets);
        setAdaWallets((d.ada ?? []) as typeof adaWallets);
        setOtherWallets((d.other ?? []) as typeof otherWallets);
        // Re-ler SEMPRE (e nao so quando veio algo da nuvem): o pull tambem
        // limpa dados de outra pessoa neste browser e pode trocar a conta
        // ativa; o que se leu no arranque pode ja nao ser desta conta.
        void restored;
        setTraditionalHoldings(loadTraditionalHoldings());
        setCryptoHoldings(loadCryptoHoldings());
        setStablecoinEntries(loadStablecoinEntries());
        walletsHydratedRef.current = true;
        setHidratado(true);
        // Após o merge, envia o estado local para a nuvem — garante que a app
        // mobile (e outros dispositivos) veem os dados mesmo sem edições novas.
        pushWalletCloud();
      });

    return () => {
      window.removeEventListener("eip6963:announceProvider", computeAvailability);
      window.removeEventListener("ethereum#initialized", computeAvailability);
      window.removeEventListener("focus", computeAvailability);
      retries.forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    if (!walletsHydratedRef.current) return;
    const id = window.setTimeout(() => {
      const snap = { eth: ethWallets, sol: solWallets, btc: btcWallets, ada: adaWallets, other: otherWallets };
      updateWalletSnapshot(snap);
      // Sync to cloud so other devices stay in sync (todas as contas)
      pushWalletCloud();
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
    // So depois da hidratacao: ao abrir, o estado ainda e a lista vazia inicial
    // e grava-la apagava (por instantes) as stablecoins guardadas e renovava o
    // carimbo, impedindo que a versao da nuvem fosse adotada.
    if (!hidratado) return;
    saveStablecoinEntries(stablecoinEntries);
    pushWalletCloud();
  }, [hidratado, stablecoinEntries]);

  useEffect(() => {
    if (!traditionalHydratedRef.current) return;
    const id = window.setTimeout(() => { saveTraditionalHoldings(traditionalHoldings); if (walletsHydratedRef.current) pushWalletCloud(); }, 120);
    return () => window.clearTimeout(id);
  }, [traditionalHoldings]);

  useEffect(() => {
    if (!cryptoHydratedRef.current) return;
    const id = window.setTimeout(() => { saveCryptoHoldings(cryptoHoldings); if (walletsHydratedRef.current) pushWalletCloud(); }, 120);
    return () => window.clearTimeout(id);
  }, [cryptoHoldings]);

  // Nota (auditoria set 2026): aqui viviam dois efeitos que ja nao existem.
  // (1) loadCloudSnapshot copiava as carteiras E os saldos CEX/DeFi do ultimo
  //     snapshot (de qualquer conta) para a conta ativa quando esta estava vazia
  //     — uma conta nova herdava tudo da anterior e ficava a contar a dobrar na
  //     vista "Todas". A nuvem por conta e o pullWalletCloud (blob v3) acima.
  // (2) um insert em portfolio_snapshots a cada visita (Pro/Premium), sem
  //     _totalEur nem _account — enchia a tabela e parava o auto-snapshot e o
  //     PNL da API. O snapshot completo grava-o so a pagina do Portefolio.


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
      const data = (await response.json()) as { total?: number; error?: string; partial?: boolean; positions?: PosicaoDefi[] };
      // Um 503 com erro em JSON aparecia como "€ 0,00": lia-se o total e mais nada.
      if (!response.ok || (data?.error && typeof data.total !== "number")) {
        setDefiTotals((prev) => ({ ...prev, [key]: null }));
        setDefiErrors((prev) => ({ ...prev, [key]: data?.error ?? t("wl_err_defi") }));
        return;
      }
      const total = typeof data?.total === "number" && Number.isFinite(data.total) ? data.total : 0;
      setDefiTotals((prev) => ({ ...prev, [key]: total }));
      setDefiPartial((prev) => ({ ...prev, [key]: !!data?.partial }));
      setDefiErrors((prev) => ({ ...prev, [key]: null }));
      setDefiPosicoes((prev) => ({ ...prev, [key]: Array.isArray(data?.positions) ? data.positions : [] }));
    } catch (error) {
      setDefiErrors((prev) => ({ ...prev, [key]: userError(error, t("wl_err_defi")) }));
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
      // Sem fornecedor ou fornecedor em baixo vem 503 com erro: aparecia "0 itens".
      if (!response.ok || (data?.error && typeof data.count !== "number")) {
        setNftCounts((prev) => ({ ...prev, [key]: 0 }));
        setNftsByKey((prev) => ({ ...prev, [key]: [] }));
        setNftErrors((prev) => ({ ...prev, [key]: data?.error ?? t("wl_err_nft") }));
        return;
      }
      setNftCounts((prev) => ({ ...prev, [key]: data.count ?? 0 }));
      setNftPartial((prev) => ({ ...prev, [key]: !!(data as { partial?: boolean }).partial }));
      setNftsByKey((prev) => ({ ...prev, [key]: data.nfts ?? [] }));
      setNftErrors((prev) => ({ ...prev, [key]: null }));
    } catch (error) {
      setNftErrors((prev) => ({ ...prev, [key]: userError(error, t("wl_err_nft")) }));
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
      const data = (await response.json()) as { total?: number; error?: string; partial?: boolean; positions?: PosicaoDefi[] };
      if (!response.ok) {
        const msg = data?.error ?? t("wl_err_defi");
        setDefiTotals((prev) => ({ ...prev, [key]: null }));
        setDefiErrors((prev) => ({ ...prev, [key]: msg }));
        return;
      }
      const total = typeof data?.total === "number" && Number.isFinite(data.total) ? data.total : 0;
      setDefiTotals((prev) => ({ ...prev, [key]: total }));
      setDefiPartial((prev) => ({ ...prev, [key]: !!data?.partial }));
      setDefiErrors((prev) => ({ ...prev, [key]: null }));
      setDefiPosicoes((prev) => ({ ...prev, [key]: Array.isArray(data?.positions) ? data.positions : [] }));
    } catch (error) {
      setDefiErrors((prev) => ({
        ...prev,
        [key]: userError(error, t("wl_err_defi")),
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
        setNftErrors((prev) => ({ ...prev, [key]: data?.error ?? t("wl_err_nft") }));
        setNftsByKey((prev) => ({ ...prev, [key]: [] }));
        return;
      }
      const count = typeof data?.count === "number" ? data.count : 0;
      const nfts = Array.isArray(data?.nfts) ? data.nfts : [];
      setNftCounts((prev) => ({ ...prev, [key]: count }));
      setNftPartial((prev) => ({ ...prev, [key]: !!(data as { partial?: boolean }).partial }));
      setNftErrors((prev) => ({ ...prev, [key]: null }));
      setNftsByKey((prev) => ({ ...prev, [key]: nfts }));
    } catch (error) {
      setNftErrors((prev) => ({ ...prev, [key]: userError(error, t("wl_err_nft")) }));
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

  const refreshCryptoPrices = async (symbolsArg?: string[]) => {
    const symbols = symbolsArg ?? Object.keys(cryptoHoldings);
    setCryptoPricesLoading(true);
    setCryptoPricesError(null);
    try {
      const response = await fetch("/api/markets?nospark=1");
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? t("wl_err_prices"));
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
      setCryptoPricesError(userError(error, t("wl_err_prices")));
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
        title: t("wl_unauth_domain"),
        description: t("wl_unauth_domain_d").replace("{host}", host || t("wl_domain_current")),
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

  const [confirmBusy, setConfirmBusy] = useState(false);
  const handleConfirm = async () => {
    const current = confirmRef.current;
    if (!current || confirmBusy) return;
    setConfirmBusy(true);
    try {
      await current.onConfirm();
      setConfirmOpen(false);
      confirmRef.current = null;
    } catch (error) {
      setConfirmError(userError(error, t("wl_err_confirm")));
    } finally {
      setConfirmBusy(false);
    }
  };

  // Depende também dos SÍMBOLOS: ao adicionar/remover um ativo manual é preciso
  // ir buscar o preço desse símbolo. A chave é a lista ordenada (não o objeto),
  // para não refazer o pedido a cada tecla no valor investido.
  const cryptoSymbolsKey = useMemo(
    () => Object.keys(cryptoHoldings).sort().join(","),
    [cryptoHoldings],
  );
  useEffect(() => {
    if (walletMode !== "web3") return;
    const symbols = cryptoSymbolsKey ? cryptoSymbolsKey.split(",") : [];
    refreshCryptoPrices(symbols);
    return repetirVisivel(() => refreshCryptoPrices(symbols), DOIS_MIN);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletMode, cryptoSymbolsKey]);

  const refreshWeb3Prices = async () => {
    setWeb3PricesLoading(true);
    try {
      const response = await fetch("/api/markets?nospark=1");
      if (!response.ok) {
        throw new Error(t("wl_err_prices"));
      }
      const payload = (await response.json()) as { data?: MarketRow[] };
      const map: Record<string, MarketRow> = {};
      (payload.data ?? []).forEach((row) => {
        map[row.symbol] = row;
      });
      // Resposta vazia conta como falha: não se trocam preços bons por nada.
      if (Object.keys(map).length > 0) setWeb3Prices(map);
    } catch {
      // Falha isolada (429, rede): ficam os preços anteriores. Antes apagava-os
      // todos e cada valor em moeda da página passava a 0 durante 2 minutos.
    } finally {
      setWeb3PricesLoading(false);
    }
  };

  useEffect(() => {
    if (walletMode !== "web3") return;
    refreshWeb3Prices();
    const pararPrecos = repetirVisivel(() => void refreshWeb3Prices(), DOIS_MIN);
    // Fetch EUR/USD rate for CEX+DeFi conversion
    fetch("/api/prices", { cache: "no-store" })
      .then(r => r.json())
      .then((d: { prices?: { usdToEur?: number } }) => {
        if (d.prices?.usdToEur && d.prices.usdToEur > 0) setUsdToEurRate(d.prices.usdToEur);
      })
      .catch(() => {});
    return () => pararPrecos();
  }, [walletMode]);

  const getFiatValue = (symbol: string, balanceValue?: string | number | null) => fiatValue(web3Prices, symbol, balanceValue);

  const ethIsAvailable = isClient && !!getEvmProviderById(selectedEvmProvider);
  const solIsAvailable =
    isClient &&
    (isSolanaWalletAvailable(selectedSolProvider) || solWallets.length > 0);
  const btcIsAvailable = isClient && isBtcWalletAvailable(selectedBtcProvider);
  const adaIsAvailable = isClient && isCardanoWalletAvailable(selectedAdaProvider);

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
      // Leitura falhada ("—") ou ainda por chegar: cai no saldo guardado desta
      // mesma carteira em vez de contar 0 (src/lib/wallets/saldos.ts).
      const guardada = ethWallets.find((w) => w.address === ethAddress && (w.network ?? "Ethereum") === connNet);
      sum += valorDoSaldo(ethBalancesByKey[k], ethBalance, guardada?.balance);
    }
    // Add manually-added wallets, skip if same address+network already counted
    ethWallets.forEach((w) => {
      if (!w.address) return;
      const net = w.network ?? "Ethereum";
      const k = ethBalanceKey(w.address, net);
      if (seen.has(k)) return;
      seen.add(k);
      sum += valorDoSaldo(ethBalancesByKey[k], w.balance);
    });
    return sum.toFixed(4);
  }, [ethWallets, ethBalancesByKey, ethAddress, ethConnectedNetwork, ethBalance]);

  const totalSolBalance = useMemo(() => {
    const ligada = solAddress ? solWallets.find((w) => w.address === solAddress) : undefined;
    let sum = valorDoSaldo(solBalance, solAddress ? solBalancesByAddress[solAddress] : undefined, ligada?.balance);
    solWallets.forEach((w) => {
      if (w.address && w.address !== solAddress) sum += valorDoSaldo(solBalancesByAddress[w.address], w.balance);
    });
    return sum.toFixed(4);
  }, [solBalance, solWallets, solAddress, solBalancesByAddress]);

  const totalBtcBalance = useMemo(() => {
    const ligada = btcAddress ? btcWallets.find((w) => w.address === btcAddress) : undefined;
    let sum = valorDoSaldo(btcBalance, btcAddress ? btcBalancesByAddress[btcAddress] : undefined, ligada?.balance);
    btcWallets.forEach((w) => {
      if (w.address && w.address !== btcAddress) sum += valorDoSaldo(btcBalancesByAddress[w.address], w.balance);
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

  const formatRuneAmount = (amount: number | string) => formatRuneAmountIn(amount, numberFormat);

  const totalAdaBalance = useMemo(() => {
    const ligada = adaAddress ? adaWallets.find((w) => w.address === adaAddress) : undefined;
    let sum = valorDoSaldo(adaBalance, adaAddress ? adaBalancesByAddress[adaAddress] : undefined, ligada?.balance);
    adaWallets.forEach((w) => {
      if (w.address && w.address !== adaAddress) sum += valorDoSaldo(adaBalancesByAddress[w.address], w.balance);
    });
    return sum.toFixed(6);
  }, [adaBalance, adaWallets, adaAddress, adaBalancesByAddress]);

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

  // Preco de uma cotacao convertido para EUR, a partir da moeda que a fonte
  // indica. Devolve undefined quando nao ha cotacao ou nao sabemos converter —
  // nesse caso o valor do ativo continua a ser o investido, como antes.
  const quotePriceEur = (quote?: TraditionalQuote): number | undefined => quotePriceEurFrom(quote, fxRates as Record<string, number>);

  const updateTraditionalBuy = (assetId: string, next: { buyValue?: number; buyDate?: string; quantity?: number }) => {
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

  // Stablecoins por endereço, em EUR (todas em USD exceto a EURC).
  const stablecoinTotalEur = useMemo(
    () =>
      stablecoinEntries.reduce((sum, e) => {
        const v = parseFloat(stablecoinBalances[e.id] ?? e.balance ?? "0");
        if (!Number.isFinite(v)) return sum;
        return sum + (e.symbol.toUpperCase() === "EURC" ? v : v * usdToEurRate);
      }, 0),
    [stablecoinEntries, stablecoinBalances, usdToEurRate],
  );

  const traditionalInvestedTotal = useMemo(
    () =>
      Object.values(traditionalHoldings).reduce((sum, h) => {
        const v = Number(h.buyValue ?? 0);
        return Number.isFinite(v) ? sum + v : sum;
      }, 0),
    [traditionalHoldings],
  );

  // Valor a precos de hoje. Cada ativo com quantidade conta quantidade x preco;
  // os que so tem montante investido continuam a contar esse montante.
  const traditionalMarketTotal = useMemo(
    () =>
      Object.entries(traditionalHoldings).reduce((sum, [id, h]) => {
        const asset = allTraditionalAssets.find((a) => a.id === id);
        const quote = asset?.alphaSymbol ? traditionalQuotes[asset.alphaSymbol] : undefined;
        return sum + traditionalHoldingValueEur(h, quotePriceEur(quote));
      }, 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [traditionalHoldings, traditionalQuotes, allTraditionalAssets, fxRates],
  );

  /** Quantos dos ativos escolhidos ja tem quantidade (logo, valor de mercado). */
  const traditionalWithQty = useMemo(
    () => Object.values(traditionalHoldings).filter((h) => hasQuantity(h)).length,
    [traditionalHoldings],
  );

  // Saldo nativo das carteiras EVM em dolares, moeda a moeda: numa carteira na
  // Polygon o nativo e POL, na BSC e BNB, na Avalanche e AVAX — antes somava-se
  // tudo como se fosse ETH e valorizava-se ao preco do ETH (portefolio inflado).
  // Nas L2 de Ethereum (Arbitrum, Base, Optimism, zkSync, Linea…) o nativo e ETH.
  const evmNativeUsd = useMemo(() => {
    const seen = new Set<string>();
    let sum = 0;
    const add = (addr: string, net: string, fallback: string | null | undefined) => {
      const k = ethBalanceKey(addr, net);
      if (seen.has(k)) return;
      seen.add(k);
      const guardada = ethWallets.find((w) => w.address === addr && (w.network ?? "Ethereum") === net);
      const amount = valorDoSaldo(ethBalancesByKey[k], fallback, guardada?.balance);
      if (!amount) return;
      const sym = nativeSymbolOf(net);
      // xDAI e uma stablecoin (1 $); o resto vem do /api/markets (ETH, POL, BNB, AVAX, CRO, MNT).
      sum += sym === "XDAI" ? amount : (getFiatValue(sym, amount) ?? 0);
    };
    if (ethAddress) add(ethAddress, ethConnectedNetwork ?? "Ethereum", ethBalance);
    ethWallets.forEach((w) => { if (w.address) add(w.address, w.network ?? "Ethereum", w.balance); });
    return sum;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ethWallets, ethBalancesByKey, ethAddress, ethConnectedNetwork, ethBalance, web3Prices]);

  const walletsTotalUsd = useMemo(() => {
    const sol = getFiatValue("SOL", totalSolBalance) ?? 0;
    const btc = getFiatValue("BTC", totalBtcBalance) ?? 0;
    const ada = getFiatValue("ADA", totalAdaBalance) ?? 0;
    return evmNativeUsd + sol + btc + ada;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evmNativeUsd, totalSolBalance, totalBtcBalance, totalAdaBalance, web3Prices]);

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

  // Este aparelho já teve exchanges com valor nesta sessão? Se sim, um 0 a
  // seguir é real (a pessoa removeu-as) e tem de ser gravado; se não, um 0 é
  // só "este aparelho não tem as chaves" e não pode apagar o que o outro
  // aparelho calculou.
  const cexJaTeveValor = useRef(false);
  // DeFi: so se grava um total quando as leituras acabaram sem erro. Ao abrir a
  // pagina o total e 0 (ainda nada foi lido) — gravar esse 0 apagava o valor
  // bom no snapshot, com carimbo novo, e o 0 ia para a nuvem e para os outros
  // aparelhos (auditoria 28 set 2026).
  const defiPronto = useMemo(() => {
    if (Object.values(defiLoading).some(Boolean)) return false;
    if (Object.values(defiErrors).some(Boolean)) return false;
    const temCarteiras = ethWallets.length + solWallets.length + btcWallets.length + adaWallets.length > 0 || !!ethAddress || !!solAddress;
    return !temCarteiras || Object.keys(defiTotals).length > 0;
  }, [defiLoading, defiErrors, defiTotals, ethWallets, solWallets, btcWallets, adaWallets, ethAddress, solAddress]);
  // Posições DeFi para o Portefólio: só com as leituras acabadas sem erro e só
  // quando mudaram (gravar a mesma lista com carimbo novo baralhava o merge
  // entre aparelhos).
  useEffect(() => {
    if (!hidratado || !defiPronto) return;
    const atual = loadWalletSnapshot().defiPosicoes ?? {};
    if (JSON.stringify(atual) === JSON.stringify(defiPosicoes)) return;
    updateWalletSnapshot({ defiPosicoes, defiPosicoesEm: Date.now() });
  }, [hidratado, defiPronto, defiPosicoes]);

  useEffect(() => {
    if (!hidratado) return;
    const defi = defiPronto ? { defiUsd: totalDefiUsd } : {};
    // Store as USD; portfolio page converts to EUR via usdToEur from /api/prices.
    if (cexHlTotalUsd > 0) {
      cexJaTeveValor.current = true;
      updateWalletSnapshot({ cexUsd: cexHlTotalUsd, ...defi });
    } else if (cexJaTeveValor.current) {
      updateWalletSnapshot({ cexUsd: 0, ...defi });
    } else if (defiPronto) {
      updateWalletSnapshot(defi);
    }
  }, [hidratado, defiPronto, cexHlTotalUsd, totalDefiUsd]);

  useEffect(() => {
    if (!hidratado) return;
    // Persistir os ativos manuais (em EUR) no snapshot, para contarem no
    // dashboard, nos snapshots da Supabase e noutros dispositivos.
    updateWalletSnapshot({ manualEur: cryptoManualTotal });
  }, [hidratado, cryptoManualTotal]);

  useEffect(() => {
    if (!hidratado) return;
    // O mesmo para os tradicionais: so esta pagina tem as cotacoes, por isso e
    // aqui que se calcula o valor de mercado que o Dashboard e o Portefolio leem.
    updateWalletSnapshot({ traditionalEur: traditionalMarketTotal });
  }, [hidratado, traditionalMarketTotal]);

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
      const payload = (await response.json().catch(() => null)) as
        | { data?: TraditionalQuote[]; code?: string; stale?: boolean }
        | null;
      if (!response.ok || !payload) {
        // Sem dados novos: mantemos os preços anteriores em vez de os apagar.
        setTraditionalQuotesError(t(payload?.code === "rate_limited" ? "wl_quotes_rate" : payload?.code === "no_key" ? "wl_quotes_nokey" : "wl_quotes_fail"));
        return;
      }
      const next: Record<string, TraditionalQuote> = {};
      (payload.data ?? []).forEach((quote) => {
        next[quote.symbol] = quote;
      });
      setTraditionalQuotes((prev) => ({ ...prev, ...next }));
      setTraditionalQuotesError(
        payload.code === "rate_limited" ? t("wl_quotes_rate") : payload.stale ? t("wl_quotes_stale") : null,
      );
    } catch {
      setTraditionalQuotesError(t("wl_quotes_fail"));
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
    return repetirVisivel(() => refreshTraditionalQuotes(selectedQuoteSymbols), TRES_MIN);
  }, [walletMode, selectedQuoteSymbols]);

  const refreshTraditionalQuote = async (symbol?: string) => {
    if (!symbol) return;
    setTraditionalQuoteLoading((prev) => ({ ...prev, [symbol]: true }));
    try {
      const response = await fetch(`/api/traditional?symbols=${encodeURIComponent(symbol)}`);
      const payload = (await response.json().catch(() => null)) as
        | { data?: TraditionalQuote[]; code?: string; stale?: boolean }
        | null;
      if (!response.ok || !payload) {
        setTraditionalQuotesError(t(payload?.code === "rate_limited" ? "wl_quotes_rate" : payload?.code === "no_key" ? "wl_quotes_nokey" : "wl_quotes_fail"));
        return;
      }
      const quote = payload.data?.[0];
      if (quote) {
        setTraditionalQuotes((prev) => ({ ...prev, [quote.symbol]: quote }));
        setTraditionalQuotesError(payload.stale ? t("wl_quotes_stale") : null);
      }
    } catch {
      setTraditionalQuotesError(t("wl_quotes_fail"));
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
        throw new Error(t("wl_ext_missing").replace("{wallet}", label));
      }
      // Switch network BEFORE requesting accounts so MetaMask connects on the right chain
      if (selectedEthConnectNetwork !== "Ethereum") {
        await switchEvmNetwork(selectedProvider, selectedEthConnectNetwork);
      }
      const address = await connectEvmProvider(selectedProvider);
      // Primeiro o saldo, so depois "ligada" (como o SOL e o BTC): se a leitura
      // falhar, a carteira guardada continua a contar com o ultimo saldo.
      const balance = await fetchEvmBalanceServerSide(address, selectedEthConnectNetwork);
      const formatted = Number(balance).toFixed(4);
      setEthAddress(address);
      setEthConnectedNetwork(selectedEthConnectNetwork);
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
      setEthError(userError(error, t("wl_err_connect"), { rejected: t("wl_user_rejected"), codes: walletCodes }));
    } finally {
      setEthLoading(false);
    }
  };

  const handleEthConnect = () => {
    const host = typeof window !== "undefined" ? window.location.hostname : "";
    requestConfirm({
      title: `${t("wl_connect_wallet")} Ethereum`,
      description: `${t("wl_connect_desc")} ${host || "—"}.`,
      onConfirm: handleEthConnectInternal,
    });
  };

  const handleWalletConnectInternal = async () => {
    try {
      setEthLoading(true);
      setEthError(null);
      const address = await connectWalletConnect();
      const balance = await fetchEvmBalanceServerSide(address, "Ethereum");
      const formatted = Number(balance).toFixed(4);
      setEthAddress(address);
      // O WalletConnect le sempre a mainnet: sem repor a rede, um saldo de
      // mainnet ficava com a chave da L2 ligada antes e contava duas vezes.
      setEthConnectedNetwork("Ethereum");
      setEthBalance(formatted);
      const nextWallets = upsertWallet(
        ethWallets,
        { address, balance: formatted, network: "Ethereum", label: "WalletConnect" },
        (item) => item.address === address && item.network === "Ethereum"
      );
      setEthWallets(nextWallets);
      updateWalletSnapshot({ eth: nextWallets, sol: solWallets, btc: btcWallets, ada: adaWallets });
    } catch (error) {
      setEthError(userError(error, t("wl_err_connect"), { rejected: t("wl_user_rejected"), codes: walletCodes }));
    } finally {
      setEthLoading(false);
    }
  };

  const handleWalletConnect = () => {
    const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
    if (!projectId) {
      setEthError(t("wl_wc_missing"));
      return;
    }
    const host = typeof window !== "undefined" ? window.location.hostname : "";
    requestConfirm({
      title: `${t("wl_connect_wallet")} WalletConnect`,
      description: t("wl_wc_qr_desc").replace("{host}", host || t("wl_domain_current")),
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
      setEthError(userError(error, t("wl_err_balance")));
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

  // Durante o beta (pagamentos congelados) os CTAs de upgrade viram convite ao beta.
  const paymentsFrozen = process.env.NEXT_PUBLIC_PAYMENTS_ENABLED !== "true";
  const totalWallets = ethWallets.length + solWallets.length + btcWallets.length + adaWallets.length;

  const handleAddEthWalletInternal = async () => {
    if (!isPro && totalWallets >= FREE_WALLET_LIMIT) {
      setEthNewError(`${t("wl_free_limit_1")} ${FREE_WALLET_LIMIT} ${t("wl_free_limit_2")}`);
      return;
    }
    if (!ethNewAddress.trim()) {
      setEthNewError(t("wl_insert_addr"));
      return;
    }
    if (!isEvmAddress(ethNewAddress.trim())) {
      setEthNewError(t("wl_invalid_eth"));
      return;
    }
    const trimmed = ethNewAddress.trim();
    {
      const dupNet = addressAlreadyTracked(trimmed);
      const network0 = ethNewNetwork === "outro" ? (ethNewCustomLabel.trim() || "Outro") : ethNewNetwork;
      if (dupNet && dupNet !== network0) {
        setEthNewError(`${t("wl_dup_addr")} (${dupNet}) — ${t("wl_dup_double")}`);
        return;
      }
    }
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
        userError(error, t("wl_invalid_or_net"))
      );
    } finally {
      setEthNewLoading(false);
    }
  };

  const handleAddEthWallet = () => {
    const host = typeof window !== "undefined" ? window.location.hostname : "";
    requestConfirm({
      title: t("wl_add_addr_title").replace("{chain}", "Ethereum"),
      description: t("wl_add_addr_desc").replace("{addr}", ethNewAddress || t("wl_addr_undefined")).replace("{host}", host || t("wl_domain_current")),
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
      setSolError(userError(error, t("wl_err_connect"), { rejected: t("wl_user_rejected"), codes: walletCodes }));
    } finally {
      setSolLoading(false);
    }
  };

  const handleSolConnect = () => {
    const host = typeof window !== "undefined" ? window.location.hostname : "";
    requestConfirm({
      title: `${t("wl_connect_wallet")} Solana`,
      description: `${t("wl_connect_desc")} ${host || "—"}.`,
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
      setSolError(userError(error, t("wl_err_balance")));
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
      setSolNewError(`${t("wl_free_limit_1")} ${FREE_WALLET_LIMIT} ${t("wl_free_limit_2")}`);
      return;
    }
    if (!solNewAddress.trim()) {
      setSolNewError(t("wl_insert_addr"));
      return;
    }
    if (!isSolAddress(solNewAddress.trim())) {
      setSolNewError(t("wl_invalid_sol"));
      return;
    }
    const trimmed = solNewAddress.trim();
    {
      const dupNet = addressAlreadyTracked(trimmed);
      const label0 = solNewWalletId === "outro" ? (solNewCustomLabel.trim() || "Solana") : (MANUAL_ADD_TO_SOL_NETWORK[solNewWalletId] ?? "Solana");
      if (dupNet && dupNet !== label0) {
        setSolNewError(`${t("wl_dup_addr")} (${dupNet}) — ${t("wl_dup_double")}`);
        return;
      }
    }
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
      setSolNewError(userError(error, t("wl_invalid_addr")));
    } finally {
      setSolNewLoading(false);
    }
  };

  const handleAddSolWallet = () => {
    const host = typeof window !== "undefined" ? window.location.hostname : "";
    requestConfirm({
      title: t("wl_add_addr_title").replace("{chain}", "Solana"),
      description: t("wl_add_addr_desc").replace("{addr}", solNewAddress || t("wl_addr_undefined")).replace("{host}", host || t("wl_domain_current")),
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
        // Leitura falhada = "nao sei", nao "0": fica o saldo que a entrada ja
        // tinha (ou nenhum) e o efeito dos saldos tenta outra vez.
        const ordBalance = await getBtcBalanceFromAddress(ordinals).catch(() => null);
        const anterior = nextWallets.find((w) => w.address === ordinals)?.balance;
        nextWallets = upsertWallet(
          nextWallets,
          { address: ordinals, ...(ordBalance != null ? { balance: ordBalance.toFixed(8) } : anterior ? { balance: anterior } : {}), network: "Bitcoin", label: `${providerLabel} (Ordinals)` },
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
      setBtcError(userError(error, t("wl_err_connect"), { rejected: t("wl_user_rejected"), codes: walletCodes }));
    } finally {
      setBtcLoading(false);
    }
  };

  const handleBtcConnect = () => {
    const host = typeof window !== "undefined" ? window.location.hostname : "";
    requestConfirm({
      title: `${t("wl_connect_wallet")} Bitcoin`,
      description: `${t("wl_connect_desc")} ${host || "—"}.`,
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
      setBtcError(userError(error, t("wl_err_balance")));
    } finally {
      setBtcLoading(false);
    }
  };

  const handleBtcDisconnect = () => {
    // Desligar a extensão NÃO pode apagar endereços colados à mão (manual/cold)
    const kept = btcWallets.filter((w) => w.source === "manual" || w.source === "cold");
    setBtcWallets(kept);
    setBtcAddress(undefined);
    setBtcBalance(null);
    setBtcError(null);
    updateWalletSnapshot({ eth: ethWallets, sol: solWallets, btc: kept, ada: adaWallets });
  };

  const handleAddBtcWalletInternal = async () => {
    if (!isPro && totalWallets >= FREE_WALLET_LIMIT) {
      setBtcNewError(`${t("wl_free_limit_1")} ${FREE_WALLET_LIMIT} ${t("wl_free_limit_2")}`);
      return;
    }
    if (!btcNewAddress.trim()) {
      setBtcNewError(t("wl_insert_addr"));
      return;
    }
    if (!isBtcAddress(btcNewAddress.trim())) {
      setBtcNewError(t("wl_invalid_btc"));
      return;
    }
    const trimmed = btcNewAddress.trim();
    {
      const dupNet = addressAlreadyTracked(trimmed);
      const label0 = btcNewLabel === "outro" ? (btcNewCustomLabel.trim() || "Bitcoin") : (btcNetworkOptions.find((o) => o.id === btcNewLabel)?.label ?? "Bitcoin");
      if (dupNet && dupNet !== label0) {
        setBtcNewError(`${t("wl_dup_addr")} (${dupNet}) — ${t("wl_dup_double")}`);
        return;
      }
    }
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
      setBtcNewError(userError(error, t("wl_invalid_addr")));
    } finally {
      setBtcNewLoading(false);
    }
  };

  const handleAddBtcWallet = () => {
    const host = typeof window !== "undefined" ? window.location.hostname : "";
    requestConfirm({
      title: t("wl_add_addr_title").replace("{chain}", "Bitcoin"),
      description: t("wl_add_addr_desc").replace("{addr}", btcNewAddress || t("wl_addr_undefined")).replace("{host}", host || t("wl_domain_current")),
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
      setAdaLoadingMsg(t("wl_ada_waiting"));
      // After 3s update message with clearer instructions
      msgTimer = setTimeout(() => {
        setAdaLoadingMsg(t("wl_ada_click_ext"));
      }, 3000);
      // Tempo esgotado: a carteira nunca responde (o pedido fica pendente atrás
      // do ícone da extensão, que é o que acontece quase sempre com o Eternl).
      // O erro leva um CÓDIGO: antes levava só a palavra "timeout", e o
      // tradutor de erros tratava-a como ruído técnico — a mensagem com os
      // passos a seguir, que está aqui em baixo, nunca chegava a aparecer.
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(Object.assign(new Error("timeout"), { code: "ada_timeout" })), 60_000)
      );
      const { api, address } = await Promise.race([
        connectCardanoWallet(selectedAdaProvider),
        timeout,
      ]);
      clearTimeout(msgTimer);
      setAdaLoadingMsg(undefined);
      const balance = await getAdaBalance(api);
      setAdaApi(api);
      setAdaAddress(address);
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
      if (error && typeof error === "object" && (error as { code?: unknown }).code === "ada_timeout") {
        setAdaError(t("wl_ada_timeout").replace("{p}", CARDANO_LABELS[selectedAdaProvider]));
        return;
      }
      const msg = userError(error, t("wl_err_connect"), { rejected: t("wl_user_rejected"), codes: walletCodes });
      if (msg.toLowerCase().includes("user canceled") || msg.toLowerCase().includes("cancelled") || msg.toLowerCase().includes("cancel")) {
        setAdaError(t("wl_cancelled"));
      } else if (
        msg.toLowerCase().includes("no account set") ||
        msg.toLowerCase().includes("no daccount") ||
        msg.toLowerCase().includes("dapp account") ||
        msg.toLowerCase().includes("account") ||
        msg.toLowerCase().includes("dapp connector")
      ) {
        setAdaError(t("wl_ada_no_dapp"));
      } else {
        setAdaError(msg);
      }
    } finally {
      setAdaLoading(false);
      setAdaLoadingMsg(undefined);
    }
  };

  const handleAdaConnect = () => {
    const host = typeof window !== "undefined" ? window.location.hostname : "";
    requestConfirm({
      title: `${t("wl_connect_wallet")} Cardano`,
      description: `${t("wl_connect_desc")} ${host || "—"}.`,
      onConfirm: handleAdaConnectInternal,
    });
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
          url: typeof window !== "undefined" ? window.location.origin : "https://chainfolioai.com",
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
            if (!provider) { setAdaError(t("wl_ada_no_api")); return; }
            const api = await provider.enable();

            const hexToBytes = (hex: string) =>
              new Uint8Array(hex.replace(/^0x/, "").match(/.{2}/g)!.map((b) => parseInt(b, 16)));

            const changeHex = (await api.getChangeAddress?.().catch(() => "")) ?? "";
            let address = changeHex;
            if (address && !address.startsWith("addr")) {
              const CardanoWasm = await import("@emurgo/cardano-serialization-lib-browser");
              address = CardanoWasm.Address.from_bytes(hexToBytes(changeHex)).to_bech32();
            }
            if (!address) { setAdaError(t("wl_ada_no_address")); return; }

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
            setAdaError(userError(e, t("wl_ada_peer_err")));
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
      setAdaError(userError(e, t("wl_ada_peer_start_err")));
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
      setAdaError(userError(error, t("wl_err_balance")));
    } finally {
      setAdaLoading(false);
    }
  };

  const handleAdaDisconnect = () => {
    // Desligar a extensão NÃO pode apagar endereços colados à mão (manual/cold)
    const kept = adaWallets.filter((w) => w.source === "manual" || w.source === "cold");
    setAdaWallets(kept);
    setAdaAddress(undefined);
    setAdaBalance(undefined);
    setAdaError(null);
    setAdaApi(null);
    updateWalletSnapshot({ eth: ethWallets, sol: solWallets, btc: btcWallets, ada: kept });
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

  // Em que rede (se alguma) é que este endereço já está a ser seguido?
  // Evita duplicados entre redes que somavam o MESMO saldo duas vezes.
  const addressAlreadyTracked = (addr: string): string | null => {
    const a = addr.toLowerCase();
    const hit =
      ethWallets.find((w) => (w.address ?? "").toLowerCase() === a) ??
      solWallets.find((w) => (w.address ?? "").toLowerCase() === a) ??
      btcWallets.find((w) => (w.address ?? "").toLowerCase() === a) ??
      adaWallets.find((w) => (w.address ?? "").toLowerCase() === a) ??
      otherWallets.find((w) => (w.address ?? "").toLowerCase() === a);
    return hit ? (hit.network ?? "?") : null;
  };

  const addManualAddress = (addressArg: string, networkId: string, labelArg?: string, source: "cold" | "manual" = "manual"): string | null => {
    if (!isPro && totalWallets >= FREE_WALLET_LIMIT) {
      return `${t("wl_free_limit_1")} ${FREE_WALLET_LIMIT} ${t("wl_free_limit_2")}`;
    }
    const trimmed = addressArg.trim();
    const label = labelArg && labelArg.trim() ? sanitizeLabel(labelArg) : undefined;
    if (!trimmed) return t("wl_insert_addr");
    {
      const dupNet = addressAlreadyTracked(trimmed);
      if (dupNet) return `${t("wl_dup_addr")} (${dupNet}).`;
    }
    const evmNetwork = MANUAL_ADD_TO_EVM_NETWORK[networkId];
    if (evmNetwork) {
      if (!isEvmAddress(trimmed)) return t("wl_invalid_evm");
      const nextWallets = upsertWallet(
        ethWallets,
        { address: trimmed, network: evmNetwork, label, source },
        (item) => item.address === trimmed && item.network === evmNetwork
      );
      setEthWallets(nextWallets);
      updateWalletSnapshot({ eth: nextWallets, sol: solWallets, btc: btcWallets, ada: adaWallets });
      void fetchEthBalanceForEntry(trimmed, evmNetwork);
    } else if (MANUAL_ADD_TO_SOL_NETWORK[networkId]) {
      if (!isSolAddress(trimmed)) return t("wl_invalid_sol");
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
      if (!isBtcAddress(trimmed)) return t("wl_invalid_btc");
      const nextWallets = upsertWallet(
        btcWallets,
        { address: trimmed, network: "Bitcoin", label, source },
        (item) => item.address === trimmed
      );
      setBtcWallets(nextWallets);
      updateWalletSnapshot({ eth: ethWallets, sol: solWallets, btc: nextWallets, ada: adaWallets });
      void fetchBtcBalanceForAddress(trimmed);
    } else if (networkId === "ada") {
      if (!isAdaAddress(trimmed)) return t("wl_invalid_ada");
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
      if (trimmed.length < 6) return t("wl_addr_short");
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

  // Campo unico do topo: reconhece a rede pelo formato e adiciona com um toque.
  // Frases de recuperacao e chaves privadas sao recusadas AQUI, antes de irem
  // para qualquer lado (nunca sao guardadas nem enviadas).
  // Endereco experimentado na demonstracao da pagina inicial (so no browser):
  // com 0 carteiras, aparece ja no campo rapido; com carteiras, esquece-se.
  const [quickFromDemo, setQuickFromDemo] = useState(false);
  useEffect(() => {
    try {
      const guardado = localStorage.getItem("cfa-demo-address");
      if (!guardado) return;
      if (totalWallets > 0) { localStorage.removeItem("cfa-demo-address"); return; }
      setQuickAddr((atual) => atual || guardado);
      setQuickFromDemo(true);
    } catch { /* sem localStorage */ }
  }, [totalWallets]);

  const handleQuickAdd = () => {
    const d = detetarRede(quickAddr);
    if (d.tipo === "frase") { setQuickMsg({ ok: false, text: t("wl_quick_seed") }); setQuickAddr(""); return; }
    if (d.tipo === "chave") { setQuickMsg({ ok: false, text: t("wl_quick_key") }); setQuickAddr(""); return; }
    if (d.tipo !== "rede") { setQuickMsg({ ok: false, text: t("wl_quick_unknown") }); return; }
    const err = addManualAddress(quickAddr, d.rede);
    if (err) { setQuickMsg({ ok: false, text: err }); return; }
    setQuickAddr("");
    setQuickMsg(null);
    setQuickFromDemo(false);
    try { localStorage.removeItem("cfa-demo-address"); } catch { /* ignore */ }
    window.setTimeout(() => document.getElementById("chain-cards")?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
  };

  const handleManualAddAddress = () => {
    setManualAddError(null);
    setManualAddOk(null);
    const addr = manualAddAddress.trim();
    const err = addManualAddress(manualAddAddress, manualAddNetwork, manualAddLabel);
    if (err) { setManualAddError(err); return; }
    setManualAddAddress("");
    setManualAddLabel("");
    setManualAddOk(`✓ ${addr.slice(0, 10)}… ${t("wl_added_ok")}`);
    window.setTimeout(() => setManualAddOk(null), 6000);
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
    setColdTokensError((prev) => { if (!(key in prev)) return prev; const next = { ...prev }; delete next[key]; return next; });
    const falhou = (msg: string) => {
      setColdTokensError((prev) => ({ ...prev, [key]: msg }));
      // Sem resultado anterior fica uma lista vazia (para o resto do ecra nao
      // esperar); com resultado anterior, mantem-se.
      setColdTokensByAddr((prev) => (key in prev ? prev : { ...prev, [key]: [] }));
    };
    try {
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const res = await fetch(`${base}/api/token-balances?address=${encodeURIComponent(address)}&chain=${chain}`);
      const data = await res.json().catch(() => ({})) as { tokens?: ColdToken[]; error?: string };
      if (!res.ok || data.error) {
        falhou(res.status === 429 ? t("wl_err_rate_limited") : res.status === 502 || res.status === 503 ? t("wl_err_provider_down") : t("wl_err_tokens"));
        return;
      }
      setColdTokensByAddr((prev) => ({ ...prev, [key]: data.tokens ?? [] }));
    } catch {
      falhou(t("wl_err_tokens"));
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

  // Total USD dos tokens cold. O nativo da rede em que a carteira foi registada
  // ja esta em walletsTotalUsd (nao contar duas vezes); o nativo das OUTRAS
  // redes (ETH na Arbitrum/Base, POL na Polygon…) so chega por aqui e conta.
  const coldTokensExtraUsd = useMemo(() => {
    const registered: Record<string, Set<string>> = {};
    ethWallets.forEach((w) => {
      if (!w.address) return;
      (registered[w.address] ??= new Set()).add(networkKey(w.network ?? "Ethereum"));
    });
    let sum = 0;
    for (const [key, tokens] of Object.entries(coldTokensByAddr)) {
      const addr = key.slice(key.indexOf(":") + 1);
      for (const t of tokens) {
        if (t.address === "native" && (!t.network || registered[addr]?.has(t.network))) continue;
        if (Number.isFinite(t.usdValue)) sum += t.usdValue;
      }
    }
    return sum;
  }, [coldTokensByAddr, ethWallets]);

  useEffect(() => {
    if (!hidratado) return;
    // So com TODAS as leituras de tokens acabadas e sem erro: um 503/429 de um
    // fornecedor (ou a pagina acabada de abrir) nao pode gravar tokensUsd = 0.
    if (Object.values(coldTokensLoading).some(Boolean)) return;
    if (Object.values(coldTokensError).some(Boolean)) return;
    const temCarteiras = ethWallets.length + solWallets.length > 0;
    if (temCarteiras && Object.keys(coldTokensByAddr).length === 0) return;
    // Estes tokens entram no total desta página; sem os gravar no snapshot o
    // Portefólio ficava aquém do que as Carteiras mostram.
    updateWalletSnapshot({ tokensUsd: coldTokensExtraUsd });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hidratado, coldTokensExtraUsd, coldTokensLoading, coldTokensError]);

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

  // Campos de dinheiro e de quantidade das listas: funcoes de render (nao
  // componentes) em src/components/wallets/camposNumero.tsx.
  const moneyField = criarMoneyField({ curRate, curCode, hideBalances, numberFormat });
  const qtyField = criarQtyField({ hideBalances });

  const handleManualAddCryptoAsset = () => {
    setManualCryptoAssetError(null);
    const symbol = manualCryptoAssetSymbol.trim();
    const amountStr = manualCryptoAssetAmountUsd.trim();
    const amount = amountStr === "" ? NaN : parseDecimal(amountStr);
    if (!symbol) {
      setManualCryptoAssetError(t("wl_pick_asset"));
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setManualCryptoAssetError(t("wl_invalid_value").replace("{cur}", curCode));
      return;
    }
    const qtyRaw = manualCryptoAssetQty.trim();
    const qty = qtyRaw === "" ? undefined : parseDecimal(qtyRaw);
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
      // Quem escreve "3000" aqui quer registar um montante — esse campo é o dos
      // ativos manuais; aqui só entram endereços 0x… para ler o saldo on-chain.
      setStablecoinAddError(/^[\d.,\s]+$/.test(addr) ? t("wl_stable_is_address") : t("wl_invalid_evm"));
      return;
    }
    if (stablecoinEntries.some((e) => e.symbol === stablecoinAddSymbol && e.address.toLowerCase() === addr.toLowerCase())) {
      setStablecoinAddError(t("wl_stable_dup"));
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
        if (!res.ok) throw new Error("balance_fetch_failed");
        const data = (await res.json()) as { balance?: string; error?: string };
        if (data.error) throw new Error(data.error);
        const balance = data.balance ?? "0";
        startTransition(() => {
          setStablecoinBalances((prev) => ({ ...prev, [entryId]: balance }));
          setStablecoinBalancesLoading((prev) => ({ ...prev, [entryId]: false }));
          // O Portefólio lê o saldo do registo guardado, não deste estado.
          setStablecoinEntries((prev) => prev.map((e) => (e.id === entryId ? { ...e, balance } : e)));
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
    // Saldos de 3 em 3 min com a tab visivel, e logo ao voltar ao separador (no
    // telemovel o intervalo para em segundo plano e via-se o saldo de ha uma hora).
    const pararSaldos = repetirVisivel(() => void refreshAll(), TRES_MIN);
    return () => {
      window.clearTimeout(startId);
      pararSaldos();
    };
  }, [walletMode, ethAddress, solAddress, btcAddress, adaApi]);

  // Ligar uma carteira disparava ~4N+2 leituras em segundos (efeitos em cadeia)
  // e batia no limite das rotas -> 429 -> "saldo a 0". As leituras pedidas pelos
  // EFEITOS saltam-se se a mesma chave foi lida ha menos de 20 s; as pedidas
  // pela pessoa (atualizar, adicionar) passam sempre.
  const ultimasLeituras = useRef<Map<string, number>>(new Map());
  const saltarLeitura = (chave: string, soSeAntiga: boolean) => {
    const agora = Date.now();
    if (soSeAntiga && leituraRecente(ultimasLeituras.current, chave, agora)) return true;
    ultimasLeituras.current.set(chave, agora);
    return false;
  };

  const fetchAdaBalanceForAddress = useCallback(async (address: string, soSeAntiga = false) => {
    if (!address || address === adaAddress) return;
    if (saltarLeitura(`ada:${address}`, soSeAntiga)) return;
    setAdaBalancesLoading((prev) => ({ ...prev, [address]: true }));
    setAdaBalanceErrors((prev) => ({ ...prev, [address]: null }));
    try {
      const balance = await getAdaBalanceByAddress(address);
      startTransition(() => {
        setAdaBalancesByAddress((prev) => ({ ...prev, [address]: balance }));
        setAdaBalanceErrors((prev) => ({ ...prev, [address]: null }));
      });
    } catch (err) {
      const message = userError(err, t("wl_err_balance"));
      startTransition(() => {
        setAdaBalanceErrors((prev) => ({ ...prev, [address]: message }));
        setAdaBalancesByAddress((prev) => aposFalha(prev, address));
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
        .forEach((w) => void fetchAdaBalanceForAddress(w.address!, true));
    }, 0);
    return () => window.clearTimeout(id);
  }, [walletMode, adaWallets, adaAddress, fetchAdaBalanceForAddress]);

  const fetchEvmBalanceServerSide = async (address: string, network: string): Promise<string> => {
    const base = typeof window !== "undefined" ? window.location.origin : "";
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch(`${base}/api/evm-balance?address=${encodeURIComponent(address)}&network=${encodeURIComponent(network)}`, { signal: controller.signal });
      const data = await res.json().catch(() => ({})) as { balance?: string; error?: string };
      // Pelo estado, nao pela frase: 429 (limite) e 502/503 (fornecedor em
      // baixo) tem texto proprio traduzido; o resto usa o erro do servidor.
      if (res.status === 429) throw new Error(t("wl_err_rate_limited"));
      if (res.status === 502 || res.status === 503) throw new Error(t("wl_err_provider_down"));
      if (!res.ok || data.error) throw new Error(data.error ?? t("wl_err_balance"));
      return Number(data.balance ?? 0).toFixed(4);
    } finally {
      window.clearTimeout(timer);
    }
  };

  const fetchEthBalanceForEntry = useCallback(
    async (address: string, network: string, soSeAntiga = false) => {
      const key = ethBalanceKey(address, network);
      if (saltarLeitura(`eth:${key}`, soSeAntiga)) return;
      setEthBalancesLoading((prev) => ({ ...prev, [key]: true }));
      setEthBalanceErrors((prev) => ({ ...prev, [key]: null }));
      try {
        const formatted = await fetchEvmBalanceServerSide(address, network);
        startTransition(() => {
          setEthBalancesByKey((prev) => ({ ...prev, [key]: formatted }));
          setEthBalanceErrors((prev) => ({ ...prev, [key]: null }));
        });
      } catch (err) {
        const msg = userError(err, t("wl_err_balance"));
        startTransition(() => {
          setEthBalanceErrors((prev) => ({ ...prev, [key]: msg }));
          setEthBalancesByKey((prev) => aposFalha(prev, key));
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
        .forEach((w) => void fetchEthBalanceForEntry(w.address!, w.network!, true));
    }, 0);
    return () => window.clearTimeout(id);
  }, [walletMode, ethWallets, ethAddress, fetchEthBalanceForEntry]);

  const fetchSolBalanceForAddress = useCallback(async (address: string, soSeAntiga = false) => {
    if (!address || address === solAddress) return;
    if (saltarLeitura(`sol:${address}`, soSeAntiga)) return;
    setSolBalancesLoading((prev) => ({ ...prev, [address]: true }));
    setSolBalanceErrors((prev) => ({ ...prev, [address]: null }));
    try {
      const balance = await getSolBalance(address);
      startTransition(() => {
        setSolBalancesByAddress((prev) => ({ ...prev, [address]: balance }));
        setSolBalanceErrors((prev) => ({ ...prev, [address]: null }));
      });
    } catch (err) {
      const msg = userError(err, t("wl_err_balance"));
      startTransition(() => {
        setSolBalanceErrors((prev) => ({ ...prev, [address]: msg }));
        setSolBalancesByAddress((prev) => aposFalha(prev, address));
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
        .forEach((w) => void fetchSolBalanceForAddress(w.address!, true));
    }, 0);
    return () => window.clearTimeout(id);
  }, [walletMode, solWallets, solAddress, fetchSolBalanceForAddress]);

  const fetchBtcBalanceForAddress = useCallback(async (address: string, soSeAntiga = false) => {
    if (!address || address === btcAddress) return;
    if (saltarLeitura(`btc:${address}`, soSeAntiga)) return;
    setBtcBalancesLoading((prev) => ({ ...prev, [address]: true }));
    setBtcBalanceErrors((prev) => ({ ...prev, [address]: null }));
    try {
      const balance = await getBtcBalanceFromAddress(address);
      startTransition(() => {
        setBtcBalancesByAddress((prev) => ({ ...prev, [address]: balance.toFixed(8) }));
        setBtcBalanceErrors((prev) => ({ ...prev, [address]: null }));
      });
    } catch (err) {
      const msg = userError(err, t("wl_err_balance"));
      startTransition(() => {
        setBtcBalanceErrors((prev) => ({ ...prev, [address]: msg }));
        setBtcBalancesByAddress((prev) => aposFalha(prev, address));
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
        if (w.address !== btcAddress) void fetchBtcBalanceForAddress(w.address!, true);
        void fetchRunesForAddress(w.address!);
      });
    }, 0);
    return () => window.clearTimeout(id);
  }, [walletMode, btcWallets, btcAddress, fetchBtcBalanceForAddress, fetchRunesForAddress]);

  const handleAddAdaWalletInternal = () => {
    if (!isPro && totalWallets >= FREE_WALLET_LIMIT) {
      setAdaNewError(`${t("wl_free_limit_1")} ${FREE_WALLET_LIMIT} ${t("wl_free_limit_2")}`);
      return;
    }
    if (!adaNewAddress.trim()) {
      setAdaNewError(t("wl_insert_addr"));
      return;
    }
    if (!isAdaAddress(adaNewAddress.trim())) {
      setAdaNewError(t("wl_invalid_ada"));
      return;
    }
    {
      const dupNet = addressAlreadyTracked(adaNewAddress.trim());
      if (dupNet) {
        setAdaNewError(`${t("wl_dup_addr")} (${dupNet}) — ${t("wl_dup_double")}`);
        return;
      }
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
      title: t("wl_add_addr_title").replace("{chain}", "Cardano"),
      description: t("wl_add_addr_desc").replace("{addr}", adaNewAddress || t("wl_addr_undefined")).replace("{host}", host || t("wl_domain_current")),
      onConfirm: () =>
        new Promise<void>((resolve) => {
          window.setTimeout(() => {
            handleAddAdaWalletInternal();
            resolve();
          }, 0);
        }),
    });
  };

  // Remover um endereco de "outras redes" (usado na secao de acompanhamento e na lista cripto).
  const removeOtherWallet = (item: StoredWalletEntry) => {
    const next = otherWallets.filter((w) => !(w.address === item.address && w.network === item.network));
    setOtherWallets(next);
    updateWalletSnapshot({ eth: ethWallets, sol: solWallets, btc: btcWallets, ada: adaWallets, other: next });
  };

  // Mapas de DeFi/NFT so de leitura, agrupados para os componentes dos cartoes.
  const defiNftMaps = { defiTotals, defiLoading, defiPartial, defiErrors, nftCounts, nftLoading, nftErrors, nftsByKey, nftPartial, defiPosicoes };

  return (
    <AppShell>
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 pb-20 pt-2">
        <CabecalhoCarteiras
          totalWallets={totalWallets}
          quickAddr={quickAddr}
          quickMsg={quickMsg}
          quickFromDemo={quickFromDemo}
          onQuickAddrChange={(v) => { setQuickAddr(v); setQuickMsg(null); setQuickFromDemo(false); }}
          onQuickSubmit={handleQuickAdd}
          isLoadingAuth={isLoadingAuth}
          isPro={isPro}
          paymentsFrozen={paymentsFrozen}
          walletMode={walletMode}
          onWalletModeChange={setWalletMode}
        />

        {walletMode === "web3" ? (
        <>
        {confirmOpen ? (
          <ConfirmacaoModal
            title={confirmRef.current?.title}
            description={confirmRef.current?.description}
            error={confirmError}
            busy={confirmBusy}
            onCancel={() => setConfirmOpen(false)}
            onConfirm={handleConfirm}
          />
        ) : null}
        {otherWallets.length > 0 && (
          <OutrasRedesSecao
            otherWallets={otherWallets}
            otherShown={otherShown}
            setOtherShown={setOtherShown}
            renameWallet={renameWallet}
            onRemove={removeOtherWallet}
          />
        )}
        <div id="chain-cards" className="grid gap-6 md:grid-cols-2 scroll-mt-24">
          <WalletCard
            {...propsCartaoEth({
              t, ethWallets, selectedEthConnectNetwork, ethActiveEntry, ethAddress, ethShowMain, ethActiveBalance, getFiatValue,
              defiNftMaps, ethMainAddress, usdToEurRate, fetchDefiTotal, ethIsAvailable, ethLoading, ethError,
              handleEthConnect, handleEthDisconnect, handleEthRefresh, setEthShowMain,
            })}
            topContent={
              <EthSeletores
                ethWalletSelectRef={ethWalletSelectRef}
                ethWalletSelectOpen={ethWalletSelectOpen}
                setEthWalletSelectOpen={setEthWalletSelectOpen}
                selectedEvmProvider={selectedEvmProvider}
                setSelectedEvmProvider={setSelectedEvmProvider}
                ethWalletSelectFilter={ethWalletSelectFilter}
                setEthWalletSelectFilter={setEthWalletSelectFilter}
                isClient={isClient}
                ethNetworkSelectRef={ethNetworkSelectRef}
                ethNetworkSelectOpen={ethNetworkSelectOpen}
                setEthNetworkSelectOpen={setEthNetworkSelectOpen}
                selectedEthConnectNetwork={selectedEthConnectNetwork}
                setSelectedEthConnectNetwork={setSelectedEthConnectNetwork}
              />
            }
          >
            <div className="space-y-3">
              <EthAdicionar
                showEthNetworks={showEthNetworks}
                setShowEthNetworks={setShowEthNetworks}
                isClient={isClient}
                handleWalletConnect={handleWalletConnect}
                ethLoading={ethLoading}
                ethNewAddress={ethNewAddress}
                setEthNewAddress={setEthNewAddress}
                ethNewNetwork={ethNewNetwork}
                setEthNewNetwork={setEthNewNetwork}
                ethNewCustomLabel={ethNewCustomLabel}
                setEthNewCustomLabel={setEthNewCustomLabel}
                handleAddEthWallet={handleAddEthWallet}
                ethNewLoading={ethNewLoading}
                ethNewError={ethNewError}
                ethWallets={ethWallets}
                onRemoveAll={async () => {
                  if (!(await askConfirm({ message: t("wl_remove_all_confirm"), danger: true, okLabel: t("remove") }))) return;
                  setEthWallets([]);
                  setEthAddress(undefined);
                  setEthBalance(undefined);
                  setEthError(null);
                  setEthBalancesByKey({});
                  setEthBalanceErrors({});
                }}
              />
              <EthCarteirasLista
                ethWallets={ethWallets}
                ethAddress={ethAddress}
                ethConnectedNetwork={ethConnectedNetwork}
                ethBalance={ethBalance}
                ethBalancesByKey={ethBalancesByKey}
                ethBalancesLoading={ethBalancesLoading}
                ethBalanceErrors={ethBalanceErrors}
                defiNft={defiNftMaps}
                ethShown={ethShown}
                setEthShown={setEthShown}
                renameWallet={renameWallet}
                fetchDefiForEntry={fetchDefiForEntry}
                fetchEthBalanceForEntry={fetchEthBalanceForEntry}
                getFiatValue={getFiatValue}
                usdToEurRate={usdToEurRate}
                onRemove={(item) => {
                  const r = remocaoEth(ethWallets, item, ethAddress, ethConnectedNetwork);
                  setEthWallets(r.nextWallets);
                  if (r.eraLigada) {
                    setEthAddress(undefined);
                    setEthBalance(undefined);
                    setEthConnectedNetwork("Ethereum");
                    setEthError(null);
                  }
                  setEthBalancesByKey((prev) => semChave(prev, r.chave));
                  setEthBalanceErrors((prev) => semChave(prev, r.chave));
                }}
              />
            </div>
          </WalletCard>
          <WalletCard
            {...propsCartaoSol({
              solWallets, solAddress, solShowMain, totalSolBalance, solBalance, getFiatValue, defiNftMaps, solMainAddress,
              usdToEurRate, fetchDefiTotal, solIsAvailable, solLoading, solError,
              handleSolConnect, handleSolDisconnect, handleSolRefresh, setSolShowMain,
            })}
            topContent={
              <SolSeletores
                solWalletSelectRef={solWalletSelectRef}
                solWalletSelectOpen={solWalletSelectOpen}
                setSolWalletSelectOpen={setSolWalletSelectOpen}
                selectedSolProvider={selectedSolProvider}
                setSelectedSolProvider={setSelectedSolProvider}
                solWalletSelectFilter={solWalletSelectFilter}
                setSolWalletSelectFilter={setSolWalletSelectFilter}
                isClient={isClient}
                solNetworkSelectRef={solNetworkSelectRef}
                solNetworkSelectOpen={solNetworkSelectOpen}
                setSolNetworkSelectOpen={setSolNetworkSelectOpen}
                selectedSolNetwork={selectedSolNetwork}
                setSelectedSolNetwork={setSelectedSolNetwork}
              />
            }
          >
            <div className="space-y-3">
              <SolAdicionar
                isClient={isClient}
                solNewAddress={solNewAddress}
                setSolNewAddress={setSolNewAddress}
                solNewWalletSelectRef={solNewWalletSelectRef}
                solNewWalletSelectOpen={solNewWalletSelectOpen}
                setSolNewWalletSelectOpen={setSolNewWalletSelectOpen}
                solNewWalletId={solNewWalletId}
                setSolNewWalletId={setSolNewWalletId}
                solNewWalletSelectFilter={solNewWalletSelectFilter}
                setSolNewWalletSelectFilter={setSolNewWalletSelectFilter}
                handleAddSolWallet={handleAddSolWallet}
                solNewLoading={solNewLoading}
                solNewCustomLabel={solNewCustomLabel}
                setSolNewCustomLabel={setSolNewCustomLabel}
                solNewError={solNewError}
              />
              <SolCarteirasLista
                solWallets={solWallets}
                solAddress={solAddress}
                solBalance={solBalance}
                solBalancesByAddress={solBalancesByAddress}
                solBalancesLoading={solBalancesLoading}
                solBalanceErrors={solBalanceErrors}
                defiNft={defiNftMaps}
                solShown={solShown}
                setSolShown={setSolShown}
                renameWallet={renameWallet}
                fetchDefiTotal={fetchDefiTotal}
                fetchNftBalance={fetchNftBalance}
                fetchSolBalanceForAddress={fetchSolBalanceForAddress}
                getFiatValue={getFiatValue}
                usdToEurRate={usdToEurRate}
                onRemove={(item) => {
                  const r = remocaoSol(solWallets, item, solAddress);
                  setSolWallets(r.nextWallets);
                  if (r.eraLigada) { setSolAddress(undefined); setSolBalance(undefined); setSolError(null); }
                  setSolBalancesByAddress((prev) => semChave(prev, r.chave));
                  setSolBalanceErrors((prev) => semChave(prev, r.chave));
                }}
              />
            </div>
          </WalletCard>
          <WalletCard
            {...propsCartaoBtc({
              btcWallets, selectedBtcProvider, btcAddress, btcShowMain, totalBtcBalance, btcBalance, getFiatValue,
              defiNftMaps, btcMainAddress, usdToEurRate, btcIsAvailable, btcLoading, btcError,
              handleBtcConnect, handleBtcDisconnect, handleBtcRefresh, setBtcShowMain,
            })}
            topContent={
              <BtcSeletor
                btcWalletSelectRef={btcWalletSelectRef}
                btcWalletSelectOpen={btcWalletSelectOpen}
                setBtcWalletSelectOpen={setBtcWalletSelectOpen}
                selectedBtcProvider={selectedBtcProvider}
                setSelectedBtcProvider={setSelectedBtcProvider}
                btcWalletSelectFilter={btcWalletSelectFilter}
                setBtcWalletSelectFilter={setBtcWalletSelectFilter}
                isClient={isClient}
              />
            }
            extraBalance={{
              label: t("wl_runes_balance"),
              content: (
                <BtcRunesResumo
                  btcAddress={btcAddress}
                  btcWalletsCount={btcWallets.length}
                  btcRunesSummary={btcRunesSummary}
                  formatRuneAmount={formatRuneAmount}
                />
              ),
            }}
          >
            <div className="space-y-3">
              <BtcAdicionar
                btcNewAddress={btcNewAddress}
                setBtcNewAddress={setBtcNewAddress}
                btcNewNetworkSelectRef={btcNewNetworkSelectRef}
                btcNewNetworkSelectOpen={btcNewNetworkSelectOpen}
                setBtcNewNetworkSelectOpen={setBtcNewNetworkSelectOpen}
                btcNetLabel={btcNetLabel}
                btcNewLabel={btcNewLabel}
                setBtcNewLabel={setBtcNewLabel}
                btcNewNetworkSelectFilter={btcNewNetworkSelectFilter}
                setBtcNewNetworkSelectFilter={setBtcNewNetworkSelectFilter}
                handleAddBtcWallet={handleAddBtcWallet}
                btcNewLoading={btcNewLoading}
                btcNewCustomLabel={btcNewCustomLabel}
                setBtcNewCustomLabel={setBtcNewCustomLabel}
                btcNewError={btcNewError}
              />
              <BtcCarteirasLista
                btcWallets={btcWallets}
                btcAddress={btcAddress}
                btcBalance={btcBalance}
                btcBalancesByAddress={btcBalancesByAddress}
                btcBalancesLoading={btcBalancesLoading}
                btcBalanceErrors={btcBalanceErrors}
                btcRunesByAddress={btcRunesByAddress}
                btcRunesLoading={btcRunesLoading}
                defiNft={defiNftMaps}
                btcShown={btcShown}
                setBtcShown={setBtcShown}
                renameWallet={renameWallet}
                fetchBtcBalanceForAddress={fetchBtcBalanceForAddress}
                getFiatValue={getFiatValue}
                usdToEurRate={usdToEurRate}
                formatRuneAmount={formatRuneAmount}
                onRemove={(item) => {
                  const r = remocaoPorEndereco(btcWallets, item, btcAddress);
                  setBtcWallets(r.nextWallets);
                  if (r.eraLigada) {
                    setBtcAddress(undefined);
                    setBtcBalance(null);
                    setBtcError(null);
                  }
                  setBtcBalancesByAddress((prev) => semChave(prev, r.chave));
                  setBtcBalanceErrors((prev) => semChave(prev, r.chave));
                  setBtcRunesByAddress((prev) => semChave(prev, r.chave));
                  setBtcRunesLoading((prev) => semChave(prev, r.chave));
                }}
              />
            </div>
          </WalletCard>
          <WalletCard
            {...propsCartaoAda({
              adaWallets, selectedAdaProvider, adaAddress, adaShowMain, totalAdaBalance, adaBalance, getFiatValue,
              defiNftMaps, adaMainAddress, usdToEurRate, adaIsAvailable, adaLoading, adaLoadingMsg, adaError,
              handleAdaConnect, handleAdaDisconnect, handleAdaRefresh, setAdaShowMain,
            })}
          >
            <div className="space-y-3">
              <AdaAjudaLigacao
                adaAddress={adaAddress}
                adaWallets={adaWallets}
                adaPeerAddress={adaPeerAddress}
                adaPeerConnecting={adaPeerConnecting}
                handleAdaPeerConnect={handleAdaPeerConnect}
                adaQrCanvasRef={adaQrCanvasRef}
                onPeerCancel={() => { setAdaPeerAddress(null); setAdaPeerConnecting(false); }}
              />
              <AdaSeletor
                adaWalletSelectRef={adaWalletSelectRef}
                adaWalletSelectOpen={adaWalletSelectOpen}
                setAdaWalletSelectOpen={setAdaWalletSelectOpen}
                selectedAdaProvider={selectedAdaProvider}
                setSelectedAdaProvider={setSelectedAdaProvider}
                adaWalletSelectFilter={adaWalletSelectFilter}
                setAdaWalletSelectFilter={setAdaWalletSelectFilter}
                isClient={isClient}
              />
              <AdaAdicionar
                showAdaNetworks={showAdaNetworks}
                setShowAdaNetworks={setShowAdaNetworks}
                isClient={isClient}
                adaNewAddress={adaNewAddress}
                setAdaNewAddress={setAdaNewAddress}
                adaNewNetworkSelectRef={adaNewNetworkSelectRef}
                adaNewNetworkSelectOpen={adaNewNetworkSelectOpen}
                setAdaNewNetworkSelectOpen={setAdaNewNetworkSelectOpen}
                adaNewNetworkId={adaNewNetworkId}
                setAdaNewNetworkId={setAdaNewNetworkId}
                adaNewNetworkSelectFilter={adaNewNetworkSelectFilter}
                setAdaNewNetworkSelectFilter={setAdaNewNetworkSelectFilter}
                handleAddAdaWallet={handleAddAdaWallet}
                adaNewCustomLabel={adaNewCustomLabel}
                setAdaNewCustomLabel={setAdaNewCustomLabel}
                adaNewError={adaNewError}
              />
              <AdaCarteirasLista
                adaWallets={adaWallets}
                adaAddress={adaAddress}
                adaBalance={adaBalance}
                adaBalancesByAddress={adaBalancesByAddress}
                adaBalancesLoading={adaBalancesLoading}
                adaBalanceErrors={adaBalanceErrors}
                defiNft={defiNftMaps}
                adaShown={adaShown}
                setAdaShown={setAdaShown}
                renameWallet={renameWallet}
                fetchAdaBalanceForAddress={fetchAdaBalanceForAddress}
                getFiatValue={getFiatValue}
                usdToEurRate={usdToEurRate}
                onRemove={(item) => {
                  const r = remocaoPorEndereco(adaWallets, item, adaAddress);
                  setAdaWallets(r.nextWallets);
                  if (r.eraLigada) {
                    setAdaAddress(undefined);
                    setAdaBalance(undefined);
                    setAdaApi(null);
                  }
                  setAdaBalancesByAddress((prev) => semChave(prev, r.chave));
                  setAdaBalanceErrors((prev) => semChave(prev, r.chave));
                }}
              />
            </div>
          </WalletCard>
        </div>
        <section id="manual-crypto-section" className="order-last rounded-2xl border border-slate-800 bg-slate-900/60 p-6 scroll-mt-24">
          <CriptoResumoTotais
            walletsTotalUsd={walletsTotalUsd}
            totalDefiUsd={totalDefiUsd}
            cexHlTotalUsd={cexHlTotalUsd}
            coldTokensExtraUsd={coldTokensExtraUsd}
            usdToEurRate={usdToEurRate}
            cryptoManualTotal={cryptoManualTotal}
            stablecoinTotalEur={stablecoinTotalEur}
            web3Prices={web3Prices}
            evmNativeUsd={evmNativeUsd}
            totalSolBalance={totalSolBalance}
            totalBtcBalance={totalBtcBalance}
            totalAdaBalance={totalAdaBalance}
            getFiatValue={getFiatValue}
            totalNftCount={totalNftCount}
          />

          {cryptoPricesError ? (
            <ErrorNote className="mt-3">{cryptoPricesError}</ErrorNote>
          ) : null}


          <div className="mt-4 space-y-3">
            {/* Carteiras conectadas — uma linha por carteira */}
            <CarteirasLigadasLinhas
              ethWallets={ethWallets}
              solWallets={solWallets}
              btcWallets={btcWallets}
              adaWallets={adaWallets}
              ethBalancesLoading={ethBalancesLoading}
              ethBalancesByKey={ethBalancesByKey}
              solBalancesByAddress={solBalancesByAddress}
              btcBalancesByAddress={btcBalancesByAddress}
              adaBalancesByAddress={adaBalancesByAddress}
              cryptoPrices={cryptoPrices}
              getFiatValue={getFiatValue}
              usdToEurRate={usdToEurRate}
              onRemoveEth={(i) => {
                const next = ethWallets.filter((_, j) => j !== i);
                setEthWallets(next);
                updateWalletSnapshot({ eth: next, sol: solWallets, btc: btcWallets, ada: adaWallets });
              }}
              onRemoveSol={(i) => {
                const next = solWallets.filter((_, j) => j !== i);
                setSolWallets(next);
                updateWalletSnapshot({ eth: ethWallets, sol: next, btc: btcWallets, ada: adaWallets });
              }}
              onRemoveBtc={(i) => {
                const next = btcWallets.filter((_, j) => j !== i);
                setBtcWallets(next);
                updateWalletSnapshot({ eth: ethWallets, sol: solWallets, btc: next, ada: adaWallets });
              }}
              onRemoveAda={(i) => {
                const next = adaWallets.filter((_, j) => j !== i);
                setAdaWallets(next);
                updateWalletSnapshot({ eth: ethWallets, sol: solWallets, btc: btcWallets, ada: next });
              }}
            />
            {/* Stablecoins por endereço */}
            <StablecoinLinhas
              stablecoinEntries={stablecoinEntries}
              cryptoPrices={cryptoPrices}
              stablecoinBalances={stablecoinBalances}
              usdToEurRate={usdToEurRate}
              onRemove={(id) => setStablecoinEntries((prev) => prev.filter((x) => x.id !== id))}
            />
            {/* Outras redes — tracking */}
            <OutrasRedesLinhas otherWallets={otherWallets} onRemove={removeOtherWallet} />
            <AtivosManuaisLista
              marketRows={marketRows}
              cryptoHoldings={cryptoHoldings}
              toggleCryptoHolding={toggleCryptoHolding}
              semAtivos={sortedCryptoSymbols.length === 0 && !(ethWallets.length > 0 || ethAddress || solWallets.length > 0 || solAddress || btcWallets.length > 0 || btcAddress || adaWallets.length > 0 || adaAddress) && stablecoinEntries.length === 0 && otherWallets.length === 0}
              sortedCryptoSymbols={sortedCryptoSymbols}
              cryptoPrices={cryptoPrices}
              usdToEurRate={usdToEurRate}
              moneyField={moneyField}
              qtyField={qtyField}
              updateCryptoHolding={updateCryptoHolding}
            />
          </div>
          {cryptoPricesLoading ? (
            <p className="mt-3 text-xs text-slate-500">{t("wl_updating_prices")}</p>
          ) : null}

          {/* Histórico de compras e vendas */}
          <HistoricoTransacoesCta />
        </section>
        </>
        ) : (
          <div className="rounded-3xl border border-slate-800 bg-slate-950/60 p-6">
            <TradicionalCabecalho />

            {/* Adicionar ação/ETF manual */}
            <AdicionarTickerManual
              customTickerCategory={customTickerCategory}
              setCustomTickerCategory={setCustomTickerCategory}
              customTickerInput={customTickerInput}
              setCustomTickerInput={setCustomTickerInput}
              customAssets={customAssets}
              onAddTicker={() => {
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
              onRemoveCustomAsset={(a) => {
                setCustomAssets((prev) => prev.filter((x) => x.id !== a.id));
                if (traditionalHoldings[a.id]) {
                  const next = { ...traditionalHoldings };
                  delete next[a.id];
                  void saveTraditionalHoldings(next);
                  setTraditionalHoldings(next);
                }
              }}
            />

            <CategoriasTradicionais
              traditionalCategory={traditionalCategory}
              setTraditionalCategory={setTraditionalCategory}
              visibleTraditionalAssets={visibleTraditionalAssets}
              traditionalHoldings={traditionalHoldings}
              toggleTraditional={toggleTraditional}
            />

            <TradicionaisSelecionados
              traditionalSortKey={traditionalSortKey}
              setTraditionalSortKey={setTraditionalSortKey}
              traditionalSortDir={traditionalSortDir}
              setTraditionalSortDir={setTraditionalSortDir}
              sortedTraditionalAssets={sortedTraditionalAssets}
              traditionalHoldings={traditionalHoldings}
              traditionalQuotes={traditionalQuotes}
              traditionalQuoteLoading={traditionalQuoteLoading}
              quotePriceEur={quotePriceEur}
              qtyField={qtyField}
              moneyField={moneyField}
              updateTraditionalBuy={updateTraditionalBuy}
              traditionalPnlRange={traditionalPnlRange}
              setTraditionalPnlRange={setTraditionalPnlRange}
              getTraditionalPnl={getTraditionalPnl}
              refreshTraditionalQuote={refreshTraditionalQuote}
              toggleTraditional={toggleTraditional}
              onClear={() => {
                setTraditionalHoldings({});
              }}
            />

            <DadosMercadoTradicional
              traditionalQuotesLoading={traditionalQuotesLoading}
              traditionalQuotesError={traditionalQuotesError}
              selectedTraditionalAssets={selectedTraditionalAssets}
              traditionalQuotes={traditionalQuotes}
              traditionalWithQty={traditionalWithQty}
              traditionalMarketTotal={traditionalMarketTotal}
              traditionalInvestedTotal={traditionalInvestedTotal}
            />
          </div>
        )}
        {walletMode === "web3" && (<>
        <EnderecoManualSecao
          manualAddNetworkRef={manualAddNetworkRef}
          manualAddNetworkOpen={manualAddNetworkOpen}
          setManualAddNetworkOpen={setManualAddNetworkOpen}
          manualAddNetwork={manualAddNetwork}
          setManualAddNetwork={setManualAddNetwork}
          manualAddNetworkFilter={manualAddNetworkFilter}
          setManualAddNetworkFilter={setManualAddNetworkFilter}
          manualAddAddress={manualAddAddress}
          manualAddLabel={manualAddLabel}
          setManualAddLabel={setManualAddLabel}
          handleManualAddAddress={handleManualAddAddress}
          manualAddOk={manualAddOk}
          manualAddError={manualAddError}
          onAddressChange={(e) => {
            const v = e.target.value;
            setManualAddAddress(v);
            // Rede pelo formato: so troca quando a atual nao serve para este
            // endereco (quem escolheu Base para um 0x… fica com Base).
            const d = detetarRede(v);
            if (d.tipo !== "rede") return;
            const evm = Boolean(MANUAL_ADD_TO_EVM_NETWORK[manualAddNetwork]);
            if (d.rede === "eth" ? !evm : manualAddNetwork !== d.rede) setManualAddNetwork(d.rede);
          }}
        />
        <AtivoCriptoManualSecao
          manualCryptoSelectRef={manualCryptoSelectRef}
          manualCryptoSelectOpen={manualCryptoSelectOpen}
          setManualCryptoSelectOpen={setManualCryptoSelectOpen}
          manualCryptoAssetSymbol={manualCryptoAssetSymbol}
          setManualCryptoAssetSymbol={setManualCryptoAssetSymbol}
          manualCryptoFilter={manualCryptoFilter}
          setManualCryptoFilter={setManualCryptoFilter}
          cryptoSelectList={cryptoSelectList}
          marketRows={marketRows}
          cryptoPricesLoading={cryptoPricesLoading}
          manualCryptoAssetDate={manualCryptoAssetDate}
          setManualCryptoAssetDate={setManualCryptoAssetDate}
          manualCryptoAssetAmountUsd={manualCryptoAssetAmountUsd}
          setManualCryptoAssetAmountUsd={setManualCryptoAssetAmountUsd}
          manualCryptoAssetQty={manualCryptoAssetQty}
          setManualCryptoAssetQty={setManualCryptoAssetQty}
          handleManualAddCryptoAsset={handleManualAddCryptoAsset}
          manualCryptoAssetError={manualCryptoAssetError}
        />
        <StablecoinsSecao
          stablecoinAddSymbol={stablecoinAddSymbol}
          setStablecoinAddSymbol={setStablecoinAddSymbol}
          stablecoinSymbolOptions={stablecoinSymbolOptions}
          stablecoinAddAddress={stablecoinAddAddress}
          setStablecoinAddAddress={setStablecoinAddAddress}
          handleAddStablecoinEntry={handleAddStablecoinEntry}
          stablecoinAddError={stablecoinAddError}
          stablecoinEntries={stablecoinEntries}
          stableShown={stableShown}
          setStableShown={setStableShown}
          stablecoinBalances={stablecoinBalances}
          stablecoinBalancesLoading={stablecoinBalancesLoading}
          onRemoveEntry={(e) => {
            setStablecoinEntries((prev) => prev.filter((x) => x.id !== e.id));
            setStablecoinBalances((prev) => semChave(prev, e.id));
            setStablecoinBalancesLoading((prev) => semChave(prev, e.id));
          }}
        />
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
            tokensErrorByAddress={coldTokensError}
            onRetryTokens={(address, kind) => void fetchColdTokens(address, kind)}
          />
        ) : (
          <CexHardwareProAviso paymentsFrozen={paymentsFrozen} />
        )}
        </>)}
      </div>
    </div>
    </AppShell>
  );
}
