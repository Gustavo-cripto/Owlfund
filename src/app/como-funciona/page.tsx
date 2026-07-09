"use client";

import AppShell from "@/components/AppShell";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import type { TranslationKey } from "@/lib/i18n/translations";

const CARDS: { icon: string; tKey: TranslationKey; dKey: TranslationKey }[] = [
  { icon: "/chainfolioai-icon.png", tKey: "dash_how_1_title", dKey: "dash_how_1_desc" },
  { icon: "🔗", tKey: "dash_how_2_title", dKey: "dash_how_2_desc" },
  { icon: "📡", tKey: "dash_how_3_title", dKey: "dash_how_3_desc" },
  { icon: "🤖", tKey: "dash_how_4_title", dKey: "dash_how_4_desc" },
  { icon: "🔒", tKey: "dash_how_5_title", dKey: "dash_how_5_desc" },
  { icon: "💎", tKey: "dash_how_6_title", dKey: "dash_how_6_desc" },
];

export default function HowItWorksPage() {
  const { t } = useLanguage();

  return (
    <AppShell>
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <main className="mx-auto w-full max-w-6xl px-6 py-16">
          <a href="/" className="text-sm text-orange-300/90 transition hover:text-orange-200">
            {t("legal_back_home")}
          </a>

          <div className="mt-8 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-300/80">{t("dash_how_title")}</p>
            <h1 className="mt-3 text-3xl font-bold text-white md:text-4xl">{t("dash_how_subtitle")}</h1>
          </div>

          <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {CARDS.map((item, i) => (
              <div
                key={item.tKey}
                className={`card-hover rounded-2xl border border-slate-800 bg-slate-900/60 p-6 animate-fade-in-up delay-${Math.min(i * 100, 500)}`}
              >
                <div className="mb-4 text-3xl leading-none">
                  {item.icon.startsWith("/")
                    ? <img src={item.icon} alt="" className="h-9 w-9 rounded-lg object-cover" />
                    : item.icon}
                </div>
                <h2 className="text-base font-bold text-white">{t(item.tKey)}</h2>
                <p className="mt-2 text-sm text-slate-400 leading-relaxed">{t(item.dKey)}</p>
              </div>
            ))}
          </div>

          <div className="mt-14 text-center">
            <a
              href="/login"
              className="inline-block rounded-full bg-orange-500 px-8 py-3.5 text-base font-bold text-slate-950 shadow-lg shadow-orange-500/25 transition hover:bg-orange-400 hover:scale-[1.03] active:scale-[0.98]"
            >
              {t("lp_plan_cta")}
            </a>
          </div>
        </main>
      </div>
    </AppShell>
  );
}
