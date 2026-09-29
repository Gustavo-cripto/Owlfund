// O pedido veio de uma página do próprio site? Decide-se pelos cabeçalhos que o
// BROWSER põe e que uma página de outro site não consegue falsificar.
// Usado pelo POST de /api/auth/confirm (o que gasta o link do email).
export function eDoProprioSite(h: { get(n: string): string | null }, origin: string): boolean {
  const sitio = h.get("sec-fetch-site");
  if (sitio && sitio !== "same-origin") return false;
  const origem = h.get("origin");
  if (origem && origem !== "null" && origem !== origin) return false;
  return Boolean(sitio || origem);   // sem nenhum dos dois não há prova
}
