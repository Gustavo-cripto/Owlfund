import type { Lang } from "@/lib/i18n/translations";

// Para onde o Supabase manda quem clica num email de autenticação.
//
// O URL é FIXO por língua (…/callback?lang=pt) e não leva o `next`: os modelos
// de email do Supabase só conseguem comparar o `.RedirectTo` por igualdade
// ({{ if eq .RedirectTo "…?lang=pt" }}), e é assim que cada email sai na língua
// do cliente. O destino depois do login vai num cookie de 1 hora, que o
// callback (src/app/api/auth/callback) lê e apaga.
//
// Os quatro URLs exatos estão em supabase/email-templates/README.md — quem
// mudar isto tem de mudar lá também.
export const COOKIE_NEXT = "cfa-next";

export function destinoDoEmail(lang: Lang, next: string): string {
  document.cookie = `${COOKIE_NEXT}=${encodeURIComponent(next)}; path=/; max-age=3600; SameSite=Lax`;
  return `${window.location.origin}/api/auth/callback?lang=${lang}`;
}

/** Recuperação de palavra-passe: a página /reset-password troca o código ela própria. */
export function destinoDoReset(lang: Lang): string {
  return `${window.location.origin}/reset-password?lang=${lang}`;
}
