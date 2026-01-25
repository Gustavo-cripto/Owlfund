"use client";

import { useEffect, useMemo, useState } from "react";

import { loadWalletSnapshot } from "@/lib/wallets/storage";

type WalletBalance = {
  label: string;
  symbol: string;
  balance?: string;
  address?: string;
};

const formatAddress = (address?: string) => {
  if (!address) return "—";
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

const sumCrypto = (balances: WalletBalance[]) => {
  return balances.reduce((sum, item) => {
    const value = Number(item.balance ?? 0);
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);
};

export default function PortfolioPage() {
  const [wallets, setWallets] = useState<WalletBalance[]>([]);

  useEffect(() => {
    const snapshot = loadWalletSnapshot();
    setWallets([
      {
        label: "Ethereum",
        symbol: "ETH",
        balance: snapshot.eth?.balance,
        address: snapshot.eth?.address,
      },
      {
        label: "Solana",
        symbol: "SOL",
        balance: snapshot.sol?.balance,
        address: snapshot.sol?.address,
      },
      {
        label: "Bitcoin",
        symbol: "BTC",
        balance: snapshot.btc?.balance,
        address: snapshot.btc?.address,
      },
      {
        label: "Cardano",
        symbol: "ADA",
        balance: snapshot.ada?.balance,
        address: snapshot.ada?.address,
      },
    ]);
  }, []);

  const cryptoTotal = useMemo(() => sumCrypto(wallets), [wallets]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 pb-20 pt-12">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <a
              className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500 transition hover:text-slate-200"
              href="/"
            >
              Voltar para início
            </a>
            <a
              className="rounded-full border border-orange-400/40 px-4 py-2 text-xs font-semibold text-orange-200 transition hover:border-orange-400 hover:text-white"
              href="/wallets"
            >
              Carteiras
            </a>
          </div>
          <h1 className="text-3xl font-semibold text-white">Portfolio</h1>
          <p className="max-w-2xl text-sm text-slate-400">
            Visão consolidada de cripto e tradicional. Os saldos de cripto são
            sincronizados a partir da página de carteiras.
          </p>
        </div>

        <section className="grid gap-6 md:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <h2 className="text-lg font-semibold text-white">Cripto</h2>
            <p className="text-sm text-slate-400">Saldos das carteiras conectadas</p>
            <div className="mt-6 space-y-4">
              {wallets.map((wallet) => (
                <div
                  key={wallet.symbol}
                  className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-950/60 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-semibold text-white">{wallet.label}</p>
                    <p className="text-xs text-slate-500">{formatAddress(wallet.address)}</p>
                  </div>
                  <div className="text-sm font-semibold text-orange-200">
                    {wallet.balance ?? "—"} {wallet.symbol}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <h2 className="text-lg font-semibold text-white">Resumo</h2>
            <div className="mt-6 space-y-4">
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                  Total cripto
                </p>
                <p className="mt-2 text-2xl font-semibold text-white">
                  {cryptoTotal.toFixed(4)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                  Tradicional
                </p>
                <p className="mt-2 text-sm text-slate-400">
                  Em breve: ações, ETFs e renda fixa.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
