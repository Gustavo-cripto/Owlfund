import type { Metadata } from "next";

import { countryBySlug, countryText, guideUrl, type GuideLang } from "./countries";
import { GUIDE_COPY } from "./guideCopy";

// Metadata dos guias, incluindo hreflang: diz ao Google que /guias/…/portugal e
// /guides/…/portugal sao a MESMA pagina em linguas diferentes. Sem isto as duas
// competem uma com a outra nos resultados.

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://chainfolioai.com";

const languagesFor = (ptPath: string, enPath: string) => ({
  "pt-PT": `${SITE}${ptPath}`,
  "en": `${SITE}${enPath}`,
  "x-default": `${SITE}${enPath}`,
});

export function indexMetadata(lang: GuideLang): Metadata {
  const c = GUIDE_COPY[lang];
  const canonical = `${SITE}${guideUrl(lang)}`;
  return {
    title: c.indexMetaTitle,
    description: c.indexMetaDescription,
    alternates: { canonical, languages: languagesFor(guideUrl("pt"), guideUrl("en")) },
    openGraph: { title: c.indexMetaTitle, description: c.indexMetaDescription, url: canonical, type: "article", locale: c.locale },
  };
}

export function countryMetadata(lang: GuideLang, slug: string): Metadata {
  const country = countryBySlug(slug, lang);
  if (!country) return {};
  const c = GUIDE_COPY[lang];
  const text = countryText(country.code, lang);
  const title = c.countryMetaTitle(text.name, text.taxShort, text.taxLong);
  const description = text.summary.slice(0, 300);
  const canonical = `${SITE}${guideUrl(lang, country)}`;
  return {
    title,
    description,
    alternates: {
      canonical,
      languages: languagesFor(guideUrl("pt", country), guideUrl("en", country)),
    },
    openGraph: { title, description, url: canonical, type: "article", locale: c.locale },
  };
}
