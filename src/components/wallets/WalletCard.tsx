"use client";

import { useState } from "react";

export type NftPreview = {
  id: string;
  name: string;
  image?: string;
  tokenAddress?: string;
  tokenId?: string;
};

type WalletCardProps = {
  title: string;
  description: string;
  address?: string;
  addressDisplay?: string;
  balance?: string | number | null;
  balanceUnit?: string;
  fiatValueUsd?: number | null;
  defiBalanceUsd?: number | null;
  defiLoading?: boolean;
  defiError?: string | null;
  nftCount?: number | null;
  nftLoading?: boolean;
  nftError?: string | null;
  nfts?: NftPreview[];
  isLoading?: boolean;
  error?: string | null;
  isConnected: boolean;
  isAvailable: boolean;
  onConnect: () => void;
  onDisconnect?: () => void;
  disconnectLabel?: string;
  onRefresh?: () => void;
  children?: React.ReactNode;
  allowConnectWhenUnavailable?: boolean;
  onToggleAddress?: () => void;
  isAddressVisible?: boolean;
  /** Ex.: para BTC: { label: "Runes:", content: "DOG: 1,234 · …" } */
  extraBalance?: { label: string; content: React.ReactNode };
};

const formatAddress = (address?: string) => {
  if (!address) return "";
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

export default function WalletCard({
  title,
  description,
  address,
  addressDisplay,
  balance,
  balanceUnit,
  fiatValueUsd,
  defiBalanceUsd,
  defiLoading,
  defiError,
  nftCount,
  nftLoading,
  nftError,
  nfts,
  isLoading,
  error,
  isConnected,
  isAvailable,
  onConnect,
  onDisconnect,
  disconnectLabel = "Desconectar",
  onRefresh,
  children,
  allowConnectWhenUnavailable,
  onToggleAddress,
  isAddressVisible,
  extraBalance,
}: WalletCardProps) {
  const [showNfts, setShowNfts] = useState(false);
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <p className="mt-1 text-sm text-slate-400">{description}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              isAvailable ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"
            }`}
          >
            {isAvailable ? "Disponível" : "Indisponível"}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-300">
            🔒 Só leitura · Sem acesso a fundos
          </span>
        </div>
      </div>

      <div className="mt-5 space-y-3 text-sm text-slate-300">
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="text-slate-500">Endereço:</span>{" "}
            {address
              ? addressDisplay ?? formatAddress(address)
              : "—"}
          </div>
          {address && onToggleAddress ? (
            <button
              type="button"
              onClick={onToggleAddress}
              className="rounded-full border border-slate-700 px-2 py-1 text-[11px] font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
              title={isAddressVisible ? "Ocultar endereço" : "Mostrar endereço"}
              aria-label={isAddressVisible ? "Ocultar endereço" : "Mostrar endereço"}
            >
              {isAddressVisible ? "🙈" : "👁️"}
            </button>
          ) : null}
        </div>
        <div>
          <span className="text-slate-500">Saldo:</span>{" "}
          {balance !== undefined && balance !== null
            ? `${balance} ${balanceUnit ?? ""}`.trim()
            : "—"}
        </div>
        <div>
          <span className="text-slate-500">Valor:</span>{" "}
          {fiatValueUsd != null ? `$${fiatValueUsd.toFixed(2)}` : "—"}
        </div>
        <div>
          <span className="text-slate-500">DeFi:</span>{" "}
          {defiLoading
            ? "A carregar..."
            : defiBalanceUsd != null
              ? `$${defiBalanceUsd.toFixed(2)}`
              : "—"}
        </div>
        <div>
          <span className="text-slate-500">NFT:</span>{" "}
          {nftLoading ? (
            "A carregar..."
          ) : nftCount != null ? (
            <span className="inline-flex items-center gap-2">
              {nftCount} {nftCount === 1 ? "item" : "itens"}
              {nfts && nfts.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setShowNfts((v) => !v)}
                  className="rounded-full border border-slate-600 px-2 py-0.5 text-[11px] font-semibold text-slate-300 transition hover:border-slate-500 hover:text-white"
                >
                  {showNfts ? "Ocultar" : "Ver"}
                </button>
              ) : null}
            </span>
          ) : (
            "—"
          )}
        </div>
        {showNfts && nfts && nfts.length > 0 ? (
          <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
            <p className="mb-2 text-xs font-semibold text-slate-400">Coleção</p>
            <div className="grid max-h-48 grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-5">
              {nfts.slice(0, 20).map((nft) => (
                <a
                  key={nft.id}
                  href={
                    nft.tokenAddress && nft.tokenId
                      ? `https://opensea.io/assets/ethereum/${nft.tokenAddress}/${nft.tokenId}`
                      : nft.tokenAddress
                        ? `https://magiceden.io/item-details/${nft.tokenAddress}`
                        : "#"
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex flex-col overflow-hidden rounded-lg border border-slate-700 transition hover:border-slate-500"
                >
                  <div className="aspect-square bg-slate-800">
                    {nft.image ? (
                      <img
                        src={nft.image}
                        alt={nft.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-500">
                        —
                      </div>
                    )}
                  </div>
                  <p className="truncate px-1 py-0.5 text-[10px] text-slate-400 group-hover:text-slate-200" title={nft.name}>
                    {nft.name || "NFT"}
                  </p>
                </a>
              ))}
            </div>
            {nfts.length > 20 ? (
              <p className="mt-2 text-[10px] text-slate-500">Mostrando 20 de {nfts.length}</p>
            ) : null}
          </div>
        ) : null}
        {extraBalance ? (
          <div>
            <span className="text-slate-500">{extraBalance.label}</span>{" "}
            {extraBalance.content}
          </div>
        ) : null}
        {error ? <p className="text-xs text-rose-300">{error}</p> : null}
        {defiError ? <p className="text-xs text-rose-300">{defiError}</p> : null}
        {nftError ? <p className="text-xs text-rose-300">{nftError}</p> : null}
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          className="rounded-full bg-orange-500 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={onConnect}
          disabled={isLoading || (!isAvailable && !allowConnectWhenUnavailable)}
        >
          {isConnected ? "Reconectar" : "Conectar"}
        </button>
        {onDisconnect && isConnected ? (
          <button
            className="rounded-full border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            onClick={onDisconnect}
            disabled={isLoading}
          >
            {disconnectLabel}
          </button>
        ) : null}
        {onRefresh ? (
          <button
            className="rounded-full border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            onClick={onRefresh}
            disabled={!isConnected || isLoading}
          >
            Atualizar saldo
          </button>
        ) : null}
        {isLoading ? <span className="text-xs text-slate-500">Carregando...</span> : null}
      </div>
      {children ? <div className="mt-5 space-y-4">{children}</div> : null}
    </div>
  );
}
