// Constantes do site sem dependencias — importaveis de qualquer lado sem
// criar ciclos (rootMetadata → pageMeta → rootMetadata rebentava aqui).
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://chainfolioai.com";

// Cartao social (1200x630), gerado por src/app/opengraph-image.tsx. Tem de ser
// declarado a mao: com um layout raiz por idioma (route groups), o Next deixou
// de ligar sozinho o ficheiro opengraph-image.tsx da raiz as paginas — e sem
// og:image o Telegram, o X, o LinkedIn e o WhatsApp partilham o link sem imagem.
export const OG_IMAGES = [{ url: `${SITE_URL}/opengraph-image`, width: 1200, height: 630, alt: "ChainFolioAI" }];

// Ultima revisao REAL das paginas fixas (git log de cada uma), em ISO. Alimenta
// o lastmod do sitemap e a data "atualizado a" dos termos/privacidade, num
// sitio so. Nunca "hoje" automatico: um lastmod que muda a cada deploy sem o
// conteudo mudar e ignorado pelo Google.
export const LEGAL_LAST_UPDATED = "2026-09-24";
export const DEVELOPERS_LAST_UPDATED = "2026-09-24";

// Cartao social de UMA pagina. Existe porque `openGraph` numa pagina substitui
// o bloco herdado do layout raiz POR INTEIRO: quem define title/url sem
// `images` perde o og:image (foi o que aconteceu em 60 guias/comparacoes), e
// `twitter` nao acompanha o titulo novo — sem ele o X mostrava o titulo da
// homepage. O locale do Open Graph leva sublinhado (pt_PT), ao contrario do
// hreflang/inLanguage (pt-PT).
export function socialMeta(o: { title: string; description: string; url: string; type: "website" | "article"; locale: string }) {
  const locale = o.locale.replace("-", "_");
  return {
    openGraph: { title: o.title, description: o.description, url: o.url, type: o.type, locale, images: OG_IMAGES },
    twitter: { card: "summary_large_image" as const, title: o.title, description: o.description, images: OG_IMAGES },
  };
}
