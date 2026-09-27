"use client";

import { useLanguage } from "@/lib/i18n/LanguageContext";
import { isEvmWalletAvailable, type EvmNetwork, type EvmProviderId } from "@/lib/wallets/evm";
import { ethWalletOptions } from "@/lib/wallets/opcoes";

// Topo do cartao Ethereum: escolher a carteira (MetaMask, Rabby...) e a rede.
// Extraido de src/app/(pt)/wallets/page.tsx (fase 1): o estado continua na pagina.
type Props = {
  ethWalletSelectRef: React.RefObject<HTMLDivElement | null>;
  ethWalletSelectOpen: boolean;
  setEthWalletSelectOpen: React.Dispatch<React.SetStateAction<boolean>>;
  selectedEvmProvider: EvmProviderId;
  setSelectedEvmProvider: (id: EvmProviderId) => void;
  ethWalletSelectFilter: string;
  setEthWalletSelectFilter: (value: string) => void;
  isClient: boolean;
  ethNetworkSelectRef: React.RefObject<HTMLDivElement | null>;
  ethNetworkSelectOpen: boolean;
  setEthNetworkSelectOpen: React.Dispatch<React.SetStateAction<boolean>>;
  selectedEthConnectNetwork: EvmNetwork;
  setSelectedEthConnectNetwork: (net: EvmNetwork) => void;
};

export default function EthSeletores({
  ethWalletSelectRef, ethWalletSelectOpen, setEthWalletSelectOpen, selectedEvmProvider,
  setSelectedEvmProvider, ethWalletSelectFilter, setEthWalletSelectFilter, isClient,
  ethNetworkSelectRef, ethNetworkSelectOpen, setEthNetworkSelectOpen, selectedEthConnectNetwork,
  setSelectedEthConnectNetwork,
}: Props) {
  const { t } = useLanguage();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
        {t("wl_wallet")} ETH
      </span>
      <div className="relative min-w-[140px]" ref={ethWalletSelectRef}>
        <button
          type="button"
          className="flex min-w-[140px] items-center justify-between gap-2 rounded-full border border-slate-800 bg-slate-950/60 px-3 py-1.5 text-left text-xs text-slate-200 outline-none transition focus:border-orange-400"
          onClick={() => setEthWalletSelectOpen((o) => !o)}
        >
          <span className="truncate">
            {ethWalletOptions.find((o) => o.id === selectedEvmProvider)?.label ?? selectedEvmProvider}
          </span>
          <span className="text-slate-500 text-[11px]">{ethWalletSelectOpen ? "▲" : "▼"}</span>
        </button>
        {ethWalletSelectOpen ? (
          <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-[200px] rounded-xl border border-slate-700 bg-slate-900 shadow-xl">
            <input
              type="text"
              className="w-full border-b border-slate-700 bg-slate-900/80 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 outline-none"
              placeholder={t("wl_search_wallet")}
              value={ethWalletSelectFilter}
              onChange={(e) => setEthWalletSelectFilter(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
            />
            <div className="max-h-[180px] overflow-y-auto py-1">
              {ethWalletOptions
                .filter(
                  (opt) =>
                    !ethWalletSelectFilter.trim() ||
                    opt.label.toLowerCase().includes(ethWalletSelectFilter.trim().toLowerCase()) ||
                    opt.id.toLowerCase().includes(ethWalletSelectFilter.trim().toLowerCase())
                )
                .map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className="flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800"
                    onClick={() => {
                      setSelectedEvmProvider(option.id);
                      setEthWalletSelectOpen(false);
                      setEthWalletSelectFilter("");
                    }}
                  >
                    <span>{option.label}</span>
                    {isClient && isEvmWalletAvailable(option.id) ? (
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
      {/* Network dropdown */}
      <div className="relative min-w-[130px]" ref={ethNetworkSelectRef}>
        <button
          type="button"
          className="flex min-w-[130px] items-center justify-between gap-2 rounded-full border border-slate-800 bg-slate-950/60 px-3 py-1.5 text-left text-xs text-slate-200 outline-none transition focus:border-orange-400"
          onClick={() => setEthNetworkSelectOpen((o) => !o)}
        >
          <span className="truncate">
            {selectedEthConnectNetwork === "Ethereum" ? "ETH Mainnet" : selectedEthConnectNetwork}
          </span>
          <span className="text-slate-500 text-[11px]">{ethNetworkSelectOpen ? "▲" : "▼"}</span>
        </button>
        {ethNetworkSelectOpen && (
          <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-[160px] rounded-xl border border-slate-700 bg-slate-900 shadow-xl">
            {(["Ethereum", "Arbitrum", "Optimism", "Base", "Polygon", "zkSync", "Linea", "Blast"] as EvmNetwork[]).map((net) => (
              <button
                key={net}
                type="button"
                className={`flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-slate-800 ${selectedEthConnectNetwork === net ? "text-orange-300" : "text-slate-200"}`}
                onClick={() => { setSelectedEthConnectNetwork(net); setEthNetworkSelectOpen(false); }}
              >
                <span>{net === "Ethereum" ? "ETH Mainnet" : net}</span>
                {selectedEthConnectNetwork === net && <span className="text-orange-400">✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
