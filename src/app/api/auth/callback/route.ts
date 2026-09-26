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

  // Conta acabada de criar (ligacao por email, Google, confirmacao) e sem
  // destino pedido: vai direta a Carteiras, que e o passo que falta — e onde
  // o funil perdia 6 em cada 7 contas (set 2026). Quem ja tinha conta, ou
  // pediu um destino (?next= ou cookie), segue para onde ia.
  let destino = next;
  const pediuDestino = Boolean(searchParams.get("next") || doCookie);

  if (code) {
    try {
      const supabase = await createClient();
      const { data: sessao, error } = await supabase.auth.exchangeCodeForSession(code);
      const criada = sessao?.user?.created_at ? new Date(sessao.user.created_at).getTime() : 0;
      if (!error && !pediuDestino && criada && Date.now() - criada < 15 * 60_000) destino = "/wallets";
      if (error) {
        console.error("[auth/callback] exchange:", error.message);
        return limpar(NextResponse.redirect(`${origin}/login?error=confirm&next=${encodeURIComponent(next)}`));
      }
    } catch (e) {
      console.error("[auth/callback]", e instanceof Error ? e.message : e);
      return limpar(NextResponse.redirect(`${origin}/login?error=confirm&next=${encodeURIComponent(next)}`));
    }
  }

  return limpar(NextResponse.redirect(`${origin}${destino}`));
}
