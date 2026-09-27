// Repor a palavra-passe noutro aparelho (lote G, set 2026).
//
// O email de recuperação passou de {{ .ConfirmationURL }} (PKCE: só abre no
// browser que pediu) para /api/auth/confirm?token_hash=…&type=recovery&lang=xx.
// A rota faz o verifyOtp no servidor — a sessão fica criada — e manda a pessoa
// para /reset-password. A página só pode mostrar o formulário a quem chegou
// por um link de recuperação, e não a qualquer sessão normal (um computador
// desbloqueado não deve bastar para trocar a palavra-passe). A prova é este
// cookie curto, com o id do utilizador que o link verificou.
//
// Sem dependências: usado pela rota (servidor), pela página (cliente) e
// testado em scripts/testes/recuperacao.test.ts.

export const COOKIE_RECUPERACAO = "cfa-recovery";
/** 15 minutos: chega para escrever a palavra-passe, não fica esquecido no browser. */
export const RECUPERACAO_MAX_AGE = 900;

const LANGS = ["pt", "en", "es", "fr"] as const;
type LangRec = (typeof LANGS)[number];

/**
 * Para onde vai quem abriu um link de recuperação já verificado.
 *
 * Hoje só existe /reset-password (sem versão por língua); o `?lang=` faz a
 * página abrir na língua do email. Se um dia houver /en/reset-password, é aqui
 * que se muda.
 */
export function destinoDaRecuperacao(lang: string | null | undefined): string {
  const l: LangRec = LANGS.includes(lang as LangRec) ? (lang as LangRec) : "pt";
  return `/reset-password?lang=${l}`;
}

/**
 * Destino depois do verifyOtp em /api/auth/confirm. A recuperação ignora o
 * `next` e o desvio de conta nova para /wallets: quem pediu para repor a
 * palavra-passe tem de cair no formulário, não no painel.
 */
export function destinoDaConfirmacao(o: { type: string; lang: string | null; next: string; contaNova: boolean; pediuDestino: boolean }): string {
  if (o.type === "recovery") return destinoDaRecuperacao(o.lang);
  if (!o.pediuDestino && o.contaNova) return "/wallets";
  return o.next;
}

/** Valor de um cookie numa string `document.cookie` / cabeçalho Cookie. */
export function lerCookie(cookies: string, nome: string): string | null {
  for (const parte of cookies.split(";")) {
    const i = parte.indexOf("=");
    if (i < 0) continue;
    if (parte.slice(0, i).trim() !== nome) continue;
    try { return decodeURIComponent(parte.slice(i + 1).trim()); } catch { return null; }
  }
  return null;
}

/**
 * A sessão atual veio de um link de recuperação? Só se o cookie existir e for
 * do MESMO utilizador da sessão — um cookie esquecido de outra pessoa no mesmo
 * browser não abre o formulário.
 */
export function sessaoDeRecuperacao(cookies: string, userId: string | null | undefined): boolean {
  if (!userId) return false;
  const v = lerCookie(cookies, COOKIE_RECUPERACAO);
  return Boolean(v) && v === userId;
}
