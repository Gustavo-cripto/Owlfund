"use client";

import { useLanguage } from "@/lib/i18n/LanguageContext";

// Titulo da vista "tradicional" (acoes, ETFs...).
// Extraido de src/app/(pt)/wallets/page.tsx (fase 1).
export default function TradicionalCabecalho() {
  const { t } = useLanguage();
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs uppercase tracking-[0.3em] text-orange-300/80">
        {t("wl_trad_title")}
      </p>
      <h2 className="text-xl font-semibold text-white">
        {t("wl_trad_sub")}
      </h2>
      <p className="text-sm text-slate-400">
        {t("wl_trad_desc")}
      </p>
    </div>
  );
}
