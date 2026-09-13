"use client";

import Link from "next/link";
import AppShell from "@/components/AppShell";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import type { TranslationKey } from "@/lib/i18n/translations";

const SECTIONS: { h: TranslationKey; b: TranslationKey }[] = [
  { h: "tp_s1_h", b: "tp_s1_b" },
  { h: "tp_s2_h", b: "tp_s2_b" },
  { h: "tp_s3_h", b: "tp_s3_b" },
  { h: "tp_s4_h", b: "tp_s4_b" },
  { h: "tp_s5_h", b: "tp_s5_b" },
  { h: "tp_s6_h", b: "tp_s6_b" },
  { h: "tp_s7_h", b: "tp_s7_b" },
  { h: "tp_s9_h", b: "tp_s9_b" },
  { h: "tp_s10_h", b: "tp_s10_b" },
  { h: "tp_s11_h", b: "tp_s11_b" },
  { h: "tp_s8_h", b: "tp_s8_b" },
];

const LAST_UPDATED = "2026-09-06";

export default function TermsPage() {
  const { t, lang } = useLanguage();
  const locale = ({ pt: "pt-PT", en: "en-GB", es: "es-ES", fr: "fr-FR" } as Record<string, string>)[lang] ?? "pt-PT";

  return (
    <AppShell>
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <main className="mx-auto w-full max-w-3xl px-6 py-16">
          <Link href="/" className="text-sm text-orange-300/90 transition hover:text-orange-200">
            {t("legal_back_home")}
          </Link>

          <h1 className="mt-6 text-3xl font-bold text-white md:text-4xl">{t("tp_title")}</h1>
          <p className="mt-2 text-xs text-slate-500">
            {t("legal_updated")}: {new Date(LAST_UPDATED + "T12:00:00Z").toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" })}
          </p>
          <p className="mt-6 text-slate-300">{t("tp_intro")}</p>

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
            <a href="/privacidade" className="transition hover:text-slate-300">
              {t("legal_privacy_short")}
            </a>
          </div>
        </main>
      </div>
    </AppShell>
  );
}
