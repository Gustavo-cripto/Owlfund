"use client";

import { useLanguage } from "@/lib/i18n/LanguageContext";
import { isBtcWalletAvailable } from "@/lib/wallets/bitcoin";
import { btcWalletOptions, type BtcWalletId } from "@/lib/wallets/opcoes";

// Topo do cartao Bitcoin: escolher a carteira (Xverse, Electrum...).
// Extraido de src/app/(pt)/wallets/page.tsx (fase 1): o estado continua na pagina.
type Props = {
  btcWalletSelectRef: React.RefObject<HTMLDivElement | null>;
  btcWalletSelectOpen: boolean;
  setBtcWalletSelectOpen: React.Dispatch<React.SetStateAction<boolean>>;
  selectedBtcProvider: BtcWalletId;
  setSelectedBtcProvider: (id: BtcWalletId) => void;
  btcWalletSelectFilter: string;
  setBtcWalletSelectFilter: (value: string) => void;
  isClient: boolean;
};

export default function BtcSeletor({
  btcWalletSelectRef, btcWalletSelectOpen, setBtcWalletSelectOpen, selectedBtcProvider,
  setSelectedBtcProvider, btcWalletSelectFilter, setBtcWalletSelectFilter, isClient,
}: Props) {
  const { t } = useLanguage();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
        {t("wl_wallet")} BTC
      </span>
      <div className="relative min-w-[120px]" ref={btcWalletSelectRef}>
        <button
          type="button"
          className="flex min-w-[120px] items-center justify-between gap-2 rounded-full border border-slate-800 bg-slate-950/60 px-3 py-1.5 text-left text-xs text-slate-200 outline-none transition focus:border-orange-400"
          onClick={() => setBtcWalletSelectOpen((o) => !o)}
        >
          <span className="truncate">
            {btcWalletOptions.find((o) => o.id === selectedBtcProvider)?.label ?? selectedBtcProvider}
          </span>
          <span className="text-slate-500 text-[11px]">{btcWalletSelectOpen ? "▲" : "▼"}</span>
        </button>
        {btcWalletSelectOpen ? (
          <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-[200px] rounded-xl border border-slate-700 bg-slate-900 shadow-xl">
            <input
              type="text"
              className="w-full border-b border-slate-700 bg-slate-900/80 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 outline-none"
              placeholder={t("wl_search_wallet")}
              value={btcWalletSelectFilter}
              onChange={(e) => setBtcWalletSelectFilter(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
            />
            <div className="max-h-[180px] overflow-y-auto py-1">
              {btcWalletOptions
                .filter(
                  (opt) =>
                    !btcWalletSelectFilter.trim() ||
                    opt.label.toLowerCase().includes(btcWalletSelectFilter.trim().toLowerCase()) ||
                    opt.id.toLowerCase().includes(btcWalletSelectFilter.trim().toLowerCase())
                )
                .map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className="flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800"
                    onClick={() => {
                      setSelectedBtcProvider(option.id);
                      setBtcWalletSelectOpen(false);
                      setBtcWalletSelectFilter("");
                    }}
                  >
                    <span>{option.label}</span>
                    {isClient && isBtcWalletAvailable(option.id) ? (
                      <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] text-emerald-300">
                        {t("wl_available")}
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-600/30 px-2 py-0.5 text-[11px] text-slate-400">
                        {t("wl_not_installed")}
                      </span>
                    )}
                  </button>
                ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
