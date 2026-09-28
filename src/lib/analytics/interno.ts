// Visitas "internas" (o dono, os agentes, testes) ficam fora das contas.
//
// Porquê: a 28 set a leitura do funil mostrou 113 pessoas em 7 dias no Vercel
// Analytics, mas as 30 que abriram /en/beta eram TODAS Mac/iPhone, 63% "EUA" e
// com o painel da Vercel como origem — quase de certeza o próprio dono e os
// agentes a testar. Com as nossas visitas misturadas, não há leitura possível.
//
// Como se usa: abrir o site UMA vez em cada aparelho com ?interno=1 (desliga
// com ?interno=0). As páginas /admin marcam sozinhas. Fica um cookie de 1 ano
// que o middleware (page_views), a rota /api/evento e o Vercel Analytics
// respeitam.

export const COOKIE_INTERNO = "cfa-interno";
const UM_ANO = 31_536_000;

/** O pedido/cookie vem de uma visita interna? (servidor e cliente) */
export function eInterno(cookies: string | null | undefined): boolean {
  return new RegExp(`(?:^|;\\s*)${COOKIE_INTERNO}=1(?:;|$)`).test(cookies ?? "");
}

/** Liga/desliga a marca neste browser (só no cliente). */
export function marcarInterno(ligar: boolean): void {
  if (typeof document === "undefined") return;
  const seguro = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = ligar
    ? `${COOKIE_INTERNO}=1; path=/; max-age=${UM_ANO}; SameSite=Lax${seguro}`
    : `${COOKIE_INTERNO}=; path=/; max-age=0; SameSite=Lax${seguro}`;
}
