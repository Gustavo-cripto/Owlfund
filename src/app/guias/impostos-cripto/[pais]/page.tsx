import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { COUNTRIES, countryBySlug, countryText, TAX_DATA_VERIFIED } from "@/lib/tax/countries";

// Uma página por país (21 no total), geradas estaticamente no build. É conteúdo
// público: quem pesquisa "impostos cripto Portugal" tem de poder chegar aqui
// sem criar conta. A calculadora, que precisa do histórico de trades, fica em
// /fiscalidade atrás de sessão.

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://chainfolioai.com";
const BASE = "/guias/impostos-cripto";

export function generateStaticParams() {
  return COUNTRIES.map((c) => ({ pais: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ pais: string }> }): Promise<Metadata> {
  const { pais } = await params;
  const country = countryBySlug(pais);
  if (!country) return {};
  const text = countryText(country.code, "pt");
  const title = `Impostos sobre cripto em ${text.name} (2026): ${text.taxShort} e ${text.taxLong.toLowerCase()}`;
  const description = text.summary.slice(0, 300);
  return {
    title,
    description,
    alternates: { canonical: `${SITE}${BASE}/${country.slug}` },
    openGraph: { title, description, url: `${SITE}${BASE}/${country.slug}`, type: "article" },
  };
}

export default async function PaisGuia({ params }: { params: Promise<{ pais: string }> }) {
  const { pais } = await params;
  const country = countryBySlug(pais);
  if (!country) notFound();
  const text = countryText(country.code, "pt");
  const others = COUNTRIES.filter((c) => c.code !== country.code);

  const facts: Array<{ label: string; value: string }> = [
    { label: "Curto prazo", value: text.taxShort },
    { label: "Longo prazo", value: text.taxLong },
    { label: "Limiar de detenção", value: text.threshold },
    { label: "Isenção anual", value: country.regime.allowance?.label ?? "Não aplicável" },
    { label: "Legislação", value: country.law },
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: `Impostos sobre cripto em ${text.name} (2026)`,
        description: text.summary,
        inLanguage: "pt-PT",
        datePublished: "2026-09-11",
        author: { "@type": "Organization", name: "ChainFolioAI", url: SITE },
        publisher: { "@type": "Organization", name: "ChainFolioAI", url: SITE },
        mainEntityOfPage: `${SITE}${BASE}/${country.slug}`,
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Início", item: SITE },
          { "@type": "ListItem", position: 2, name: "Impostos sobre cripto", item: `${SITE}${BASE}` },
          { "@type": "ListItem", position: 3, name: text.name, item: `${SITE}${BASE}/${country.slug}` },
        ],
      },
      {
        // Perguntas que as pessoas fazem mesmo — e que os modelos de IA citam.
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: `Quanto se paga de imposto sobre cripto em ${text.name}?`,
            acceptedAnswer: { "@type": "Answer", text: `${text.taxShort} sobre ganhos de curto prazo. Longo prazo: ${text.taxLong}. ${text.summary}` },
          },
          {
            "@type": "Question",
            name: `Há isenção anual sobre mais-valias de cripto em ${text.name}?`,
            acceptedAnswer: {
              "@type": "Answer",
              text: country.regime.allowance
                ? `Sim: ${country.regime.allowance.label}.`
                : `Não existe uma isenção anual específica para mais-valias de criptomoedas em ${text.name}.`,
            },
          },
          {
            "@type": "Question",
            name: "Que método de cálculo se usa para emparelhar compras e vendas?",
            acceptedAnswer: { "@type": "Answer", text: "FIFO (first in, first out) é o método por defeito na generalidade das jurisdições: a primeira unidade comprada é a primeira a ser considerada vendida. O ChainFolioAI aplica FIFO ao teu histórico e exporta o resultado." },
          },
        ],
      },
    ],
  };

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <nav className="text-xs text-slate-500">
        <Link href="/" className="transition hover:text-slate-300">Início</Link> ·{" "}
        <Link href={BASE} className="transition hover:text-slate-300">Impostos sobre cripto</Link> ·{" "}
        {text.name}
      </nav>

      <h1 className="mt-4 flex items-center gap-3 text-3xl font-bold text-white sm:text-4xl">
        <span aria-hidden>{country.flag}</span>
        Impostos sobre cripto em {text.name}
      </h1>
      <p className="mt-2 text-sm text-slate-500">Regras verificadas em {TAX_DATA_VERIFIED}.</p>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {facts.map((f) => (
          <div key={f.label} className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3">
            <p className="text-xs uppercase tracking-wider text-slate-500">{f.label}</p>
            <p className="mt-1 font-semibold text-white">{f.value}</p>
          </div>
        ))}
      </div>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-white">Em resumo</h2>
        <p className="mt-3 leading-relaxed text-slate-300">{text.summary}</p>
      </section>

      {text.keyPoints.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xl font-semibold text-white">Pontos a reter</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-slate-300 marker:text-orange-400/70">
            {text.keyPoints.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </section>
      )}

      <section className="mt-10 rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
        <h2 className="text-lg font-semibold text-white">Calcular sobre o teu histórico</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          A taxa é só metade do problema. Para declarar, precisas de emparelhar cada venda com a
          compra certa por FIFO, converter para euros à data de cada operação e separar o curto do
          longo prazo. O ChainFolioAI faz isso a partir das tuas transações — ligas as carteiras em
          modo só-leitura ou importas um CSV da exchange — e exporta em PDF ou Excel.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/beta" className="rounded-full bg-orange-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-orange-400">
            Entrar no beta — Premium grátis 60 dias
          </Link>
          <Link href={BASE} className="rounded-full border border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white">
            Comparar os 21 países
          </Link>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-sm uppercase tracking-wider text-slate-500">Outros países</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {others.map((c) => (
            <Link
              key={c.code}
              href={`${BASE}/${c.slug}`}
              className="rounded-full border border-slate-800 px-3 py-1.5 text-sm text-slate-300 transition hover:border-orange-400/50 hover:text-white"
            >
              <span aria-hidden className="mr-1">{c.flag}</span>
              {countryText(c.code, "pt").name}
            </Link>
          ))}
        </div>
      </section>

      <p className="mt-10 text-xs leading-relaxed text-slate-600">
        ⚠️ Informação geral, não aconselhamento fiscal. As regras mudam e a tua situação pode ter
        particularidades (residência, atividade profissional, staking, mineração). Confirma com um
        contabilista ou com a autoridade fiscal antes de declarar.
      </p>
    </main>
  );
}
