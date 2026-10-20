// Prolonga o Premium de TODOS os testers ativos até ao fim do beta (decisão do
// dono, 20 out 2026: os pagamentos não abrem a 22 out; prolongar uns meses para
// conseguir testers). Só admins; idempotente (quem já vai além da data fica).
// Com { avisar: true }, cada tester REAL (fora de CONTAS_INTERNAS) recebe um
// email a dizer até quando — uma vez (notification_log "beta_prolongado").
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { adminDaSessao } from "@/lib/auth/adminSessao";
import { BETA_CUTOFF_ISO } from "@/lib/plans";
import { eContaInterna, emailsInternos } from "@/lib/analytics/internas";
import { EMAIL_LOCALE, TZ, markSent, sendEmail, shell } from "@/lib/email";
import { langFromMetadata, resolveLang } from "@/lib/user/lang";
import type { Lang } from "@/lib/i18n/translations";

export const dynamic = "force-dynamic";

const AVISO: Record<Lang, (ate: string) => { subject: string; html: string }> = {
  pt: (ate) => ({ subject: "O teu Premium do ChainFolioAI foi prolongado", html: shell(`<p style="color:#fff;font-size:16px;font-weight:700">Boa notícia: o teu Premium foi prolongado 🎉</p><p>Os pagamentos ainda não abriram, por isso o teu acesso Premium grátis continua até <b>${ate}</b>, o fim do beta. Não tens de fazer nada.</p><p>Se tiveres sugestões ou algo não funcionar, responde a este email.</p>`) }),
  en: (ate) => ({ subject: "Your ChainFolioAI Premium has been extended", html: shell(`<p style="color:#fff;font-size:16px;font-weight:700">Good news: your Premium has been extended 🎉</p><p>Payments have not opened yet, so your free Premium access continues until <b>${ate}</b>, the end of the beta. Nothing to do on your side.</p><p>Ideas, or something not working? Just reply to this email.</p>`) }),
  es: (ate) => ({ subject: "Tu Premium de ChainFolioAI se ha prolongado", html: shell(`<p style="color:#fff;font-size:16px;font-weight:700">Buenas noticias: tu Premium se ha prolongado 🎉</p><p>Los pagos aún no se han abierto, así que tu acceso Premium gratis sigue hasta el <b>${ate}</b>, el final de la beta. No tienes que hacer nada.</p><p>¿Sugerencias o algo que no funciona? Responde a este correo.</p>`) }),
  fr: (ate) => ({ subject: "Votre Premium ChainFolioAI a été prolongé", html: shell(`<p style="color:#fff;font-size:16px;font-weight:700">Bonne nouvelle : votre Premium a été prolongé 🎉</p><p>Les paiements ne sont pas encore ouverts : votre accès Premium gratuit continue jusqu'au <b>${ate}</b>, la fin de la bêta. Vous n'avez rien à faire.</p><p>Des idées, ou quelque chose ne marche pas ? Répondez simplement à cet email.</p>`) }),
};

export async function POST(req: NextRequest) {
  const a = await adminDaSessao();
  if (!a.ok) return NextResponse.json({ error: a.status === 401 ? "Não autenticado." : "Sem permissão." }, { status: a.status });
  let body: { avisar?: boolean } = {};
  try { body = (await req.json()) as typeof body; } catch { /* sem corpo: não avisa */ }

  const ate = new Date(BETA_CUTOFF_ISO);
  if (Number.isNaN(ate.getTime()) || ate.getTime() <= Date.now()) return NextResponse.json({ error: "O beta já acabou ou a data do fim é inválida." }, { status: 400 });
  const admin = getSupabaseAdmin();
  const { data: subs, error } = await admin
    .from("subscriptions")
    .select("user_id, current_period_end")
    .eq("source", "manual")
    .eq("status", "active")
    .lt("current_period_end", ate.toISOString());
  if (error) return NextResponse.json({ error: "Base de dados indisponível." }, { status: 500 });

  const internos = emailsInternos();
  let prolongados = 0, avisados = 0;
  const falhas: string[] = [];
  for (const s of subs ?? []) {
    const uid = s.user_id as string;
    const { error: upErr } = await admin.from("subscriptions").update({ current_period_end: ate.toISOString(), cancel_at_period_end: false }).eq("user_id", uid).eq("source", "manual");
    if (upErr) { falhas.push(uid); continue; }
    prolongados++;
    if (!body.avisar) continue;
    try {
      const { data } = await admin.auth.admin.getUserById(uid);
      const email = data.user?.email ?? "";
      if (!email || eContaInterna(email, internos, uid)) continue;
      if (!(await markSent(admin, uid, "beta_prolongado", false))) continue;
      const lang = resolveLang(langFromMetadata(data.user?.user_metadata));
      const m = AVISO[lang](ate.toLocaleDateString(EMAIL_LOCALE[lang] ?? "pt-PT", { day: "2-digit", month: "long", year: "numeric", timeZone: TZ }));
      if (await sendEmail({ to: email, subject: m.subject, html: m.html, tag: "beta_prolongado", userId: uid, lang })) avisados++;
    } catch { /* o prolongamento já ficou; só o aviso falhou */ }
  }
  return NextResponse.json({ ok: true, ate: ate.toISOString(), prolongados, avisados, falhas: falhas.length });
}
