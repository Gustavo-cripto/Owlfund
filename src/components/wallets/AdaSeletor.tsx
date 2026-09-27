"use client";

import { useLanguage } from "@/lib/i18n/LanguageContext";
import { isCardanoWalletAvailable, type CardanoWalletId } from "@/lib/wallets/cardano";
import { adaWalletOptions } from "@/lib/wallets/opcoes";

// Cartao Cardano: escolher a carteira (Eternl, Lace...).
// Extraido de src/app/(pt)/wallets/page.tsx (fase 1): o estado continua na pagina.
type Props = {
  adaWalletSelectRef: React.RefObject<HTMLDivElement | null>;
  adaWalletSelectOpen: boolean;
  setAdaWalletSelectOpen: React.Dispatch<React.SetStateAction<boolean>>;
  selectedAdaProvider: CardanoWalletId;
  setSelectedAdaProvider: (id: CardanoWalletId) => void;
  adaWalletSelectFilter: string;
  setAdaWalletSelectFilter: (value: string) => void;
  isClient: boolean;
};

export default function AdaSeletor({
  adaWalletSelectRef, adaWalletSelectOpen, setAdaWalletSelectOpen, selectedAdaProvider,
  setSelectedAdaProvider, adaWalletSelectFilter, setAdaWalletSelectFilter, isClient,
}: Props) {
  const { t } = useLanguage();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
        {t("wl_wallet")} ADA
      </span>
      <div className="relative min-w-[120px]" ref={adaWalletSelectRef}>
        <button
          type="button"
          className="flex min-w-[120px] items-center justify-between gap-2 rounded-full border border-slate-800 bg-slate-950/60 px-3 py-1.5 text-left text-xs text-slate-200 outline-none transition focus:border-orange-400"
          onClick={() => setAdaWalletSelectOpen((o) => !o)}
        >
          <span className="truncate">
            {adaWalletOptions.find((o) => o.id === selectedAdaProvider)?.label ?? selectedAdaProvider}
          </span>
          <span className="text-slate-500 text-[11px]">{adaWalletSelectOpen ? "▲" : "▼"}</span>
        </button>
        {adaWalletSelectOpen ? (
          <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-[200px] rounded-xl border border-slate-700 bg-slate-900 shadow-xl">
            <input
              type="text"
              className="w-full border-b border-slate-700 bg-slate-900/80 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 outline-none"
              placeholder={t("wl_search_wallet")}
              value={adaWalletSelectFilter}
              onChange={(e) => setAdaWalletSelectFilter(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
            />
            <div className="max-h-[180px] overflow-y-auto py-1">
              {adaWalletOptions
                .filter(
                  (opt) =>
                    !adaWalletSelectFilter.trim() ||
                    opt.label.toLowerCase().includes(adaWalletSelectFilter.trim().toLowerCase()) ||
                    opt.id.toLowerCase().includes(adaWalletSelectFilter.trim().toLowerCase())
                )
                .map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className="flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800"
                    onClick={() => {
                      setSelectedAdaProvider(option.id);
                      setAdaWalletSelectOpen(false);
                      setAdaWalletSelectFilter("");
                    }}
                  >
                    <span>{option.label}</span>
                    {isClient && isCardanoWalletAvailable(option.id) ? (
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
