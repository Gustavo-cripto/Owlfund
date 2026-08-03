"use client";

import Link from "next/link";
import AppShell from "@/components/AppShell";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import type { TranslationKey } from "@/lib/i18n/translations";

const SECTIONS: { h: TranslationKey; b: TranslationKey }[] = [
  { h: "pp_s1_h", b: "pp_s1_b" },
  { h: "pp_s2_h", b: "pp_s2_b" },
  { h: "pp_s3_h", b: "pp_s3_b" },
  { h: "pp_s4_h", b: "pp_s4_b" },
  { h: "pp_s5_h", b: "pp_s5_b" },
  { h: "pp_s6_h", b: "pp_s6_b" },
  { h: "pp_s7_h", b: "pp_s7_b" },
  { h: "pp_s9_h", b: "pp_s9_b" },
  { h: "pp_s8_h", b: "pp_s8_b" },
];

const LAST_UPDATED = "2026-08-03";

export default function PrivacyPage() {
  const { t } = useLanguage();

  return (
    <AppShell>
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <main className="mx-auto w-full max-w-3xl px-6 py-16">
          <Link href="/" className="text-sm text-orange-300/90 transition hover:text-orange-200">
            {t("legal_back_home")}
          </Link>

          <h1 className="mt-6 text-3xl font-bold text-white md:text-4xl">{t("pp_title")}</h1>
          <p className="mt-2 text-xs text-slate-500">
            {t("legal_updated")}: {LAST_UPDATED}
          </p>
          <p className="mt-6 text-slate-300">{t("pp_intro")}</p>

          <div className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3 text-sm text-amber-200/90">
            {t("legal_draft")}
          </div>

          <div className="mt-10 space-y-8">
            {SECTIONS.map((s, i) => (
              <section key={s.h}>
                <h2 className="text-lg font-bold text-white">
                  {i + 1}. {t(s.h)}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{t(s.b)}</p>
              </section>
            ))}
          </div>

          <div className="mt-12 border-t border-slate-900 pt-6 text-sm text-slate-500">
            <a href="/termos" className="transition hover:text-slate-300">
              {t("legal_terms_short")}
            </a>
          </div>
        </main>
      </div>
    </AppShell>
  );
}
