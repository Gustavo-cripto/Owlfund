import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sanitizeNext } from "@/lib/auth/redirects";
import { COOKIE_NEXT } from "@/lib/auth/emailRedirect";
import { COOKIE_LANG, contaSemCarteiras, langDoPedido } from "@/lib/auth/contaNova";
import { pageUrl } from "@/lib/i18n/routes";

// Callback do Supabase para o fluxo PKCE (`?code=`): OAuth Google e os emails
// antigos com {{ .ConfirmationURL }}. Os emails novos usam token_hash e vao a
// /api/auth/confirm (funciona noutro aparelho) — a logica de destino e a mesma.
// - `?next=` é passado pelo login/OAuth (allowlist em src/lib/auth/redirects.ts).
//   Os emails (confirmação, ligação mágica) não o levam no URL — vem no cookie
//   `cfa-next`, porque o URL do email é fixo por língua (ver emailRedirect.ts).
// - `?lang=` vem no URL do email: fica no cookie cfa-lang (para a app abrir na
//   lingua certa noutro aparelho) e decide a lingua do /login em caso de erro.
// - Erros do Supabase (`?error=access_denied&error_code=otp_expired`, links
//   abertos noutro browser sem o code_verifier PKCE, código já usado) deixam de
//   ser engolidos: vão para /login?error=… com mensagem e botão de reenvio.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const doCookie = /(?:^|;\s*)cfa-next=([^;]*)/.exec(request.headers.get("cookie") ?? "")?.[1];
  const next = sanitizeNext(searchParams.get("next") ?? (doCookie ? decodeURIComponent(doCookie) : null));
  const lang = langDoPedido(searchParams);
  const limpar = (res: NextResponse) => {
    res.cookies.set(COOKIE_NEXT, "", { path: "/", maxAge: 0 });
    if (lang) res.cookies.set({ ...COOKIE_LANG, value: lang });
    return res;
  };
  const login = pageUrl("login", lang ?? "pt");
  const paraLogin = (kind: "expired" | "confirm") => limpar(NextResponse.redirect(`${origin}${login}?error=${kind}&next=${encodeURIComponent(next)}`));
  const supaError = searchParams.get("error");
  const errorCode = searchParams.get("error_code");

  if (supaError) return paraLogin(errorCode === "otp_expired" ? "expired" : "confirm");

  // Conta sem nada guardado (nunca escreveu em wallet_config) e sem destino
  // pedido: vai direta a Carteiras, que e o passo que falta — e onde o funil
  // perdia 6 em cada 7 contas (set 2026). Quem ja tem carteiras, ou pediu um
  // destino (?next= ou cookie), segue para onde ia.
  let destino = next;
  const pediuDestino = Boolean(searchParams.get("next") || doCookie);

  if (code) {
    try {
      const supabase = await createClient();
      const { data: sessao, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        console.error("[auth/callback] exchange:", error.message);
        return paraLogin("confirm");
      }
      const uid = sessao?.user?.id ?? "";
      if (!pediuDestino && uid) {
        try { if (await contaSemCarteiras(getSupabaseAdmin(), uid)) destino = "/wallets"; } catch { /* sem admin: fica o destino normal */ }
      }
    } catch (e) {
      console.error("[auth/callback]", e instanceof Error ? e.message : e);
      return paraLogin("confirm");
    }
  }

  return limpar(NextResponse.redirect(`${origin}${destino}`));
}
