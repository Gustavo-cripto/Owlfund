// Fonte única dos caminhos protegidos (middleware) e dos destinos aceites em
// `?next=` (login, callback OAuth). Antes havia 3 listas divergentes — o login
// descartava /mercado, /fiscalidade, … e o OAuth perdia sempre o next.

export const PROTECTED_PATHS = [
  "/dashboard", "/wallets", "/portfolio", "/mercado", "/smart-money", "/fiscalidade",
  "/fire", "/account", "/gestor", "/historico", "/admin", "/crypto",
] as const;

// Além das protegidas, páginas públicas para onde faz sentido voltar após login.
const EXTRA_NEXT = ["/beta", "/pricing", "/developers", "/como-funciona"] as const;

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
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
