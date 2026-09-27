"use client";

import { useLanguage } from "@/lib/i18n/LanguageContext";
import type { StoredWalletEntry } from "@/lib/wallets/storage";

// Linhas "outras redes — em acompanhamento" dentro da lista cripto.
// Extraido de src/app/(pt)/wallets/page.tsx (fase 1): o estado continua na pagina.
type Props = {
  otherWallets: StoredWalletEntry[];
  onRemove: (item: StoredWalletEntry) => void;
};

export default function OutrasRedesLinhas({ otherWallets, onRemove }: Props) {
  const { t } = useLanguage();
  return otherWallets.map((item) => {
    const addr = item.address ?? "";
    return (
      <div
        key={`other-${addr}-${item.network}`}
        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-700/60 bg-slate-900/40 px-4 py-3 text-xs text-slate-100"
      >
        <div>
          <p className="font-semibold text-white">{item.label ?? item.network ?? addr}</p>
          <p className="text-slate-500 font-mono text-[11px]">{addr.length > 20 ? `${addr.slice(0, 10)}…${addr.slice(-6)}` : addr}</p>
          <p className="mt-0.5 text-[11px] text-slate-600 uppercase tracking-wide">{t("wl_tracking_tag")} · {item.network}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-right">
          <span className="rounded-full border border-slate-700/40 bg-slate-800/40 px-3 py-2 text-[11px] text-slate-500">{t("wl_no_price")}</span>
          <button
            onClick={() => onRemove(item)}
            title={t("wl_remove")}
            className="rounded-full border border-rose-800/40 bg-rose-950/30 p-2 text-rose-400 transition hover:bg-rose-900/50 hover:text-rose-300"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
              <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>
    );
  });
}
