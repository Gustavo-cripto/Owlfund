"use client";

import { useLanguage } from "@/lib/i18n/LanguageContext";

// Chamada para o historico de compras e vendas (fim da secao cripto).
// Extraido de src/app/(pt)/wallets/page.tsx (fase 1).
export default function HistoricoTransacoesCta() {
  const { t } = useLanguage();
  return (
    <div className="mt-6 rounded-2xl border border-slate-700/60 bg-slate-900/40 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-0.5">{t("wl_manual_record")}</p>
        <p className="text-sm font-bold text-white">{t("wl_tx_history")}</p>
        <p className="text-xs text-slate-500 mt-1">{t("wl_tx_history_desc")}</p>
      </div>
      <a
        href="/historico"
        className="shrink-0 rounded-xl border border-orange-500/40 bg-orange-500/10 px-5 py-2.5 text-sm font-semibold text-orange-300 hover:bg-orange-500/20 transition"
      >
        {t("wl_view_history")}
      </a>
    </div>
  );
}
