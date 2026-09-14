// Constantes do site sem dependencias — importaveis de qualquer lado sem
// criar ciclos (rootMetadata → pageMeta → rootMetadata rebentava aqui).
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://chainfolioai.com";

// Cartao social (1200x630), gerado por src/app/opengraph-image.tsx. Tem de ser
// declarado a mao: com um layout raiz por idioma (route groups), o Next deixou
// de ligar sozinho o ficheiro opengraph-image.tsx da raiz as paginas — e sem
// og:image o Telegram, o X, o LinkedIn e o WhatsApp partilham o link sem imagem.
export const OG_IMAGES = [{ url: `${SITE_URL}/opengraph-image`, width: 1200, height: 630, alt: "ChainFolioAI" }];
