import Link from "next/link";

import AppShell from "@/components/AppShell";
import { COUNTRIES, countryText, guideUrl, TAX_DATA_VERIFIED, type Country, type GuideLang } from "@/lib/tax/countries";
import { GUIDE_COPY } from "@/lib/tax/guideCopy";

// Página de um país, partilhada pelas duas línguas. Os textos das regras vêm
// das traduções (fc_<code>_*); os rótulos vêm de guideCopy.

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://chainfolioai.com";

export default function TaxGuideCountry({ lang, country }: { lang: GuideLang; country: Country }) {
  const c = GUIDE_COPY[lang];
  const text = countryText(country.code, lang);
  const base = guideUrl(lang);
  const here = `${SITE}${guideUrl(lang, country)}`;
  const others = COUNTRIES.filter((o) => o.code !== country.code);

  const facts = [
    { label: c.factShort, value: text.taxShort },
    { label: c.factLong, value: text.taxLong },
    { label: c.factThreshold, value: text.threshold },
    { label: c.factAllowance, value: country.regime.allowance?.label[lang] ?? c.notApplicable },
    { label: c.factLaw, value: country.law },
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: c.countryTitle(text.name),
        description: text.summary,
        inLanguage: c.locale,
        datePublished: "2026-09-11",
        author: { "@type": "Organization", name: "ChainFolioAI", url: SITE },
        publisher: { "@type": "Organization", name: "ChainFolioAI", url: SITE },
        mainEntityOfPage: here,
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: c.breadcrumbHome, item: SITE },
          { "@type": "ListItem", position: 2, name: c.indexTitle, item: `${SITE}${base}` },
          { "@type": "ListItem", position: 3, name: text.name, item: here },
        ],
      },
      {
        // Perguntas que as pessoas fazem mesmo — e que os modelos de IA citam.
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: c.faqHowMuch(text.name),
            acceptedAnswer: { "@type": "Answer", text: `${text.taxShort} · ${text.taxLong}. ${text.summary}` },
          },
          {
            "@type": "Question",
            name: c.faqAllowance(text.name),
            acceptedAnswer: {
              "@type": "Answer",
              text: country.regime.allowance
                ? c.faqAllowanceYes(country.regime.allowance.label[lang])
                : c.faqAllowanceNo(text.name),
            },
          },
          {
            "@type": "Question",
            name: c.faqMethod,
            acceptedAnswer: { "@type": "Answer", text: c.faqMethodAnswer },
          },
        ],
      },
    ],
  };

  return (
    <AppShell>
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <main className="mx-auto w-full max-w-4xl px-6 py-12">
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

          <nav className="text-xs text-slate-500">
            <Link href="/" className="transition hover:text-slate-300">{c.breadcrumbHome}</Link> ·{" "}
            <Link href={base} className="transition hover:text-slate-300">{c.breadcrumbGuides}</Link> · {text.name}
          </nav>

          <h1 className="mt-4 flex items-center gap-3 text-3xl font-bold text-white sm:text-4xl">
            <span aria-hidden>{country.flag}</span>
            {c.countryTitle(text.name)}
          </h1>
          <p className="mt-2 text-sm text-slate-500">{c.verifiedOn(TAX_DATA_VERIFIED[lang])}</p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {facts.map((f) => (
              <div key={f.label} className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3">
                <p className="text-xs uppercase tracking-wider text-slate-500">{f.label}</p>
                <p className="mt-1 font-semibold text-white">{f.value}</p>
              </div>
            ))}
          </div>

          <section className="mt-10">
            <h2 className="text-xl font-semibold text-white">{c.summaryTitle}</h2>
            <p className="mt-3 leading-relaxed text-slate-300">{text.summary}</p>
          </section>

          {text.keyPoints.length > 0 && (
            <section className="mt-8">
              <h2 className="text-xl font-semibold text-white">{c.keyPointsTitle}</h2>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-slate-300 marker:text-orange-400/70">
                {text.keyPoints.map((p) => <li key={p}>{p}</li>)}
              </ul>
            </section>
          )}

          <section className="mt-10 rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
            <h2 className="text-lg font-semibold text-white">{c.calcTitle}</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">{c.calcBody}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href="/beta" className="rounded-full bg-orange-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-orange-400">
                {c.ctaBeta}
              </Link>
              <Link href={base} className="rounded-full border border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white">
                {c.ctaCompare}
              </Link>
            </div>
          </section>

          <section className="mt-10">
            <h2 className="text-sm uppercase tracking-wider text-slate-500">{c.otherCountries}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {others.map((o) => (
                <Link
                  key={o.code}
                  href={guideUrl(lang, o)}
                  className="rounded-full border border-slate-800 px-3 py-1.5 text-sm text-slate-300 transition hover:border-orange-400/50 hover:text-white"
                >
                  <span aria-hidden className="mr-1">{o.flag}</span>
                  {countryText(o.code, lang).name}
                </Link>
              ))}
            </div>
          </section>

          <p className="mt-10 text-xs leading-relaxed text-slate-500">{c.disclaimerCountry}</p>
        </main>
      </div>
    </AppShell>
  );
}
