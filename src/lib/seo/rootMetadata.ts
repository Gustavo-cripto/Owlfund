// Metadata e dados estruturados do layout raiz, num sitio so.
//
// Ha um layout raiz por idioma (src/app/(pt), (en), (es), (fr)) — e a unica
// forma, no App Router, de o `<html lang>` sair certo no HTML que o servidor
// manda, sem tornar todas as paginas dinamicas. Os quatro layouts partilham
// isto para nao divergirem.
import type { Metadata } from "next";
import type { Lang } from "@/lib/i18n/translations";
import { pageText } from "@/lib/i18n/pageMeta";
import { SOCIAL_URLS } from "@/lib/social";

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://chainfolioai.com";

/** Codigo de lingua do <html lang> e o locale do Open Graph, por idioma. */
export const HTML_LANG: Record<Lang, string> = { pt: "pt-PT", en: "en-GB", es: "es-ES", fr: "fr-FR" };
const OG_LOCALE: Record<Lang, string> = { pt: "pt_PT", en: "en_GB", es: "es_ES", fr: "fr_FR" };

// Dados estruturados (schema.org) — ajudam Google E modelos de IA a perceberem
// o produto, a categoria e os precos. Ver estrategia GEO.
export const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      name: "ChainFolioAI",
      url: SITE_URL,
      logo: `${SITE_URL}/chainfolioai-icon.png`,
      // Diz ao Google e aos modelos de IA que estes perfis sao mesmo da marca.
      sameAs: SOCIAL_URLS,
    },
    {
      "@type": "SoftwareApplication",
      name: "ChainFolioAI",
      applicationCategory: "FinanceApplication",
      operatingSystem: "Web",
      url: SITE_URL,
      description:
        "Read-only crypto + traditional portfolio tracker with real-time PNL, advanced metrics, multi-country tax tools, an AI assistant, and API/MCP access for AI agents. Non-custodial.",
      offers: [
        { "@type": "Offer", name: "Free", price: "0", priceCurrency: "EUR" },
        { "@type": "Offer", name: "Pro", price: "14.99", priceCurrency: "EUR" },
        { "@type": "Offer", name: "Premium", price: "39.00", priceCurrency: "EUR" },
      ],
    },
  ],
};

export function rootMetadata(lang: Lang): Metadata {
  const home = pageText("home", lang);
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: home.title, template: "%s · ChainFolioAI" },
    description: home.description,
    applicationName: "ChainFolioAI",
    keywords: [
      "crypto portfolio tracker", "portefólio cripto", "PNL cripto", "Bitcoin", "Ethereum",
      "Solana", "Cardano", "DeFi", "crypto tax", "fiscalidade cripto", "AI assistant", "read-only",
    ],
    authors: [{ name: "ChainFolioAI" }],
    icons: { icon: "/chainfolioai-icon.png", apple: "/apple-touch-icon.png" },
    openGraph: {
      type: "website",
      url: SITE_URL,
      siteName: "ChainFolioAI",
      title: home.title,
      description: home.description,
      locale: OG_LOCALE[lang],
    },
    twitter: { card: "summary_large_image", title: home.title, description: home.description },
    robots: { index: true, follow: true },
  };
}
