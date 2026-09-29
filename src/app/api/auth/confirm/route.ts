import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sanitizeNext } from "@/lib/auth/redirects";
import { COOKIE_NEXT } from "@/lib/auth/emailRedirect";
import { COOKIE_LANG, contaSemCarteiras, langDoPedido } from "@/lib/auth/contaNova";
import { pageUrl } from "@/lib/i18n/routes";
import { COOKIE_RECUPERACAO, RECUPERACAO_MAX_AGE, destinoDaConfirmacao } from "@/lib/auth/recuperacao";
import { eDoProprioSite } from "@/lib/auth/proprioSite";

// Confirmacao de email e ligacao magica por `token_hash` (modelos em
// supabase/email-templates/*.html): /api/auth/confirm?token_hash=…&type=…&lang=xx
//
// PORQUE: o fluxo PKCE ({{ .ConfirmationURL }} → ?code=) so funciona no browser
// que pediu o email, porque o code_verifier fica la guardado. Quem pedia a
// ligacao no portatil e a abria no telemovel via sempre "link invalido". O
// verifyOtp com token_hash e verificado no servidor e funciona em qualquer
// aparelho. O destino (next/cookie cfa-next, conta nova → /wallets) e o mesmo
// do callback, que se mantem para o OAuth Google e para emails antigos.
//
// type=recovery (repor palavra-passe, lote G): depois do verifyOtp a sessao
// fica criada e a pessoa vai para /reset-password?lang=xx, com o cookie curto
// cfa-recovery (id do utilizador) que diz a pagina que esta sessao veio de um
// link de recuperacao. Ver src/lib/auth/recuperacao.ts.
const TIPOS: readonly EmailOtpType[] = ["signup", "magiclink", "email", "invite", "email_change", "recovery"];

//
// PAGINA DE CONFIRMACAO (auditoria 28 set 2026): o GET ja nao gasta o link —
// mostra uma pagina com um botao, e so o POST desse botao (vindo do proprio
// site) faz o verifyOtp. Duas razoes:
// 1. Os filtros de email (Outlook/Hotmail "Safe Links", antivirus) abrem os
//    links antes da pessoa; com o GET a verificar, gastavam o link de uso unico
//    e a pessoa via "link expirado".
// 2. Login-CSRF: um link com o token de OUTRA conta iniciava sessao nessa conta
//    so por ser aberto. Agora e preciso um clique consciente numa pagina nossa.
type LangPag = "pt" | "en" | "es" | "fr";
const TXT: Record<LangPag, { titulo: string; entrar: string; repor: string; confirmar: string; botao: string; botaoRepor: string; nota: string }> = {
  pt: { titulo: "Confirmar entrada", entrar: "Carrega no botão para entrares na tua conta ChainFolioAI.", repor: "Carrega no botão para escolheres uma palavra-passe nova.", confirmar: "Carrega no botão para confirmares o teu email e entrares.", botao: "Entrar", botaoRepor: "Continuar", nota: "Não pediste este email? Fecha esta página — nada acontece." },
  en: { titulo: "Confirm sign-in", entrar: "Press the button to sign in to your ChainFolioAI account.", repor: "Press the button to choose a new password.", confirmar: "Press the button to confirm your email and sign in.", botao: "Sign in", botaoRepor: "Continue", nota: "Didn't request this email? Close this page — nothing happens." },
  es: { titulo: "Confirmar entrada", entrar: "Pulsa el botón para entrar en tu cuenta de ChainFolioAI.", repor: "Pulsa el botón para elegir una contraseña nueva.", confirmar: "Pulsa el botón para confirmar tu email y entrar.", botao: "Entrar", botaoRepor: "Continuar", nota: "¿No pediste este email? Cierra esta página: no pasa nada." },
  fr: { titulo: "Confirmer la connexion", entrar: "Appuyez sur le bouton pour vous connecter à votre compte ChainFolioAI.", repor: "Appuyez sur le bouton pour choisir un nouveau mot de passe.", confirmar: "Appuyez sur le bouton pour confirmer votre e-mail et vous connecter.", botao: "Se connecter", botaoRepor: "Continuer", nota: "Vous n'avez pas demandé cet e-mail ? Fermez cette page : rien ne se passe." },
};
const escHtml = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function paginaDeConfirmacao(lang: LangPag, type: string, action: string): NextResponse {
  const t = TXT[lang];
  const frase = type === "recovery" ? t.repor : type === "magiclink" ? t.entrar : t.confirmar;
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><meta name="referrer" content="no-referrer"><title>${escHtml(t.titulo)} · ChainFolioAI</title>
<style>body{margin:0;background:#0f172a;color:#cbd5e1;font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6}main{max-width:480px;margin:64px auto;padding:0 20px}.card{background:#111827;border:1px solid #1f2937;border-radius:16px;padding:28px}h1{color:#fff;font-size:20px;margin:0 0 12px}.brand{color:#fff;font-weight:800;font-size:18px;margin-bottom:16px}.brand span{color:#f97316}button{width:100%;background:#f97316;color:#0f172a;font-weight:700;border:0;padding:14px 20px;border-radius:999px;font-size:16px;cursor:pointer;margin-top:8px}p.small{color:#64748b;font-size:13px;margin:16px 0 0}</style></head>
<body><main><div class="brand">ChainFolio<span>AI</span></div><div class="card"><h1>${escHtml(t.titulo)}</h1><p>${escHtml(frase)}</p><form method="post" action="${escHtml(action)}"><button type="submit">${escHtml(type === "recovery" ? t.botaoRepor : t.botao)}</button></form><p class="small">${escHtml(t.nota)}</p></div></main></body></html>`;
  return new NextResponse(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash") ?? "";
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const lang = langDoPedido(url.searchParams);
  if (!tokenHash || !type || !TIPOS.includes(type)) {
    const login = pageUrl("login", lang ?? "pt");
    return NextResponse.redirect(`${url.origin}${login}?error=confirm`);
  }
  // Mesmo URL, por POST: os parametros (token_hash, type, lang, next) vao na query.
  return paginaDeConfirmacao((lang ?? "pt") as LangPag, type, `${url.pathname}${url.search}`);
}

export async function POST(request: Request) {
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
  const paraLogin = (kind: "expired" | "confirm") => limpar(NextResponse.redirect(`${origin}${login}?error=${kind}&next=${encodeURIComponent(next)}`, 303));

  if (!tokenHash || !type || !TIPOS.includes(type)) return paraLogin("confirm");
  if (!eDoProprioSite(request.headers, origin)) return paraLogin("confirm");

  let contaNova = false;
  let uid = "";
  const pediuDestino = Boolean(searchParams.get("next") || doCookie);
  try {
    const supabase = await createClient();
    const { data: sessao, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) {
      console.error("[auth/confirm] verifyOtp:", error.code ?? "", error.message);
      // otp_expired: o link tem mais de 1 h (ou ja foi usado) — pede outro.
      return paraLogin(/expired|otp_expired/i.test(`${error.code ?? ""} ${error.message}`) ? "expired" : "confirm");
    }
    uid = sessao?.user?.id ?? "";
    if (type !== "recovery" && !pediuDestino && uid) {
      try { contaNova = await contaSemCarteiras(getSupabaseAdmin(), uid); } catch { /* sem admin: fica o destino normal */ }
    }
  } catch (e) {
    console.error("[auth/confirm]", e instanceof Error ? e.message : e);
    return paraLogin("confirm");
  }

  const destino = destinoDaConfirmacao({ type, lang, next, contaNova, pediuDestino });
  const res = limpar(NextResponse.redirect(`${origin}${destino}`, 303));
  if (type === "recovery" && uid) {
    // Lido pela pagina no cliente (por isso sem httpOnly); so vale junto com a
    // sessao do MESMO utilizador, e a pagina apaga-o depois de gravar.
    res.cookies.set({ name: COOKIE_RECUPERACAO, value: uid, path: "/", maxAge: RECUPERACAO_MAX_AGE, sameSite: "lax", secure: origin.startsWith("https://") });
  }
  return res;
}
