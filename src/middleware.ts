import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest, type NextFetchEvent } from "next/server";
import { isProtectedPath } from "@/lib/auth/redirects";
import { isBotUserAgent } from "@/lib/analytics/bots";
import { pageFromPath, pageUrl } from "@/lib/i18n/routes";
import type { Lang } from "@/lib/i18n/translations";

// Regista uma visualizacao de pagina (fire-and-forget via waitUntil, sem atrasar
// a resposta). So conta navegacoes reais: GET, sem prefetch, fora de /api e das
// rotas de auth. Delega a escrita a /api/track (runtime Node, com service role) -
// o Edge nao tem acesso fiavel ao SUPABASE_SERVICE_ROLE_KEY.
function trackPageView(request: NextRequest, event: NextFetchEvent): void {
  if (request.method !== "GET") return;
  const isPrefetch =
    request.headers.get("next-router-prefetch") === "1" ||
    request.headers.get("purpose") === "prefetch";
  if (isPrefetch) return;

  const path = request.nextUrl.pathname;
  // So paginas: fora /api, /auth e ficheiros estaticos/crawler (robots.txt,
  // sitemap.xml, e qualquer path com extensao) - esses nao sao page views.
  //
  // /login E contado: era o unico passo do funil invisivel, e sem ele nao da
  // para saber quantos dos que veem /beta chegam sequer a criar conta. Guardamos
  // so o pathname (nunca a query nem o User-Agent), por isso nao ha risco de
  // apanhar tokens. /auth continua de fora: e o callback do OAuth.
  if (path.startsWith("/api") || path.startsWith("/auth") || path.includes(".")) return;

  // TRACK_SECRET (quando definido) prova a /api/track que o pedido vem daqui e
  // não de fora — o beacon escreve com o service role, por isso não pode aceitar
  // pedidos arbitrários da internet.
  const trackSecret = (process.env.TRACK_SECRET ?? "").trim();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (trackSecret) headers["x-track-secret"] = trackSecret;

  event.waitUntil(
    fetch(new URL("/api/track", request.url), {
      method: "POST",
      headers,
      // Origem do link (?src=reddit, ?utm_source=…): so letras/numeros/tracos,
    // ate 40 caracteres. E o que permite ao marketing saber que canal traz
    // visitas e inscricoes — sem isto via um total sem rosto.
    body: JSON.stringify({
      path,
      bot: isBotUserAgent(request.headers.get("user-agent")),
      src: (request.nextUrl.searchParams.get("src") ?? request.nextUrl.searchParams.get("utm_source") ?? "")
        .replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40),
    }),
    }).catch(() => {}),
  );
}

// Idioma pedido pelo browser, entre os que o site tem.
//
// Devolve null quando nao ha cabecalho, quando o primeiro reconhecido e o
// portugues, ou quando nenhum e reconhecido. Sem cabecalho e caso comum e
// deliberado: o Googlebot rastreia assim, e queremos que continue a ver a
// versao portuguesa em "/" e a seguir os hreflang para as outras — nao que
// seja atirado para /en.
function langFromHeader(header: string | null): Lang | null {
  if (!header) return null;
  const preferencias = header
    .split(",")
    .map((parte) => {
      const [tag, ...params] = parte.trim().split(";");
      const q = params.find((x) => x.trim().startsWith("q="));
      return { tag: tag.trim().toLowerCase(), q: q ? Number(q.split("=")[1]) : 1 };
    })
    .filter((x) => x.tag && Number.isFinite(x.q))
    .sort((a, b) => b.q - a.q);
  for (const { tag } of preferencias) {
    const base = tag.split("-")[0];
    if (base === "pt") return null;                       // ja e o idioma de "/"
    if (base === "en" || base === "es" || base === "fr") return base as Lang;
  }
  return null;
}

/**
 * Primeira visita a uma pagina publica sem prefixo de idioma: manda a pessoa
 * para a versao na lingua do browser.
 *
 * Sem isto, o site respondia em portugues a toda a gente — o /en existia mas so
 * la chegava quem reparasse na bandeira. Anulava o alcance dos guias em ingles
 * e dos anuncios em comunidades internacionais.
 *
 * Guardas: so paginas publicas, so sem prefixo, e NUNCA por cima de uma escolha
 * ja feita (o cookie cfa-lang manda sempre). 307 e nao 301: a escolha do
 * visitante pode mudar, e um permanente ficaria preso na cache do browser.
 */
function idiomaRedirect(request: NextRequest): URL | null {
  const path = request.nextUrl.pathname;
  const aqui = pageFromPath(path);
  if (!aqui || aqui.lang !== "pt") return null;           // so paginas publicas, so sem prefixo
  // O login fica de fora: nao e pagina de descoberta e esta no meio de fluxos
  // de autenticacao (?next=, ?error=, callback do OAuth). Mais a perder do que
  // a ganhar. Quem vem da landing inglesa ja recebe /en/login pelo link.
  if (aqui.page === "login") return null;
  if (request.cookies.get("cfa-lang")) return null;       // escolha ja feita manda
  const lang = langFromHeader(request.headers.get("accept-language"));
  if (!lang) return null;
  const destino = new URL(pageUrl(aqui.page, lang), request.url);
  destino.search = request.nextUrl.search;                // nao perder ?next=, ?mode=…
  return destino;
}

export async function middleware(request: NextRequest, event: NextFetchEvent) {
  // HEAD tem de responder como GET (verificadores de links e alguns crawlers
  // usam-no); o resto dos metodos nunca e navegacao.
  const navegacao = request.method === "GET" || request.method === "HEAD";
  const paraOutroIdioma = navegacao ? idiomaRedirect(request) : null;
  if (paraOutroIdioma) {
    const redirect = NextResponse.redirect(paraOutroIdioma, 307);
    // Sem isto a cache serve a lingua do primeiro visitante a todos os
    // seguintes — um portugues apanharia a pagina inglesa.
    redirect.headers.set("Vary", "Accept-Language, Cookie");
    // A visita e contada no destino. Contar aqui tambem duplicava a mesma
    // pessoa em duas linhas e estragava exatamente os numeros do funil que
    // esta alteracao existe para melhorar.
    return redirect;
  }

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
