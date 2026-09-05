"use client";

import { useState } from "react";
import Link from "next/link";
import { btnPrimary } from "@/lib/ui/buttons";
import AppShell from "@/components/AppShell";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import type { TranslationKey } from "@/lib/i18n/translations";

const paymentsFrozen = process.env.NEXT_PUBLIC_PAYMENTS_ENABLED !== "true";

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
// A ordem do array é a ordem no ecrã — os números das chaves (cf_tN) são a ordem
// em que foram criadas, por isso não têm de coincidir.
const TOOLS: { img: string; t: TranslationKey; d: TranslationKey; b: TranslationKey[] }[] = [
  { img: "/screenshots/dashboard.png",   t: "cf_t1_t", d: "cf_t1_d", b: ["cf_t1_b1", "cf_t1_b2", "cf_t1_b3"] },
  { img: "/screenshots/portfolio.png",   t: "cf_t2_t", d: "cf_t2_d", b: ["cf_t2_b1", "cf_t2_b2", "cf_t2_b3"] },
  { img: "/screenshots/wallets.png",     t: "cf_t3_t", d: "cf_t3_d", b: ["cf_t3_b1", "cf_t3_b2", "cf_t3_b3"] },
  { img: "/screenshots/market.png",      t: "cf_t4_t", d: "cf_t4_d", b: ["cf_t4_b1", "cf_t4_b2", "cf_t4_b3"] },
  { img: "/screenshots/smart-money.png", t: "cf_t7_t", d: "cf_t7_d", b: ["cf_t7_b1", "cf_t7_b2", "cf_t7_b3"] },
  { img: "/screenshots/fiscalidade.png", t: "cf_t5_t", d: "cf_t5_d", b: ["cf_t5_b1", "cf_t5_b2", "cf_t5_b3"] },
  { img: "/screenshots/fire.png",        t: "cf_t8_t", d: "cf_t8_d", b: ["cf_t8_b1", "cf_t8_b2", "cf_t8_b3"] },
  { img: "/screenshots/historico.png",   t: "cf_t9_t", d: "cf_t9_d", b: ["cf_t9_b1", "cf_t9_b2", "cf_t9_b3"] },
  { img: "/screenshots/chat.png",        t: "cf_t6_t", d: "cf_t6_d", b: ["cf_t6_b1", "cf_t6_b2", "cf_t6_b3"] },
  { img: "/screenshots/developers.png",  t: "cf_t10_t", d: "cf_t10_d", b: ["cf_t10_b1", "cf_t10_b2", "cf_t10_b3"] },
];

// Passos reais do fluxo (durante o beta inclui a inscrição com o mesmo email).
const FLOW: Array<{ t: TranslationKey; d: TranslationKey; href: string }> = paymentsFrozen
  ? [
      { t: "lp_s1_t", d: "lp_s1_d", href: "/login" },
      { t: "lp_s_beta_t", d: "lp_s_beta_d", href: "/beta" },
      { t: "lp_s2_t", d: "lp_s2_d", href: "/wallets" },
      { t: "lp_s3_t", d: "lp_s3_d", href: "/dashboard" },
    ]
  : [
      { t: "lp_s1_t", d: "lp_s1_d", href: "/login" },
      { t: "lp_s2_t", d: "lp_s2_d", href: "/wallets" },
      { t: "lp_s3_t", d: "lp_s3_d", href: "/dashboard" },
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
          <Link href="/" className="text-sm text-orange-300/90 transition hover:text-orange-200">
            {t("legal_back_home")}
          </Link>

          <div className="mt-8 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-300/80">{t("dash_how_title")}</p>
            <h1 className="mt-3 text-3xl font-bold text-white md:text-4xl">{t("cf_h1")}</h1>
            <p className="mt-3 text-slate-400">{t("dash_how_subtitle")}</p>
          </div>

          {/* Fluxo passo a passo */}
          <ol className={`mt-10 grid gap-4 ${FLOW.length === 4 ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
            {FLOW.map((f, i) => (
              <li key={f.t} className="rounded-2xl border border-orange-500/20 bg-gradient-to-br from-slate-900 to-slate-950 p-5">
                <div className="text-4xl font-black leading-none text-orange-500/20">{String(i + 1).padStart(2, "0")}</div>
                <h2 className="mt-3 text-sm font-bold text-white">{t(f.t)}</h2>
                <p className="mt-1 text-xs text-slate-400 leading-relaxed">{t(f.d)}</p>
                <Link href={f.href} className="mt-3 inline-block text-xs font-semibold text-orange-300 hover:text-orange-200">{t("cf_go")} →</Link>
              </li>
            ))}
          </ol>

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
                <h3 className="text-base font-bold text-white">{t(item.tKey)}</h3>
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

          <p className="mt-16 rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3 text-center text-xs text-slate-500">⚠️ {t("lp_disclaimer")}</p>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a href="/login" className={`${btnPrimary} px-8 py-3.5 text-base`}>
              {t("lp_plan_cta")}
            </a>
            {paymentsFrozen && (
              <a href="/beta" className="rounded-xl border border-orange-500/40 px-8 py-3.5 text-base font-semibold text-orange-200 hover:bg-orange-500/10 transition">
                🧪 {t("lp_hero_beta_cta")}
              </a>
            )}
          </div>
        </main>
      </div>
    </AppShell>
  );
}
