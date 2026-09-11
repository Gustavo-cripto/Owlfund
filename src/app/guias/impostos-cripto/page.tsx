import type { Metadata } from "next";
import Link from "next/link";

import { COUNTRIES, countryText, TAX_DATA_VERIFIED } from "@/lib/tax/countries";

// Guia público (sem sessão) sobre impostos de cripto em 21 países. Renderizado
// no servidor de propósito: é a porta de entrada para quem pesquisa "impostos
// cripto <país>" no Google ou pergunta a um modelo de IA. A calculadora fica
// em /fiscalidade, atrás de conta.
//
// Em português, que é o mercado principal. A app continua em 4 idiomas.

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://chainfolioai.com";
const URL_PATH = "/guias/impostos-cripto";

export const metadata: Metadata = {
  title: "Impostos sobre cripto em 21 países (2026) — taxas, prazos e leis",
  description:
    "Quanto se paga de imposto sobre mais-valias de criptomoedas em Portugal, Espanha, Alemanha, Brasil e mais 17 países: taxas, prazos de detenção, isenções anuais e a lei aplicável. Atualizado a 2026.",
  alternates: { canonical: `${SITE}${URL_PATH}` },
  openGraph: {
    title: "Impostos sobre cripto em 21 países (2026)",
    description: "Taxas, prazos de detenção, isenções anuais e a lei aplicável, país a país.",
    url: `${SITE}${URL_PATH}`,
    type: "article",
  },
};

const pct = (n: number) => `${(n * 100).toLocaleString("pt-PT", { maximumFractionDigits: 2 })}%`;

export default function GuiaImpostosCripto() {
  const rows = COUNTRIES.map((c) => ({ country: c, text: countryText(c.code, "pt") }));

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: "Impostos sobre cripto em 21 países (2026)",
        description: metadata.description,
        inLanguage: "pt-PT",
        datePublished: "2026-09-11",
        author: { "@type": "Organization", name: "ChainFolioAI", url: SITE },
        publisher: { "@type": "Organization", name: "ChainFolioAI", url: SITE },
        mainEntityOfPage: `${SITE}${URL_PATH}`,
      },
      {
        "@type": "ItemList",
        name: "Regimes fiscais de criptomoedas por país",
        itemListElement: rows.map(({ country, text }, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: `Impostos sobre cripto em ${text.name}`,
          url: `${SITE}${URL_PATH}/${country.slug}`,
        })),
      },
    ],
  };

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <nav className="text-xs text-slate-500">
        <Link href="/" className="transition hover:text-slate-300">Início</Link> · Guias
      </nav>

      <h1 className="mt-4 text-3xl font-bold text-white sm:text-4xl">
        Impostos sobre cripto em 21 países
      </h1>
      <p className="mt-3 max-w-3xl text-slate-400">
        Quanto se paga sobre mais-valias de criptomoedas, país a país: a taxa de curto prazo, o que
        acontece se mantiveres o ativo mais tempo, as isenções anuais e a lei que se aplica. Cada
        país tem uma página própria com o detalhe. Regras verificadas em {TAX_DATA_VERIFIED}.
      </p>

      <div className="mt-8 overflow-x-auto rounded-2xl border border-slate-800">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-slate-900/60 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">País</th>
              <th className="px-4 py-3 font-medium">Curto prazo</th>
              <th className="px-4 py-3 font-medium">Longo prazo</th>
              <th className="px-4 py-3 font-medium">Limiar</th>
              <th className="px-4 py-3 font-medium">Isenção anual</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {rows.map(({ country, text }) => (
              <tr key={country.code} className="transition hover:bg-slate-900/40">
                <td className="px-4 py-3">
                  <Link href={`${URL_PATH}/${country.slug}`} className="font-medium text-white transition hover:text-orange-300">
                    <span aria-hidden className="mr-2">{country.flag}</span>
                    {text.name}
                  </Link>
                </td>
                <td className="px-4 py-3 tabular-nums text-slate-200">{text.taxShort}</td>
                <td className="px-4 py-3 text-slate-300">{text.taxLong}</td>
                <td className="px-4 py-3 text-slate-400">{text.threshold}</td>
                <td className="px-4 py-3 text-slate-400">
                  {country.regime.allowance ? country.regime.allowance.label : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="mt-10 rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
        <h2 className="text-lg font-semibold text-white">Como calcular o que deves</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          Saber a taxa é a parte fácil. O trabalho está em emparelhar cada venda com a compra
          correspondente pelo método FIFO, converter tudo para a tua moeda à data de cada operação e
          separar o que caiu no curto prazo do que já passou o limiar. O ChainFolioAI faz esse
          cálculo a partir do teu histórico e exporta o resultado em PDF ou Excel para levares ao
          contabilista.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/beta" className="rounded-full bg-orange-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-orange-400">
            Entrar no beta — Premium grátis 60 dias
          </Link>
          <Link href="/como-funciona" className="rounded-full border border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white">
            Ver como funciona
          </Link>
        </div>
      </section>

      <p className="mt-8 text-xs leading-relaxed text-slate-600">
        ⚠️ Este guia é informativo e não constitui aconselhamento fiscal. As regras mudam e a tua
        situação concreta pode ter particularidades — confirma sempre com um contabilista ou com a
        autoridade fiscal do teu país antes de declarar.
      </p>
    </main>
  );
}
