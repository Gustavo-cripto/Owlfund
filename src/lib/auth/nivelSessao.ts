// O 2FA tem de valer no servidor (auditoria 6 nov 2026). Até aqui só o browser o
// pedia: com a palavra-passe roubada, um token aal1 lia as carteiras, criava chaves
// de API e apagava a conta sem nunca ver o ecrã do código.
//
// A regra só se aplica a quem tem um fator verificado: uma conta sem 2FA continua a
// entrar como sempre, e nunca fica trancada por isto. O aal vem do JWT, que a chamada
// a getUser já validou junto do Supabase; os fatores vêm do utilizador devolvido.
// Sem dependências de Node: o middleware corre no Edge.

export const CODIGO_2FA = "AAL2_REQUIRED";

type ComFatores = { factors?: ReadonlyArray<{ status?: string }> | null } | null | undefined;

export function temFatorVerificado(user: ComFatores): boolean {
  return (user?.factors ?? []).some((f) => f.status === "verified");
}

export function aalDoToken(token: string | null | undefined): string | null {
  try {
    const parte = (token ?? "").split(".")[1] ?? "";
    const payload = JSON.parse(atob(parte.replace(/-/g, "+").replace(/_/g, "/"))) as { aal?: unknown };
    return typeof payload.aal === "string" ? payload.aal : null;
  } catch {
    return null;
  }
}

/** Esta sessão precisa de passar o desafio do 2FA? Sem token legível, precisa. */
export function falta2fa(user: ComFatores, token: string | null | undefined): boolean {
  return temFatorVerificado(user) && aalDoToken(token) !== "aal2";
}

type ComSessao = { auth: { getSession(): Promise<{ data: { session: { access_token: string } | null } }> } };

/** O mesmo para uma sessão por cookie. Quem não tem fatores não lê a sessão. */
export async function falta2faNaSessao(supabase: ComSessao, user: ComFatores): Promise<boolean> {
  if (!temFatorVerificado(user)) return false;
  try {
    const { data } = await supabase.auth.getSession();
    return falta2fa(user, data.session?.access_token);
  } catch {
    return true;
  }
}

// O que uma sessão aal1 tem mesmo de poder fazer: acabar de entrar (o acolhimento e
// as ligações do email) e recuperar a conta com um código de recuperação, porque
// quem perdeu o telemóvel só tem isso. Lista fechada, sem prefixos: cada rota nova
// fica protegida sem ninguém se lembrar disso.
const ROTAS_SEM_2FA = new Set(["/api/auth/boas-vindas", "/api/auth/callback", "/api/auth/confirm", "/api/mfa/recover"]);

export function rotaAceitaSem2fa(caminho: string): boolean {
  return ROTAS_SEM_2FA.has(caminho.replace(/\/$/, ""));
}
