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
