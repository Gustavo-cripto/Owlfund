import type { Metadata } from "next";

import { COMPARE_COPY } from "./compareCopy";
import { competitorBySlug, compareUrl, type Competitor } from "./competitors";
import { LANGS } from "@/lib/i18n/routes";
import type { Lang } from "@/lib/i18n/translations";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://chainfolioai.com";

const HREFLANG: Record<Lang, string> = { pt: "pt-PT", en: "en", es: "es", fr: "fr" };

/** Alternates recíprocos: cada versão aponta para todas, incluindo ela própria. */
function alternatesFor(c?: Competitor) {
  const languages: Record<string, string> = {};
  for (const l of LANGS) languages[HREFLANG[l]] = `${SITE}${compareUrl(l, c)}`;
  languages["x-default"] = `${SITE}${compareUrl("en", c)}`;
  return languages;
}

// Título absoluto (sem o sufixo da marca) pela mesma razão dos guias: o Google
// corta por volta dos 60 e o sufixo rouba 15 caracteres ao que interessa.
export function compareIndexMetadata(lang: Lang): Metadata {
  const c = COMPARE_COPY[lang];
  const canonical = `${SITE}${compareUrl(lang)}`;
  return {
    title: { absolute: c.indexMetaTitle },
    description: c.indexMetaDescription,
    alternates: { canonical, languages: alternatesFor() },
    openGraph: { title: c.indexMetaTitle, description: c.indexMetaDescription, url: canonical, type: "website", locale: c.locale },
  };
}

export function compareMetadata(lang: Lang, slug: string): Metadata {
  const competitor = competitorBySlug(slug);
  if (!competitor) return {};
  const c = COMPARE_COPY[lang];
  const title = c.metaTitle(competitor.name);
  const description = c.metaDescription(competitor.name);
  const canonical = `${SITE}${compareUrl(lang, competitor)}`;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical, languages: alternatesFor(competitor) },
    openGraph: { title, description, url: canonical, type: "article", locale: c.locale },
  };
}
