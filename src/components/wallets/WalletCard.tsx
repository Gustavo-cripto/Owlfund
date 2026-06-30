"use client";

import { useState } from "react";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useCurrencyFormat } from "@/lib/theme/ThemeContext";

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
  /** Esconde a linha "DeFi:" (ex.: BTC, que não tem DeFi de lending na L1). */
  hideDefi?: boolean;
  usdToEur?: number;
  onRefreshDefi?: () => void;
  nftCount?: number | null;
  nftLoading?: boolean;
  nftError?: string | null;
  nfts?: NftPreview[];
  isLoading?: boolean;
  loadingMessage?: string;
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
  /** Conteúdo a renderizar acima dos valores (endereço, saldo, etc.) */
  topContent?: React.ReactNode;
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
  hideDefi,
  usdToEur = 0.92,
  onRefreshDefi,
  nftCount,
  nftLoading,
  nftError,
  nfts,
  isLoading,
  loadingMessage,
  error,
  isConnected,
  isAvailable,
  onConnect,
  onDisconnect,
  disconnectLabel,
  onRefresh,
  children,
  allowConnectWhenUnavailable,
  onToggleAddress,
  isAddressVisible,
  extraBalance,
  topContent,
}: WalletCardProps) {
  const { t } = useLanguage();
  const { format: fmtCur } = useCurrencyFormat();
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
            {isAvailable ? t("wc_available") : t("wc_unavailable")}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-300">
            🔒 Só leitura · Sem acesso a fundos
          </span>
        </div>
      </div>

      {topContent ? <div className="mt-4">{topContent}</div> : null}
      <div className="mt-5 space-y-3 text-sm text-slate-300">
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="text-slate-500">{t("wc_address")}</span>{" "}
            {address
              ? isAddressVisible
                ? (addressDisplay ?? formatAddress(address))
                : <span className="tracking-widest text-slate-600 select-none">••••••••</span>
              : "—"}
          </div>
          {address && onToggleAddress ? (
            <button
              type="button"
              onClick={onToggleAddress}
              className="rounded-full border border-slate-700 px-2 py-1 text-[11px] font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
              title={isAddressVisible ? t("wc_hide_addr") : t("wc_show_addr")}
              aria-label={isAddressVisible ? t("wc_hide_addr") : t("wc_show_addr")}
            >
              {isAddressVisible ? "🙈" : "👁️"}
            </button>
          ) : null}
        </div>
        <div>
          <span className="text-slate-500">{t("wc_balance")}</span>{" "}
          {balance !== undefined && balance !== null
            ? `${balance} ${balanceUnit ?? ""}`.trim()
            : "—"}
        </div>
        <div>
          <span className="text-slate-500">{t("wc_value")}</span>{" "}
          {fiatValueUsd != null
            ? fmtCur(fiatValueUsd * usdToEur)
            : "—"}
        </div>
        <div className={`flex flex-wrap items-center gap-2 ${hideDefi ? "hidden" : ""}`}>
          <span className="text-slate-500">{t("wc_defi")}</span>{" "}
          {defiLoading
            ? <span className="animate-pulse">{t("wc_loading")}</span>
            : defiBalanceUsd != null
              ? <span className={defiBalanceUsd >= 0.01 ? "text-emerald-400 font-semibold" : "text-slate-400"}>
                  {fmtCur(defiBalanceUsd * usdToEur)}
                </span>
              : <span className="text-slate-600 text-[11px]">—</span>}
          {address && balanceUnit !== "BTC" && balanceUnit !== "ADA" && (
            <span className="inline-flex items-center gap-1.5">
              {balanceUnit === "SOL"
                ? <a href={`https://app.meteora.ag/dlmm?wallet=${address}`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-violet-400 hover:text-violet-300 underline underline-offset-2">Meteora ↗</a>
                : <>
                    <a href={`https://app.uniswap.org/positions`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-pink-400 hover:text-pink-300 underline underline-offset-2">Uniswap ↗</a>
                    <a href={`https://defillama.com/portfolio#${address}`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-violet-400 hover:text-violet-300 underline underline-offset-2">DeFiLlama ↗</a>
                  </>}
              {onRefreshDefi && (
                <button type="button" onClick={onRefreshDefi} className="text-slate-600 hover:text-orange-400 transition text-[10px]" title={t("wc_refresh_defi")}>↻</button>
              )}
            </span>
          )}
        </div>
        <div>
          <span className="text-slate-500">{t("wc_nft")}</span>{" "}
          {nftLoading ? (
            t("wc_loading2")
          ) : nftCount != null ? (
            <span className="inline-flex items-center gap-2">
              {nftCount} {nftCount === 1 ? "item" : "itens"}
              {nfts && nfts.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setShowNfts((v) => !v)}
                  className="rounded-full border border-slate-600 px-2 py-0.5 text-[11px] font-semibold text-slate-300 transition hover:border-slate-500 hover:text-white"
                >
                  {showNfts ? t("wc_hide") : "Ver"}
                </button>
              ) : null}
            </span>
          ) : (
            "—"
          )}
        </div>
        {showNfts && nfts && nfts.length > 0 ? (
          <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
            <p className="mb-2 text-xs font-semibold text-slate-400">{t("wc_collection")}</p>
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
          {isConnected ? t("wc_reconnect") : t("wc_connect")}
        </button>
        {onDisconnect && isConnected ? (
          <button
            className="rounded-full border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            onClick={onDisconnect}
            disabled={isLoading}
          >
            {disconnectLabel ?? t("wc_disconnect")}
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
        {isLoading ? <span className="text-xs text-slate-500 animate-pulse">{loadingMessage ?? t("wc_loading3")}</span> : null}
      </div>
      {children ? <div className="mt-5 space-y-4">{children}</div> : null}
    </div>
  );
}
