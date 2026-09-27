// Cancelamento dos emails do produto, SEM sessao: o URL vem assinado em cada
// email (List-Unsubscribe e rodape). GET mostra uma pagina simples com um
// botao de confirmacao; POST grava (e o Gmail/Apple Mail chamam-no sozinhos
// com "List-Unsubscribe=One-Click", RFC 8058). Ver src/lib/emailOptout.ts.
import { NextResponse } from "next/server";
import { rateLimitPublic } from "@/lib/api/requireUser";
import { apiLang } from "@/lib/api/apiMessages";
import { isOptedOut, setOptout, verifyUnsubscribeToken } from "@/lib/emailOptout";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Lang } from "@/lib/i18n/translations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const T: Record<Lang, { titulo: string; pergunta: string; botao: string; feito: string; ja: string; invalido: string; erro: string; nota: string; voltar: string }> = {
  pt: {
    titulo: "Emails do ChainFolioAI",
    pergunta: "Queres deixar de receber os emails do produto (boas-vindas, lembretes, inatividade, oferta de fundador)?",
    botao: "Sim, cancelar estes emails",
    feito: "Feito. Não voltas a receber estes emails. Os avisos sobre o fim do teu período de teste continuam a chegar, porque dizem respeito à tua conta.",
    ja: "Já tinhas cancelado estes emails. Não recebes nenhum.",
    invalido: "Esta ligação não é válida ou já não serve. Se quiseres cancelar os emails, usa a ligação do email mais recente ou escreve para suporte@chainfolioai.com.",
    erro: "Não conseguimos gravar o pedido agora. Escreve para suporte@chainfolioai.com e tratamos disso à mão.",
    nota: "Podes voltar a ligá-los em Conta → Notificações.",
    voltar: "Ir para o site",
  },
  en: {
    titulo: "ChainFolioAI emails",
    pergunta: "Do you want to stop receiving product emails (welcome, reminders, inactivity, founder offer)?",
    botao: "Yes, unsubscribe from these emails",
    feito: "Done. You will not receive these emails again. Notices about the end of your trial period still arrive, because they concern your account.",
    ja: "You had already unsubscribed from these emails. You receive none.",
    invalido: "This link is not valid or no longer works. To unsubscribe, use the link in the most recent email or write to suporte@chainfolioai.com.",
    erro: "We could not save your request right now. Write to suporte@chainfolioai.com and we will handle it by hand.",
    nota: "You can turn them back on in Account → Notifications.",
    voltar: "Go to the site",
  },
  es: {
    titulo: "Correos de ChainFolioAI",
    pergunta: "¿Quieres dejar de recibir los correos del producto (bienvenida, recordatorios, inactividad, oferta de fundador)?",
    botao: "Sí, cancelar estos correos",
    feito: "Hecho. No volverás a recibir estos correos. Los avisos sobre el fin de tu periodo de prueba siguen llegando, porque afectan a tu cuenta.",
    ja: "Ya habías cancelado estos correos. No recibes ninguno.",
    invalido: "Este enlace no es válido o ya no sirve. Para cancelar los correos, usa el enlace del correo más reciente o escribe a suporte@chainfolioai.com.",
    erro: "No hemos podido guardar tu petición ahora. Escribe a suporte@chainfolioai.com y lo hacemos a mano.",
    nota: "Puedes volver a activarlos en Cuenta → Notificaciones.",
    voltar: "Ir al sitio",
  },
  fr: {
    titulo: "E-mails de ChainFolioAI",
    pergunta: "Voulez-vous ne plus recevoir les e-mails du produit (bienvenue, rappels, inactivité, offre fondateur) ?",
    botao: "Oui, me désabonner de ces e-mails",
    feito: "C'est fait. Vous ne recevrez plus ces e-mails. Les avis sur la fin de votre période d'essai continuent d'arriver, car ils concernent votre compte.",
    ja: "Vous aviez déjà annulé ces e-mails. Vous n'en recevez aucun.",
    invalido: "Ce lien n'est pas valide ou ne fonctionne plus. Pour vous désabonner, utilisez le lien de l'e-mail le plus récent ou écrivez à suporte@chainfolioai.com.",
    erro: "Nous n'avons pas pu enregistrer votre demande. Écrivez à suporte@chainfolioai.com et nous nous en occupons à la main.",
    nota: "Vous pouvez les réactiver dans Compte → Notifications.",
    voltar: "Aller sur le site",
  },
};

const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function pagina(lang: Lang, corpo: string, status = 200): NextResponse {
  const t = T[lang];
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(t.titulo)}</title>
<style>body{margin:0;background:#0f172a;color:#cbd5e1;font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6}main{max-width:520px;margin:48px auto;padding:0 20px}.card{background:#111827;border:1px solid #1f2937;border-radius:16px;padding:24px}h1{color:#fff;font-size:18px;margin:0 0 12px}.brand{color:#fff;font-weight:800;font-size:18px;margin-bottom:16px}.brand span{color:#f97316}button{background:#f97316;color:#0f172a;font-weight:700;border:0;padding:11px 20px;border-radius:10px;font-size:15px;cursor:pointer}a{color:#fb923c}p.small{color:#64748b;font-size:13px}</style></head>
<body><main><div class="brand">ChainFolio<span>AI</span></div><div class="card"><h1>${esc(t.titulo)}</h1>${corpo}</div></main></body></html>`;
  return new NextResponse(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

function ler(req: Request): { lang: Lang; uid: string | null; ok: boolean } {
  const url = new URL(req.url);
  const q = url.searchParams.get("lang");
  const lang: Lang = q && /^(pt|en|es|fr)$/.test(q) ? (q as Lang) : apiLang(req);
  const u = (url.searchParams.get("u") ?? "").trim().toLowerCase();
  const t = (url.searchParams.get("t") ?? "").trim();
  if (!UUID.test(u) || !t) return { lang, uid: null, ok: false };
  return { lang, uid: u, ok: verifyUnsubscribeToken(u, t) };
}

export async function GET(req: Request) {
  const limitado = rateLimitPublic(req, "email-unsubscribe", 30);
  if (limitado) return limitado;
  const { lang, uid, ok } = ler(req);
  const t = T[lang];
  if (!ok || !uid) return pagina(lang, `<p>${esc(t.invalido)}</p>`, 400);
  let ja = false;
  try { ja = await isOptedOut(getSupabaseAdmin(), uid); } catch { /* sem admin: mostra o botao na mesma */ }
  if (ja) return pagina(lang, `<p>${esc(t.ja)}</p><p class="small">${esc(t.nota)}</p><p><a href="/">${esc(t.voltar)}</a></p>`);
  const action = `/api/email/unsubscribe?u=${encodeURIComponent(uid)}&t=${encodeURIComponent(new URL(req.url).searchParams.get("t") ?? "")}&lang=${lang}`;
  return pagina(lang, `<p>${esc(t.pergunta)}</p><form method="post" action="${esc(action)}"><button type="submit">${esc(t.botao)}</button></form><p class="small">${esc(t.nota)}</p>`);
}

export async function POST(req: Request) {
  const limitado = rateLimitPublic(req, "email-unsubscribe", 30);
  if (limitado) return limitado;
  const { lang, uid, ok } = ler(req);
  const t = T[lang];
  if (!ok || !uid) return pagina(lang, `<p>${esc(t.invalido)}</p>`, 400);
  let gravado = false;
  try { gravado = await setOptout(getSupabaseAdmin(), uid, true); } catch (e) { console.error("[email/unsubscribe]", e instanceof Error ? e.message : e); }
  if (!gravado) return pagina(lang, `<p>${esc(t.erro)}</p>`, 503);
  return pagina(lang, `<p>${esc(t.feito)}</p><p class="small">${esc(t.nota)}</p><p><a href="/">${esc(t.voltar)}</a></p>`);
}
