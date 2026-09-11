import Link from "next/link";

import AppShell from "@/components/AppShell";
import { COUNTRIES, countryText, guideUrl, TAX_DATA_VERIFIED, type GuideLang } from "@/lib/tax/countries";
import { GUIDE_COPY } from "@/lib/tax/guideCopy";

// Índice do guia fiscal, partilhado pelas duas línguas (/guias/… e /guides/…).
// Server component: o HTML sai completo, que é o que o Google e os modelos leem.

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://chainfolioai.com";

export default function TaxGuideIndex({ lang }: { lang: GuideLang }) {
  const c = GUIDE_COPY[lang];
  const base = guideUrl(lang);
  const rows = COUNTRIES.map((country) => ({ country, text: countryText(country.code, lang) }));

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: c.indexTitle,
        description: c.indexMetaDescription,
        inLanguage: c.locale,
        datePublished: "2026-09-11",
        author: { "@type": "Organization", name: "ChainFolioAI", url: SITE },
        publisher: { "@type": "Organization", name: "ChainFolioAI", url: SITE },
        mainEntityOfPage: `${SITE}${base}`,
      },
      {
        "@type": "ItemList",
        name: c.indexTitle,
        itemListElement: rows.map(({ country, text }, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: c.countryTitle(text.name),
          url: `${SITE}${guideUrl(lang, country)}`,
        })),
      },
    ],
  };

  return (
    <AppShell>
      {/* Sem este embrulho o conteudo herda o fundo claro do layout e o texto
          branco fica invisivel — foi o que aconteceu na 1.a versao. */}
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <main className="mx-auto w-full max-w-5xl px-6 py-12">
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

          <nav className="text-xs text-slate-500">
            <Link href="/" className="transition hover:text-slate-300">{c.breadcrumbHome}</Link> · {c.breadcrumbGuides}
          </nav>

          <h1 className="mt-4 text-3xl font-bold text-white sm:text-4xl">{c.indexTitle}</h1>
          <p className="mt-3 max-w-3xl text-slate-400">{c.indexIntro(TAX_DATA_VERIFIED[lang])}</p>

          <div className="mt-8 overflow-x-auto rounded-2xl border border-slate-800">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-slate-900/60 text-xs uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-medium">{c.colCountry}</th>
                  <th className="px-4 py-3 font-medium">{c.colShort}</th>
                  <th className="px-4 py-3 font-medium">{c.colLong}</th>
                  <th className="px-4 py-3 font-medium">{c.colThreshold}</th>
                  <th className="px-4 py-3 font-medium">{c.colAllowance}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {rows.map(({ country, text }) => (
                  <tr key={country.code} className="transition hover:bg-slate-900/40">
                    <td className="px-4 py-3">
                      <Link href={guideUrl(lang, country)} className="font-medium text-white transition hover:text-orange-300">
                        <span aria-hidden className="mr-2">{country.flag}</span>
                        {text.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-200">{text.taxShort}</td>
                    <td className="px-4 py-3 text-slate-300">{text.taxLong}</td>
                    <td className="px-4 py-3 text-slate-400">{text.threshold}</td>
                    <td className="px-4 py-3 text-slate-400">{country.regime.allowance?.label[lang] ?? c.none}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <section className="mt-10 rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
            <h2 className="text-lg font-semibold text-white">{c.howToTitle}</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">{c.howToBody}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href="/beta" className="rounded-full bg-orange-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-orange-400">
                {c.ctaBeta}
              </Link>
              <Link href="/como-funciona" className="rounded-full border border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white">
                {c.ctaHow}
              </Link>
            </div>
          </section>

          <p className="mt-8 text-xs leading-relaxed text-slate-500">{c.disclaimerIndex}</p>
        </main>
      </div>
    </AppShell>
  );
}
