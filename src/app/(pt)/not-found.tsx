"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { btnPrimary, btnSecondary } from "@/lib/ui/buttons";

export default function NotFound() {
  const { t } = useLanguage();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-6 text-center text-slate-100">
      <img src="/chainfolioai-icon.png" alt="" className="mb-6 h-16 w-16 rounded-2xl object-cover" />
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-300/80">404</p>
      <h1 className="mt-3 text-3xl font-bold text-white md:text-4xl">{t("nf_title")}</h1>
      <p className="mt-3 max-w-md text-slate-400">{t("nf_desc")}</p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link href="/" className={`${btnPrimary} px-8 py-3 text-sm`}>{t("nf_home")}</Link>
        <Link href="/dashboard" className={`${btnSecondary} px-8 py-3 text-sm`}>{t("nf_dashboard")}</Link>
      </div>
      <p className="mt-10 text-xs text-slate-600">{t("nf_help")} <a href="mailto:suporte@chainfolioai.com" className="text-orange-300/90 underline decoration-dotted">suporte@chainfolioai.com</a></p>
    </div>
  );
}
