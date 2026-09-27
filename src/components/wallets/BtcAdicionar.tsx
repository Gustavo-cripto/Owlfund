"use client";

import ErrorNote from "@/components/ErrorNote";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { btcNetworkOptions } from "@/lib/wallets/opcoes";

// Cartao Bitcoin: formulario "adicionar endereco" (Bitcoin, Liquid, Stacks...).
// Devolve um fragmento para o DOM ficar igual.
// Extraido de src/app/(pt)/wallets/page.tsx (fase 1): o estado continua na pagina.
type Props = {
  btcNewAddress: string;
  setBtcNewAddress: (value: string) => void;
  btcNewNetworkSelectRef: React.RefObject<HTMLDivElement | null>;
  btcNewNetworkSelectOpen: boolean;
  setBtcNewNetworkSelectOpen: React.Dispatch<React.SetStateAction<boolean>>;
  btcNetLabel: (id: string) => string;
  btcNewLabel: string;
  setBtcNewLabel: (value: string) => void;
  btcNewNetworkSelectFilter: string;
  setBtcNewNetworkSelectFilter: (value: string) => void;
  handleAddBtcWallet: () => void;
  btcNewLoading: boolean;
  btcNewCustomLabel: string;
  setBtcNewCustomLabel: (value: string) => void;
  btcNewError: string | null;
};

export default function BtcAdicionar({
  btcNewAddress, setBtcNewAddress, btcNewNetworkSelectRef, btcNewNetworkSelectOpen,
  setBtcNewNetworkSelectOpen, btcNetLabel, btcNewLabel, setBtcNewLabel, btcNewNetworkSelectFilter,
  setBtcNewNetworkSelectFilter, handleAddBtcWallet, btcNewLoading, btcNewCustomLabel,
  setBtcNewCustomLabel, btcNewError,
}: Props) {
  const { t } = useLanguage();
  return (
    <>
      <p className="text-xs text-slate-500">
        {t("wl_connect_or_add")}
      </p>
      <div className="grid gap-3 sm:grid-cols-[1.2fr_0.8fr_auto]">
        <input
          className="w-full rounded-full border border-slate-800 bg-slate-950/60 px-4 py-2 text-xs text-slate-200 outline-none transition focus:border-orange-400"
          placeholder={t("wl_addr_btc")}
          value={btcNewAddress}
          onChange={(event) => setBtcNewAddress(event.target.value)}
        />
        <div className="relative" ref={btcNewNetworkSelectRef}>
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-full border border-slate-800 bg-slate-950/60 px-4 py-2 text-xs text-slate-200 outline-none transition hover:border-slate-600"
            onClick={() => setBtcNewNetworkSelectOpen((prev) => !prev)}
          >
            <span>{btcNetLabel(btcNewLabel)}</span>
            <span className="text-slate-500 text-[11px] shrink-0">{btcNewNetworkSelectOpen ? "▲" : "▼"}</span>
          </button>
          {btcNewNetworkSelectOpen ? (
            <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-xl border border-slate-700 bg-slate-900 shadow-xl">
              <input
                type="text"
                className="w-full border-b border-slate-700 bg-slate-900/80 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 outline-none"
                placeholder={t("wl_search_network")}
                value={btcNewNetworkSelectFilter}
                onChange={(e) => setBtcNewNetworkSelectFilter(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
              />
              <div className="max-h-[200px] overflow-y-auto py-1">
                {btcNetworkOptions
                  .filter(
                    (opt) =>
                      !btcNewNetworkSelectFilter.trim() ||
                      opt.label.toLowerCase().includes(btcNewNetworkSelectFilter.trim().toLowerCase()) ||
                      opt.id.toLowerCase().includes(btcNewNetworkSelectFilter.trim().toLowerCase())
                  )
                  .map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800"
                      onClick={() => {
                        setBtcNewLabel(opt.id);
                        setBtcNewNetworkSelectOpen(false);
                        setBtcNewNetworkSelectFilter("");
                      }}
                    >
                      {btcNetLabel(opt.id)}
                    </button>
                  ))}
              </div>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className="rounded-full border border-orange-400/40 px-4 py-2 text-xs font-semibold text-orange-200 transition hover:border-orange-400 hover:text-white disabled:opacity-60"
          onClick={handleAddBtcWallet}
          disabled={btcNewLoading}
        >
          {btcNewLoading ? t("wl_adding") : t("wl_add")}
        </button>
      </div>
      {btcNewLabel === "outro" ? (
        <input
          className="w-full max-w-xs rounded-full border border-slate-800 bg-slate-950/60 px-4 py-2 text-xs text-slate-200 outline-none transition focus:border-orange-400"
          placeholder={t("wl_name_opt")}
          value={btcNewCustomLabel}
          onChange={(e) => setBtcNewCustomLabel(e.target.value)}
        />
      ) : null}
      {btcNewError ? <ErrorNote>{btcNewError}</ErrorNote> : null}
    </>
  );
}
