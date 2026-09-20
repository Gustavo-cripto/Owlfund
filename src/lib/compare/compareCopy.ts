import type { Lang } from "@/lib/i18n/translations";

// Rótulos das páginas de comparação. Separados dos factos (competitors.ts)
// para se poder mudar o tom sem tocar no conteúdo, e vice-versa.

export type CompareCopy = {
  locale: string;
  breadcrumbHome: string;
  breadcrumbCompare: string;
  indexTitle: string;
  indexMetaTitle: string;
  indexMetaDescription: string;
  indexIntro: string;
  /** Título da página de um concorrente. */
  metaTitle: (name: string) => string;
  metaDescription: (name: string) => string;
  heading: (name: string) => string;
  lead: (name: string) => string;
  whatIs: (name: string) => string;
  whatWeAre: string;
  whatWeAreText: string;
  sameTitle: string;
  theirsTitle: (name: string) => string;
  theirsNote: string;
  oursTitle: string;
  pickTitle: string;
  pickThem: (name: string) => string;
  pickUs: string;
  priceTitle: string;
  priceOurs: string;
  priceTheirs: (name: string) => string;
  honesty: string;
  reviewed: string;
  visit: (name: string) => string;
  ctaTitle: string;
  ctaButton: string;
  otherTitle: string;
  faqSame: (name: string) => string;
  faqSameA: (name: string) => string;
  faqBetter: (name: string) => string;
  faqBetterA: (name: string) => string;
  faqSwitch: (name: string) => string;
  faqSwitchA: string;
  faqFree: string;
  faqFreeA: string;
};

const OURS_PRICE = {
  pt: "Gratuito 0 €, Pro 14,99 €/mês, Premium 39 €/mês. Anual mais barato. Paga-se com cartão ou stablecoins.",
  en: "Free €0, Pro €14.99/mo, Premium €39/mo. Cheaper yearly. Card or stablecoins.",
  es: "Gratuito 0 €, Pro 14,99 €/mes, Premium 39 €/mes. Anual más barato. Tarjeta o stablecoins.",
  fr: "Gratuit 0 €, Pro 14,99 €/mois, Premium 39 €/mois. Moins cher à l'année. Carte ou stablecoins.",
};

export const COMPARE_COPY: Record<Lang, CompareCopy> = {
  pt: {
    locale: "pt_PT",
    breadcrumbHome: "Início",
    breadcrumbCompare: "Comparações",
    indexTitle: "ChainFolioAI comparado com outras ferramentas",
    indexMetaTitle: "ChainFolioAI vs Koinly, CoinTracking e Zerion",
    indexMetaDescription: "Comparação honesta do ChainFolioAI com o Koinly, o CoinTracking e o Zerion, incluindo o que cada um faz melhor do que nós.",
    indexIntro: "Comparações escritas para serem úteis a quem está a decidir, não para vender. Cada página diz primeiro o que a outra ferramenta faz melhor do que nós — se não dissesse, não valia a pena ler.",
    metaTitle: (n) => `ChainFolioAI vs ${n}: o que muda`,
    metaDescription: (n) => `Comparação do ChainFolioAI com o ${n}: o que fazem igual, o que o ${n} faz melhor, e o que o ChainFolioAI faz de diferente.`,
    heading: (n) => `ChainFolioAI vs ${n}`,
    lead: (n) => `As duas ferramentas resolvem problemas que se tocam, mas não são a mesma coisa. Aqui está a diferença, incluindo o que o ${n} faz melhor do que nós.`,
    whatIs: (n) => `O que é o ${n}`,
    whatWeAre: "O que é o ChainFolioAI",
    whatWeAreText: "Painel de portefólio cripto e tradicional, só-leitura, com relatório fiscal FIFO, métricas de risco, assistente de IA e acesso por API e MCP para agentes.",
    sameTitle: "O que os dois fazem",
    theirsTitle: (n) => `O que o ${n} faz melhor`,
    theirsNote: "Esta secção existe porque sem ela a comparação não vale nada.",
    oursTitle: "O que o ChainFolioAI faz de diferente",
    pickTitle: "Qual escolher",
    pickThem: (n) => `Escolhe o ${n} se…`,
    pickUs: "Escolhe o ChainFolioAI se…",
    priceTitle: "Preço",
    priceOurs: OURS_PRICE.pt,
    priceTheirs: (n) => `O preço do ${n} muda com o tempo e com o plano. Confirma no site deles.`,
    honesty: "Nada aqui é número de desempenho nem promessa de retorno. O relatório fiscal é uma estimativa a partir do histórico que registas, não uma declaração.",
    reviewed: "Factos revistos a 20 de setembro de 2026. As ferramentas mudam: confirma no site de cada uma antes de decidir.",
    visit: (n) => `Site do ${n}`,
    ctaTitle: "Ver por ti",
    ctaButton: "Criar conta grátis",
    otherTitle: "Outras comparações",
    faqSame: (n) => `O ChainFolioAI faz o mesmo que o ${n}?`,
    faqSameA: (n) => `Não. Há coisas em comum, mas o ${n} e o ChainFolioAI foram feitos para problemas diferentes. A página acima diz o que cada um faz melhor.`,
    faqBetter: (n) => `O que é que o ${n} faz melhor do que o ChainFolioAI?`,
    faqBetterA: (n) => `Está escrito na página, numa secção própria. O principal, no caso do ${n}, tem a ver com a profundidade e o tempo de mercado dele.`,
    faqSwitch: (n) => `Dá para usar os dois?`,
    faqSwitchA: "Dá. Há quem use uma ferramenta para o relatório de fim de ano e outra para acompanhar o portefólio no dia a dia.",
    faqFree: "O ChainFolioAI tem plano gratuito?",
    faqFreeA: "Tem, sem cartão. Inclui carteiras on-chain, histórico de transações completo, calculadora FIRE e fiscalidade de 4 países.",
  },
  en: {
    locale: "en_GB",
    breadcrumbHome: "Home",
    breadcrumbCompare: "Comparisons",
    indexTitle: "ChainFolioAI compared with other tools",
    indexMetaTitle: "ChainFolioAI vs Koinly, CoinTracking and Zerion",
    indexMetaDescription: "An honest comparison of ChainFolioAI with Koinly, CoinTracking and Zerion, including what each of them does better than us.",
    indexIntro: "Comparisons written to be useful to someone deciding, not to sell. Each page starts with what the other tool does better than us — without that, it would not be worth reading.",
    metaTitle: (n) => `ChainFolioAI vs ${n}: what changes`,
    metaDescription: (n) => `ChainFolioAI compared with ${n}: what they do alike, what ${n} does better, and what ChainFolioAI does differently.`,
    heading: (n) => `ChainFolioAI vs ${n}`,
    lead: (n) => `The two tools solve overlapping problems, but they are not the same thing. Here is the difference, including what ${n} does better than us.`,
    whatIs: (n) => `What ${n} is`,
    whatWeAre: "What ChainFolioAI is",
    whatWeAreText: "A read-only crypto and traditional portfolio dashboard, with FIFO tax reporting, risk metrics, an AI assistant, and API and MCP access for agents.",
    sameTitle: "What both do",
    theirsTitle: (n) => `What ${n} does better`,
    theirsNote: "This section exists because without it the comparison is worthless.",
    oursTitle: "What ChainFolioAI does differently",
    pickTitle: "Which to choose",
    pickThem: (n) => `Choose ${n} if…`,
    pickUs: "Choose ChainFolioAI if…",
    priceTitle: "Price",
    priceOurs: OURS_PRICE.en,
    priceTheirs: (n) => `${n}'s price changes over time and by plan. Check it on their site.`,
    honesty: "Nothing here is a performance figure or a promise of returns. The tax report is an estimate built from the history you record, not a tax return.",
    reviewed: "Facts reviewed on 20 September 2026. Tools change: check each one's site before deciding.",
    visit: (n) => `${n}'s site`,
    ctaTitle: "See for yourself",
    ctaButton: "Create a free account",
    otherTitle: "Other comparisons",
    faqSame: (n) => `Does ChainFolioAI do the same as ${n}?`,
    faqSameA: (n) => `No. There is common ground, but ${n} and ChainFolioAI were built for different problems. The page above says what each does better.`,
    faqBetter: (n) => `What does ${n} do better than ChainFolioAI?`,
    faqBetterA: (n) => `It is on the page, in a section of its own. In ${n}'s case it mostly comes down to depth and years on the market.`,
    faqSwitch: () => `Can you use both?`,
    faqSwitchA: "Yes. Some people use one tool for the year-end report and another to follow the portfolio day to day.",
    faqFree: "Does ChainFolioAI have a free plan?",
    faqFreeA: "It does, with no card. It includes on-chain wallets, full trade history, the FIRE calculator and tax tools for 4 countries.",
  },
  es: {
    locale: "es_ES",
    breadcrumbHome: "Inicio",
    breadcrumbCompare: "Comparativas",
    indexTitle: "ChainFolioAI comparado con otras herramientas",
    indexMetaTitle: "ChainFolioAI vs Koinly, CoinTracking y Zerion",
    indexMetaDescription: "Comparativa honesta de ChainFolioAI con Koinly, CoinTracking y Zerion, incluido lo que cada uno hace mejor que nosotros.",
    indexIntro: "Comparativas escritas para ser útiles a quien está decidiendo, no para vender. Cada página dice primero lo que la otra herramienta hace mejor que nosotros — si no lo dijera, no valdría la pena leerla.",
    metaTitle: (n) => `ChainFolioAI vs ${n}: qué cambia`,
    metaDescription: (n) => `Comparativa de ChainFolioAI con ${n}: qué hacen igual, qué hace mejor ${n}, y qué hace ChainFolioAI de otra manera.`,
    heading: (n) => `ChainFolioAI vs ${n}`,
    lead: (n) => `Las dos herramientas resuelven problemas que se tocan, pero no son lo mismo. Aquí está la diferencia, incluido lo que ${n} hace mejor que nosotros.`,
    whatIs: (n) => `Qué es ${n}`,
    whatWeAre: "Qué es ChainFolioAI",
    whatWeAreText: "Panel de cartera cripto y tradicional, de solo lectura, con informe fiscal FIFO, métricas de riesgo, asistente de IA y acceso por API y MCP para agentes.",
    sameTitle: "Qué hacen los dos",
    theirsTitle: (n) => `Qué hace mejor ${n}`,
    theirsNote: "Esta sección existe porque sin ella la comparativa no vale nada.",
    oursTitle: "Qué hace ChainFolioAI de otra manera",
    pickTitle: "Cuál elegir",
    pickThem: (n) => `Elige ${n} si…`,
    pickUs: "Elige ChainFolioAI si…",
    priceTitle: "Precio",
    priceOurs: OURS_PRICE.es,
    priceTheirs: (n) => `El precio de ${n} cambia con el tiempo y según el plan. Confírmalo en su web.`,
    honesty: "Nada de esto es una cifra de rendimiento ni una promesa de rentabilidad. El informe fiscal es una estimación a partir del historial que registras, no una declaración.",
    reviewed: "Datos revisados el 20 de septiembre de 2026. Las herramientas cambian: confírmalo en la web de cada una antes de decidir.",
    visit: (n) => `Web de ${n}`,
    ctaTitle: "Compruébalo tú",
    ctaButton: "Crear cuenta gratis",
    otherTitle: "Otras comparativas",
    faqSame: (n) => `¿ChainFolioAI hace lo mismo que ${n}?`,
    faqSameA: (n) => `No. Hay cosas en común, pero ${n} y ChainFolioAI se hicieron para problemas distintos. La página de arriba dice qué hace mejor cada uno.`,
    faqBetter: (n) => `¿Qué hace ${n} mejor que ChainFolioAI?`,
    faqBetterA: (n) => `Está en la página, en una sección propia. En el caso de ${n} tiene que ver sobre todo con su profundidad y su tiempo en el mercado.`,
    faqSwitch: () => `¿Se pueden usar los dos?`,
    faqSwitchA: "Sí. Hay quien usa una herramienta para el informe de fin de año y otra para seguir la cartera a diario.",
    faqFree: "¿ChainFolioAI tiene plan gratuito?",
    faqFreeA: "Sí, sin tarjeta. Incluye monederos on-chain, historial de operaciones completo, calculadora FIRE y fiscalidad de 4 países.",
  },
  fr: {
    locale: "fr_FR",
    breadcrumbHome: "Accueil",
    breadcrumbCompare: "Comparatifs",
    indexTitle: "ChainFolioAI comparé à d'autres outils",
    indexMetaTitle: "ChainFolioAI vs Koinly, CoinTracking et Zerion",
    indexMetaDescription: "Comparatif honnête de ChainFolioAI avec Koinly, CoinTracking et Zerion, y compris ce que chacun fait mieux que nous.",
    indexIntro: "Des comparatifs écrits pour être utiles à qui hésite, pas pour vendre. Chaque page commence par ce que l'autre outil fait mieux que nous — sans cela, elle ne vaudrait pas la lecture.",
    metaTitle: (n) => `ChainFolioAI vs ${n} : ce qui change`,
    metaDescription: (n) => `ChainFolioAI comparé à ${n} : ce qu'ils font pareil, ce que ${n} fait mieux, et ce que ChainFolioAI fait autrement.`,
    heading: (n) => `ChainFolioAI vs ${n}`,
    lead: (n) => `Les deux outils traitent des problèmes voisins, mais ce n'est pas la même chose. Voici la différence, y compris ce que ${n} fait mieux que nous.`,
    whatIs: (n) => `Ce qu'est ${n}`,
    whatWeAre: "Ce qu'est ChainFolioAI",
    whatWeAreText: "Un tableau de bord de portefeuille crypto et traditionnel, en lecture seule, avec rapport fiscal FIFO, métriques de risque, assistant IA et accès API et MCP pour les agents.",
    sameTitle: "Ce que font les deux",
    theirsTitle: (n) => `Ce que ${n} fait mieux`,
    theirsNote: "Cette section existe parce que, sans elle, le comparatif ne vaut rien.",
    oursTitle: "Ce que ChainFolioAI fait autrement",
    pickTitle: "Lequel choisir",
    pickThem: (n) => `Choisissez ${n} si…`,
    pickUs: "Choisissez ChainFolioAI si…",
    priceTitle: "Prix",
    priceOurs: OURS_PRICE.fr,
    priceTheirs: (n) => `Le prix de ${n} évolue avec le temps et selon le forfait. Vérifiez sur leur site.`,
    honesty: "Rien ici n'est un chiffre de performance ni une promesse de rendement. Le rapport fiscal est une estimation bâtie sur l'historique que vous saisissez, pas une déclaration.",
    reviewed: "Faits vérifiés le 20 septembre 2026. Les outils changent : vérifiez sur le site de chacun avant de décider.",
    visit: (n) => `Site de ${n}`,
    ctaTitle: "Voyez par vous-même",
    ctaButton: "Créer un compte gratuit",
    otherTitle: "Autres comparatifs",
    faqSame: (n) => `ChainFolioAI fait-il la même chose que ${n} ?`,
    faqSameA: (n) => `Non. Il y a des points communs, mais ${n} et ChainFolioAI ont été conçus pour des problèmes différents. La page ci-dessus dit ce que chacun fait mieux.`,
    faqBetter: (n) => `Qu'est-ce que ${n} fait mieux que ChainFolioAI ?`,
    faqBetterA: (n) => `C'est sur la page, dans une section dédiée. Pour ${n}, cela tient surtout à sa profondeur et à son ancienneté.`,
    faqSwitch: () => `Peut-on utiliser les deux ?`,
    faqSwitchA: "Oui. Certains utilisent un outil pour le rapport de fin d'année et un autre pour suivre le portefeuille au quotidien.",
    faqFree: "ChainFolioAI a-t-il un forfait gratuit ?",
    faqFreeA: "Oui, sans carte. Il inclut les wallets on-chain, l'historique complet des opérations, le calculateur FIRE et la fiscalité de 4 pays.",
  },
};
