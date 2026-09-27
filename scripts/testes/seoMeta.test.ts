// Metadata dos guias e comparacoes + sitemap: og:image, twitter, og:locale
// com sublinhado, descricao <= 155 e lastmod real por entrada.
// Regressao do lote D (set 2026): 60 paginas saiam sem og:image porque
// `openGraph` sem `images` substitui o bloco herdado do layout raiz.
import { countryMetadata, indexMetadata } from "@/lib/tax/guideMeta";
import { compareIndexMetadata, compareMetadata } from "@/lib/compare/compareMeta";
import { COUNTRIES, TAX_GUIDE_DATE_MODIFIED } from "@/lib/tax/countries";
import { COMPETITORS, COMPARE_DATE_MODIFIED } from "@/lib/compare/competitors";
import { LIMITE_DESCRICAO, MINIMO_DESCRICAO } from "@/lib/seo/descricao";
import sitemap from "@/app/sitemap";

let fails = 0;
const ok = (name: string, cond: boolean, extra = "") => { if (!cond) fails++; console.log(`${cond ? "✅" : "❌"} ${name}${extra ? `: ${extra}` : ""}`); };

type M = { description?: string; openGraph?: Record<string, unknown>; twitter?: Record<string, unknown> };
const social = (name: string, m: M, locale: string) => {
  const og = m.openGraph ?? {};
  const tw = m.twitter ?? {};
  const imgs = og.images as Array<{ url: string }> | undefined;
  ok(`${name} og:image`, Array.isArray(imgs) && imgs.length > 0 && /opengraph-image$/.test(imgs[0].url));
  ok(`${name} og:locale ${locale}`, og.locale === locale, String(og.locale));
  ok(`${name} og:title = title da pagina`, typeof og.title === "string" && og.title.length > 0 && og.title === tw.title);
  ok(`${name} twitter summary_large_image + imagem`, tw.card === "summary_large_image" && Array.isArray(tw.images));
  ok(`${name} og:description = description`, og.description === m.description);
};

// ── guias (21 paises x 2 linguas) ──
social("guia indice pt", indexMetadata("pt") as M, "pt_PT");
social("guia indice en", indexMetadata("en") as M, "en_GB");
let maisLonga = 0, maisCurta = 999, sem = 0;
for (const c of COUNTRIES) for (const lang of ["pt", "en"] as const) {
  const m = countryMetadata(lang, c.slug[lang]) as M;
  const d = m.description ?? "";
  if (!d) sem++;
  maisLonga = Math.max(maisLonga, d.length); maisCurta = Math.min(maisCurta, d.length);
  const og = m.openGraph ?? {};
  if (!(og.images as unknown[])?.length || og.locale !== (lang === "pt" ? "pt_PT" : "en_GB") || (m.twitter ?? {}).card !== "summary_large_image") { fails++; console.log(`❌ ${lang}/${c.slug[lang]} sem og:image/locale/twitter`); }
}
ok(`42 guias com descricao (nenhum vazio)`, sem === 0);
ok(`descricao mais longa <= ${LIMITE_DESCRICAO}`, maisLonga <= LIMITE_DESCRICAO, `${maisLonga}`);
// Com a frase seguinte cortada em palavra quando as inteiras nao chegam a 120,
// o guia mais curto fica a 119 (pt/luxemburgo: o pedaco que sobra e < 30 chars).
ok(`descricao mais curta >= ${MINIMO_DESCRICAO - 5}`, maisCurta >= MINIMO_DESCRICAO - 5, `${maisCurta}`);
const pt = countryMetadata("pt", "portugal") as M;
ok(`Portugal comeca por "Portugal: 28%."`, (pt.description ?? "").startsWith("Portugal: 28%. "), pt.description);
ok(`Portugal acaba em fim de frase`, /[.!?…]$/.test(pt.description ?? ""));

// ── comparacoes (3 x 4 linguas) ──
const LOC = { pt: "pt_PT", en: "en_GB", es: "es_ES", fr: "fr_FR" } as const;
for (const lang of ["pt", "en", "es", "fr"] as const) {
  social(`comparacoes indice ${lang}`, compareIndexMetadata(lang) as M, LOC[lang]);
  for (const c of COMPETITORS) social(`${lang}/${c.slug}`, compareMetadata(lang, c.slug) as M, LOC[lang]);
}

// ── sitemap ──
const entradas = sitemap();
const porUrl = new Map(entradas.map((e) => [e.url.replace(/^https?:\/\/[^/]+/, ""), e]));
ok("sitemap: guia com lastmod real", porUrl.get("/guias/impostos-cripto/portugal")?.lastModified === TAX_GUIDE_DATE_MODIFIED);
ok("sitemap: indice dos guias com a mesma data", porUrl.get("/guides/crypto-tax")?.lastModified === TAX_GUIDE_DATE_MODIFIED);
ok("sitemap: comparacao com a data revista", porUrl.get("/en/comparisons/koinly")?.lastModified === COMPARE_DATE_MODIFIED);
ok("sitemap: termos/privacidade/developers com data", ["/termos", "/privacidade", "/developers"].every((p) => typeof porUrl.get(p)?.lastModified === "string"));
ok("sitemap: paginas de produto SEM lastmod", ["/", "/pricing", "/en/pricing", "/fr/beta"].every((p) => porUrl.has(p) && porUrl.get(p)?.lastModified === undefined));
ok("sitemap: nenhuma data e 'agora'", entradas.every((e) => !(e.lastModified instanceof Date)));
ok("sitemap: datas em ISO AAAA-MM-DD", entradas.every((e) => e.lastModified === undefined || /^\d{4}-\d{2}-\d{2}$/.test(String(e.lastModified))));

if (fails) { console.log(`\n${fails} falha(s)`); process.exit(1); }
console.log("TODOS OK");
