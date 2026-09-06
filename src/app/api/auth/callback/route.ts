import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sanitizeNext } from "@/lib/auth/redirects";

// Callback do Supabase (confirmação de email, OAuth Google, magic links).
// - `?next=` é passado pelo login (allowlist em src/lib/auth/redirects.ts).
// - Erros do Supabase (`?error=access_denied&error_code=otp_expired`, links
//   abertos noutro browser sem o code_verifier PKCE, código já usado) deixam de
//   ser engolidos: vão para /login?error=… com mensagem e botão de reenvio.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = sanitizeNext(searchParams.get("next"));
  const supaError = searchParams.get("error");
  const errorCode = searchParams.get("error_code");

  if (supaError) {
    const kind = errorCode === "otp_expired" ? "expired" : "confirm";
    return NextResponse.redirect(`${origin}/login?error=${kind}&next=${encodeURIComponent(next)}`);
  }

  if (code) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        console.error("[auth/callback] exchange:", error.message);
        return NextResponse.redirect(`${origin}/login?error=confirm&next=${encodeURIComponent(next)}`);
      }
    } catch (e) {
      console.error("[auth/callback]", e instanceof Error ? e.message : e);
      return NextResponse.redirect(`${origin}/login?error=confirm&next=${encodeURIComponent(next)}`);
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
