// Título e descrição de cada página pública, nas 4 línguas.
//
// Vive aqui e não nas traduções do site porque isto é lido no SERVIDOR, ao
// gerar o `metadata` de cada rota — é o texto que aparece no separador do
// browser, nos resultados de pesquisa e quando alguém partilha o link.
// As traduções do ecrã são carregadas no cliente e não servem para isso.

import type { Metadata } from "next";
import type { Lang } from "./translations";
import { pageAlternates, type PublicPage } from "./routes";
import { OG_IMAGES } from "@/lib/seo/site";

type Meta = { title: string; description: string };

const META: Record<PublicPage, Record<Lang, Meta>> = {
  home: {
    pt: {
      title: "ChainFolioAI — Portefólio cripto e tradicional num só lugar",
      description:
        "Carteiras, exchanges e ativos tradicionais num só painel. PNL em tempo real, fiscalidade em 21 países e assistente de IA. Só-leitura e grátis para começar.",
    },
    en: {
      title: "ChainFolioAI — Crypto and traditional portfolio in one place",
      description:
        "Wallets, exchanges and traditional assets on one dashboard. Real-time PNL, tax tools for 21 countries and an AI assistant. Read-only and free to start.",
    },
    es: {
      title: "ChainFolioAI — Cartera cripto y tradicional en un solo lugar",
      description:
        "Monederos, exchanges y activos tradicionales en un solo panel. PNL en tiempo real, fiscalidad de 21 países y asistente de IA. Solo lectura y gratis.",
    },
    fr: {
      title: "ChainFolioAI — Portefeuille crypto et traditionnel réunis",
      description:
        "Wallets, plateformes et actifs traditionnels sur un seul tableau de bord. PNL en temps réel, fiscalité de 21 pays et assistant IA. Lecture seule et gratuit.",
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
  login: {
    pt: {
      title: "Entrar",
      description: "Entra na tua conta ChainFolioAI para acederes ao teu portefólio.",
    },
    en: {
      title: "Log in",
      description: "Log in to your ChainFolioAI account to access your portfolio.",
    },
    es: {
      title: "Entrar",
      description: "Entra en tu cuenta ChainFolioAI para acceder a tu cartera.",
    },
    fr: {
      title: "Connexion",
      description: "Connectez-vous à votre compte ChainFolioAI pour accéder à votre portefeuille.",
    },
  },
  feedback: {
    pt: { title: "Ajude-nos a melhorar", description: "Uma pergunta breve sobre a sua experiência com o ChainFolioAI." },
    en: { title: "Help us improve", description: "A brief question about your experience with ChainFolioAI." },
    es: { title: "Ayúdenos a mejorar", description: "Una breve pregunta sobre su experiencia con ChainFolioAI." },
    fr: { title: "Aidez-nous à nous améliorer", description: "Une brève question sur votre expérience avec ChainFolioAI." },
  },
  status: {
    pt: { title: "Estado do serviço", description: "Estado, em tempo real, das fontes de dados de que o ChainFolioAI depende: cotações, blockchain, câmbios, ações e alertas." },
    en: { title: "Service status", description: "Live status of the data sources ChainFolioAI depends on: prices, blockchain, FX rates, stocks and alerts." },
    es: { title: "Estado del servicio", description: "Estado en tiempo real de las fuentes de datos de las que depende ChainFolioAI: cotizaciones, blockchain, cambios, acciones y alertas." },
    fr: { title: "État du service", description: "État en temps réel des sources de données dont dépend ChainFolioAI : cours, blockchain, taux de change, actions et alertes." },
  },
};

const OG_LOCALE: Record<Lang, string> = {
  pt: "pt_PT",
  en: "en_GB",
  es: "es_ES",
  fr: "fr_FR",
};

/** Título e descrição crus de uma página — para o layout raiz compor o `title.default`. */
export function pageText(page: PublicPage, lang: Lang): Meta {
  return META[page][lang];
}

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
      images: OG_IMAGES,
    },
    // Sem isto o cartao do X herdava o titulo da home em todas as paginas.
    twitter: { card: "summary_large_image", title: m.title, description: m.description, images: OG_IMAGES },
  };
}
