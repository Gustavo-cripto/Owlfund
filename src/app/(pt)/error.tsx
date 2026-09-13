"use client";

// Fronteira de erro das páginas (dentro do layout raiz → tem i18n e tema).
// Nunca mostra o stack ao utilizador; o ErrorMonitor já reporta o erro.

import { useEffect } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { btnPrimary, btnSecondary } from "@/lib/ui/buttons";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useLanguage();
  useEffect(() => { console.error("[page-error]", error); }, [error]);
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-6 text-center text-slate-100">
      <img src="/chainfolioai-icon.png" alt="" className="mb-6 h-16 w-16 rounded-2xl object-cover" />
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-rose-300/80">{t("err_tag")}</p>
      <h1 className="mt-3 text-3xl font-bold text-white md:text-4xl">{t("err_title")}</h1>
      <p className="mt-3 max-w-md text-slate-400">{t("err_desc")}</p>
      {error.digest && <p className="mt-2 font-mono text-[11px] text-slate-600">ref: {error.digest}</p>}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <button type="button" onClick={reset} className={`${btnPrimary} px-8 py-3 text-sm`}>{t("err_retry")}</button>
        <Link href="/dashboard" className={`${btnSecondary} px-8 py-3 text-sm`}>{t("nf_dashboard")}</Link>
      </div>
      <p className="mt-10 text-xs text-slate-600">{t("nf_help")} <a href="mailto:suporte@chainfolioai.com" className="text-orange-300/90 underline decoration-dotted">suporte@chainfolioai.com</a></p>
    </div>
  );
}
