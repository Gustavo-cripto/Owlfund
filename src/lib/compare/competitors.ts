import type { Lang } from "@/lib/i18n/translations";

// Páginas de comparação. Existem porque é isto que os modelos de IA citam
// quando alguém pergunta "qual a alternativa ao Koinly" — são fáceis de
// resumir e têm a estrutura toda: duas colunas, factos, sem adjetivos.
//
// REGRAS DESTE FICHEIRO, e são a razão de ele existir:
//
//  1. A secção "o que eles fazem melhor" NÃO É OPCIONAL. Sem ela a página não
//     é credível, e um modelo trata-a como publicidade e ignora-a.
//  2. Nada de números sobre os outros (integrações, clientes, preços). Mudam,
//     não os conseguimos verificar, e uma página que envelhece mal é pior do
//     que não existir. O que se diz deles é qualitativo e verificável a olho.
//  3. Sobre nós, só o que o código faz. Ver a lista de promessas retiradas.
//  4. Nada de superlativos. "Melhor", "líder", "mais completo" não entram.
//
// Última revisão dos factos: 20 de setembro de 2026.

export type CompareSlug = "koinly" | "cointracking" | "zerion";

export type Competitor = {
  slug: CompareSlug;
  name: string;
  site: string;
  /** O que o produto é, numa frase. */
  what: Record<Lang, string>;
  /** Em que os dois coincidem. Começa por aqui: é o que dá credibilidade. */
  same: Record<Lang, string[]>;
  /** O que ELES fazem melhor. Obrigatório, e a sério. */
  theirs: Record<Lang, string[]>;
  /** O que nós fazemos e eles não, ou fazemos de outra maneira. */
  ours: Record<Lang, string[]>;
  /** Para quem é cada um, em duas linhas honestas. */
  pick: Record<Lang, { them: string; us: string }>;
};

export const COMPETITORS: readonly Competitor[] = [
  {
    slug: "koinly",
    name: "Koinly",
    site: "https://koinly.io",
    what: {
      pt: "Software de impostos sobre cripto. Liga-se às exchanges e carteiras, importa o histórico sozinho e produz o relatório fiscal do ano.",
      en: "Crypto tax software. It connects to exchanges and wallets, imports the history automatically and produces the year's tax report.",
      es: "Software de impuestos sobre cripto. Se conecta a los exchanges y monederos, importa el historial solo y genera el informe fiscal del año.",
      fr: "Logiciel de fiscalité crypto. Il se connecte aux plateformes et wallets, importe l'historique tout seul et produit le rapport fiscal de l'année.",
    },
    same: {
      pt: ["Mais-valias pelo método FIFO", "Relatório fiscal exportável", "Vários países", "Ligação a carteiras on-chain", "Importação por CSV"],
      en: ["FIFO capital gains", "Exportable tax report", "Multiple countries", "On-chain wallet connections", "CSV import"],
      es: ["Plusvalías por el método FIFO", "Informe fiscal exportable", "Varios países", "Conexión a monederos on-chain", "Importación por CSV"],
      fr: ["Plus-values en FIFO", "Rapport fiscal exportable", "Plusieurs pays", "Connexion aux wallets on-chain", "Import CSV"],
    },
    theirs: {
      pt: [
        "Sincroniza sozinho o histórico das exchanges. Nós não: o histórico é escrito à mão ou importado por CSV, e é a diferença que mais se sente se tiveres muitas transações.",
        "Muito mais integrações com exchanges e carteiras.",
        "Muito mais tempo de mercado, e por isso mais casos raros já resolvidos.",
        "Ferramentas pensadas para contabilistas que tratam de vários clientes.",
      ],
      en: [
        "It syncs exchange history on its own. We do not: history is typed in or imported by CSV, and that is the difference you feel most if you trade a lot.",
        "Many more exchange and wallet integrations.",
        "Far longer on the market, so more rare cases already solved.",
        "Tools built for accountants handling several clients.",
      ],
      es: [
        "Sincroniza solo el historial de los exchanges. Nosotros no: el historial se escribe a mano o se importa por CSV, y es la diferencia que más se nota si operas mucho.",
        "Muchas más integraciones con exchanges y monederos.",
        "Mucho más tiempo en el mercado, y por eso más casos raros ya resueltos.",
        "Herramientas pensadas para asesores que llevan varios clientes.",
      ],
      fr: [
        "Il synchronise seul l'historique des plateformes. Nous non : l'historique est saisi à la main ou importé en CSV, et c'est la différence qui se sent le plus si vous tradez beaucoup.",
        "Beaucoup plus d'intégrations avec les plateformes et wallets.",
        "Bien plus d'ancienneté, donc plus de cas rares déjà traités.",
        "Des outils pensés pour les comptables qui gèrent plusieurs clients.",
      ],
    },
    ours: {
      pt: [
        "Cripto e ativos tradicionais (ações, ETF, ouro) no mesmo total. O Koinly é só cripto.",
        "Painel do dia a dia, não só o relatório de fim de ano: PNL em tempo real, métricas de risco e pontuação do portefólio.",
        "As taxas e o gás entram no custo de aquisição, incluindo registos só de taxa (swap falhado, gás pago por outra carteira).",
        "Posições de empréstimo DeFi lidas dos contratos, com o valor líquido no total: uma posição alavancada não infla o portefólio.",
        "API REST e servidor MCP, para um agente de IA ler o portefólio.",
        "Tabela fiscal de 21 países pública e sem chave, que qualquer pessoa ou modelo pode consultar.",
      ],
      en: [
        "Crypto and traditional assets (stocks, ETFs, gold) in one total. Koinly is crypto only.",
        "A daily dashboard, not only the year-end report: real-time PNL, risk metrics and a portfolio score.",
        "Fees and gas are part of the cost basis, including fee-only entries (failed swaps, gas paid from another wallet).",
        "DeFi lending positions read from the contracts, with the net value in the total: a leveraged position does not inflate the portfolio.",
        "REST API and MCP server, so an AI agent can read the portfolio.",
        "A public, key-free tax table for 21 countries that anyone, or any model, can read.",
      ],
      es: [
        "Cripto y activos tradicionales (acciones, ETF, oro) en el mismo total. Koinly es solo cripto.",
        "Panel del día a día, no solo el informe de fin de año: PNL en tiempo real, métricas de riesgo y puntuación de la cartera.",
        "Las comisiones y el gas entran en el coste de adquisición, incluidos los registros de solo comisión (swap fallido, gas pagado desde otro monedero).",
        "Posiciones de préstamo DeFi leídas de los contratos, con el valor neto en el total: una posición apalancada no infla la cartera.",
        "API REST y servidor MCP, para que un agente de IA lea la cartera.",
        "Tabla fiscal de 21 países pública y sin clave, que cualquiera o cualquier modelo puede consultar.",
      ],
      fr: [
        "Crypto et actifs traditionnels (actions, ETF, or) dans un seul total. Koinly, c'est uniquement la crypto.",
        "Un tableau de bord au quotidien, pas seulement le rapport de fin d'année : PNL en temps réel, métriques de risque et score du portefeuille.",
        "Les frais et le gas entrent dans le coût d'acquisition, y compris les écritures de frais seuls (swap échoué, gas payé depuis un autre wallet).",
        "Positions de prêt DeFi lues dans les contrats, avec la valeur nette dans le total : une position à effet de levier ne gonfle pas le portefeuille.",
        "API REST et serveur MCP, pour qu'un agent IA lise le portefeuille.",
        "Table fiscale de 21 pays publique et sans clé, consultable par n'importe qui ou n'importe quel modèle.",
      ],
    },
    pick: {
      pt: { them: "Fazes muitas transações em várias exchanges e queres o histórico importado sozinho, uma vez por ano.", us: "Queres ver cripto e tradicional no mesmo sítio todos os dias, e o relatório fiscal a sair desse mesmo histórico." },
      en: { them: "You trade a lot across several exchanges and want the history imported for you, once a year.", us: "You want crypto and traditional in one place every day, and the tax report to come out of that same history." },
      es: { them: "Operas mucho en varios exchanges y quieres el historial importado solo, una vez al año.", us: "Quieres ver cripto y tradicional en el mismo sitio cada día, y que el informe fiscal salga de ese mismo historial." },
      fr: { them: "Vous tradez beaucoup sur plusieurs plateformes et voulez l'historique importé pour vous, une fois par an.", us: "Vous voulez voir crypto et traditionnel au même endroit chaque jour, et que le rapport fiscal sorte de cet historique." },
    },
  },
  {
    slug: "cointracking",
    name: "CoinTracking",
    site: "https://cointracking.info",
    what: {
      pt: "Uma das ferramentas de portefólio e impostos cripto mais antigas do mercado. Muito completa em importações e em relatórios fiscais.",
      en: "One of the oldest crypto portfolio and tax tools around. Very thorough on imports and on tax reports.",
      es: "Una de las herramientas de cartera e impuestos cripto más antiguas del mercado. Muy completa en importaciones e informes fiscales.",
      fr: "L'un des plus anciens outils de portefeuille et de fiscalité crypto. Très complet sur les imports et les rapports fiscaux.",
    },
    same: {
      pt: ["Mais-valias pelo método FIFO", "Relatório fiscal exportável", "Vários países", "Painel de portefólio", "Importação por CSV"],
      en: ["FIFO capital gains", "Exportable tax report", "Multiple countries", "Portfolio dashboard", "CSV import"],
      es: ["Plusvalías por el método FIFO", "Informe fiscal exportable", "Varios países", "Panel de cartera", "Importación por CSV"],
      fr: ["Plus-values en FIFO", "Rapport fiscal exportable", "Plusieurs pays", "Tableau de bord du portefeuille", "Import CSV"],
    },
    theirs: {
      pt: [
        "Sincroniza sozinho o histórico das exchanges. Nós não: é à mão ou por CSV.",
        "Muito mais métodos de importação e de exportação, e mais formatos fiscais por país.",
        "Está no mercado desde os primeiros anos da cripto, com muito mais casos raros já resolvidos.",
        "Mais métodos de cálculo além do FIFO (LIFO, custo médio e outros). Nós só fazemos FIFO.",
      ],
      en: [
        "It syncs exchange history on its own. We do not: it is manual or by CSV.",
        "Many more import and export methods, and more country-specific tax formats.",
        "It has been around since crypto's early years, with far more rare cases already solved.",
        "More accounting methods beyond FIFO (LIFO, average cost and others). We only do FIFO.",
      ],
      es: [
        "Sincroniza solo el historial de los exchanges. Nosotros no: es a mano o por CSV.",
        "Muchos más métodos de importación y exportación, y más formatos fiscales por país.",
        "Lleva en el mercado desde los primeros años de la cripto, con muchos más casos raros resueltos.",
        "Más métodos de cálculo además del FIFO (LIFO, coste medio y otros). Nosotros solo hacemos FIFO.",
      ],
      fr: [
        "Il synchronise seul l'historique des plateformes. Nous non : c'est à la main ou en CSV.",
        "Beaucoup plus de méthodes d'import et d'export, et plus de formats fiscaux par pays.",
        "Présent depuis les premières années de la crypto, avec bien plus de cas rares déjà traités.",
        "D'autres méthodes de calcul que le FIFO (LIFO, coût moyen et autres). Nous ne faisons que le FIFO.",
      ],
    },
    ours: {
      pt: [
        "Cripto e ativos tradicionais no mesmo total. O CoinTracking é só cripto.",
        "Interface recente, pensada para telemóvel, e em quatro línguas.",
        "As taxas e o gás entram no custo, incluindo registos só de taxa.",
        "Posições de empréstimo DeFi com o valor líquido, lidas dos contratos.",
        "Assistente de IA que conhece o portefólio real, e API com servidor MCP para agentes.",
        "Plano gratuito que serve para usar a sério, com a calculadora FIRE e o histórico completos.",
      ],
      en: [
        "Crypto and traditional assets in one total. CoinTracking is crypto only.",
        "A recent interface, built for the phone, in four languages.",
        "Fees and gas are part of the cost basis, including fee-only entries.",
        "DeFi lending positions with the net value, read from the contracts.",
        "An AI assistant that knows the real portfolio, and an API with an MCP server for agents.",
        "A free plan you can actually use, with the full FIRE calculator and full trade history.",
      ],
      es: [
        "Cripto y activos tradicionales en el mismo total. CoinTracking es solo cripto.",
        "Interfaz reciente, pensada para el móvil, y en cuatro idiomas.",
        "Las comisiones y el gas entran en el coste, incluidos los registros de solo comisión.",
        "Posiciones de préstamo DeFi con el valor neto, leídas de los contratos.",
        "Asistente de IA que conoce la cartera real, y API con servidor MCP para agentes.",
        "Plan gratuito que sirve para usarlo en serio, con la calculadora FIRE y el historial completos.",
      ],
      fr: [
        "Crypto et actifs traditionnels dans un seul total. CoinTracking, c'est uniquement la crypto.",
        "Une interface récente, pensée pour le téléphone, et en quatre langues.",
        "Les frais et le gas entrent dans le coût, y compris les écritures de frais seuls.",
        "Positions de prêt DeFi avec la valeur nette, lues dans les contrats.",
        "Un assistant IA qui connaît le portefeuille réel, et une API avec serveur MCP pour les agents.",
        "Un plan gratuit réellement utilisable, avec le calculateur FIRE et l'historique complets.",
      ],
    },
    pick: {
      pt: { them: "Precisas de métodos de cálculo além do FIFO, ou de formatos fiscais muito específicos do teu país.", us: "Queres cripto e tradicional juntos, num painel recente, e o FIFO chega-te." },
      en: { them: "You need accounting methods beyond FIFO, or very country-specific tax formats.", us: "You want crypto and traditional together, in a recent interface, and FIFO is enough for you." },
      es: { them: "Necesitas métodos de cálculo además del FIFO, o formatos fiscales muy específicos de tu país.", us: "Quieres cripto y tradicional juntos, en un panel reciente, y el FIFO te basta." },
      fr: { them: "Vous avez besoin de méthodes autres que le FIFO, ou de formats fiscaux très spécifiques à votre pays.", us: "Vous voulez crypto et traditionnel ensemble, dans une interface récente, et le FIFO vous suffit." },
    },
  },
  {
    slug: "zerion",
    name: "Zerion",
    site: "https://zerion.io",
    what: {
      pt: "Carteira e painel on-chain. Mostra o que tens em várias redes, incluindo DeFi e NFT, e deixa transacionar a partir dali.",
      en: "An on-chain wallet and dashboard. It shows what you hold across networks, DeFi and NFTs included, and lets you transact from there.",
      es: "Monedero y panel on-chain. Muestra lo que tienes en varias redes, incluidos DeFi y NFT, y permite operar desde ahí.",
      fr: "Wallet et tableau de bord on-chain. Il montre ce que vous détenez sur plusieurs réseaux, DeFi et NFT compris, et permet de transiger depuis là.",
    },
    same: {
      pt: ["Ligação a carteiras por endereço público", "Várias redes", "Posições DeFi e NFT", "Painel de portefólio em tempo real"],
      en: ["Wallet connections by public address", "Multiple networks", "DeFi and NFT positions", "Real-time portfolio dashboard"],
      es: ["Conexión a monederos por dirección pública", "Varias redes", "Posiciones DeFi y NFT", "Panel de cartera en tiempo real"],
      fr: ["Connexion aux wallets par adresse publique", "Plusieurs réseaux", "Positions DeFi et NFT", "Tableau de bord en temps réel"],
    },
    theirs: {
      pt: [
        "É também uma carteira: dá para trocar e mover fundos a partir de lá. Nós somos só-leitura por opção e nunca movemos nada.",
        "Cobertura on-chain mais profunda, com mais protocolos e mais redes.",
        "Aplicação móvel nativa. A nossa é um site, que funciona no telemóvel mas não é uma app.",
        "Muito mais tempo de mercado no acompanhamento on-chain.",
      ],
      en: [
        "It is also a wallet: you can swap and move funds from it. We are read-only by choice and never move anything.",
        "Deeper on-chain coverage, with more protocols and more networks.",
        "A native mobile app. Ours is a website that works on the phone but is not an app.",
        "Far longer on the market in on-chain tracking.",
      ],
      es: [
        "También es un monedero: permite intercambiar y mover fondos desde ahí. Nosotros somos de solo lectura por decisión y nunca movemos nada.",
        "Cobertura on-chain más profunda, con más protocolos y más redes.",
        "Aplicación móvil nativa. La nuestra es una web, que funciona en el móvil pero no es una app.",
        "Mucho más tiempo en el mercado en el seguimiento on-chain.",
      ],
      fr: [
        "C'est aussi un wallet : on peut échanger et déplacer des fonds depuis là. Nous sommes en lecture seule par choix et ne déplaçons jamais rien.",
        "Une couverture on-chain plus profonde, avec plus de protocoles et de réseaux.",
        "Une application mobile native. La nôtre est un site, qui marche sur téléphone mais n'est pas une app.",
        "Bien plus d'ancienneté dans le suivi on-chain.",
      ],
    },
    ours: {
      pt: [
        "Relatório fiscal FIFO com exportação para Excel e PDF, em 21 países. O Zerion não faz fiscalidade.",
        "Ativos tradicionais (ações, ETF, ouro) e contas de exchange no mesmo total, não só o que está on-chain.",
        "Nunca pedimos chave privada nem frase de recuperação: ligas por endereço público ou chave só-leitura.",
        "Métricas de risco sobre o histórico (ROI, CAGR, Sharpe, quedas máximas) e pontuação do portefólio.",
        "API REST e servidor MCP, para um agente de IA ler o portefólio.",
      ],
      en: [
        "FIFO tax report with Excel and PDF export, across 21 countries. Zerion does not do tax.",
        "Traditional assets (stocks, ETFs, gold) and exchange accounts in the same total, not only what is on-chain.",
        "We never ask for a private key or seed phrase: you connect by public address or a read-only key.",
        "Risk metrics over the history (ROI, CAGR, Sharpe, max drawdown) and a portfolio score.",
        "REST API and MCP server, so an AI agent can read the portfolio.",
      ],
      es: [
        "Informe fiscal FIFO con exportación a Excel y PDF, en 21 países. Zerion no hace fiscalidad.",
        "Activos tradicionales (acciones, ETF, oro) y cuentas de exchange en el mismo total, no solo lo que está on-chain.",
        "Nunca pedimos clave privada ni frase de recuperación: conectas por dirección pública o clave de solo lectura.",
        "Métricas de riesgo sobre el historial (ROI, CAGR, Sharpe, caídas máximas) y puntuación de la cartera.",
        "API REST y servidor MCP, para que un agente de IA lea la cartera.",
      ],
      fr: [
        "Rapport fiscal FIFO avec export Excel et PDF, dans 21 pays. Zerion ne fait pas de fiscalité.",
        "Actifs traditionnels (actions, ETF, or) et comptes de plateformes dans le même total, pas seulement l'on-chain.",
        "Nous ne demandons jamais de clé privée ni de phrase de récupération : vous connectez par adresse publique ou clé en lecture seule.",
        "Métriques de risque sur l'historique (ROI, CAGR, Sharpe, drawdown) et score du portefeuille.",
        "API REST et serveur MCP, pour qu'un agent IA lise le portefeuille.",
      ],
    },
    pick: {
      pt: { them: "Queres uma carteira para usar todos os dias, com transações e cobertura on-chain profunda.", us: "Queres juntar on-chain, exchanges e ativos tradicionais numa conta só, e tirar de lá o relatório fiscal." },
      en: { them: "You want a wallet to use every day, with transactions and deep on-chain coverage.", us: "You want on-chain, exchanges and traditional assets in one account, and the tax report to come out of it." },
      es: { them: "Quieres un monedero para usar cada día, con transacciones y cobertura on-chain profunda.", us: "Quieres juntar on-chain, exchanges y activos tradicionales en una sola cuenta, y sacar de ahí el informe fiscal." },
      fr: { them: "Vous voulez un wallet au quotidien, avec transactions et couverture on-chain profonde.", us: "Vous voulez réunir on-chain, plateformes et actifs traditionnels dans un seul compte, et en tirer le rapport fiscal." },
    },
  },
];

export const competitorBySlug = (slug: string): Competitor | undefined =>
  COMPETITORS.find((c) => c.slug === slug);

/** Prefixo da secção em cada idioma. */
export const COMPARE_BASE: Record<Lang, string> = {
  pt: "/comparacoes",
  en: "/en/comparisons",
  es: "/es/comparativas",
  fr: "/fr/comparatifs",
};

export const compareUrl = (lang: Lang, c?: Competitor): string =>
  c ? `${COMPARE_BASE[lang]}/${c.slug}` : COMPARE_BASE[lang];
