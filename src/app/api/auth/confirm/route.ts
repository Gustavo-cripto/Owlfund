import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sanitizeNext } from "@/lib/auth/redirects";
import { COOKIE_NEXT } from "@/lib/auth/emailRedirect";
import { COOKIE_LANG, contaSemCarteiras, langDoPedido } from "@/lib/auth/contaNova";
import { pageUrl } from "@/lib/i18n/routes";

// Confirmacao de email e ligacao magica por `token_hash` (modelos em
// supabase/email-templates/*.html): /api/auth/confirm?token_hash=…&type=…&lang=xx
//
// PORQUE: o fluxo PKCE ({{ .ConfirmationURL }} → ?code=) so funciona no browser
// que pediu o email, porque o code_verifier fica la guardado. Quem pedia a
// ligacao no portatil e a abria no telemovel via sempre "link invalido". O
// verifyOtp com token_hash e verificado no servidor e funciona em qualquer
// aparelho. O destino (next/cookie cfa-next, conta nova → /wallets) e o mesmo
// do callback, que se mantem para o OAuth Google e para emails antigos.
const TIPOS: readonly EmailOtpType[] = ["signup", "magiclink", "email", "invite", "email_change"];

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash") ?? "";
  const type = searchParams.get("type") as EmailOtpType | null;
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

  if (!tokenHash || !type || !TIPOS.includes(type)) return paraLogin("confirm");

  let destino = next;
  const pediuDestino = Boolean(searchParams.get("next") || doCookie);
  try {
    const supabase = await createClient();
    const { data: sessao, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) {
      console.error("[auth/confirm] verifyOtp:", error.code ?? "", error.message);
      // otp_expired: o link tem mais de 1 h (ou ja foi usado) — pede outro.
      return paraLogin(/expired|otp_expired/i.test(`${error.code ?? ""} ${error.message}`) ? "expired" : "confirm");
    }
    const uid = sessao?.user?.id ?? "";
    if (!pediuDestino && uid) {
      try { if (await contaSemCarteiras(getSupabaseAdmin(), uid)) destino = "/wallets"; } catch { /* sem admin: fica o destino normal */ }
    }
  } catch (e) {
    console.error("[auth/confirm]", e instanceof Error ? e.message : e);
    return paraLogin("confirm");
  }

  return limpar(NextResponse.redirect(`${origin}${destino}`));
}
