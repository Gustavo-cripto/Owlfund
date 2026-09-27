"use client";

import EditableName from "@/components/wallets/EditableName";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import type { StoredWalletEntry } from "@/lib/wallets/storage";

// "Outras redes — em acompanhamento": enderecos de redes sem leitura de saldo.
// Extraido de src/app/(pt)/wallets/page.tsx (fase 1): o estado continua na pagina.
type Props = {
  otherWallets: StoredWalletEntry[];
  otherShown: Record<string, boolean>;
  setOtherShown: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  renameWallet: (kind: "other", address: string | undefined, rawLabel: string) => void;
  onRemove: (item: StoredWalletEntry) => void;
};

export default function OutrasRedesSecao({ otherWallets, otherShown, setOtherShown, renameWallet, onRemove }: Props) {
  const { t } = useLanguage();
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="mb-3">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{t("wl_other_networks")}</p>
        <h3 className="text-base font-bold text-white mt-0.5">{t("wl_tracking")}</h3>
        <p className="text-xs text-slate-500 mt-1">{t("wl_tracking_desc")}</p>
      </div>
      <div className="space-y-2">
        {otherWallets.map((item) => (
          <div
            key={`${item.address}-${item.network}`}
            className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-300 flex flex-wrap items-center justify-between gap-2"
          >
            <div className="space-y-0.5">
              <p className="font-semibold text-white text-[11px]">
                <EditableName
                  current={item.label && item.label !== item.network ? item.label : ""}
                  display={item.label && item.label !== item.network ? item.label : (item.network ?? "—")}
                  onSave={(v) => renameWallet("other", item.address, v)}
                  placeholder={t("wc_name_ph")}
                />
                <span className="ml-2 rounded-full bg-slate-600/30 px-2 py-0.5 text-[11px] text-slate-400">{item.network}</span>
              </p>
              <div className="flex items-center gap-2">
                <p className="text-slate-500 font-mono text-[11px] break-all">
                  {otherShown[item.address ?? ""]
                    ? item.address
                    : <span className="tracking-widest text-slate-600 select-none">••••••••</span>}
                </p>
                <button
                  type="button"
                  onClick={() => setOtherShown((prev) => ({ ...prev, [item.address ?? ""]: !prev[item.address ?? ""] }))}
                  className="shrink-0 rounded-full border border-slate-700 px-2 py-0.5 text-[11px] font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
                  title={otherShown[item.address ?? ""] ? t("wc_hide_addr") : t("wc_show_addr")}
                  aria-label={otherShown[item.address ?? ""] ? t("wc_hide_addr") : t("wc_show_addr")}
                >
                  {otherShown[item.address ?? ""] ? "🙈" : "👁️"}
                </button>
              </div>
            </div>
            <button
              type="button"
              className="rounded-full border border-rose-400/40 px-3 py-1 text-[11px] font-semibold text-rose-200 transition hover:border-rose-400 hover:text-white shrink-0"
              onClick={() => onRemove(item)}
            >
              {t("wl_remove")}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
