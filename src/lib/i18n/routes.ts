// Mapa das páginas públicas em cada idioma.
//
// Porquê: até aqui havia um único URL por página e a língua escolhia-se no
// browser. Funciona para quem já cá está, mas nos resultados de pesquisa o
// site só existia em português — o Google indexa o HTML que o servidor manda,
// e esse vinha sempre em pt. Quem procurasse "crypto portfolio tracker" nunca
// encontrava a versão inglesa, porque ela não tinha URL próprio.
//
// As rotas em português mantêm os endereços que sempre tiveram (há links por
// aí); os outros idiomas ganham prefixo e slug traduzido.

import type { Lang } from "./translations";

export type PublicPage = "home" | "pricing" | "howItWorks" | "beta";

/** Slug de cada página em cada idioma. "" = raiz do idioma. */
export const PAGE_SLUG: Record<PublicPage, Record<Lang, string>> = {
  home: { pt: "", en: "", es: "", fr: "" },
  pricing: { pt: "pricing", en: "pricing", es: "precios", fr: "tarifs" },
  howItWorks: { pt: "como-funciona", en: "how-it-works", es: "como-funciona", fr: "comment-ca-marche" },
  beta: { pt: "beta", en: "beta", es: "beta", fr: "beta" },
};

/** Prefixo do idioma. O português não tem — é o idioma de origem do site. */
const PREFIX: Record<Lang, string> = { pt: "", en: "/en", es: "/es", fr: "/fr" };

/** Caminho de uma página pública num idioma (ex.: pageUrl("pricing", "fr") = "/fr/tarifs"). */
export function pageUrl(page: PublicPage, lang: Lang): string {
  const slug = PAGE_SLUG[page][lang];
  const prefix = PREFIX[lang];
  if (!slug) return prefix || "/";
  return `${prefix}/${slug}`;
}

export const LANGS: readonly Lang[] = ["pt", "en", "es", "fr"];

/** Códigos hreflang. O `pt` é pt-PT (o site é escrito em português europeu). */
const HREFLANG: Record<Lang, string> = { pt: "pt-PT", en: "en", es: "es", fr: "fr" };

/**
 * Bloco `alternates` para o metadata de uma página pública: canónico do próprio
 * idioma + todas as traduções + x-default.
 *
 * Tem de ser recíproco — cada versão aponta para todas as outras, incluindo
 * ela própria. Sem isso as versões competem entre si em vez de se reforçarem;
 * foi a armadilha que já apanhámos nos guias fiscais.
 */
export function pageAlternates(page: PublicPage, lang: Lang) {
  const languages: Record<string, string> = {};
  for (const l of LANGS) languages[HREFLANG[l]] = pageUrl(page, l);
  languages["x-default"] = pageUrl(page, "en");
  return { canonical: pageUrl(page, lang), languages };
}

/** A página pública correspondente a um caminho, se for uma delas. */
export function pageFromPath(pathname: string): { page: PublicPage; lang: Lang } | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  for (const page of Object.keys(PAGE_SLUG) as PublicPage[]) {
    for (const lang of LANGS) {
      if (pageUrl(page, lang) === path) return { page, lang };
    }
  }
  return null;
}
