// Autenticacao do endpoint de administracao (/api/v1/admin/*). Protege dados
// agregados do site (contas, planos, chaves) atras de um segredo dedicado 
// separado das chaves cfa_live_ dos clientes e do CRON_SECRET. Comparacao em
// tempo constante (anti timing-attack). Sem ADMIN_STATS_TOKEN definido, recusa
// sempre (fail closed)  dados internos nunca ficam expostos por engano.

function timingSafeEqual(a: string, b: string): boolean {
  // Padding para nao vazar o comprimento pela duracao da comparacao.
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// True se o pedido traz o ADMIN_STATS_TOKEN correto no header Authorization.
export function verifyAdminAuth(request: Request): boolean {
  const secret = process.env.ADMIN_STATS_TOKEN;
  if (!secret) return false;
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;
  return timingSafeEqual(token, secret);
}
