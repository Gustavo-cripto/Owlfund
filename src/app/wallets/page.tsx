"use client";

import { useEffect, useState } from "react";

import WalletCard from "@/components/wallets/WalletCard";
import { connectMetaMask, getEthBalance, isMetaMaskAvailable } from "@/lib/wallets/evm";
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
import { updateWalletSnapshot } from "@/lib/wallets/storage";
import { useRequireAuth } from "@/lib/auth/useRequireAuth";

export default function WalletsPage() {
  useRequireAuth("/login");
  const [isClient, setIsClient] = useState(false);
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
  }, []);
  const [ethAddress, setEthAddress] = useState<string>();
  const [ethBalance, setEthBalance] = useState<string>();
  const [ethError, setEthError] = useState<string | null>(null);
  const [ethLoading, setEthLoading] = useState(false);

  const [solAddress, setSolAddress] = useState<string>();
  const [solBalance, setSolBalance] = useState<string>();
  const [solError, setSolError] = useState<string | null>(null);
  const [solLoading, setSolLoading] = useState(false);

  const [btcAddress, setBtcAddress] = useState<string>();
  const [btcBalance, setBtcBalance] = useState<number | null>(null);
  const [btcError, setBtcError] = useState<string | null>(null);
  const [btcLoading, setBtcLoading] = useState(false);

  const [adaAddress, setAdaAddress] = useState<string>();
  const [adaBalance, setAdaBalance] = useState<string>();
  const [adaError, setAdaError] = useState<string | null>(null);
  const [adaLoading, setAdaLoading] = useState(false);
  const [adaApi, setAdaApi] = useState<EternlApi | null>(null);

  const handleEthConnect = async () => {
    try {
      setEthLoading(true);
      setEthError(null);
      const address = await connectMetaMask();
      setEthAddress(address);
      const balance = await getEthBalance(address);
      const formatted = Number(balance).toFixed(4);
      setEthBalance(formatted);
      updateWalletSnapshot({ eth: { address, balance: formatted } });
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
      updateWalletSnapshot({ eth: { address: ethAddress, balance: formatted } });
    } catch (error) {
      setEthError(error instanceof Error ? error.message : "Erro ao atualizar saldo.");
    } finally {
      setEthLoading(false);
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
      updateWalletSnapshot({ sol: { address, balance } });
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
      updateWalletSnapshot({ sol: { address: solAddress, balance } });
    } catch (error) {
      setSolError(error instanceof Error ? error.message : "Erro ao atualizar saldo.");
    } finally {
      setSolLoading(false);
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
        updateWalletSnapshot({
          btc: { address, balance: walletBalance.toFixed(8) },
        });
        return;
      }
      const apiBalance = await getBtcBalanceFromAddress(address);
      setBtcBalance(apiBalance);
      updateWalletSnapshot({
        btc: { address, balance: apiBalance.toFixed(8) },
      });
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
        updateWalletSnapshot({
          btc: { address: btcAddress, balance: walletBalance.toFixed(8) },
        });
        return;
      }
      const apiBalance = await getBtcBalanceFromAddress(btcAddress);
      setBtcBalance(apiBalance);
      updateWalletSnapshot({
        btc: { address: btcAddress, balance: apiBalance.toFixed(8) },
      });
    } catch (error) {
      setBtcError(error instanceof Error ? error.message : "Erro ao atualizar saldo.");
    } finally {
      setBtcLoading(false);
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
      updateWalletSnapshot({ ada: { address, balance } });
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
        updateWalletSnapshot({ ada: { address: adaAddress, balance } });
      }
    } catch (error) {
      setAdaError(error instanceof Error ? error.message : "Erro ao atualizar saldo.");
    } finally {
      setAdaLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 pb-20 pt-12">
        <div className="flex flex-col gap-4">
          <a
            className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500 transition hover:text-slate-200"
            href="/"
          >
            Voltar para início
          </a>
          <p className="text-xs uppercase tracking-[0.3em] text-orange-300/80">
            Carteiras Web3
          </p>
          <h1 className="text-3xl font-semibold text-white">
            Leitura de saldo e endereços por rede
          </h1>
          <p className="max-w-2xl text-sm text-slate-400">
            Conecte as carteiras listadas e visualize apenas dados de leitura. Nenhuma
            transação é enviada nesta etapa.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <WalletCard
            title="Ethereum"
            description="MetaMask (ETH)"
            address={ethAddress}
            balance={ethBalance}
            balanceUnit="ETH"
            isConnected={!!ethAddress}
            isAvailable={isClient && availability.metamask}
            isLoading={ethLoading}
            error={ethError}
            onConnect={handleEthConnect}
            onRefresh={handleEthRefresh}
          />
          <WalletCard
            title="Solana"
            description="Phantom (SOL)"
            address={solAddress}
            balance={solBalance}
            balanceUnit="SOL"
            isConnected={!!solAddress}
            isAvailable={isClient && availability.phantom}
            isLoading={solLoading}
            error={solError}
            onConnect={handleSolConnect}
            onRefresh={handleSolRefresh}
          />
          <WalletCard
            title="Bitcoin"
            description="Xverse (BTC)"
            address={btcAddress}
            balance={btcBalance !== null ? btcBalance.toFixed(8) : null}
            balanceUnit="BTC"
            isConnected={!!btcAddress}
            isAvailable={isClient && availability.xverse}
            isLoading={btcLoading}
            error={btcError}
            onConnect={handleBtcConnect}
            onRefresh={handleBtcRefresh}
          />
          <WalletCard
            title="Cardano"
            description="Eternl (ADA)"
            address={adaAddress}
            balance={adaBalance}
            balanceUnit="ADA"
            isConnected={!!adaAddress}
            isAvailable={isClient && availability.eternl}
            isLoading={adaLoading}
            error={adaError}
            onConnect={handleAdaConnect}
            onRefresh={handleAdaRefresh}
          />
        </div>
      </main>
    </div>
  );
}
