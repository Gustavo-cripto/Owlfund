// Limites por plano — FONTE ÚNICA (antes havia valores diferentes no cliente,
// no /api/chat e no /api/usage). O servidor é a autoridade; o cliente só mostra.

export const FREE_AI_LIMIT = 3;          // análises IA por mês no Free (Chain + análise do portefólio, contador único)
export const FREE_CHAT_LIMIT = FREE_AI_LIMIT; // alias antigo (UI)
export const ANON_DAILY_CHAT_LIMIT = 10; // visitantes, por IP e por dia
export const ACCOUNT_LIMITS = { free: 1, pro: 3, premium: 10 } as const;
export const FREE_WALLET_LIMIT = 3;
export const FREE_WHALE_LIMIT = 3;
export const API_CHAT_PER_DAY = 50;      // /api/v1/chat + MCP ask_ai (por conta)
export const GESTOR_DAILY_LIMIT = 150;   // Gestor IA (Premium): uso razoável por conta e por dia

// Data-limite do beta — FONTE ÚNICA (estava repetida em 4 sítios de 3 ficheiros;
// bastava esquecer um para a página dizer "aberto" e a API responder "fechado").
// A partir dela não se aceitam NOVOS testers; quem já tem plano mantém os dias
// que faltam. NEXT_PUBLIC_BETA_CUTOFF (ISO) substitui-a; vazia = sempre aberto.
// É NEXT_PUBLIC_: mudar a env exige novo deploy para o cliente a ver.
export const BETA_CUTOFF_ISO = process.env.NEXT_PUBLIC_BETA_CUTOFF ?? "2027-01-15T23:59:59Z";
export function betaAberto(now = Date.now()): boolean {
  if (!BETA_CUTOFF_ISO) return true;
  const fim = new Date(BETA_CUTOFF_ISO).getTime();
  return Number.isNaN(fim) || now <= fim;
}
