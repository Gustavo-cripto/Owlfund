"use client";

import EditableName from "@/components/wallets/EditableName";
import NftImage from "@/components/NftImage";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useCurrencyFormat } from "@/lib/theme/ThemeContext";
import { defiKey, type DefiChain, type DefiNftMaps } from "@/lib/wallets/formatar";
import { solWalletOptions } from "@/lib/wallets/opcoes";
import type { StoredWalletEntry } from "@/lib/wallets/storage";

// Lista das carteiras Solana (saldo, DeFi e NFTs por endereco).
// Extraido de src/app/(pt)/wallets/page.tsx (fase 1): o estado continua na pagina.
type Props = {
  solWallets: StoredWalletEntry[];
  solAddress: string | undefined;
  solBalance: string | undefined;
  solBalancesByAddress: Record<string, string>;
  solBalancesLoading: Record<string, boolean>;
  solBalanceErrors: Record<string, string | null>;
  defiNft: DefiNftMaps;
  solShown: Record<string, boolean>;
  setSolShown: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  renameWallet: (kind: "sol", address: string | undefined, rawLabel: string) => void;
  fetchDefiTotal: (address: string, chain: DefiChain) => unknown;
  fetchNftBalance: (address: string, chain: DefiChain) => unknown;
  fetchSolBalanceForAddress: (address: string) => unknown;
  getFiatValue: (symbol: string, balanceValue?: string | number | null) => number | null;
  usdToEurRate: number;
  onRemove: (item: StoredWalletEntry) => void;
};

export default function SolCarteirasLista({
  solWallets, solAddress, solBalance, solBalancesByAddress, solBalancesLoading, solBalanceErrors,
  defiNft, solShown, setSolShown, renameWallet, fetchDefiTotal, fetchNftBalance,
  fetchSolBalanceForAddress, getFiatValue, usdToEurRate, onRemove,
}: Props) {
  const { t } = useLanguage();
  const { format: fmtCur, hideBalances } = useCurrencyFormat();
  const { defiTotals, defiLoading, defiPartial, nftCounts, nftLoading, nftsByKey } = defiNft;
  return (
    <div className="space-y-2">
      {solWallets.map((item) => {
        const isConnected = item.address === solAddress
          || (!!item.label && solWalletOptions.some((o) => o.label === item.label));
        const addr = item.address ?? "";
        const loading = solBalancesLoading[addr];
        const err = solBalanceErrors[addr];
        const balanceDisplay = item.address === solAddress
          ? solBalance ?? "—"
          : loading
            ? t("wl_loading")
            : err
              ? null
              : solBalancesByAddress[addr] ?? item.balance ?? "—";
        const dk = addr ? defiKey(addr, "sol") : null;
        const itemDefi = dk ? (defiTotals[dk] ?? null) : null;
        const itemDefiLoading = dk ? !!defiLoading[dk] : false;
        const itemDefiPartial = dk ? !!defiPartial[dk] : false;
        const itemNftCount = dk ? (nftCounts[dk] ?? null) : null;
        const itemNftLoading = dk ? !!nftLoading[dk] : false;
        const itemNfts = dk ? (nftsByKey[dk] ?? []) : [];
        return (
          <div
            key={`${item.address}-${item.network ?? "Solana"}`}
            className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-300"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="space-y-1">
                <p className="font-semibold text-white">
                  <EditableName
                    current={item.label ?? ""}
                    display={item.label ?? item.network ?? "Solana"}
                    onSave={(v) => renameWallet("sol", item.address, v)}
                    placeholder={t("wc_name_ph")}
                  />
                  {isConnected ? (
                    <span className="ml-2 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] text-emerald-300">{t("wl_connected")}</span>
                  ) : (
                    <span className="ml-2 rounded-full bg-slate-600/30 px-2 py-0.5 text-[11px] text-slate-400">{t("wl_by_address")}</span>
                  )}
                </p>
                <div className="flex items-center gap-2">
                  <p className="text-slate-500">
                    {solShown[addr] ? item.address : <span className="tracking-widest text-slate-600 select-none">••••••••</span>}
                  </p>
                  <button
                    type="button"
                    onClick={() => setSolShown((prev) => ({ ...prev, [addr]: !prev[addr] }))}
                    className="rounded-full border border-slate-700 px-2 py-1 text-[11px] font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
                    title={solShown[addr] ? "Ocultar" : "Mostrar"}
                  >
                    {solShown[addr] ? "🙈" : "👁️"}
                  </button>
                </div>
                {/* DeFi */}
                <p className="flex flex-wrap items-center gap-1.5 text-slate-500">
                  DeFi:{" "}
                  {itemDefiLoading
                    ? <span className="animate-pulse">{t("wl_loading")}</span>
                    : itemDefi != null
                      ? <span className={itemDefi >= 0.01 ? "text-emerald-400 font-semibold" : "text-slate-400"}>
                          {fmtCur(itemDefi * usdToEurRate)}
                        </span>
                      : <span className="text-slate-600 text-[11px]">—</span>}
                      {itemDefiPartial && !itemDefiLoading && (
                        <span title={t("pcs_defi_partial")} className="cursor-help rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 text-[11px] text-amber-300">{t("wl_defi_partial")}</span>
                      )}
                  {addr && (
                    <span className="inline-flex items-center gap-1.5">
                      <a href="https://app.meteora.ag/portfolio" target="_blank" rel="noopener noreferrer" className="text-[11px] text-violet-400 hover:text-violet-300 underline underline-offset-2">Meteora ↗</a>
                      <a href={`https://defillama.com/portfolio#${addr}`} target="_blank" rel="noopener noreferrer" className="text-[11px] text-violet-400 hover:text-violet-300 underline underline-offset-2">DeFiLlama ↗</a>
                      <button
                        type="button"
                        onClick={() => { void fetchDefiTotal(addr, "sol"); void fetchNftBalance(addr, "sol"); }}
                        className="text-slate-600 hover:text-orange-400 transition text-[11px]"
                        title={t("wl_refresh_defi")}
                      >↻</button>
                    </span>
                  )}
                </p>
                {/* NFT */}
                <p className="text-slate-500">
                  NFT:{" "}
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
                        href={nft.tokenAddress ? `https://magiceden.io/item-details/${nft.tokenAddress}` : "#"}
                        target="_blank" rel="noopener noreferrer"
                        className="aspect-square overflow-hidden rounded border border-slate-700 bg-slate-800"
                        title={nft.name}
                      >
                        {(nft.image || nft.tokenUri)
                          ? <NftImage src={nft.image} tokenUri={nft.tokenUri} alt={nft.name} className="h-full w-full object-cover" loading="lazy" />
                          : <div className="h-full w-full flex items-center justify-center text-[8px] text-slate-500">{nft.name?.slice(0, 3)}</div>}
                      </a>
                    ))}
                  </div>
                )}
              </div>
              <div className="text-right shrink-0">
                {balanceDisplay != null && (
                  <p>{hideBalances ? "••••" : <>{balanceDisplay}{balanceDisplay !== t("wl_loading") && balanceDisplay !== "—" ? " SOL" : ""}</>}</p>
                )}
                {balanceDisplay != null && balanceDisplay !== t("wl_loading") && balanceDisplay !== "—" && getFiatValue("SOL", balanceDisplay) != null ? (
                  <p className="text-slate-400">{fmtCur((getFiatValue("SOL", balanceDisplay) ?? 0) * usdToEurRate)}</p>
                ) : null}
                {err ? (
                  <p className="text-rose-300" title={err}>{err.length > 40 ? `${err.slice(0, 40)}…` : err}</p>
                ) : null}
                <div className="mt-1 flex flex-wrap justify-end gap-1">
                  {!isConnected && (err || balanceDisplay === "—") ? (
                    <button
                      type="button"
                      className="rounded-full border border-slate-600 px-3 py-1 text-[11px] font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white disabled:opacity-50"
                      onClick={() => void fetchSolBalanceForAddress(addr)}
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
