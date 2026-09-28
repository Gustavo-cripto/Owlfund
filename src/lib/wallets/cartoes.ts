// Props dos quatro WalletCard da pagina de carteiras (Ethereum, Solana,
// Bitcoin, Cardano), calculadas a partir do estado da pagina. Extraido de
// src/app/(pt)/wallets/page.tsx sem alteracoes de comportamento (fase 2): as
// expressoes sao as mesmas que estavam no JSX, pela mesma ordem, com os mesmos
// fallbacks. O estado, os handlers e o JSX (topContent, extraBalance, filhos)
// continuam na pagina. Testes em scripts/testes/cartoesCarteiras.test.ts.
import type { Dispatch, SetStateAction } from "react";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { EvmNetwork } from "@/lib/wallets/evm";
import type { CardanoWalletId } from "@/lib/wallets/cardano";
import type { StoredWalletEntry } from "@/lib/wallets/storage";
import { formatAddress, propsDefiNftCartao, type DefiChain, type DefiNftMaps } from "@/lib/wallets/formatar";
import { adaWalletOptions, btcWalletOptions, type BtcWalletId } from "@/lib/wallets/opcoes";

/** O que os quatro cartoes usam em comum. */
type EntradaComum = {
  defiNftMaps: DefiNftMaps;
  usdToEurRate: number;
  getFiatValue: (symbol: string, balanceValue?: string | number | null) => number | null;
};

export type EntradaCartaoEth = EntradaComum & {
  t: (key: TranslationKey) => string;
  ethWallets: StoredWalletEntry[];
  selectedEthConnectNetwork: EvmNetwork;
  ethActiveEntry: StoredWalletEntry | null;
  ethAddress: string | undefined;
  ethShowMain: boolean;
  ethActiveBalance: string | null;
  ethMainAddress: string | undefined;
  fetchDefiTotal: (address: string, chain: DefiChain) => Promise<void>;
  ethIsAvailable: boolean;
  ethLoading: boolean;
  ethError: string | null;
  handleEthConnect: () => void;
  handleEthDisconnect: () => void;
  handleEthRefresh: () => void;
  setEthShowMain: Dispatch<SetStateAction<boolean>>;
};

export const propsCartaoEth = ({
  t, ethWallets, selectedEthConnectNetwork, ethActiveEntry, ethAddress, ethShowMain, ethActiveBalance, getFiatValue,
  defiNftMaps, ethMainAddress, usdToEurRate, fetchDefiTotal, ethIsAvailable, ethLoading, ethError,
  handleEthConnect, handleEthDisconnect, handleEthRefresh, setEthShowMain,
}: EntradaCartaoEth) => ({
  title: "Ethereum",
  description:
    ethWallets.length > 0
      ? `${selectedEthConnectNetwork === "Ethereum" ? "ETH Mainnet" : selectedEthConnectNetwork} · ${t("wl_networks_n").replace("{n}", String(ethWallets.length))}`
      : "MetaMask (ETH)",
  address: ethActiveEntry?.address ?? ethAddress ?? ethWallets[0]?.address,
  addressDisplay:
    ethShowMain
      ? (ethActiveEntry?.address ?? ethAddress ?? ethWallets[0]?.address)
      : formatAddress(ethActiveEntry?.address ?? ethAddress ?? ethWallets[0]?.address),
  balance: ethActiveBalance,
  balanceUnit: "ETH",
  fiatValueUsd: getFiatValue("ETH", ethActiveBalance),
  ...propsDefiNftCartao(defiNftMaps, ethMainAddress, "eth"),
  usdToEur: usdToEurRate,
  onRefreshDefi: ethMainAddress ? () => void fetchDefiTotal(ethMainAddress, "eth") : undefined,
  isConnected: !!ethAddress || ethWallets.length > 0,
  isAvailable: ethIsAvailable || ethWallets.length > 0,
  isLoading: ethLoading,
  error: ethError,
  onConnect: handleEthConnect,
  onConnectAnother: handleEthConnect,
  onDisconnect: handleEthDisconnect,
  onRefresh: handleEthRefresh,
  onToggleAddress: () => setEthShowMain((prev) => !prev),
  isAddressVisible: ethShowMain,
});

export type EntradaCartaoSol = EntradaComum & {
  solWallets: StoredWalletEntry[];
  solAddress: string | undefined;
  solShowMain: boolean;
  totalSolBalance: string;
  solBalance: string | undefined;
  solMainAddress: string | undefined;
  fetchDefiTotal: (address: string, chain: DefiChain) => Promise<void>;
  solIsAvailable: boolean;
  solLoading: boolean;
  solError: string | null;
  handleSolConnect: () => void;
  handleSolDisconnect: () => void;
  handleSolRefresh: () => void;
  setSolShowMain: Dispatch<SetStateAction<boolean>>;
};

export const propsCartaoSol = ({
  solWallets, solAddress, solShowMain, totalSolBalance, solBalance, getFiatValue, defiNftMaps, solMainAddress,
  usdToEurRate, fetchDefiTotal, solIsAvailable, solLoading, solError,
  handleSolConnect, handleSolDisconnect, handleSolRefresh, setSolShowMain,
}: EntradaCartaoSol) => ({
  title: "Solana",
  description:
    solWallets.length > 0
      ? `${solWallets.length} carteira(s) · Saldo total SOL`
      : "Phantom (SOL)",
  address: solAddress ?? solWallets[0]?.address,
  addressDisplay:
    solShowMain
      ? solAddress ?? solWallets[0]?.address
      : formatAddress(solAddress ?? solWallets[0]?.address),
  balance: solWallets.length > 0 ? totalSolBalance : solBalance,
  balanceUnit: "SOL",
  fiatValueUsd: getFiatValue("SOL", solWallets.length > 0 ? totalSolBalance : solBalance),
  ...propsDefiNftCartao(defiNftMaps, solMainAddress, "sol"),
  usdToEur: usdToEurRate,
  onRefreshDefi: solMainAddress ? () => void fetchDefiTotal(solMainAddress, "sol") : undefined,
  isConnected: !!solAddress || solWallets.length > 0,
  isAvailable: solIsAvailable || solWallets.length > 0,
  isLoading: solLoading,
  error: solError,
  onConnect: handleSolConnect,
  onConnectAnother: handleSolConnect,
  onDisconnect: handleSolDisconnect,
  onRefresh: handleSolRefresh,
  onToggleAddress: () => setSolShowMain((prev) => !prev),
  isAddressVisible: solShowMain,
});

export type EntradaCartaoBtc = EntradaComum & {
  btcWallets: StoredWalletEntry[];
  selectedBtcProvider: BtcWalletId;
  btcAddress: string | undefined;
  btcShowMain: boolean;
  totalBtcBalance: string;
  btcBalance: number | null;
  btcMainAddress: string | undefined;
  btcIsAvailable: boolean;
  btcLoading: boolean;
  btcError: string | null;
  handleBtcConnect: () => void;
  handleBtcDisconnect: () => void;
  handleBtcRefresh: () => void;
  setBtcShowMain: Dispatch<SetStateAction<boolean>>;
};

export const propsCartaoBtc = ({
  btcWallets, selectedBtcProvider, btcAddress, btcShowMain, totalBtcBalance, btcBalance, getFiatValue,
  defiNftMaps, btcMainAddress, usdToEurRate, btcIsAvailable, btcLoading, btcError,
  handleBtcConnect, handleBtcDisconnect, handleBtcRefresh, setBtcShowMain,
}: EntradaCartaoBtc) => ({
  title: "Bitcoin",
  description:
    btcWallets.length > 0
      ? `${btcWallets.length} carteira(s) · Saldo total BTC`
      : `${btcWalletOptions.find((o) => o.id === selectedBtcProvider)?.label ?? "Xverse"} (BTC)`,
  address: btcAddress ?? btcWallets[0]?.address,
  addressDisplay:
    btcShowMain
      ? btcAddress ?? btcWallets[0]?.address
      : formatAddress(btcAddress ?? btcWallets[0]?.address),
  balance: btcWallets.length > 0 ? totalBtcBalance : (btcBalance !== null ? btcBalance.toFixed(8) : null),
  balanceUnit: "BTC",
  fiatValueUsd: getFiatValue("BTC", btcWallets.length > 0 ? totalBtcBalance : (btcBalance ?? undefined)),
  hideDefi: true,
  ...propsDefiNftCartao(defiNftMaps, btcMainAddress, "btc"),
  usdToEur: usdToEurRate,
  isConnected: !!btcAddress || btcWallets.length > 0,
  isAvailable: btcIsAvailable,
  isLoading: btcLoading,
  error: btcError,
  onConnect: handleBtcConnect,
  onConnectAnother: handleBtcConnect,
  onDisconnect: handleBtcDisconnect,
  onRefresh: handleBtcRefresh,
  allowConnectWhenUnavailable: true,
  onToggleAddress: () => setBtcShowMain((prev) => !prev),
  isAddressVisible: btcShowMain,
});

export type EntradaCartaoAda = EntradaComum & {
  adaWallets: StoredWalletEntry[];
  selectedAdaProvider: CardanoWalletId;
  adaAddress: string | undefined;
  adaShowMain: boolean;
  totalAdaBalance: string;
  adaBalance: string | undefined;
  adaMainAddress: string | undefined;
  adaIsAvailable: boolean;
  adaLoading: boolean;
  adaLoadingMsg: string | undefined;
  adaError: string | null;
  handleAdaConnect: () => void;
  handleAdaDisconnect: () => void;
  handleAdaRefresh: () => void;
  setAdaShowMain: Dispatch<SetStateAction<boolean>>;
};

export const propsCartaoAda = ({
  adaWallets, selectedAdaProvider, adaAddress, adaShowMain, totalAdaBalance, adaBalance, getFiatValue,
  defiNftMaps, adaMainAddress, usdToEurRate, adaIsAvailable, adaLoading, adaLoadingMsg, adaError,
  handleAdaConnect, handleAdaDisconnect, handleAdaRefresh, setAdaShowMain,
}: EntradaCartaoAda) => ({
  title: "Cardano",
  description:
    adaWallets.length > 0
      ? `${adaWallets.length} carteira(s) · Saldo total ADA`
      : `${adaWalletOptions.find((o) => o.id === selectedAdaProvider)?.label ?? "Eternl"} (ADA)`,
  address: adaAddress ?? adaWallets[0]?.address,
  addressDisplay:
    adaShowMain
      ? adaAddress ?? adaWallets[0]?.address
      : formatAddress(adaAddress ?? adaWallets[0]?.address),
  balance: adaWallets.length > 0 ? totalAdaBalance : adaBalance,
  balanceUnit: "ADA",
  fiatValueUsd: getFiatValue("ADA", adaWallets.length > 0 ? totalAdaBalance : adaBalance),
  ...propsDefiNftCartao(defiNftMaps, adaMainAddress, "ada"),
  usdToEur: usdToEurRate,
  isConnected: !!adaAddress || adaWallets.length > 0,
  isAvailable: adaIsAvailable || adaWallets.length > 0,
  isLoading: adaLoading,
  loadingMessage: adaLoadingMsg,
  error: adaError,
  onConnect: handleAdaConnect,
  onConnectAnother: handleAdaConnect,
  onDisconnect: handleAdaDisconnect,
  onRefresh: handleAdaRefresh,
  onToggleAddress: () => setAdaShowMain((prev) => !prev),
  isAddressVisible: adaShowMain,
});
