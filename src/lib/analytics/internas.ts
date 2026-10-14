// Contas internas (o dono, testes, agentes): ficam fora das estatísticas de
// contas e do funil. Antes, as contas de teste contavam como clientes — a 14 out
// 2026 havia 11 contas e só 2 eram de pessoas reais, e a API não as distinguia.
//
// Lista na Vercel: CONTAS_INTERNAS (emails ou ids de conta, separados por vírgula
// ou espaço — o id serve para as contas sem email, criadas por carteira); os de
// ADMIN_EMAILS contam também como internos.

function lista(nome: string): string[] {
  return (process.env[nome] ?? "").split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean);
}

export function emailsInternos(): Set<string> {
  return new Set([...lista("CONTAS_INTERNAS"), ...lista("ADMIN_EMAILS")]);
}

/** "nome+teste2@x.com" → "nome@x.com": os aliases de teste contam como o email da lista. */
function semAlias(email: string): string {
  return email.replace(/\+[^@]*@/, "@");
}

/** A conta é interna? Pelo email (ou o mesmo sem o +alias) ou, nas contas sem email (carteira), pelo id. */
export function eContaInterna(email: string | null | undefined, internos: Set<string> = emailsInternos(), id?: string | null): boolean {
  const e = email ? String(email).trim().toLowerCase() : "";
  if (e && (internos.has(e) || internos.has(semAlias(e)))) return true;
  return Boolean(id) && internos.has(String(id).trim().toLowerCase());
}
