"use client";

import ErrorNote from "@/components/ErrorNote";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import type { StablecoinEntry } from "@/lib/crypto/storage";

// Secao "stablecoins por endereco": formulario e tabela com saldos.
// Extraido de src/app/(pt)/wallets/page.tsx (fase 1): o estado continua na pagina.
type Props = {
  stablecoinAddSymbol: string;
  setStablecoinAddSymbol: (value: string) => void;
  stablecoinSymbolOptions: string[];
  stablecoinAddAddress: string;
  setStablecoinAddAddress: (value: string) => void;
  handleAddStablecoinEntry: () => void;
  stablecoinAddError: string | null;
  stablecoinEntries: StablecoinEntry[];
  stableShown: Record<string, boolean>;
  setStableShown: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  stablecoinBalances: Record<string, string>;
  stablecoinBalancesLoading: Record<string, boolean>;
  onRemoveEntry: (e: StablecoinEntry) => void;
};

export default function StablecoinsSecao({
  stablecoinAddSymbol, setStablecoinAddSymbol, stablecoinSymbolOptions, stablecoinAddAddress,
  setStablecoinAddAddress, handleAddStablecoinEntry, stablecoinAddError, stablecoinEntries,
  stableShown, setStableShown, stablecoinBalances, stablecoinBalancesLoading, onRemoveEntry,
}: Props) {
  const { t } = useLanguage();
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <h3 className="text-sm font-semibold text-white">{t("wl_stablecoins_addr")}</h3>
      <p className="mt-1 text-xs text-slate-500">
        {t("wl_stable_intro")}
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-[auto_1fr_auto] sm:items-center">
        <select
          className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-200 outline-none focus:border-orange-400"
          value={stablecoinAddSymbol}
          onChange={(e) => setStablecoinAddSymbol(e.target.value)}
        >
          {stablecoinSymbolOptions.map((sym) => (
            <option key={sym} value={sym}>{sym}</option>
          ))}
        </select>
        <input
          type="text"
          className="min-w-0 rounded-full border border-slate-800 bg-slate-950/60 px-4 py-2 text-xs text-slate-200 placeholder:text-slate-500 outline-none focus:border-orange-400"
          placeholder={t("wl_ph_stable_addr").replace("{sym}", stablecoinAddSymbol)}
          value={stablecoinAddAddress}
          onChange={(e) => setStablecoinAddAddress(e.target.value)}
        />
        <button
          type="button"
          className="rounded-full border border-orange-400/40 px-4 py-2 text-xs font-semibold text-orange-200 transition hover:border-orange-400 hover:text-white"
          onClick={handleAddStablecoinEntry}
        >
          {t("wl_add")}
        </button>
      </div>
      {stablecoinAddError ? (
        <ErrorNote className="mt-2">{stablecoinAddError}</ErrorNote>
      ) : null}
      {stablecoinEntries.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[320px] text-left text-xs text-slate-300">
            <thead>
              <tr className="border-b border-slate-700 text-slate-500">
                <th className="py-2 pr-2 font-medium">{t("wl_stablecoin")}</th>
                <th className="py-2 pr-2 font-medium">{t("wl_address")}</th>
                <th className="py-2 pr-2 text-right font-medium">{t("wl_balance")}</th>
                <th className="w-20 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {stablecoinEntries.map((e) => (
                <tr key={e.id} className="border-b border-slate-800/80">
                  <td className="py-2 pr-2 font-medium text-white">{e.symbol}</td>
                  <td className="max-w-[170px] py-2 pr-2 font-mono text-slate-400">
                    <span className="inline-flex items-center gap-1.5">
                      {stableShown[e.id]
                        ? <span className="truncate">{e.address.slice(0, 6)}…{e.address.slice(-4)}</span>
                        : <span className="tracking-widest text-slate-600 select-none">••••••••</span>}
                      <button
                        type="button"
                        onClick={() => setStableShown((prev) => ({ ...prev, [e.id]: !prev[e.id] }))}
                        className="shrink-0 rounded-full border border-slate-700 px-1.5 py-0.5 text-[11px] text-slate-200 transition hover:border-slate-500 hover:text-white"
                        title={stableShown[e.id] ? t("wc_hide_addr") : t("wc_show_addr")}
                        aria-label={stableShown[e.id] ? t("wc_hide_addr") : t("wc_show_addr")}
                      >
                        {stableShown[e.id] ? "🙈" : "👁️"}
                      </button>
                    </span>
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums">
                    {stablecoinBalancesLoading[e.id] ? t("wl_loading") : (stablecoinBalances[e.id] ?? "—")}
                  </td>
                  <td className="py-2">
                    <button
                      type="button"
                      className="rounded-full border border-rose-400/40 px-2 py-1 text-[11px] font-semibold text-rose-200 transition hover:border-rose-400 hover:text-white"
                      onClick={() => onRemoveEntry(e)}
                    >
                      {t("wl_remove")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
