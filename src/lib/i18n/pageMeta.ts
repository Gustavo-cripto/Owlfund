// Título e descrição de cada página pública, nas 4 línguas.
//
// Vive aqui e não nas traduções do site porque isto é lido no SERVIDOR, ao
// gerar o `metadata` de cada rota — é o texto que aparece no separador do
// browser, nos resultados de pesquisa e quando alguém partilha o link.
// As traduções do ecrã são carregadas no cliente e não servem para isso.

import type { Metadata } from "next";
import type { Lang } from "./translations";
import { pageAlternates, type PublicPage } from "./routes";

type Meta = { title: string; description: string };

const META: Record<PublicPage, Record<Lang, Meta>> = {
  home: {
    pt: {
      title: "ChainFolioAI — O teu portefólio cripto e tradicional num só lugar",
      description:
        "Carteiras, exchanges e ativos manuais num só painel. PNL em tempo real, métricas avançadas (ROI, Sharpe, drawdown), fiscalidade e um assistente de IA que conhece o teu portefólio. 100% só-leitura e gratuito para começar.",
    },
    en: {
      title: "ChainFolioAI — Your crypto and traditional portfolio in one place",
      description:
        "Wallets, exchanges and manual assets on a single dashboard. Real-time PNL, advanced metrics (ROI, Sharpe, drawdown), tax tools for 21 countries and an AI assistant that knows your portfolio. Read-only and free to start.",
    },
    es: {
      title: "ChainFolioAI — Tu cartera cripto y tradicional en un solo lugar",
      description:
        "Monederos, exchanges y activos manuales en un único panel. PNL en tiempo real, métricas avanzadas (ROI, Sharpe, drawdown), fiscalidad de 21 países y un asistente de IA que conoce tu cartera. Solo lectura y gratis para empezar.",
    },
    fr: {
      title: "ChainFolioAI — Votre portefeuille crypto et traditionnel au même endroit",
      description:
        "Portefeuilles, plateformes et actifs manuels sur un seul tableau de bord. PNL en temps réel, métriques avancées (ROI, Sharpe, drawdown), fiscalité de 21 pays et un assistant IA qui connaît votre portefeuille. Lecture seule et gratuit pour commencer.",
    },
  },
  pricing: {
    pt: {
      title: "Preços e planos",
      description:
        "Compara os planos Gratuito, Pro e Premium do ChainFolioAI: carteiras ilimitadas, análise IA, fiscalidade e relatórios.",
    },
    en: {
      title: "Pricing and plans",
      description:
        "Compare the ChainFolioAI Free, Pro and Premium plans: unlimited wallets, AI analysis, tax tools and reports.",
    },
    es: {
      title: "Precios y planes",
      description:
        "Compara los planes Gratuito, Pro y Premium de ChainFolioAI: monederos ilimitados, análisis con IA, fiscalidad e informes.",
    },
    fr: {
      title: "Tarifs et forfaits",
      description:
        "Comparez les forfaits Gratuit, Pro et Premium de ChainFolioAI : portefeuilles illimités, analyse IA, fiscalité et rapports.",
    },
  },
  howItWorks: {
    pt: {
      title: "Como funciona",
      description:
        "Liga as tuas carteiras, acompanha o portefólio cripto e tradicional e recebe análises com IA — em minutos.",
    },
    en: {
      title: "How it works",
      description:
        "Connect your wallets, track your crypto and traditional portfolio and get AI analysis — in minutes.",
    },
    es: {
      title: "Cómo funciona",
      description:
        "Conecta tus monederos, sigue tu cartera cripto y tradicional y recibe análisis con IA — en minutos.",
    },
    fr: {
      title: "Comment ça marche",
      description:
        "Connectez vos portefeuilles, suivez votre portefeuille crypto et traditionnel et recevez des analyses IA — en quelques minutes.",
    },
  },
  beta: {
    pt: {
      title: "Beta — Premium grátis 60 dias",
      description:
        "Entra no beta do ChainFolioAI: testa a plataforma, dá feedback e recebe Premium grátis durante 60 dias.",
    },
    en: {
      title: "Beta — Premium free for 60 days",
      description:
        "Join the ChainFolioAI beta: try the platform, send feedback and get Premium free for 60 days.",
    },
    es: {
      title: "Beta — Premium gratis 60 días",
      description:
        "Entra en la beta de ChainFolioAI: prueba la plataforma, da tu opinión y recibe Premium gratis durante 60 días.",
    },
    fr: {
      title: "Bêta — Premium gratuit 60 jours",
      description:
        "Rejoignez la bêta de ChainFolioAI : testez la plateforme, donnez votre avis et recevez Premium gratuitement pendant 60 jours.",
    },
  },
};

const OG_LOCALE: Record<Lang, string> = {
  pt: "pt_PT",
  en: "en_GB",
  es: "es_ES",
  fr: "fr_FR",
};

/** Metadata completa de uma página pública num idioma, com hreflang recíproco. */
export function pageMetadata(page: PublicPage, lang: Lang): Metadata {
  const m = META[page][lang];
  return {
    // A raiz ja traz a marca no titulo; sem `absolute` o template do layout
    // juntava-lhe outro " · ChainFolioAI".
    title: page === "home" ? { absolute: m.title } : m.title,
    description: m.description,
    alternates: pageAlternates(page, lang),
    openGraph: {
      title: m.title,
      description: m.description,
      locale: OG_LOCALE[lang],
    },
  };
}
