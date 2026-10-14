// Contas internas (o dono, testes, agentes): ficam fora das estatísticas de
// contas e do funil. Antes, as contas de teste contavam como clientes — a 14 out
// 2026 havia 11 contas e só 2 eram de pessoas reais, e a API não as distinguia.
//
// Lista na Vercel: CONTAS_INTERNAS (emails separados por vírgula ou espaço);
// os de ADMIN_EMAILS contam também como internos.

function lista(nome: string): string[] {
  return (process.env[nome] ?? "").split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean);
}

export function emailsInternos(): Set<string> {
  return new Set([...lista("CONTAS_INTERNAS"), ...lista("ADMIN_EMAILS")]);
}

/** O email é de uma conta interna? Sem email (login por carteira) não é. */
export function eContaInterna(email: string | null | undefined, internos: Set<string> = emailsInternos()): boolean {
  return Boolean(email) && internos.has(String(email).trim().toLowerCase());
}
