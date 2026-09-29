import Link from "next/link";

import AppShell from "@/components/AppShell";
import ExperimentarSemConta from "@/components/ExperimentarSemConta";
import { pageUrl } from "@/lib/i18n/routes";
import type { Lang } from "@/lib/i18n/translations";
import { ogImages } from "@/lib/seo/site";
import { REDES_SALDO, SALDO_COPY, SALDO_DATE_MODIFIED, saldoUrl, type RedeSaldo } from "@/lib/tools/saldo";
import { btnPrimary } from "@/lib/ui/buttons";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://chainfolioai.com";

function Pontos({ itens }: { itens: readonly string[] }) {
  return (
    <ul className="mt-3 space-y-2">
      {itens.map((t) => (
        <li key={t} className="flex gap-2.5 text-sm leading-relaxed text-slate-300">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-400" aria-hidden />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

// Página própria da ferramenta "ver saldo sem conta" (geral e por rede).
// Texto em src/lib/tools/saldo.ts; a consulta é o mesmo componente da página
// inicial, que fala com /api/preview.
export default function VerSaldoPage({ lang, rede }: { lang: Lang; rede: RedeSaldo }) {
  const c = SALDO_COPY[lang];
  const r = c.redes[rede];
  const here = `${SITE}${saldoUrl(lang, rede)}`;
  const geral = c.redes.todas;
  const outras = REDES_SALDO.filter((x) => x !== rede);

  // As perguntas servem o bloco visível e o FAQPage: declarar perguntas que a
  // página não mostra é motivo para o Google ignorar o resultado rico.
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebApplication",
        name: `${r.nome} · ChainFolioAI`,
        url: here,
        description: r.metaDescription,
        inLanguage: lang,
        applicationCategory: "FinanceApplication",
        operatingSystem: "Web",
        isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
        image: ogImages(lang)[0].url,
        dateModified: SALDO_DATE_MODIFIED,
        publisher: { "@type": "Organization", name: "ChainFolioAI", url: SITE, logo: { "@type": "ImageObject", url: `${SITE}/chainfolioai-icon.png` } },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: c.breadcrumbHome, item: `${SITE}${pageUrl("home", lang)}` },
          ...(rede === "todas"
            ? [{ "@type": "ListItem", position: 2, name: geral.nome, item: here }]
            : [
                { "@type": "ListItem", position: 2, name: geral.nome, item: `${SITE}${saldoUrl(lang, "todas")}` },
                { "@type": "ListItem", position: 3, name: r.nome, item: here },
              ]),
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: c.faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
      },
    ],
  };

  return (
    <AppShell>
      <div className="min-h-screen bg-slate-950 text-slate-100">
        {/* <article>, não <main>: o AppShell já tem o <main> da página. */}
        <article className="mx-auto w-full max-w-4xl px-6 pb-8 pt-12">
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

          <nav aria-label={c.breadcrumbLabel} className="text-xs text-slate-500">
            <Link href={pageUrl("home", lang)} className="transition hover:text-slate-300">{c.breadcrumbHome}</Link>
            {rede !== "todas" && (
              <> · <Link href={saldoUrl(lang, "todas")} className="transition hover:text-slate-300">{geral.nome}</Link></>
            )}
            {" "}· {r.nome}
          </nav>

          <h1 className="mt-4 text-3xl font-bold text-white md:text-4xl">{r.h1}</h1>
          <p className="mt-3 max-w-2xl leading-relaxed text-slate-400">{r.lead}</p>
        </article>

        {/* A ferramenta: o mesmo bloco da página inicial, sem o cabeçalho dele. */}
        <ExperimentarSemConta rede={rede === "todas" ? undefined : rede} semCabecalho />

        <div className="mx-auto w-full max-w-4xl px-6 pb-24 pt-10">
          <p className="max-w-2xl text-sm leading-relaxed text-slate-300">{r.le}</p>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <h2 className="text-base font-semibold text-white">{c.mostraTitulo}</h2>
              <Pontos itens={c.mostra} />
            </section>
            <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <h2 className="text-base font-semibold text-white">{c.privTitulo}</h2>
              <Pontos itens={c.priv} />
            </section>
          </div>

          <section className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <h2 className="text-base font-semibold text-white">{c.naoFazTitulo}</h2>
            <Pontos itens={c.naoFaz} />
          </section>

          <section className="mt-10">
            <h2 className="text-lg font-semibold text-white">{c.outrasTitulo}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {outras.map((x) => (
                <Link key={x} href={saldoUrl(lang, x)}
                  className="rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-orange-400/60 hover:text-white">
                  {c.redes[x].nome}
                </Link>
              ))}
            </div>
          </section>

          <section className="mt-10 rounded-2xl border border-orange-500/25 bg-orange-500/[0.05] p-6">
            <h2 className="text-lg font-semibold text-white">{c.guiasTitulo}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">{c.guiasTexto}</p>
            <ul className="mt-3 space-y-1.5">
              {c.guias.map((g) => (
                <li key={g.href}>
                  <Link href={g.href} className="text-sm font-semibold text-orange-300 underline decoration-dotted underline-offset-2 transition hover:text-orange-200">{g.texto} →</Link>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-10">
            <h2 className="text-lg font-semibold text-white">{c.faqTitulo}</h2>
            <dl className="mt-4 divide-y divide-slate-800 rounded-2xl border border-slate-800 bg-slate-900/60">
              {c.faqs.map((f) => (
                <div key={f.q} className="p-5">
                  <dt className="text-sm font-semibold text-white">{f.q}</dt>
                  <dd className="mt-1.5 text-sm leading-relaxed text-slate-400">{f.a}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="mt-10 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-center">
            <h2 className="text-lg font-semibold text-white">{c.ctaTitulo}</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-slate-400">{c.ctaTexto}</p>
            <Link href={`${pageUrl("login", lang)}?mode=signup&next=%2Fwallets`} className={`${btnPrimary} mt-4 inline-flex px-6 py-3 text-sm`}>{c.ctaBotao}</Link>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
