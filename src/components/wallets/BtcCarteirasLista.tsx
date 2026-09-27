"use client";

import EditableName from "@/components/wallets/EditableName";
import NftImage from "@/components/NftImage";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useCurrencyFormat } from "@/lib/theme/ThemeContext";
import { defiKey, type DefiNftMaps } from "@/lib/wallets/formatar";
import { btcWalletOptions } from "@/lib/wallets/opcoes";
import type { RunesBalanceEntry } from "@/lib/wallets/bitcoin";
import type { StoredWalletEntry } from "@/lib/wallets/storage";

// Lista das carteiras Bitcoin (saldo, Ordinals e Runes por endereco).
// Extraido de src/app/(pt)/wallets/page.tsx (fase 1): o estado continua na pagina.
type Props = {
  btcWallets: StoredWalletEntry[];
  btcAddress: string | undefined;
  btcBalance: number | null;
  btcBalancesByAddress: Record<string, string>;
  btcBalancesLoading: Record<string, boolean>;
  btcBalanceErrors: Record<string, string | null>;
  btcRunesByAddress: Record<string, RunesBalanceEntry[]>;
  btcRunesLoading: Record<string, boolean>;
  defiNft: DefiNftMaps;
  btcShown: Record<string, boolean>;
  setBtcShown: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  renameWallet: (kind: "btc", address: string | undefined, rawLabel: string) => void;
  fetchBtcBalanceForAddress: (address: string) => unknown;
  getFiatValue: (symbol: string, balanceValue?: string | number | null) => number | null;
  usdToEurRate: number;
  formatRuneAmount: (amount: number | string) => string;
  onRemove: (item: StoredWalletEntry) => void;
};

export default function BtcCarteirasLista({
  btcWallets, btcAddress, btcBalance, btcBalancesByAddress, btcBalancesLoading, btcBalanceErrors,
  btcRunesByAddress, btcRunesLoading, defiNft, btcShown, setBtcShown, renameWallet,
  fetchBtcBalanceForAddress, getFiatValue, usdToEurRate, formatRuneAmount, onRemove,
}: Props) {
  const { t } = useLanguage();
  const { format: fmtCur, hideBalances } = useCurrencyFormat();
  const { defiTotals, defiLoading, nftCounts, nftLoading, nftsByKey } = defiNft;
  return (
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
            ? t("wl_loading")
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
                  <span className="ml-2 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] text-emerald-300">
                    {t("wl_connected")}
                  </span>
                ) : (
                  <span className="ml-2 rounded-full bg-slate-600/30 px-2 py-0.5 text-[11px] text-slate-400">
                    {t("wl_by_address")}
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
                  className="rounded-full border border-slate-700 px-2 py-1 text-[11px] font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
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
                      ? t("wl_loading")
                      : itemNftCount != null
                        ? `${itemNftCount} ${itemNftCount === 1 ? t("wc_item") : t("wc_items")}`
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
                    <p className="text-[11px] text-slate-500">{t("wl_runes_loading")}</p>
                  ) : (btcRunesByAddress[addr]?.length ?? 0) > 0 ? (
                    <div className="space-y-0.5 text-[11px] text-amber-200/90">
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
                  {hideBalances ? "••••" : <>{balanceDisplay} {balanceDisplay !== t("wl_loading") && balanceDisplay !== "—" ? "BTC" : ""}</>}
                </p>
              )}
              {balanceDisplay != null && balanceDisplay !== t("wl_loading") && balanceDisplay !== "—" && getFiatValue("BTC", balanceDisplay) != null ? (
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
                    {loading ? t("wl_loading") : t("wl_retry")}
                  </button>
                ) : null}
                <button
                  className="rounded-full border border-rose-400/40 px-3 py-1 text-[11px] font-semibold text-rose-200 transition hover:border-rose-400 hover:text-white"
                  type="button"
                  onClick={() => onRemove(item)}
                >
                  {t("wl_remove")}
                </button>
              </div>
            </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
