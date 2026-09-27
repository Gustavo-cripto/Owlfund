"use client";

import ErrorNote from "@/components/ErrorNote";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { MANUAL_ADD_NETWORKS, MANUAL_ADD_TO_EVM_NETWORK, MANUAL_ADD_TO_SOL_NETWORK } from "@/lib/wallets/opcoes";

// Secao "adicionar endereco manual (todas as redes)".
// Extraido de src/app/(pt)/wallets/page.tsx (fase 1): o estado continua na pagina.
type Props = {
  manualAddNetworkRef: React.RefObject<HTMLDivElement | null>;
  manualAddNetworkOpen: boolean;
  setManualAddNetworkOpen: React.Dispatch<React.SetStateAction<boolean>>;
  manualAddNetwork: string;
  setManualAddNetwork: (value: string) => void;
  manualAddNetworkFilter: string;
  setManualAddNetworkFilter: (value: string) => void;
  manualAddAddress: string;
  onAddressChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  manualAddLabel: string;
  setManualAddLabel: (value: string) => void;
  handleManualAddAddress: () => void;
  manualAddOk: string | null;
  manualAddError: string | null;
};

export default function EnderecoManualSecao({
  manualAddNetworkRef, manualAddNetworkOpen, setManualAddNetworkOpen, manualAddNetwork,
  setManualAddNetwork, manualAddNetworkFilter, setManualAddNetworkFilter, manualAddAddress,
  onAddressChange, manualAddLabel, setManualAddLabel, handleManualAddAddress, manualAddOk,
  manualAddError,
}: Props) {
  const { t } = useLanguage();
  return (
    <section id="manual-address-section" className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 scroll-mt-24">
      <h3 className="text-sm font-semibold text-white">{t("wl_add_manual")}</h3>
      <p className="mt-1 text-xs text-slate-500">
        {t("wl_universal_intro")} {t("wl_hw_addr_hint")}
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="relative min-w-[200px]" ref={manualAddNetworkRef}>
          <button
            type="button"
            className="flex w-full min-w-[200px] items-center justify-between gap-2 rounded-full border border-slate-800 bg-slate-950/60 px-4 py-2 text-left text-xs text-slate-200 outline-none transition focus:border-orange-400"
            onClick={() => setManualAddNetworkOpen((o) => !o)}
          >
            <span className="truncate">
              {MANUAL_ADD_NETWORKS.find((n) => n.id === manualAddNetwork)?.label ?? manualAddNetwork}
            </span>
            <span className="text-slate-500">{manualAddNetworkOpen ? "▲" : "▼"}</span>
          </button>
          {manualAddNetworkOpen ? (
            <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-[260px] rounded-xl border border-slate-700 bg-slate-900 shadow-xl">
              <input
                type="text"
                className="w-full border-b border-slate-700 bg-slate-900/80 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 outline-none"
                placeholder={t("wl_search_network")}
                value={manualAddNetworkFilter}
                onChange={(e) => setManualAddNetworkFilter(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
              />
              <div className="max-h-[300px] overflow-y-auto py-1">
                {(() => {
                  const filtered = MANUAL_ADD_NETWORKS.filter(
                    (net) =>
                      !manualAddNetworkFilter.trim() ||
                      net.label.toLowerCase().includes(manualAddNetworkFilter.trim().toLowerCase()) ||
                      net.id.toLowerCase().includes(manualAddNetworkFilter.trim().toLowerCase())
                  );
                  const groups: string[] = [];
                  return filtered.map((net) => {
                    const showGroup = net.group && !groups.includes(net.group) && !manualAddNetworkFilter.trim();
                    if (showGroup && net.group) groups.push(net.group);
                    return (
                      <div key={net.id}>
                        {showGroup && (
                          <p className="px-3 pt-2 pb-1 text-[11px] font-bold uppercase tracking-widest text-slate-600">{net.group}</p>
                        )}
                        <button
                          type="button"
                          className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-200 hover:bg-slate-800 transition-colors"
                          onClick={() => {
                            setManualAddNetwork(net.id);
                            setManualAddNetworkOpen(false);
                            setManualAddNetworkFilter("");
                          }}
                        >
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{
                            background: net.group === "EVM L1" ? "#f97316" :
                                        net.group === "EVM L2" ? "#3b82f6" :
                                        net.group === "Bitcoin" ? "#eab308" :
                                        net.group === "Solana" ? "#a855f7" :
                                        net.group === "Cardano" ? "#06b6d4" : "#64748b"
                          }} />
                          {net.label}
                        </button>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          ) : null}
        </div>
        <input
          className="min-w-[200px] flex-1 rounded-full border border-slate-800 bg-slate-950/60 px-4 py-2 text-xs text-slate-200 outline-none transition focus:border-orange-400"
          placeholder={
            MANUAL_ADD_TO_EVM_NETWORK[manualAddNetwork]
              ? t("wl_ph_evm")
              : MANUAL_ADD_TO_SOL_NETWORK[manualAddNetwork]
                ? t("wl_ph_sol")
                : manualAddNetwork === "btc"
                  ? t("wl_addr_btc")
                  : manualAddNetwork === "ada"
                    ? t("wl_ph_ada")
                    : t("wl_ph_soon")
          }
          value={manualAddAddress}
          onChange={onAddressChange}
        />
        <input
          className="w-32 rounded-full border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-200 outline-none placeholder:text-slate-500"
          placeholder={t("wl_name_opt")}
          value={manualAddLabel}
          onChange={(e) => setManualAddLabel(e.target.value)}
        />
        <button
          type="button"
          className="rounded-full border border-orange-400/40 px-4 py-2 text-xs font-semibold text-orange-200 transition hover:border-orange-400 hover:text-white"
          onClick={handleManualAddAddress}
        >
          {t("wl_add")}
        </button>
      </div>
      {manualAddOk ? (
        <p className="mt-2 text-xs text-emerald-300">{manualAddOk}</p>
      ) : null}
      {manualAddError ? (
        <ErrorNote className="mt-2">{manualAddError}</ErrorNote>
      ) : null}
    </section>
  );
}
