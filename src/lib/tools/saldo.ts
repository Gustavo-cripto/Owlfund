// Páginas próprias da ferramenta "ver o saldo de uma carteira sem conta".
//
// Porquê (29 set 2026, proposta do agente social): a demonstração só existia
// como âncora na página inicial (/#experimentar). Uma âncora não é um URL que o
// Google classifique nem a que alguém possa ligar. Aqui a mesma ferramenta
// ganha página própria — geral e uma por rede —, com título, descrição,
// sitemap e hreflang, nas 4 línguas. A âncora da página inicial mantém-se.
//
// Honestidade: tudo o que se promete aqui é o que /api/preview faz
// (src/app/api/preview/route.ts). Se a rota mudar, muda-se este texto.

import type { Metadata } from "next";

import { LANGS } from "@/lib/i18n/routes";
import type { Lang } from "@/lib/i18n/translations";
import { socialMeta } from "@/lib/seo/site";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://chainfolioai.com";

export type RedeSaldo = "todas" | "btc" | "eth" | "sol";
export const REDES_SALDO: readonly RedeSaldo[] = ["todas", "btc", "eth", "sol"];

/** Última revisão real do conteúdo (alimenta o sitemap e o JSON-LD). */
export const SALDO_DATE_MODIFIED = "2026-09-29";

/** Limites da demonstração, os mesmos de /api/preview (teste em scripts/testes/saldoPaginas.test.ts). */
export const DEMO_LIMITES = { consultas: 8, minutos: 10, ativos: 8, redesEvm: 5 } as const;

export const SALDO_SLUG: Record<RedeSaldo, Record<Lang, string>> = {
  todas: { pt: "ver-saldo-carteira", en: "wallet-balance-checker", es: "ver-saldo-monedero", fr: "voir-solde-portefeuille" },
  btc: { pt: "saldo-bitcoin", en: "bitcoin-balance-checker", es: "saldo-bitcoin", fr: "solde-bitcoin" },
  eth: { pt: "saldo-ethereum", en: "ethereum-balance-checker", es: "saldo-ethereum", fr: "solde-ethereum" },
  sol: { pt: "saldo-solana", en: "solana-balance-checker", es: "saldo-solana", fr: "solde-solana" },
};

const PREFIX: Record<Lang, string> = { pt: "", en: "/en", es: "/es", fr: "/fr" };
export const saldoUrl = (lang: Lang, rede: RedeSaldo = "todas") => `${PREFIX[lang]}/${SALDO_SLUG[rede][lang]}`;

/** Todos os slugs (para a contagem de visitas e para os testes). */
export const SALDO_SLUGS: readonly string[] = [...new Set(REDES_SALDO.flatMap((r) => LANGS.map((l) => SALDO_SLUG[r][l])))];

type PorRede = { nome: string; h1: string; lead: string; metaTitle: string; metaDescription: string; le: string };
export type CopiaSaldo = {
  locale: string;
  breadcrumbHome: string;
  breadcrumbLabel: string;
  redes: Record<RedeSaldo, PorRede>;
  mostraTitulo: string;
  mostra: readonly string[];
  privTitulo: string;
  priv: readonly string[];
  naoFazTitulo: string;
  naoFaz: readonly string[];
  outrasTitulo: string;
  guiasTitulo: string;
  guiasTexto: string;
  guias: ReadonlyArray<{ href: string; texto: string }>;
  ctaTitulo: string;
  ctaTexto: string;
  ctaBotao: string;
  faqTitulo: string;
  faqs: ReadonlyArray<{ q: string; a: string }>;
};

const L = DEMO_LIMITES;

export const SALDO_COPY: Record<Lang, CopiaSaldo> = {
  pt: {
    locale: "pt-PT",
    breadcrumbHome: "Início",
    breadcrumbLabel: "Localização",
    redes: {
      todas: {
        nome: "Ver saldo de carteira",
        h1: "Ver o saldo de uma carteira cripto, em euros e sem conta",
        lead: "Cola o endereço público de uma carteira Ethereum, Bitcoin ou Solana e vê o que lá está. Não é preciso registo, não pedimos nada teu e o endereço não fica guardado nos nossos servidores.",
        metaTitle: "Ver saldo de carteira cripto em euros, sem conta",
        metaDescription: "Cola um endereço público de Ethereum, Bitcoin ou Solana e vê o saldo em euros. Sem registo e só de leitura: não pedimos chaves nem guardamos o endereço.",
        le: "Um endereço que começa por 0x é lido em 5 redes de uma vez: Ethereum, Base, Arbitrum, Optimism e Polygon. Também aceita endereços Bitcoin e Solana.",
      },
      btc: {
        nome: "Saldo Bitcoin",
        h1: "Ver o saldo de um endereço Bitcoin, em euros",
        lead: "Cola um endereço Bitcoin (começa por bc1, 1 ou 3) e vê o saldo e o valor em euros. Sem conta e só de leitura.",
        metaTitle: "Ver saldo de endereço Bitcoin em euros, sem conta",
        metaDescription: "Cola um endereço Bitcoin (bc1, 1 ou 3) e vê o saldo em BTC e em euros. Sem registo, só de leitura, e o endereço não fica guardado.",
        le: "O saldo inclui o que já está confirmado na blockchain e o que ainda está à espera de confirmação.",
      },
      eth: {
        nome: "Saldo Ethereum",
        h1: "Ver o saldo de um endereço Ethereum, em euros",
        lead: "Cola um endereço que começa por 0x e vê ETH e tokens em 5 redes ao mesmo tempo. Sem conta e só de leitura.",
        metaTitle: "Ver saldo de endereço Ethereum (0x) em euros",
        metaDescription: "Cola um endereço 0x e vê ETH e tokens em Ethereum, Base, Arbitrum, Optimism e Polygon, com o valor em euros. Sem registo e só de leitura.",
        le: "O mesmo endereço 0x serve em todas as redes compatíveis. A ferramenta lê Ethereum, Base, Arbitrum, Optimism e Polygon de uma vez e soma tudo.",
      },
      sol: {
        nome: "Saldo Solana",
        h1: "Ver o saldo de um endereço Solana, em euros",
        lead: "Cola um endereço Solana e vê o SOL e os tokens que lá estão, com o valor em euros. Sem conta e só de leitura.",
        metaTitle: "Ver saldo de endereço Solana em euros, sem conta",
        metaDescription: "Cola um endereço Solana e vê SOL e tokens com o valor em euros, mais o número de NFTs. Sem registo, só de leitura, e o endereço não fica guardado.",
        le: "Mostra o SOL, os tokens com valor e quantos NFTs o endereço tem.",
      },
    },
    mostraTitulo: "O que a ferramenta mostra",
    mostra: [
      "O valor total do endereço, na moeda que escolheres (euros por omissão).",
      `Os ${L.ativos} ativos com mais valor, com a quantidade e a rede de cada um, e quantos outros ficaram de fora da lista.`,
      "O número de NFTs, em endereços Ethereum e Solana.",
      "Só entram ativos com preço conhecido e com valor de pelo menos 1 dólar. Assim ficam de fora os tokens de spam que chegam às carteiras sem ninguém pedir.",
    ],
    privTitulo: "O que fazemos com o endereço",
    priv: [
      "Usamo-lo para ler a blockchain e devolver o resultado. Não o guardamos nos nossos servidores.",
      "Um endereço público só permite ver. Nunca pedimos a frase de recuperação nem a chave privada, e ninguém que as peça é de confiança.",
      "Se colares uma frase de recuperação ou uma chave privada por engano, o campo é apagado e nada é enviado.",
    ],
    naoFazTitulo: "O que a ferramenta não faz",
    naoFaz: [
      "Não mostra posições em DeFi (empréstimos, staking, liquidez) nem a lista dos NFTs. Isso existe dentro da conta.",
      "Não lê Cardano nem outras redes fora das indicadas.",
      `Tem um limite de ${L.consultas} consultas a cada ${L.minutos} minutos por pessoa, para o serviço continuar gratuito.`,
    ],
    outrasTitulo: "A mesma ferramenta, por rede",
    guiasTitulo: "E os impostos?",
    guiasTexto: "Ver o saldo é o primeiro passo. A pergunta seguinte costuma ser quanto se paga ao vender. Temos guias por país, com a lei de referência de cada um.",
    guias: [
      { href: "/guias/impostos-cripto/portugal", texto: "Impostos sobre cripto em Portugal" },
      { href: "/guias/impostos-cripto", texto: "Guias fiscais dos 21 países" },
    ],
    ctaTitulo: "Queres acompanhar esta carteira todos os dias?",
    ctaTexto: "Com uma conta gratuita juntas várias carteiras e corretoras, vês a evolução do valor e calculas as mais-valias. Continua a ser só de leitura.",
    ctaBotao: "Criar conta grátis",
    faqTitulo: "Perguntas frequentes",
    faqs: [
      { q: "É seguro colar o meu endereço?", a: "Sim. O endereço público só permite ver saldos; não dá para mover fundos com ele. Nunca escrevas a frase de recuperação nem a chave privada, aqui ou noutro site." },
      { q: "Preciso de criar conta?", a: "Não. A ferramenta funciona sem registo e sem email. A conta só é precisa para guardar carteiras e ver a evolução ao longo do tempo." },
      { q: "De onde vêm os valores?", a: "Os saldos são lidos diretamente da blockchain, através da Alchemy (Ethereum e redes compatíveis), da Helius (Solana) e do mempool.space (Bitcoin). Os preços são os do momento da consulta." },
      { q: "Porque é que falta um token na lista?", a: `A lista mostra os ${L.ativos} ativos com mais valor. Ficam de fora os que valem menos de 1 dólar e os que não têm preço conhecido.` },
      { q: "Posso ver o endereço de outra pessoa?", a: "Podes ver qualquer endereço público: a blockchain é pública. O que não dá é para saber de quem é um endereço só por o consultar." },
    ],
  },

  en: {
    locale: "en-GB",
    breadcrumbHome: "Home",
    breadcrumbLabel: "Breadcrumb",
    redes: {
      todas: {
        nome: "Wallet balance checker",
        h1: "Check a crypto wallet balance, no account needed",
        lead: "Paste the public address of an Ethereum, Bitcoin or Solana wallet and see what it holds. No sign-up, nothing asked of you, and the address is not stored on our servers.",
        metaTitle: "Crypto wallet balance checker, no sign-up",
        metaDescription: "Paste a public Ethereum, Bitcoin or Solana address and see the balance in your currency. No sign-up, read-only: we never ask for keys or store the address.",
        le: "An address starting with 0x is read on 5 networks at once: Ethereum, Base, Arbitrum, Optimism and Polygon. Bitcoin and Solana addresses work too.",
      },
      btc: {
        nome: "Bitcoin balance",
        h1: "Check the balance of a Bitcoin address",
        lead: "Paste a Bitcoin address (starting with bc1, 1 or 3) and see the balance and its value. No account, read-only.",
        metaTitle: "Bitcoin address balance checker, no sign-up",
        metaDescription: "Paste a Bitcoin address (bc1, 1 or 3) and see the balance in BTC and in your currency. No sign-up, read-only, and the address is not stored.",
        le: "The balance includes what is already confirmed on the blockchain and what is still waiting for confirmation.",
      },
      eth: {
        nome: "Ethereum balance",
        h1: "Check the balance of an Ethereum address",
        lead: "Paste an address starting with 0x and see ETH and tokens on 5 networks at once. No account, read-only.",
        metaTitle: "Ethereum (0x) address balance checker",
        metaDescription: "Paste a 0x address and see ETH and tokens on Ethereum, Base, Arbitrum, Optimism and Polygon, with their value. No sign-up, read-only.",
        le: "The same 0x address works on every compatible network. The tool reads Ethereum, Base, Arbitrum, Optimism and Polygon in one go and adds everything up.",
      },
      sol: {
        nome: "Solana balance",
        h1: "Check the balance of a Solana address",
        lead: "Paste a Solana address and see the SOL and tokens it holds, with their value. No account, read-only.",
        metaTitle: "Solana address balance checker, no sign-up",
        metaDescription: "Paste a Solana address and see SOL and tokens with their value, plus the number of NFTs. No sign-up, read-only, and the address is not stored.",
        le: "It shows SOL, the tokens that have value and how many NFTs the address holds.",
      },
    },
    mostraTitulo: "What the tool shows",
    mostra: [
      "The total value of the address, in the currency you choose (euros by default).",
      `The ${L.ativos} assets worth the most, with the amount and network of each, and how many others were left off the list.`,
      "The number of NFTs, for Ethereum and Solana addresses.",
      "Only assets with a known price and worth at least 1 dollar are included. That leaves out the spam tokens that land in wallets uninvited.",
    ],
    privTitulo: "What we do with the address",
    priv: [
      "We use it to read the blockchain and return the result. We do not store it on our servers.",
      "A public address only lets you look. We never ask for the recovery phrase or the private key, and anyone who asks for them should not be trusted.",
      "If you paste a recovery phrase or a private key by mistake, the field is cleared and nothing is sent.",
    ],
    naoFazTitulo: "What the tool does not do",
    naoFaz: [
      "It does not show DeFi positions (lending, staking, liquidity) or the list of NFTs. Those are available inside an account.",
      "It does not read Cardano or other networks beyond the ones listed.",
      `It is limited to ${L.consultas} lookups every ${L.minutos} minutes per person, so the service can stay free.`,
    ],
    outrasTitulo: "The same tool, by network",
    guiasTitulo: "What about tax?",
    guiasTexto: "Seeing the balance is the first step. The next question is usually how much tax is due when you sell. We have guides by country, each with its reference law.",
    guias: [
      { href: "/guides/crypto-tax", texto: "Crypto tax guides for 21 countries" },
      { href: "/guides/crypto-tax/united-kingdom", texto: "Crypto tax in the United Kingdom" },
    ],
    ctaTitulo: "Want to follow this wallet every day?",
    ctaTexto: "With a free account you add several wallets and exchanges, watch the value over time and work out capital gains. It stays read-only.",
    ctaBotao: "Create a free account",
    faqTitulo: "Frequently asked questions",
    faqs: [
      { q: "Is it safe to paste my address?", a: "Yes. A public address only lets someone see balances; funds cannot be moved with it. Never type your recovery phrase or private key, here or on any other site." },
      { q: "Do I need an account?", a: "No. The tool works with no sign-up and no email. An account is only needed to save wallets and see how they change over time." },
      { q: "Where do the numbers come from?", a: "Balances are read straight from the blockchain, through Alchemy (Ethereum and compatible networks), Helius (Solana) and mempool.space (Bitcoin). Prices are those at the moment of the lookup." },
      { q: "Why is a token missing from the list?", a: `The list shows the ${L.ativos} assets worth the most. Assets worth less than 1 dollar, or with no known price, are left out.` },
      { q: "Can I look up someone else's address?", a: "You can look up any public address: the blockchain is public. What you cannot do is tell who owns an address just by looking it up." },
    ],
  },

  es: {
    locale: "es-ES",
    breadcrumbHome: "Inicio",
    breadcrumbLabel: "Ubicación",
    redes: {
      todas: {
        nome: "Ver saldo de monedero",
        h1: "Ver el saldo de un monedero cripto, en euros y sin cuenta",
        lead: "Pega la dirección pública de un monedero de Ethereum, Bitcoin o Solana y mira lo que contiene. Sin registro, sin pedirte nada, y la dirección no se guarda en nuestros servidores.",
        metaTitle: "Ver saldo de monedero cripto en euros, sin cuenta",
        metaDescription: "Pega una dirección pública de Ethereum, Bitcoin o Solana y mira el saldo en euros. Sin registro y solo lectura: no pedimos claves ni guardamos la dirección.",
        le: "Una dirección que empieza por 0x se lee en 5 redes a la vez: Ethereum, Base, Arbitrum, Optimism y Polygon. También acepta direcciones de Bitcoin y Solana.",
      },
      btc: {
        nome: "Saldo Bitcoin",
        h1: "Ver el saldo de una dirección Bitcoin, en euros",
        lead: "Pega una dirección Bitcoin (empieza por bc1, 1 o 3) y mira el saldo y su valor en euros. Sin cuenta y solo lectura.",
        metaTitle: "Ver saldo de dirección Bitcoin en euros, sin cuenta",
        metaDescription: "Pega una dirección Bitcoin (bc1, 1 o 3) y mira el saldo en BTC y en euros. Sin registro, solo lectura, y la dirección no se guarda.",
        le: "El saldo incluye lo que ya está confirmado en la blockchain y lo que aún espera confirmación.",
      },
      eth: {
        nome: "Saldo Ethereum",
        h1: "Ver el saldo de una dirección Ethereum, en euros",
        lead: "Pega una dirección que empieza por 0x y mira ETH y tokens en 5 redes a la vez. Sin cuenta y solo lectura.",
        metaTitle: "Ver saldo de dirección Ethereum (0x) en euros",
        metaDescription: "Pega una dirección 0x y mira ETH y tokens en Ethereum, Base, Arbitrum, Optimism y Polygon, con su valor en euros. Sin registro y solo lectura.",
        le: "La misma dirección 0x sirve en todas las redes compatibles. La herramienta lee Ethereum, Base, Arbitrum, Optimism y Polygon de una vez y lo suma todo.",
      },
      sol: {
        nome: "Saldo Solana",
        h1: "Ver el saldo de una dirección Solana, en euros",
        lead: "Pega una dirección Solana y mira el SOL y los tokens que contiene, con su valor en euros. Sin cuenta y solo lectura.",
        metaTitle: "Ver saldo de dirección Solana en euros, sin cuenta",
        metaDescription: "Pega una dirección Solana y mira SOL y tokens con su valor en euros, más el número de NFT. Sin registro, solo lectura, y la dirección no se guarda.",
        le: "Muestra el SOL, los tokens con valor y cuántos NFT tiene la dirección.",
      },
    },
    mostraTitulo: "Qué muestra la herramienta",
    mostra: [
      "El valor total de la dirección, en la moneda que elijas (euros por defecto).",
      `Los ${L.ativos} activos de más valor, con la cantidad y la red de cada uno, y cuántos más quedaron fuera de la lista.`,
      "El número de NFT, en direcciones de Ethereum y Solana.",
      "Solo entran activos con precio conocido y con un valor de al menos 1 dólar. Así quedan fuera los tokens de spam que llegan a los monederos sin que nadie los pida.",
    ],
    privTitulo: "Qué hacemos con la dirección",
    priv: [
      "La usamos para leer la blockchain y devolver el resultado. No la guardamos en nuestros servidores.",
      "Una dirección pública solo permite mirar. Nunca pedimos la frase de recuperación ni la clave privada, y quien las pida no es de fiar.",
      "Si pegas una frase de recuperación o una clave privada por error, el campo se borra y no se envía nada.",
    ],
    naoFazTitulo: "Qué no hace la herramienta",
    naoFaz: [
      "No muestra posiciones en DeFi (préstamos, staking, liquidez) ni la lista de NFT. Eso está disponible dentro de la cuenta.",
      "No lee Cardano ni otras redes fuera de las indicadas.",
      `Tiene un límite de ${L.consultas} consultas cada ${L.minutos} minutos por persona, para que el servicio siga siendo gratuito.`,
    ],
    outrasTitulo: "La misma herramienta, por red",
    guiasTitulo: "¿Y los impuestos?",
    guiasTexto: "Ver el saldo es el primer paso. La pregunta siguiente suele ser cuánto se paga al vender. Tenemos guías por país, con la ley de referencia de cada uno. Están en inglés.",
    guias: [
      { href: "/guides/crypto-tax/spain", texto: "Impuestos cripto en España (en inglés)" },
      { href: "/guides/crypto-tax", texto: "Guías fiscales de 21 países (en inglés)" },
    ],
    ctaTitulo: "¿Quieres seguir este monedero cada día?",
    ctaTexto: "Con una cuenta gratuita añades varios monederos y exchanges, ves la evolución del valor y calculas las ganancias patrimoniales. Sigue siendo solo lectura.",
    ctaBotao: "Crear cuenta gratis",
    faqTitulo: "Preguntas frecuentes",
    faqs: [
      { q: "¿Es seguro pegar mi dirección?", a: "Sí. La dirección pública solo permite ver saldos; con ella no se pueden mover fondos. Nunca escribas la frase de recuperación ni la clave privada, ni aquí ni en otro sitio." },
      { q: "¿Necesito crear una cuenta?", a: "No. La herramienta funciona sin registro y sin email. La cuenta solo hace falta para guardar monederos y ver su evolución." },
      { q: "¿De dónde salen los valores?", a: "Los saldos se leen directamente de la blockchain, a través de Alchemy (Ethereum y redes compatibles), Helius (Solana) y mempool.space (Bitcoin). Los precios son los del momento de la consulta." },
      { q: "¿Por qué falta un token en la lista?", a: `La lista muestra los ${L.ativos} activos de más valor. Quedan fuera los que valen menos de 1 dólar y los que no tienen precio conocido.` },
      { q: "¿Puedo ver la dirección de otra persona?", a: "Puedes ver cualquier dirección pública: la blockchain es pública. Lo que no se puede es saber de quién es una dirección solo por consultarla." },
    ],
  },

  fr: {
    locale: "fr-FR",
    breadcrumbHome: "Accueil",
    breadcrumbLabel: "Fil d'Ariane",
    redes: {
      todas: {
        nome: "Voir le solde d'un portefeuille",
        h1: "Voir le solde d'un portefeuille crypto, en euros et sans compte",
        lead: "Collez l'adresse publique d'un portefeuille Ethereum, Bitcoin ou Solana et voyez ce qu'il contient. Sans inscription, sans rien vous demander, et l'adresse n'est pas conservée sur nos serveurs.",
        metaTitle: "Voir le solde d'un portefeuille crypto, sans compte",
        metaDescription: "Collez une adresse publique Ethereum, Bitcoin ou Solana et voyez le solde en euros. Sans inscription, en lecture seule : ni clés demandées ni adresse conservée.",
        le: "Une adresse qui commence par 0x est lue sur 5 réseaux à la fois : Ethereum, Base, Arbitrum, Optimism et Polygon. Les adresses Bitcoin et Solana sont aussi acceptées.",
      },
      btc: {
        nome: "Solde Bitcoin",
        h1: "Voir le solde d'une adresse Bitcoin, en euros",
        lead: "Collez une adresse Bitcoin (elle commence par bc1, 1 ou 3) et voyez le solde et sa valeur en euros. Sans compte, en lecture seule.",
        metaTitle: "Voir le solde d'une adresse Bitcoin, sans compte",
        metaDescription: "Collez une adresse Bitcoin (bc1, 1 ou 3) et voyez le solde en BTC et en euros. Sans inscription, en lecture seule, et l'adresse n'est pas conservée.",
        le: "Le solde comprend ce qui est déjà confirmé sur la blockchain et ce qui attend encore sa confirmation.",
      },
      eth: {
        nome: "Solde Ethereum",
        h1: "Voir le solde d'une adresse Ethereum, en euros",
        lead: "Collez une adresse qui commence par 0x et voyez l'ETH et les jetons sur 5 réseaux à la fois. Sans compte, en lecture seule.",
        metaTitle: "Voir le solde d'une adresse Ethereum (0x)",
        metaDescription: "Collez une adresse 0x et voyez l'ETH et les jetons sur Ethereum, Base, Arbitrum, Optimism et Polygon, avec leur valeur en euros. Sans inscription.",
        le: "La même adresse 0x fonctionne sur tous les réseaux compatibles. L'outil lit Ethereum, Base, Arbitrum, Optimism et Polygon en une fois et additionne le tout.",
      },
      sol: {
        nome: "Solde Solana",
        h1: "Voir le solde d'une adresse Solana, en euros",
        lead: "Collez une adresse Solana et voyez le SOL et les jetons qu'elle contient, avec leur valeur en euros. Sans compte, en lecture seule.",
        metaTitle: "Voir le solde d'une adresse Solana, sans compte",
        metaDescription: "Collez une adresse Solana et voyez le SOL et les jetons avec leur valeur en euros, ainsi que le nombre de NFT. Sans inscription, en lecture seule.",
        le: "Il affiche le SOL, les jetons qui ont une valeur et le nombre de NFT de l'adresse.",
      },
    },
    mostraTitulo: "Ce que l'outil affiche",
    mostra: [
      "La valeur totale de l'adresse, dans la devise de votre choix (l'euro par défaut).",
      `Les ${L.ativos} actifs de plus grande valeur, avec la quantité et le réseau de chacun, et le nombre d'actifs restés hors de la liste.`,
      "Le nombre de NFT, pour les adresses Ethereum et Solana.",
      "Seuls les actifs dont le prix est connu et qui valent au moins 1 dollar sont retenus. Les jetons de spam, arrivés sans que personne les demande, restent ainsi à l'écart.",
    ],
    privTitulo: "Ce que nous faisons de l'adresse",
    priv: [
      "Nous l'utilisons pour lire la blockchain et renvoyer le résultat. Nous ne la conservons pas sur nos serveurs.",
      "Une adresse publique permet seulement de consulter. Nous ne demandons jamais la phrase de récupération ni la clé privée, et quiconque les demande n'est pas digne de confiance.",
      "Si vous collez par erreur une phrase de récupération ou une clé privée, le champ est effacé et rien n'est envoyé.",
    ],
    naoFazTitulo: "Ce que l'outil ne fait pas",
    naoFaz: [
      "Il n'affiche pas les positions DeFi (prêts, staking, liquidité) ni la liste des NFT. Tout cela est disponible dans un compte.",
      "Il ne lit pas Cardano ni d'autres réseaux que ceux indiqués.",
      `Il est limité à ${L.consultas} consultations toutes les ${L.minutos} minutes par personne, pour que le service reste gratuit.`,
    ],
    outrasTitulo: "Le même outil, par réseau",
    guiasTitulo: "Et les impôts ?",
    guiasTexto: "Voir le solde est la première étape. La question suivante est souvent : combien paie-t-on à la vente ? Nous avons des guides par pays, chacun avec sa loi de référence. Ils sont en anglais.",
    guias: [
      { href: "/guides/crypto-tax/france", texto: "Fiscalité crypto en France (en anglais)" },
      { href: "/guides/crypto-tax", texto: "Guides fiscaux de 21 pays (en anglais)" },
    ],
    ctaTitulo: "Envie de suivre ce portefeuille chaque jour ?",
    ctaTexto: "Avec un compte gratuit, vous ajoutez plusieurs portefeuilles et plateformes, suivez l'évolution de la valeur et calculez les plus-values. Tout reste en lecture seule.",
    ctaBotao: "Créer un compte gratuit",
    faqTitulo: "Questions fréquentes",
    faqs: [
      { q: "Est-il sûr de coller mon adresse ?", a: "Oui. Une adresse publique permet seulement de voir des soldes ; elle ne permet pas de déplacer des fonds. N'écrivez jamais votre phrase de récupération ni votre clé privée, ici ou ailleurs." },
      { q: "Faut-il créer un compte ?", a: "Non. L'outil fonctionne sans inscription et sans e-mail. Le compte sert seulement à enregistrer des portefeuilles et à suivre leur évolution." },
      { q: "D'où viennent les valeurs ?", a: "Les soldes sont lus directement sur la blockchain, via Alchemy (Ethereum et réseaux compatibles), Helius (Solana) et mempool.space (Bitcoin). Les prix sont ceux du moment de la consultation." },
      { q: "Pourquoi un jeton manque-t-il dans la liste ?", a: `La liste affiche les ${L.ativos} actifs de plus grande valeur. Ceux qui valent moins de 1 dollar, ou dont le prix est inconnu, n'y figurent pas.` },
      { q: "Puis-je consulter l'adresse de quelqu'un d'autre ?", a: "Vous pouvez consulter n'importe quelle adresse publique : la blockchain est publique. En revanche, consulter une adresse ne dit pas à qui elle appartient." },
    ],
  },
};

const HREFLANG: Record<Lang, string> = { pt: "pt-PT", en: "en", es: "es", fr: "fr" };

export function saldoMetadata(lang: Lang, rede: RedeSaldo): Metadata {
  const c = SALDO_COPY[lang];
  const r = c.redes[rede];
  const canonical = `${SITE}${saldoUrl(lang, rede)}`;
  const languages: Record<string, string> = {};
  for (const l of LANGS) languages[HREFLANG[l]] = `${SITE}${saldoUrl(l, rede)}`;
  languages["x-default"] = `${SITE}${saldoUrl("en", rede)}`;
  return {
    // Título absoluto (sem o sufixo da marca), como nos guias e comparações: o
    // Google corta por volta dos 60 caracteres.
    title: { absolute: r.metaTitle },
    description: r.metaDescription,
    alternates: { canonical, languages },
    ...socialMeta({ title: r.metaTitle, description: r.metaDescription, url: canonical, type: "website", locale: c.locale, lang }),
  };
}
