// Textos e tamanho do cartao social (og:image), nas 4 linguas (lote G).
//
// Antes havia um so cartao, em portugues, para todas as paginas: quem partilhava
// /en/pricing no X ou no LinkedIn mostrava "O teu portefolio…" a um publico
// ingles. O desenho vive em src/lib/seo/ogCard.tsx; aqui ficam so os dados, sem
// JSX nem dependencias, para o site.ts e os testes os poderem importar.
import type { Lang } from "@/lib/i18n/translations";

/** Tamanho que o X, o LinkedIn, o WhatsApp e o Telegram esperam (1,91:1). */
export const OG_SIZE = { width: 1200, height: 630 } as const;

export type OgText = {
  /** Texto alternativo da imagem (og:image:alt). */
  alt: string;
  /** Titulo em tres pedacos: o do meio sai a laranja. */
  title: readonly [string, string, string];
  sub: string;
  chips: readonly [string, string, string];
};

export const OG_TEXT: Record<Lang, OgText> = {
  pt: {
    alt: "ChainFolioAI — O teu portefólio cripto e tradicional num só lugar",
    title: ["O teu portefólio ", "cripto e tradicional ", "num só lugar"],
    sub: "PNL em tempo real, métricas avançadas, fiscalidade e um assistente de IA. 100% só-leitura.",
    chips: ["ROI · Sharpe · Drawdown", "BTC · ETH · SOL · ADA", "Grátis para começar"],
  },
  en: {
    alt: "ChainFolioAI — Your crypto and traditional portfolio in one place",
    title: ["Your ", "crypto and traditional ", "portfolio in one place"],
    sub: "Real-time PNL, advanced metrics, tax tools and an AI assistant. 100% read-only.",
    chips: ["ROI · Sharpe · Drawdown", "BTC · ETH · SOL · ADA", "Free to start"],
  },
  es: {
    alt: "ChainFolioAI — Tu cartera cripto y tradicional en un solo lugar",
    title: ["Tu cartera ", "cripto y tradicional ", "en un solo lugar"],
    sub: "PNL en tiempo real, métricas avanzadas, fiscalidad y un asistente de IA. 100 % solo lectura.",
    chips: ["ROI · Sharpe · Drawdown", "BTC · ETH · SOL · ADA", "Gratis para empezar"],
  },
  fr: {
    alt: "ChainFolioAI — Votre portefeuille crypto et traditionnel au même endroit",
    title: ["Votre portefeuille ", "crypto et traditionnel ", "au même endroit"],
    sub: "PNL en temps réel, métriques avancées, fiscalité et un assistant IA. 100 % en lecture seule.",
    chips: ["ROI · Sharpe · Drawdown", "BTC · ETH · SOL · ADA", "Gratuit pour débuter"],
  },
};

/**
 * Caminho da imagem de cada lingua. O pt fica no /opengraph-image de sempre
 * (ha links partilhados com ele); as outras em /og/xx/image.png — o `.png` no
 * fim tira-as do middleware (sem getUser nem contagem de visita por imagem).
 */
export function ogImagePath(lang: Lang): string {
  return lang === "pt" ? "/opengraph-image" : `/og/${lang}/image.png`;
}

/** Linguas com rota /og/xx/image.png (o pt usa src/app/opengraph-image.tsx). */
export const OG_LANGS_ROTA: readonly Exclude<Lang, "pt">[] = ["en", "es", "fr"];
