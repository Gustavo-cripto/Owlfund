"use client";

import { useState } from "react";
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

// Percurso ferramenta a ferramenta. A imagem só aparece se existir em
// /public/screenshots/; se faltar, a linha fica só com o texto (sem partir a página).
const TOOLS: { img: string; t: TranslationKey; d: TranslationKey; b: TranslationKey[] }[] = [
  { img: "/screenshots/dashboard.png",   t: "cf_t1_t", d: "cf_t1_d", b: ["cf_t1_b1", "cf_t1_b2", "cf_t1_b3"] },
  { img: "/screenshots/portfolio.png",   t: "cf_t2_t", d: "cf_t2_d", b: ["cf_t2_b1", "cf_t2_b2", "cf_t2_b3"] },
  { img: "/screenshots/wallets.png",     t: "cf_t3_t", d: "cf_t3_d", b: ["cf_t3_b1", "cf_t3_b2", "cf_t3_b3"] },
  { img: "/screenshots/market.png",      t: "cf_t4_t", d: "cf_t4_d", b: ["cf_t4_b1", "cf_t4_b2", "cf_t4_b3"] },
  { img: "/screenshots/fiscalidade.png", t: "cf_t5_t", d: "cf_t5_d", b: ["cf_t5_b1", "cf_t5_b2", "cf_t5_b3"] },
  { img: "/screenshots/chat.png",        t: "cf_t6_t", d: "cf_t6_d", b: ["cf_t6_b1", "cf_t6_b2", "cf_t6_b3"] },
];

function ToolRow({ tool, index }: { tool: (typeof TOOLS)[number]; index: number }) {
  const { t } = useLanguage();
  const [imgOk, setImgOk] = useState(true);
  const reverse = index % 2 === 1;
  return (
    <div className="grid items-center gap-8 md:grid-cols-2">
      {imgOk && (
        <figure className={`animate-fade-in-up overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 shadow-xl shadow-black/30 ${reverse ? "md:order-2" : ""}`}>
          <img
            src={tool.img}
            alt={t(tool.t)}
            loading="lazy"
            onError={() => setImgOk(false)}
            className="w-full object-cover"
          />
        </figure>
      )}
      <div className={`${reverse ? "md:order-1" : ""} ${imgOk ? "" : "md:col-span-2 md:max-w-2xl md:mx-auto"}`}>
        <h3 className="text-xl font-bold text-white md:text-2xl">{t(tool.t)}</h3>
        <p className="mt-3 leading-relaxed text-slate-400">{t(tool.d)}</p>
        <ul className="mt-5 space-y-2.5">
          {tool.b.map((b) => (
            <li key={b} className="flex items-start gap-2.5 text-sm text-slate-300">
              <span className="mt-0.5 shrink-0 text-orange-400">✓</span>
              <span>{t(b)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

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

          {/* Conceito geral — 6 cartões */}
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

          {/* Percurso ferramenta a ferramenta */}
          <div className="mt-24 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-300/80">{t("cf_walk_tag")}</p>
            <h2 className="mt-3 text-3xl font-bold text-white md:text-4xl">{t("cf_walk_title")}</h2>
          </div>
          <div className="mt-14 space-y-16 md:space-y-24">
            {TOOLS.map((tool, i) => (
              <ToolRow key={tool.t} tool={tool} index={i} />
            ))}
          </div>

          <div className="mt-20 text-center">
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
