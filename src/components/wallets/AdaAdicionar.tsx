"use client";

import ErrorNote from "@/components/ErrorNote";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { isCardanoWalletAvailable } from "@/lib/wallets/cardano";
import { adaNetworkOptions, adaWalletOptions } from "@/lib/wallets/opcoes";

// Cartao Cardano: carteiras suportadas e formulario "adicionar endereco".
// Devolve um fragmento para o DOM ficar igual.
// Extraido de src/app/(pt)/wallets/page.tsx (fase 1): o estado continua na pagina.
type Props = {
  showAdaNetworks: boolean;
  setShowAdaNetworks: React.Dispatch<React.SetStateAction<boolean>>;
  isClient: boolean;
  adaNewAddress: string;
  setAdaNewAddress: (value: string) => void;
  adaNewNetworkSelectRef: React.RefObject<HTMLDivElement | null>;
  adaNewNetworkSelectOpen: boolean;
  setAdaNewNetworkSelectOpen: React.Dispatch<React.SetStateAction<boolean>>;
  adaNewNetworkId: string;
  setAdaNewNetworkId: (value: string) => void;
  adaNewNetworkSelectFilter: string;
  setAdaNewNetworkSelectFilter: (value: string) => void;
  handleAddAdaWallet: () => void;
  adaNewCustomLabel: string;
  setAdaNewCustomLabel: (value: string) => void;
  adaNewError: string | null;
};

export default function AdaAdicionar({
  showAdaNetworks, setShowAdaNetworks, isClient, adaNewAddress, setAdaNewAddress,
  adaNewNetworkSelectRef, adaNewNetworkSelectOpen, setAdaNewNetworkSelectOpen, adaNewNetworkId,
  setAdaNewNetworkId, adaNewNetworkSelectFilter, setAdaNewNetworkSelectFilter, handleAddAdaWallet,
  adaNewCustomLabel, setAdaNewCustomLabel, adaNewError,
}: Props) {
  const { t } = useLanguage();
  return (
    <>
      <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
        {t("wl_more_wallets")}
      </p>
      <div>
        <button
          type="button"
          onClick={() => setShowAdaNetworks((prev) => !prev)}
          className="rounded-full border border-slate-700 px-3 py-1 text-[11px] font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
        >
          {t("wl_ada_wallets")}
        </button>
        {showAdaNetworks ? (
          <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
            {adaWalletOptions.map((option) => (
              <span
                key={option.id}
                className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-1 text-slate-200"
              >
                {option.label}{" "}
                {isClient && isCardanoWalletAvailable(option.id) ? (
                  <span className="ml-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] text-emerald-300">
                    {t("wl_available")}
                  </span>
                ) : (
                  <span className="ml-1 rounded-full bg-slate-600/30 px-2 py-0.5 text-[11px] text-slate-400">
                    {t("wl_not_installed")}
                  </span>
                )}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-[1.2fr_0.8fr_auto]">
        <input
          className="w-full rounded-full border border-slate-800 bg-slate-950/60 px-4 py-2 text-xs text-slate-200 outline-none transition focus:border-orange-400"
          placeholder={t("wl_addr_ada")}
          value={adaNewAddress}
          onChange={(event) => setAdaNewAddress(event.target.value)}
        />
        <div className="relative" ref={adaNewNetworkSelectRef}>
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-full border border-slate-800 bg-slate-950/60 px-4 py-2 text-xs text-slate-200 outline-none transition hover:border-slate-600"
            onClick={() => setAdaNewNetworkSelectOpen((prev) => !prev)}
          >
            <span>{adaNetworkOptions.find((o) => o.id === adaNewNetworkId)?.label ?? "Cardano"}</span>
            <span className="text-slate-500 text-[11px] shrink-0">{adaNewNetworkSelectOpen ? "▲" : "▼"}</span>
          </button>
          {adaNewNetworkSelectOpen ? (
            <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-xl border border-slate-700 bg-slate-900 shadow-xl">
              <input
                type="text"
                className="w-full border-b border-slate-700 bg-slate-900/80 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 outline-none"
                placeholder={t("wl_search_network")}
                value={adaNewNetworkSelectFilter}
                onChange={(e) => setAdaNewNetworkSelectFilter(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
              />
              <div className="max-h-[200px] overflow-y-auto py-1">
                {adaNetworkOptions
                  .filter(
                    (opt) =>
                      !adaNewNetworkSelectFilter.trim() ||
                      opt.label.toLowerCase().includes(adaNewNetworkSelectFilter.trim().toLowerCase()) ||
                      opt.id.toLowerCase().includes(adaNewNetworkSelectFilter.trim().toLowerCase())
                  )
                  .map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800"
                      onClick={() => {
                        setAdaNewNetworkId(opt.id);
                        setAdaNewNetworkSelectOpen(false);
                        setAdaNewNetworkSelectFilter("");
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
              </div>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className="rounded-full border border-orange-400/40 px-4 py-2 text-xs font-semibold text-orange-200 transition hover:border-orange-400 hover:text-white"
          onClick={handleAddAdaWallet}
        >
          {t("wl_add")}
        </button>
      </div>
      {adaNewNetworkId === "outro" ? (
        <input
          className="w-full max-w-xs rounded-full border border-slate-800 bg-slate-950/60 px-4 py-2 text-xs text-slate-200 outline-none transition focus:border-orange-400"
          placeholder={t("wl_name_opt")}
          value={adaNewCustomLabel}
          onChange={(e) => setAdaNewCustomLabel(e.target.value)}
        />
      ) : null}
      {adaNewError ? <ErrorNote>{adaNewError}</ErrorNote> : null}
      <p className="text-xs text-slate-500">
        {t("wl_connect_or_add")}
      </p>
    </>
  );
}
