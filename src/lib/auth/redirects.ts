// Fonte única dos caminhos protegidos (middleware) e dos destinos aceites em
// `?next=` (login, callback OAuth). Antes havia 3 listas divergentes — o login
// descartava /mercado, /fiscalidade, … e o OAuth perdia sempre o next.

export const PROTECTED_PATHS = [
  "/dashboard", "/wallets", "/portfolio", "/mercado", "/smart-money", "/fiscalidade",
  "/fire", "/account", "/gestor", "/historico", "/admin", "/crypto",
] as const;

// Além das protegidas, páginas públicas para onde faz sentido voltar após login.
const EXTRA_NEXT = ["/beta", "/pricing", "/developers", "/como-funciona"] as const;

/**
 * O caminho tal como o Next o vai encaminhar: ele descodifica antes de escolher a
 * rota, e sem isto /%61dmin/beta abria a página sem sessão (auditoria 6 nov 2026).
 * Só os códigos ASCII, que são os únicos que podem formar um caminho protegido;
 * assim um "%" malformado nunca lança nem dá 500 no middleware.
 */
export function caminhoDescodificado(pathname: string): string {
  let atual = pathname;
  for (let i = 0; i < 3; i++) {
    const seguinte = atual.replace(/%([0-7][0-9a-f])/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
    if (seguinte === atual) break;
    atual = seguinte;
  }
  return atual;
}

export function isProtectedPath(pathname: string): boolean {
  // Os pré-carregamentos do Next pedem a mesma página com sufixo
  // (/portfolio.rsc, /portfolio.segments/_full.segment.rsc): contam como ela.
  const pagina = caminhoDescodificado(pathname).replace(/\.(?:segments\/.*|prefetch\.rsc|rsc)$/, "");
  return PROTECTED_PATHS.some((p) => pagina === p || pagina.startsWith(`${p}/`));
}

/** Devolve um caminho relativo seguro (sem open redirect) ou o fallback. */
export function sanitizeNext(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next) return fallback;
  let path = next.trim();
  try { path = decodeURIComponent(path); } catch { /* mantém */ }
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("://") || /[\r\n\\]/.test(path)) return fallback;
  const base = path.split(/[?#]/)[0];
  const ok = [...PROTECTED_PATHS, ...EXTRA_NEXT].some((p) => base === p || base.startsWith(`${p}/`));
  return ok ? path : fallback;
}
