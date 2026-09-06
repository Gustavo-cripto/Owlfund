// Limites por plano — FONTE ÚNICA (antes havia valores diferentes no cliente,
// no /api/chat e no /api/usage). O servidor é a autoridade; o cliente só mostra.

export const FREE_CHAT_LIMIT = 1;        // análises IA do "Chain" por mês (Free)
export const ANON_DAILY_CHAT_LIMIT = 10; // visitantes, por IP e por dia
export const ACCOUNT_LIMITS = { free: 1, pro: 3, premium: 10 } as const;
export const FREE_WALLET_LIMIT = 3;
export const FREE_WHALE_LIMIT = 3;
export const API_CHAT_PER_DAY = 50;      // /api/v1/chat + MCP ask_ai (por conta)
