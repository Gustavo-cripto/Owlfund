"use client";

import EditableName from "@/components/wallets/EditableName";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useCurrencyFormat } from "@/lib/theme/ThemeContext";
import { defiKey, type DefiNftMaps } from "@/lib/wallets/formatar";
import type { StoredWalletEntry } from "@/lib/wallets/storage";

// Lista das carteiras Cardano (saldo, DeFi e NFTs por endereco).
// Extraido de src/app/(pt)/wallets/page.tsx (fase 1): o estado continua na pagina.
type Props = {
  adaWallets: StoredWalletEntry[];
  adaAddress: string | undefined;
  adaBalance: string | undefined;
  adaBalancesByAddress: Record<string, string>;
  adaBalancesLoading: Record<string, boolean>;
  adaBalanceErrors: Record<string, string | null>;
  defiNft: DefiNftMaps;
  adaShown: Record<string, boolean>;
  setAdaShown: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  renameWallet: (kind: "ada", address: string | undefined, rawLabel: string) => void;
  fetchAdaBalanceForAddress: (address: string) => unknown;
  getFiatValue: (symbol: string, balanceValue?: string | number | null) => number | null;
  usdToEurRate: number;
  onRemove: (item: StoredWalletEntry) => void;
};

export default function AdaCarteirasLista({
  adaWallets, adaAddress, adaBalance, adaBalancesByAddress, adaBalancesLoading, adaBalanceErrors,
  defiNft, adaShown, setAdaShown, renameWallet, fetchAdaBalanceForAddress, getFiatValue,
  usdToEurRate, onRemove,
}: Props) {
  const { t } = useLanguage();
  const { format: fmtCur, hideBalances } = useCurrencyFormat();
  const { defiTotals, defiLoading, nftCounts, nftLoading, nftErrors } = defiNft;
  return (
    <div className="space-y-2">
      {adaWallets.map((item) => {
        const isConnected = item.address === adaAddress;
        const addr = item.address ?? "";
        const loading = adaBalancesLoading[addr];
        const error = adaBalanceErrors[addr];
        const balanceDisplay =
          isConnected
            ? adaBalance ?? "—"
            : loading
              ? t("wl_loading")
              : error
                ? null
                : adaBalancesByAddress[addr] ?? "—";
        return (
          <div
            key={`${item.address}-${item.network ?? "Cardano"}`}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-300"
          >
            <div className="space-y-1">
              <p className="font-semibold text-white">
                <EditableName
                  current={item.label ?? ""}
                  display={item.label ?? item.network ?? "Cardano"}
                  onSave={(v) => renameWallet("ada", item.address, v)}
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
                  {adaShown[addr] ? item.address : <span className="tracking-widest text-slate-600 select-none">••••••••</span>}
                </p>
                <button
                  type="button"
                  onClick={() =>
                    setAdaShown((prev) => ({ ...prev, [addr]: !prev[addr] }))
                  }
                  className="rounded-full border border-slate-700 px-2 py-1 text-[11px] font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
                  title={adaShown[addr] ? "Ocultar" : "Mostrar"}
                >
                  {adaShown[addr] ? "🙈" : "👁️"}
                </button>
              </div>
              {/* A entrada Cardano não mostrava DeFi nem NFTs — só o saldo. */}
              {(() => {
                const k = defiKey(addr, "ada");
                const d = defiTotals[k] ?? null; const dl = !!defiLoading[k];
                const nc = nftCounts[k] ?? null; const nl = !!nftLoading[k]; const ne = nftErrors[k];
                return (
                  <>
                    <p className="text-slate-500">
                      DeFi:{" "}
                      {dl ? <span className="animate-pulse">{t("wl_loading")}</span>
                        : d != null ? <span className={d >= 0.01 ? "text-emerald-400 font-semibold" : "text-slate-400"}>{fmtCur(d * usdToEurRate)}</span>
                        : <span className="text-slate-600 text-[11px]">—</span>}
                    </p>
                    <p className="text-slate-500">
                      NFT:{" "}
                      {hideBalances ? "••••" : nl ? t("wl_loading") : ne ? <span className="text-rose-300" title={ne}>{t("wl_err_nft")}</span>
                        : nc != null ? `${nc} ${nc === 1 ? t("wc_item") : t("wc_items")}` : "—"}
                    </p>
                  </>
                );
              })()}
            </div>
            <div className="text-right">
              {balanceDisplay != null && (
                <p>
                  {hideBalances ? "••••" : <>
                  {balanceDisplay}{" "}
                  {balanceDisplay !== t("wl_loading") && balanceDisplay !== "—"
                    ? "ADA"
                    : ""}
                  </>}
                </p>
              )}
              {balanceDisplay != null && balanceDisplay !== t("wl_loading") && balanceDisplay !== "—" && getFiatValue("ADA", balanceDisplay) != null ? (
                <p className="text-slate-400">{fmtCur((getFiatValue("ADA", balanceDisplay) ?? 0) * usdToEurRate)}</p>
              ) : null}
              {error ? (
                <p className="text-rose-300" title={error}>
                  {error.length > 40 ? `${error.slice(0, 40)}…` : error}
                </p>
              ) : null}
              <div className="mt-1 flex flex-wrap justify-end gap-1">
                {!isConnected && !["Hydra", "Midnight"].includes(item.network ?? "") && (error || balanceDisplay === "—") ? (
                  <button
                    type="button"
                    className="rounded-full border border-slate-600 px-3 py-1 text-[11px] font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white disabled:opacity-50"
                    onClick={() => void fetchAdaBalanceForAddress(addr)}
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
        );
      })}
    </div>
  );
}
