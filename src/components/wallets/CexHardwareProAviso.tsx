"use client";

import { btnPrimary } from "@/lib/ui/buttons";
import { useLanguage } from "@/lib/i18n/LanguageContext";

// Sem Pro: aviso de que CEX, Hyperliquid e carteiras de hardware sao do plano Pro.
// Extraido de src/app/(pt)/wallets/page.tsx (fase 1): o estado continua na pagina.
type Props = {
  paymentsFrozen: boolean;
};

export default function CexHardwareProAviso({
  paymentsFrozen,
}: Props) {
  const { t } = useLanguage();
  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-8">
      <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-6 flex flex-col sm:flex-row items-center gap-5">
        <div className="text-4xl">🔒</div>
        <div className="flex-1 text-center sm:text-left">
          <p className="text-base font-bold text-white mb-1">{t("wl_cex_hw_pro")}</p>
          <p className="text-sm text-slate-400">{t("wl_cex_hw_desc")}</p>
        </div>
        <a href={paymentsFrozen ? "/beta" : "/pricing"} className={`${btnPrimary} shrink-0 px-5 py-2.5 text-sm`}>
          {paymentsFrozen ? `🧪 ${t("dash_beta_cta_short")} →` : t("wl_upgrade_pro")}
        </a>
      </div>
    </div>
  );
}
