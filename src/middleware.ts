import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest, type NextFetchEvent } from "next/server";

const protectedPaths = ["/dashboard", "/wallets", "/portfolio", "/mercado", "/smart-money", "/fiscalidade", "/fire", "/account", "/gestor", "/historico"];

function isProtectedPath(pathname: string): boolean {
  return protectedPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

// Regista uma visualizacao de pagina (fire-and-forget via waitUntil, sem atrasar
// a resposta). So conta navegacoes reais: GET, sem prefetch, fora de /api e das
// rotas de auth. Escreve com o service role (bypassa RLS da tabela page_views).
function trackPageView(request: NextRequest, event: NextFetchEvent): void {
  if (request.method !== "GET") return;
  const isPrefetch =
    request.headers.get("next-router-prefetch") === "1" ||
    request.headers.get("purpose") === "prefetch";
  if (isPrefetch) return;

  const path = request.nextUrl.pathname;
  if (path.startsWith("/api") || path.startsWith("/login") || path.startsWith("/auth")) return;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return;

  event.waitUntil(
    fetch(`${url}/rest/v1/page_views`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ path }),
    }).catch(() => {}),
  );
}

export async function middleware(request: NextRequest, event: NextFetchEvent) {
  let response = NextResponse.next({ request });

  trackPageView(request, event);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: Record<string, unknown>) {
        request.cookies.set({ name, value, ...options });
        response = NextResponse.next({ request });
        response.cookies.set({ name, value, ...options });
      },
      remove(name: string, options: Record<string, unknown>) {
        request.cookies.set({ name, value: "", ...options });
        response = NextResponse.next({ request });
        response.cookies.set({ name, value: "", ...options });
      },
    },
  });

  // Renova a sessao (refresh token) e atualiza os cookies na response
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (isProtectedPath(request.nextUrl.pathname) && !user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
