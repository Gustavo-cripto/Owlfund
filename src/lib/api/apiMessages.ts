// Mensagens de erro das rotas de API, nas 4 línguas do site.
//
// Porquê aqui e não nas traduções do cliente: várias rotas devolvem
// `{ error: "..." }` e o ecrã mostra essa frase tal e qual (`data.error ?? t(...)`),
// por isso a string do servidor ganha sempre. Enquanto viveram em português
// dentro de cada `route.ts`, um utilizador em inglês recebia "Endereço
// obrigatório." no meio da interface traduzida.
//
// O idioma vem do cookie `cfa-lang`, escrito pelo seletor de idioma. É só uma
// preferência de apresentação — nunca uma decisão de autorização.

import type { Lang } from "@/lib/i18n/translations";

const LANGS: readonly Lang[] = ["pt", "en", "es", "fr"];

/** Idioma da app para este pedido. Cai em português quando não há cookie. */
export function apiLang(req: Request): Lang {
  const cookie = req.headers.get("cookie") ?? "";
  const m = /(?:^|;\s*)cfa-lang=([a-z]{2})/.exec(cookie);
  const fromCookie = m?.[1] as Lang | undefined;
  if (fromCookie && LANGS.includes(fromCookie)) return fromCookie;
  // Alguns pedidos (chat, briefing) já enviam ?lang= explicitamente.
  try {
    const q = new URL(req.url).searchParams.get("lang") as Lang | null;
    if (q && LANGS.includes(q)) return q;
  } catch { /* URL relativa em testes */ }
  return "pt";
}

type Msg = Record<Lang, string>;
const M = (pt: string, en: string, es: string, fr: string): Msg => ({ pt, en, es, fr });

export const API_MESSAGES = {
  address_required: M("Endereço obrigatório.", "Address required.", "Dirección obligatoria.", "Adresse obligatoire."),
  address_invalid: M("Endereço inválido.", "Invalid address.", "Dirección no válida.", "Adresse non valide."),
  btc_address_invalid: M("Endereço BTC inválido.", "Invalid BTC address.", "Dirección BTC no válida.", "Adresse BTC non valide."),
  chain_invalid: M("Rede inválida.", "Invalid chain.", "Red no válida.", "Réseau non valide."),
  chain_invalid_list: M(
    "Rede inválida. Usa eth, sol, btc ou ada.",
    "Invalid chain. Use eth, sol, btc or ada.",
    "Red no válida. Usa eth, sol, btc o ada.",
    "Réseau non valide. Utilisez eth, sol, btc ou ada.",
  ),
  btc_balance_failed: M(
    "Falha ao consultar o saldo BTC.",
    "Could not fetch the BTC balance.",
    "No se pudo consultar el saldo BTC.",
    "Impossible de consulter le solde BTC.",
  ),
  nft_provider_down: M(
    "Fornecedor de NFTs (Alchemy) indisponível. Tenta mais tarde.",
    "The NFT provider (Alchemy) is unavailable. Try again later.",
    "El proveedor de NFT (Alchemy) no está disponible. Inténtalo más tarde.",
    "Le fournisseur de NFT (Alchemy) est indisponible. Réessayez plus tard.",
  ),
  cardano_nfts_unconfigured: M(
    "NFTs de Cardano por configurar no servidor.",
    "Cardano NFTs are not configured on the server.",
    "Los NFT de Cardano no están configurados en el servidor.",
    "Les NFT Cardano ne sont pas configurés sur le serveur.",
  ),
  balances_provider_missing: M(
    "Sem fornecedor de saldos configurado no servidor.",
    "No balance provider is configured on the server.",
    "No hay proveedor de saldos configurado en el servidor.",
    "Aucun fournisseur de soldes n'est configuré sur le serveur.",
  ),
  prices_failed: M(
    "Não foi possível obter as cotações agora.",
    "Could not fetch prices right now.",
    "No se pudieron obtener las cotizaciones ahora.",
    "Impossible d'obtenir les cours pour le moment.",
  ),
  ai_unconfigured: M(
    "Serviço de IA por configurar.",
    "The AI service is not configured.",
    "El servicio de IA no está configurado.",
    "Le service d'IA n'est pas configuré.",
  ),
  ai_failed: M(
    "Não foi possível gerar a análise agora. Tenta novamente.",
    "Could not generate the analysis right now. Please try again.",
    "No se pudo generar el análisis ahora. Inténtalo de nuevo.",
    "Impossible de générer l'analyse pour le moment. Réessayez.",
  ),
  rate_limited: M("Demasiados pedidos.", "Too many requests.", "Demasiadas solicitudes.", "Trop de requêtes."),
  not_authenticated: M("Não autenticado.", "Not authenticated.", "No autenticado.", "Non authentifié."),
  no_subscription: M(
    "Sem subscrição ativa.",
    "No active subscription.",
    "Sin suscripción activa.",
    "Aucun abonnement actif.",
  ),
  sync_failed: M(
    "Não foi possível sincronizar a subscrição.",
    "Could not sync the subscription.",
    "No se pudo sincronizar la suscripción.",
    "Impossible de synchroniser l'abonnement.",
  ),
  webhook_url_invalid: M(
    "URL inválido — tem de começar por https://",
    "Invalid URL — it must start with https://",
    "URL no válida — debe empezar por https://",
    "URL non valide — elle doit commencer par https://",
  ),
  briefing_requires_pro: M(
    "O briefing diário requer o Plano Pro.",
    "The daily briefing requires the Pro plan.",
    "El briefing diario requiere el Plan Pro.",
    "Le briefing quotidien nécessite le plan Pro.",
  ),
  mfa_too_many: M(
    "Demasiadas tentativas. Espera 15 minutos.",
    "Too many attempts. Wait 15 minutes.",
    "Demasiados intentos. Espera 15 minutos.",
    "Trop de tentatives. Attendez 15 minutes.",
  ),
  mfa_code_invalid: M(
    "Código inválido ou já usado.",
    "Invalid or already used code.",
    "Código no válido o ya usado.",
    "Code non valide ou déjà utilisé.",
  ),
  payments_frozen: M(
    "Os pagamentos abrem no lançamento. Durante o beta o acesso é pelo convite em /beta.",
    "Payments open at launch. During the beta, access is via the invite at /beta.",
    "Los pagos se abren en el lanzamiento. Durante la beta, el acceso es por la invitación en /beta.",
    "Les paiements ouvriront au lancement. Pendant la bêta, l'accès se fait par l'invitation sur /beta.",
  ),
  address_invalid_for_chain: M(
    "Endereço inválido para {chain}.",
    "Invalid address for {chain}.",
    "Dirección no válida para {chain}.",
    "Adresse non valide pour {chain}.",
  ),
  token_unsupported: M(
    "Token não suportado: {token}",
    "Unsupported token: {token}",
    "Token no soportado: {token}",
    "Jeton non pris en charge : {token}",
  ),
  server_unconfigured: M(
    "Funcionalidade por configurar no servidor.",
    "This feature is not configured on the server.",
    "Funcionalidad no configurada en el servidor.",
    "Fonctionnalité non configurée sur le serveur.",
  ),
  code_missing: M("Código em falta.", "Missing code.", "Falta el código.", "Code manquant."),
} as const;

export type ApiMessageKey = keyof typeof API_MESSAGES;

/**
 * Mensagem já na língua do pedido. `vars` substitui os `{marcadores}` do texto
 * (ex.: `apiMsg(req, "address_invalid_for_chain", { chain })`).
 */
export function apiMsg(req: Request, key: ApiMessageKey, vars?: Record<string, string>): string {
  let out: string = API_MESSAGES[key][apiLang(req)];
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.replace(`{${k}}`, v);
  return out;
}
