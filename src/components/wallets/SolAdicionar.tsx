"use client";

import ErrorNote from "@/components/ErrorNote";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { isSolanaWalletAvailable } from "@/lib/wallets/solana";
import { solNetworkOptions, solWalletOptions } from "@/lib/wallets/opcoes";

// Cartao Solana: carteiras suportadas e formulario "adicionar endereco".
// Devolve um fragmento para o DOM ficar igual.
// Extraido de src/app/(pt)/wallets/page.tsx (fase 1): o estado continua na pagina.
type Props = {
  isClient: boolean;
  solNewAddress: string;
  setSolNewAddress: (value: string) => void;
  solNewWalletSelectRef: React.RefObject<HTMLDivElement | null>;
  solNewWalletSelectOpen: boolean;
  setSolNewWalletSelectOpen: React.Dispatch<React.SetStateAction<boolean>>;
  solNewWalletId: string;
  setSolNewWalletId: (value: string) => void;
  solNewWalletSelectFilter: string;
  setSolNewWalletSelectFilter: (value: string) => void;
  handleAddSolWallet: () => void;
  solNewLoading: boolean;
  solNewCustomLabel: string;
  setSolNewCustomLabel: (value: string) => void;
  solNewError: string | null;
};

export default function SolAdicionar({
  isClient, solNewAddress, setSolNewAddress, solNewWalletSelectRef, solNewWalletSelectOpen,
  setSolNewWalletSelectOpen, solNewWalletId, setSolNewWalletId, solNewWalletSelectFilter,
  setSolNewWalletSelectFilter, handleAddSolWallet, solNewLoading, solNewCustomLabel,
  setSolNewCustomLabel, solNewError,
}: Props) {
  const { t } = useLanguage();
  return (
    <>
      <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
        {t("wl_more_wallets")}
      </p>
      <div className="flex flex-wrap gap-2 text-[11px]">
        {solWalletOptions.map((option) => (
          <span
            key={option.id}
            className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-1 text-slate-200"
          >
            {option.label}{" "}
            {isClient && isSolanaWalletAvailable(option.id) ? (
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
      <p className="text-xs text-slate-500">
        {t("wl_connect_or_add")}
      </p>
      <div className="grid gap-3 sm:grid-cols-[1.2fr_0.8fr_auto]">
        <input
          className="w-full rounded-full border border-slate-800 bg-slate-950/60 px-4 py-2 text-xs text-slate-200 outline-none transition focus:border-orange-400"
          placeholder={t("wl_addr_sol")}
          value={solNewAddress}
          onChange={(event) => setSolNewAddress(event.target.value)}
        />
        <div className="relative min-w-0" ref={solNewWalletSelectRef}>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 rounded-full border border-slate-800 bg-slate-950/60 px-4 py-2 text-left text-xs text-slate-200 outline-none transition focus:border-orange-400"
            onClick={() => setSolNewWalletSelectOpen((o) => !o)}
          >
            <span className="truncate">
              {solNetworkOptions.find((o) => o.id === solNewWalletId)?.label ?? solNewWalletId}
            </span>
            <span className="text-slate-500 text-[11px] shrink-0">{solNewWalletSelectOpen ? "▲" : "▼"}</span>
          </button>
          {solNewWalletSelectOpen ? (
            <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-xl border border-slate-700 bg-slate-900 shadow-xl">
              <input
                type="text"
                className="w-full border-b border-slate-700 bg-slate-900/80 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 outline-none"
                placeholder={t("wl_search_network")}
                value={solNewWalletSelectFilter}
                onChange={(e) => setSolNewWalletSelectFilter(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
              />
              <div className="max-h-[200px] overflow-y-auto py-1">
                {solNetworkOptions
                  .filter(
                    (opt) =>
                      !solNewWalletSelectFilter.trim() ||
                      opt.label.toLowerCase().includes(solNewWalletSelectFilter.trim().toLowerCase()) ||
                      opt.id.toLowerCase().includes(solNewWalletSelectFilter.trim().toLowerCase())
                  )
                  .map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800"
                      onClick={() => {
                        setSolNewWalletId(opt.id);
                        setSolNewWalletSelectOpen(false);
                        setSolNewWalletSelectFilter("");
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
          className="rounded-full border border-orange-400/40 px-4 py-2 text-xs font-semibold text-orange-200 transition hover:border-orange-400 hover:text-white disabled:opacity-60"
          onClick={handleAddSolWallet}
          disabled={solNewLoading}
        >
          {solNewLoading ? t("wl_adding") : t("wl_add")}
        </button>
      </div>
      {solNewWalletId === "outro" ? (
        <input
          className="w-full max-w-xs rounded-full border border-slate-800 bg-slate-950/60 px-4 py-2 text-xs text-slate-200 outline-none transition focus:border-orange-400"
          placeholder={t("wl_name_opt")}
          value={solNewCustomLabel}
          onChange={(e) => setSolNewCustomLabel(e.target.value)}
        />
      ) : null}
      {solNewError ? <ErrorNote>{solNewError}</ErrorNote> : null}
    </>
  );
}
