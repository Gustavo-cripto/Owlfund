import Link from "next/link";

import AppShell from "@/components/AppShell";
import { COMPARE_COPY } from "@/lib/compare/compareCopy";
import { COMPETITORS, compareUrl } from "@/lib/compare/competitors";
import type { Lang } from "@/lib/i18n/translations";
import { pageUrl } from "@/lib/i18n/routes";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://chainfolioai.com";

export default function ComparisonIndex({ lang }: { lang: Lang }) {
  const c = COMPARE_COPY[lang];

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: c.breadcrumbHome, item: `${SITE}${pageUrl("home", lang)}` },
          { "@type": "ListItem", position: 2, name: c.breadcrumbCompare, item: `${SITE}${compareUrl(lang)}` },
        ],
      },
      {
        "@type": "ItemList",
        itemListElement: COMPETITORS.map((o, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: `ChainFolioAI vs ${o.name}`,
          url: `${SITE}${compareUrl(lang, o)}`,
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
            <Link href={pageUrl("home", lang)} className="transition hover:text-slate-300">{c.breadcrumbHome}</Link> · {c.breadcrumbCompare}
          </nav>

          <h1 className="mt-4 text-3xl font-bold text-white md:text-4xl">{c.indexTitle}</h1>
          <p className="mt-3 max-w-2xl leading-relaxed text-slate-400">{c.indexIntro}</p>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {COMPETITORS.map((o) => (
              <Link key={o.slug} href={compareUrl(lang, o)} prefetch
                className="press block rounded-2xl border border-slate-800 bg-slate-900/60 p-5 transition hover:border-orange-400/50">
                <p className="text-base font-bold text-white">ChainFolioAI vs {o.name}</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{o.what[lang]}</p>
                <span className="mt-3 inline-block text-xs font-semibold text-orange-300">{c.theirsTitle(o.name)} →</span>
              </Link>
            ))}
          </div>

          <p className="mt-8 text-xs leading-relaxed text-slate-600">{c.reviewed}</p>
        </main>
      </div>
    </AppShell>
  );
}
