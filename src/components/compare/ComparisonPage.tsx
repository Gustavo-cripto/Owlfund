import Link from "next/link";

import AppShell from "@/components/AppShell";
import { btnPrimary } from "@/lib/ui/buttons";
import { COMPARE_COPY } from "@/lib/compare/compareCopy";
import { COMPETITORS, compareUrl, type Competitor } from "@/lib/compare/competitors";
import type { Lang } from "@/lib/i18n/translations";
import { pageUrl } from "@/lib/i18n/routes";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://chainfolioai.com";

/** Lista com marcador, usada nas quatro secções. */
function Pontos({ itens, cor }: { itens: readonly string[]; cor: string }) {
  return (
    <ul className="mt-3 space-y-2">
      {itens.map((t) => (
        <li key={t} className="flex gap-2.5 text-sm leading-relaxed text-slate-300">
          <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${cor}`} aria-hidden />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

export default function ComparisonPage({ lang, competitor }: { lang: Lang; competitor: Competitor }) {
  const c = COMPARE_COPY[lang];
  const n = competitor.name;
  const here = `${SITE}${compareUrl(lang, competitor)}`;
  const outros = COMPETITORS.filter((o) => o.slug !== competitor.slug);

  // As perguntas são escritas UMA vez e servem o bloco visível e o FAQPage.
  // Declarar perguntas que a página não mostra é motivo para o Google ignorar
  // o resultado rico.
  const faqs = [
    { q: c.faqSame(n), a: c.faqSameA(n) },
    { q: c.faqBetter(n), a: c.faqBetterA(n) },
    { q: c.faqSwitch(n), a: c.faqSwitchA },
    { q: c.faqFree, a: c.faqFreeA },
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: c.heading(n),
        description: c.metaDescription(n),
        inLanguage: lang,
        mainEntityOfPage: here,
        // Datas reais do conteudo (git log de src/lib/compare/competitors.ts).
        datePublished: "2026-09-20",
        dateModified: "2026-09-20",
        image: `${SITE}/opengraph-image`,
        author: { "@type": "Organization", name: "ChainFolioAI", url: SITE },
        publisher: { "@type": "Organization", name: "ChainFolioAI", url: SITE, logo: { "@type": "ImageObject", url: `${SITE}/chainfolioai-icon.png` } },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: c.breadcrumbHome, item: `${SITE}${pageUrl("home", lang)}` },
          { "@type": "ListItem", position: 2, name: c.breadcrumbCompare, item: `${SITE}${compareUrl(lang)}` },
          { "@type": "ListItem", position: 3, name: n, item: here },
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: faqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };

  return (
    <AppShell>
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <main className="mx-auto w-full max-w-4xl px-6 py-12">
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

          <nav className="text-xs text-slate-500">
            <Link href={pageUrl("home", lang)} className="transition hover:text-slate-300">{c.breadcrumbHome}</Link> ·{" "}
            <Link href={compareUrl(lang)} className="transition hover:text-slate-300">{c.breadcrumbCompare}</Link> · {n}
          </nav>

          <h1 className="mt-4 text-3xl font-bold text-white md:text-4xl">{c.heading(n)}</h1>
          <p className="mt-3 max-w-2xl leading-relaxed text-slate-400">{c.lead(n)}</p>

          {/* O que cada um é, lado a lado. */}
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">{c.whatIs(n)}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">{competitor.what[lang]}</p>
              <a href={competitor.site} target="_blank" rel="noopener noreferrer nofollow"
                className="mt-3 inline-block text-xs font-semibold text-slate-400 underline decoration-dotted underline-offset-2 hover:text-slate-200">
                {c.visit(n)} ↗
              </a>
            </section>
            <section className="rounded-2xl border border-orange-500/30 bg-orange-500/[0.06] p-5">
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-orange-300/80">{c.whatWeAre}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">{c.whatWeAreText}</p>
            </section>
          </div>

          {/* Começa pelo que é comum: é o que dá credibilidade ao resto. */}
          <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <h2 className="text-lg font-bold text-white">{c.sameTitle}</h2>
            <Pontos itens={competitor.same[lang]} cor="bg-slate-500" />
          </section>

          {/* A secção que faz a página valer alguma coisa. */}
          <section className="mt-6 rounded-2xl border border-sky-500/30 bg-sky-500/[0.06] p-5">
            <h2 className="text-lg font-bold text-sky-200">{c.theirsTitle(n)}</h2>
            <p className="mt-1 text-xs text-sky-300/70">{c.theirsNote}</p>
            <Pontos itens={competitor.theirs[lang]} cor="bg-sky-400" />
          </section>

          <section className="mt-6 rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.06] p-5">
            <h2 className="text-lg font-bold text-emerald-200">{c.oursTitle}</h2>
            <Pontos itens={competitor.ours[lang]} cor="bg-emerald-400" />
          </section>

          {/* Qual escolher, sem superlativos. */}
          <section className="mt-6">
            <h2 className="text-lg font-bold text-white">{c.pickTitle}</h2>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                <p className="text-sm font-semibold text-slate-300">{c.pickThem(n)}</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{competitor.pick[lang].them}</p>
              </div>
              <div className="rounded-2xl border border-orange-500/30 bg-orange-500/[0.06] p-5">
                <p className="text-sm font-semibold text-orange-200">{c.pickUs}</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">{competitor.pick[lang].us}</p>
              </div>
            </div>
          </section>

          <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <h2 className="text-lg font-bold text-white">{c.priceTitle}</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">{c.priceOurs}</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">{c.priceTheirs(n)}</p>
          </section>

          {/* As mesmas perguntas do JSON-LD, visíveis. */}
          <section className="mt-6 space-y-2">
            {faqs.map((f) => (
              <details key={f.q} className="group rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
                <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-slate-200 [&::-webkit-details-marker]:hidden">
                  <span className="flex-1">{f.q}</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                    strokeLinecap="round" strokeLinejoin="round"
                    className="shrink-0 text-slate-500 transition-transform duration-200 group-open:rotate-180" aria-hidden="true">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </summary>
                <p className="faq-a mt-2 text-sm leading-relaxed text-slate-400">{f.a}</p>
              </details>
            ))}
          </section>

          <p className="mt-6 text-xs leading-relaxed text-slate-500">{c.honesty}</p>
          <p className="mt-2 text-xs leading-relaxed text-slate-600">{c.reviewed}</p>

          <section className="mt-8 rounded-2xl border border-orange-500/30 bg-gradient-to-br from-orange-500/[0.08] to-slate-900/60 p-6 text-center">
            <h2 className="text-lg font-bold text-white">{c.ctaTitle}</h2>
            <Link href={`${pageUrl("login", lang)}?mode=signup`} prefetch
              className={`${btnPrimary} mt-4 inline-flex px-6 py-3 text-sm`}>
              {c.ctaButton}
            </Link>
          </section>

          <section className="mt-8">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">{c.otherTitle}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {outros.map((o) => (
                <Link key={o.slug} href={compareUrl(lang, o)} prefetch
                  className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-orange-400/50 hover:text-white">
                  ChainFolioAI vs {o.name}
                </Link>
              ))}
            </div>
          </section>
        </main>
      </div>
    </AppShell>
  );
}
