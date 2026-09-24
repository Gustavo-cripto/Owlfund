import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sanitizeNext } from "@/lib/auth/redirects";
import { COOKIE_NEXT } from "@/lib/auth/emailRedirect";

// Callback do Supabase (confirmação de email, OAuth Google, magic links).
// - `?next=` é passado pelo login/OAuth (allowlist em src/lib/auth/redirects.ts).
//   Os emails (confirmação, ligação mágica) não o levam no URL — vem no cookie
//   `cfa-next`, porque o URL do email é fixo por língua (ver emailRedirect.ts).
// - Erros do Supabase (`?error=access_denied&error_code=otp_expired`, links
//   abertos noutro browser sem o code_verifier PKCE, código já usado) deixam de
//   ser engolidos: vão para /login?error=… com mensagem e botão de reenvio.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const doCookie = /(?:^|;\s*)cfa-next=([^;]*)/.exec(request.headers.get("cookie") ?? "")?.[1];
  const next = sanitizeNext(searchParams.get("next") ?? (doCookie ? decodeURIComponent(doCookie) : null));
  const limpar = (res: NextResponse) => { res.cookies.set(COOKIE_NEXT, "", { path: "/", maxAge: 0 }); return res; };
  const supaError = searchParams.get("error");
  const errorCode = searchParams.get("error_code");

  if (supaError) {
    const kind = errorCode === "otp_expired" ? "expired" : "confirm";
    return limpar(NextResponse.redirect(`${origin}/login?error=${kind}&next=${encodeURIComponent(next)}`));
  }

  if (code) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        console.error("[auth/callback] exchange:", error.message);
        return limpar(NextResponse.redirect(`${origin}/login?error=confirm&next=${encodeURIComponent(next)}`));
      }
    } catch (e) {
      console.error("[auth/callback]", e instanceof Error ? e.message : e);
      return limpar(NextResponse.redirect(`${origin}/login?error=confirm&next=${encodeURIComponent(next)}`));
    }
  }

  return limpar(NextResponse.redirect(`${origin}${next}`));
}
