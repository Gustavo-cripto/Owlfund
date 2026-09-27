import type { Metadata } from "next";

import { countryBySlug, guideUrl, type GuideLang } from "./countries";
import { countryText } from "./countryText";
import { GUIDE_COPY } from "./guideCopy";
import { descricaoMeta } from "@/lib/seo/descricao";
import { socialMeta } from "@/lib/seo/site";

// Metadata dos guias, incluindo hreflang: diz ao Google que /guias/…/portugal e
// /guides/…/portugal sao a MESMA pagina em linguas diferentes. Sem isto as duas
// competem uma com a outra nos resultados.

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://chainfolioai.com";

// O layout raiz junta " · ChainFolioAI" a todos os titulos, o que rouba 15
// caracteres. Nos guias isso nao compensa: o Google corta por volta dos 60 e o
// que fica de fora e a taxa, que e justamente o que faz a pessoa carregar.
// Estas paginas passam a ter titulo absoluto (sem sufixo), e se ainda assim
// ficar comprido cai-se para a versao sem taxas.
const LIMITE_TITULO = 60;
const tituloAbsoluto = (completo: string, curto: string) => ({
  absolute: completo.length <= LIMITE_TITULO ? completo : curto,
});

const languagesFor = (ptPath: string, enPath: string) => ({
  "pt-PT": `${SITE}${ptPath}`,
  "en": `${SITE}${enPath}`,
  "x-default": `${SITE}${enPath}`,
});

export function indexMetadata(lang: GuideLang): Metadata {
  const c = GUIDE_COPY[lang];
  const canonical = `${SITE}${guideUrl(lang)}`;
  return {
    title: { absolute: c.indexMetaTitle },
    description: c.indexMetaDescription,
    alternates: { canonical, languages: languagesFor(guideUrl("pt"), guideUrl("en")) },
    // Com images e twitter: sem eles o cartao saia sem imagem e com o titulo
    // da homepage no X (ver socialMeta).
    ...socialMeta({ title: c.indexMetaTitle, description: c.indexMetaDescription, url: canonical, type: "article", locale: c.locale }),
  };
}

export function countryMetadata(lang: GuideLang, slug: string): Metadata {
  const country = countryBySlug(slug, lang);
  if (!country) return {};
  const c = GUIDE_COPY[lang];
  const text = countryText(country.code, lang);
  const title = c.countryMetaTitle(text.name, text.taxShort, text.taxLong);
  const titleCurto = c.countryMetaTitleShort(text.name);
  // "Pais: taxa" + as primeiras frases do resumo que caibam em ~155 caracteres,
  // cortado em fim de frase. Antes ia o resumo inteiro (ate 300): o Google
  // cortava a meio e a taxa — o gancho — ficava de fora do snippet.
  const description = descricaoMeta(`${text.name}: ${text.taxShort}`, text.summary);
  const canonical = `${SITE}${guideUrl(lang, country)}`;
  return {
    title: tituloAbsoluto(title, titleCurto),
    description,
    alternates: {
      canonical,
      languages: languagesFor(guideUrl("pt", country), guideUrl("en", country)),
    },
    ...socialMeta({ title: title.length <= LIMITE_TITULO ? title : titleCurto, description, url: canonical, type: "article", locale: c.locale }),
  };
}
