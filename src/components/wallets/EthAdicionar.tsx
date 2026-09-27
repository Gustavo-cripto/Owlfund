"use client";

import ErrorNote from "@/components/ErrorNote";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { isEvmWalletAvailable, type EvmNetwork } from "@/lib/wallets/evm";
import { ethNetworkLabelOptions, ethWalletOptions } from "@/lib/wallets/opcoes";
import type { StoredWalletEntry } from "@/lib/wallets/storage";

// Cartao Ethereum: lista de carteiras suportadas, WalletConnect, formulario
// "adicionar endereco" e "remover todas". Devolve um fragmento para o DOM
// ficar igual (os filhos continuam diretos do space-y-3 do cartao).
// Extraido de src/app/(pt)/wallets/page.tsx (fase 1): o estado continua na pagina.
type Props = {
  showEthNetworks: boolean;
  setShowEthNetworks: React.Dispatch<React.SetStateAction<boolean>>;
  isClient: boolean;
  handleWalletConnect: () => void;
  ethLoading: boolean;
  ethNewAddress: string;
  setEthNewAddress: (value: string) => void;
  ethNewNetwork: EvmNetwork | "outro";
  setEthNewNetwork: (value: EvmNetwork | "outro") => void;
  ethNewCustomLabel: string;
  setEthNewCustomLabel: (value: string) => void;
  handleAddEthWallet: () => void;
  ethNewLoading: boolean;
  ethNewError: string | null;
  ethWallets: StoredWalletEntry[];
  onRemoveAll: () => void;
};

export default function EthAdicionar({
  showEthNetworks, setShowEthNetworks, isClient, handleWalletConnect, ethLoading,
  ethNewAddress, setEthNewAddress, ethNewNetwork, setEthNewNetwork, ethNewCustomLabel,
  setEthNewCustomLabel, handleAddEthWallet, ethNewLoading, ethNewError, ethWallets, onRemoveAll,
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
          onClick={() => setShowEthNetworks((prev) => !prev)}
          className="rounded-full border border-slate-700 px-3 py-1 text-[11px] font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
        >
          {t("wl_eth_wallets")}
        </button>
        {showEthNetworks ? (
          <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
            {ethWalletOptions.map((option) => (
              <span
                key={option.id}
                className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-1 text-slate-200"
              >
                {option.label}{" "}
                {isClient && isEvmWalletAvailable(option.id) ? (
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
      <p className="text-xs text-slate-500">
        {t("wl_connect_or_add")}
      </p>
      <button
        type="button"
        className="flex items-center gap-2 rounded-full border border-blue-500/40 bg-blue-950/30 px-4 py-2 text-xs font-semibold text-blue-300 transition hover:border-blue-400 hover:text-white disabled:opacity-60"
        onClick={handleWalletConnect}
        disabled={ethLoading}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 300 185" fill="currentColor">
          <path d="M61.4 36.3c48.9-47.9 128.3-47.9 177.2 0l5.9 5.8c2.4 2.4 2.4 6.2 0 8.6l-20.2 19.8c-1.2 1.2-3.2 1.2-4.4 0l-8.1-7.9c-34.1-33.4-89.4-33.4-123.5 0l-8.7 8.5c-1.2 1.2-3.2 1.2-4.4 0L54.9 51.3c-2.4-2.4-2.4-6.2 0-8.6l6.5-6.4zm218.8 40.8l18 17.6c2.4 2.4 2.4 6.2 0 8.6l-81.2 79.5c-2.4 2.4-6.4 2.4-8.8 0l-57.6-56.4c-.6-.6-1.6-.6-2.2 0l-57.6 56.4c-2.4 2.4-6.4 2.4-8.8 0L.8 103.3c-2.4-2.4-2.4-6.2 0-8.6l18-17.6c2.4-2.4 6.4-2.4 8.8 0l57.6 56.4c.6.6 1.6.6 2.2 0l57.6-56.4c2.4-2.4 6.4-2.4 8.8 0l57.6 56.4c.6.6 1.6.6 2.2 0l57.6-56.4c2.4-2.5 6.4-2.5 8.8-.1z"/>
        </svg>
        WalletConnect (QR)
      </button>
      <div className="grid gap-3 sm:grid-cols-[1.2fr_0.8fr_auto]">
        <input
          className="w-full rounded-full border border-slate-800 bg-slate-950/60 px-4 py-2 text-xs text-slate-200 outline-none transition focus:border-orange-400"
          placeholder={t("wl_addr_eth")}
          value={ethNewAddress}
          onChange={(event) => setEthNewAddress(event.target.value)}
        />
        <select
          className="w-full rounded-full border border-slate-800 bg-slate-950/60 px-4 py-2 text-xs text-slate-200 outline-none"
          value={ethNewNetwork}
          onChange={(e) => setEthNewNetwork(e.target.value as EvmNetwork | "outro")}
        >
          <optgroup label="── Layer 1 ──">
            {ethNetworkLabelOptions.filter(o => o.group === "L1").map(opt => (
              <option key={opt.id} value={opt.id}>{opt.label}</option>
            ))}
          </optgroup>
          <optgroup label="── Layer 2 ──">
            {ethNetworkLabelOptions.filter(o => o.group === "L2").map(opt => (
              <option key={opt.id} value={opt.id}>{opt.label}</option>
            ))}
          </optgroup>
          <option value="outro">{t("wl_other_evm")}</option>
        </select>
        <button
          type="button"
          className="rounded-full border border-orange-400/40 px-4 py-2 text-xs font-semibold text-orange-200 transition hover:border-orange-400 hover:text-white disabled:opacity-60"
          onClick={handleAddEthWallet}
          disabled={ethNewLoading}
        >
          {ethNewLoading ? t("wl_adding") : t("wl_add")}
        </button>
      </div>
      {ethNewNetwork === "outro" ? (
        <input
          className="w-full max-w-xs rounded-full border border-slate-800 bg-slate-950/60 px-4 py-2 text-xs text-slate-200 outline-none transition focus:border-orange-400"
          placeholder={t("wl_name_opt")}
          value={ethNewCustomLabel}
          onChange={(e) => setEthNewCustomLabel(e.target.value)}
        />
      ) : null}
      {ethNewError ? <ErrorNote>{ethNewError}</ErrorNote> : null}
      {ethWallets.length > 1 && (
        <div className="flex justify-end">
          <button
            type="button"
            className="rounded-full border border-rose-400/30 px-3 py-1 text-[11px] font-semibold text-rose-300 transition hover:border-rose-400 hover:text-white"
            onClick={onRemoveAll}
          >
            {t("wl_remove_all")}
          </button>
        </div>
      )}
    </>
  );
}
