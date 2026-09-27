"use client";

import { useLanguage } from "@/lib/i18n/LanguageContext";
import { isSolanaWalletAvailable } from "@/lib/wallets/solana";
import { solWalletOptions, type SolanaWalletId } from "@/lib/wallets/opcoes";

// Topo do cartao Solana: escolher a carteira (Phantom...) e a rede.
// Extraido de src/app/(pt)/wallets/page.tsx (fase 1): o estado continua na pagina.
type Props = {
  solWalletSelectRef: React.RefObject<HTMLDivElement | null>;
  solWalletSelectOpen: boolean;
  setSolWalletSelectOpen: React.Dispatch<React.SetStateAction<boolean>>;
  selectedSolProvider: SolanaWalletId;
  setSelectedSolProvider: (id: SolanaWalletId) => void;
  solWalletSelectFilter: string;
  setSolWalletSelectFilter: (value: string) => void;
  isClient: boolean;
  solNetworkSelectRef: React.RefObject<HTMLDivElement | null>;
  solNetworkSelectOpen: boolean;
  setSolNetworkSelectOpen: React.Dispatch<React.SetStateAction<boolean>>;
  selectedSolNetwork: "Mainnet" | "Devnet";
  setSelectedSolNetwork: (net: "Mainnet" | "Devnet") => void;
};

export default function SolSeletores({
  solWalletSelectRef, solWalletSelectOpen, setSolWalletSelectOpen, selectedSolProvider,
  setSelectedSolProvider, solWalletSelectFilter, setSolWalletSelectFilter, isClient,
  solNetworkSelectRef, solNetworkSelectOpen, setSolNetworkSelectOpen, selectedSolNetwork,
  setSelectedSolNetwork,
}: Props) {
  const { t } = useLanguage();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
        {t("wl_wallet")} SOL
      </span>
      {/* Wallet selector */}
      <div className="relative min-w-[160px]" ref={solWalletSelectRef}>
        <button
          type="button"
          className="flex min-w-[160px] items-center justify-between gap-2 rounded-full border border-slate-800 bg-slate-950/60 px-3 py-1.5 text-left text-xs text-slate-200 outline-none transition focus:border-orange-400"
          onClick={() => setSolWalletSelectOpen((o) => !o)}
        >
          <span className="truncate">
            {solWalletOptions.find((o) => o.id === selectedSolProvider)?.label ?? selectedSolProvider}
          </span>
          <span className="text-slate-500 text-[11px]">{solWalletSelectOpen ? "▲" : "▼"}</span>
        </button>
        {solWalletSelectOpen ? (
          <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-[220px] rounded-xl border border-slate-700 bg-slate-900 shadow-xl">
            <input
              type="text"
              className="w-full border-b border-slate-700 bg-slate-900/80 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 outline-none"
              placeholder={t("wl_search_wallet")}
              value={solWalletSelectFilter}
              onChange={(e) => setSolWalletSelectFilter(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
            />
            <div className="max-h-[200px] overflow-y-auto py-1">
              {solWalletOptions
                .filter(
                  (opt) =>
                    !solWalletSelectFilter.trim() ||
                    opt.label.toLowerCase().includes(solWalletSelectFilter.trim().toLowerCase()) ||
                    opt.id.toLowerCase().includes(solWalletSelectFilter.trim().toLowerCase())
                )
                .map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className="flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800"
                    onClick={() => {
                      setSelectedSolProvider(option.id);
                      setSolWalletSelectOpen(false);
                      setSolWalletSelectFilter("");
                    }}
                  >
                    <span>{option.label}</span>
                    {isClient && isSolanaWalletAvailable(option.id) ? (
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
      {/* Network selector */}
      <div className="relative min-w-[130px]" ref={solNetworkSelectRef}>
        <button
          type="button"
          className="flex min-w-[130px] items-center justify-between gap-2 rounded-full border border-slate-800 bg-slate-950/60 px-3 py-1.5 text-left text-xs text-slate-200 outline-none transition focus:border-orange-400"
          onClick={() => setSolNetworkSelectOpen((o) => !o)}
        >
          <span className="truncate">
            {selectedSolNetwork === "Mainnet" ? "SOL Mainnet" : "SOL Devnet"}
          </span>
          <span className="text-slate-500 text-[11px]">{solNetworkSelectOpen ? "▲" : "▼"}</span>
        </button>
        {solNetworkSelectOpen && (
          <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-[160px] rounded-xl border border-slate-700 bg-slate-900 shadow-xl">
            {(["Mainnet", "Devnet"] as const).map((net) => (
              <button
                key={net}
                type="button"
                className={`flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-slate-800 ${selectedSolNetwork === net ? "text-orange-300" : "text-slate-200"}`}
                onClick={() => { setSelectedSolNetwork(net); setSolNetworkSelectOpen(false); }}
              >
                <span>{net === "Mainnet" ? "SOL Mainnet" : "SOL Devnet"}</span>
                {selectedSolNetwork === net && <span className="text-orange-400">✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
