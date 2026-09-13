import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/api/cron-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { FROM, REPLY_TO, esc, markSent, sendEmail } from "@/lib/email";
import { pageUrl } from "@/lib/i18n/routes";
import type { Lang } from "@/lib/i18n/translations";
import { langFromMetadata, resolveLang, signupLangByEmail } from "@/lib/user/lang";

// Um email, uma pergunta, a um tester que entrou uma vez e nao voltou:
// "o que te fez parar?". E a informacao mais barata que existe sobre o produto.
//
// Regras do dono para tudo o que sai para fora (cumpridas aqui):
//   - o mesmo remetente dos outros emails do beta (noreply@), resposta para
//     suporte@; nunca um endereco pessoal, nunca um nome de pessoa na assinatura;
//   - um email so, sem seguimento: o `notification_log` recusa um segundo envio
//     a mesma pessoa, mesmo que a rota seja chamada duas vezes;
//   - sem tracking, sem pixel — o objetivo e a frase que a pessoa escrever;
//   - na lingua da pessoa (user_metadata.lang → beta_signups.lang → pt), com o
//     questionario no mesmo idioma.
//
// Nao e cron: dispara-se a mao, com o CRON_SECRET, quando se decide a quem.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KIND = "nudge-inactive";

const COPY: Record<Lang, { subject: string; ola: string; p1: string; p2: string; p3a: string; p3b: string; p4: string; obrigado: string }> = {
  pt: {
    subject: "Ficámos com saudades — e com uma pergunta",
    ola: "Olá,",
    p1: "Criaste conta no ChainFolioAI há uns dias, deste uma volta e não voltaste. Acontece — e não há problema nenhum. Mas foste das primeiras pessoas de fora a experimentar isto, e isso conta muito para nós.",
    p2: "Estamos a melhorar o produto todos os dias, em grande parte com o que os primeiros testers nos dizem. Por isso a pergunta, e podes responder com uma frase só: o que te fez parar? Não percebeste o que fazer a seguir, faltava a tua exchange, algo não carregou, ou simplesmente não era o que procuravas — tudo serve, e não há resposta errada.",
    p3a: "E se quiseres dar uma segunda oportunidade, o teu acesso Premium dos 60 dias continua ativo. Entra em ",
    p3b: " — e se ficares preso em algum passo, responde a este email e ajudamos-te a ligar tudo.",
    p4: "Se preferires responder em 30 segundos, sem escrever email: ",
    obrigado: "Obrigado por teres experimentado,",
  },
  en: {
    subject: "We missed you — and we have one question",
    ola: "Hi,",
    p1: "You created a ChainFolioAI account a few days ago, had a look around and didn't come back. It happens — no problem at all. But you were one of the first people from outside to try this, and that means a lot to us.",
    p2: "We're improving the product every day, largely from what the first testers tell us. So here's the question, and one sentence is enough: what made you stop? You didn't know what to do next, your exchange was missing, something didn't load, or it simply wasn't what you were looking for — anything helps, and there's no wrong answer.",
    p3a: "And if you'd like to give it a second chance, your 60-day Premium access is still active. Go to ",
    p3b: " — and if you get stuck at any step, reply to this email and we'll help you connect everything.",
    p4: "If you'd rather answer in 30 seconds, without writing an email: ",
    obrigado: "Thank you for trying it,",
  },
  es: {
    subject: "Te echamos de menos — y tenemos una pregunta",
    ola: "Hola,",
    p1: "Creaste una cuenta en ChainFolioAI hace unos días, diste una vuelta y no volviste. Pasa — y no hay ningún problema. Pero fuiste de las primeras personas de fuera en probarlo, y eso cuenta mucho para nosotros.",
    p2: "Mejoramos el producto cada día, en gran parte con lo que nos dicen los primeros testers. De ahí la pregunta, y puedes responder con una sola frase: ¿qué te hizo parar? No entendiste qué hacer después, faltaba tu exchange, algo no cargó, o simplemente no era lo que buscabas — todo sirve, y no hay respuesta incorrecta.",
    p3a: "Y si quieres darle una segunda oportunidad, tu acceso Premium de 60 días sigue activo. Entra en ",
    p3b: " — y si te quedas atascado en algún paso, responde a este email y te ayudamos a conectarlo todo.",
    p4: "Si prefieres responder en 30 segundos, sin escribir un email: ",
    obrigado: "Gracias por haberlo probado,",
  },
  fr: {
    subject: "Vous nous avez manqué — et nous avons une question",
    ola: "Bonjour,",
    p1: "Vous avez créé un compte ChainFolioAI il y a quelques jours, fait un tour et vous n'êtes pas revenu. Ça arrive — aucun problème. Mais vous avez été parmi les premières personnes extérieures à l'essayer, et ça compte beaucoup pour nous.",
    p2: "Nous améliorons le produit chaque jour, en grande partie grâce à ce que nous disent les premiers testeurs. D'où la question, et une phrase suffit : qu'est-ce qui vous a fait arrêter ? Vous ne saviez pas quoi faire ensuite, votre plateforme manquait, quelque chose n'a pas chargé, ou ce n'était simplement pas ce que vous cherchiez — tout nous aide, et il n'y a pas de mauvaise réponse.",
    p3a: "Et si vous voulez lui donner une seconde chance, votre accès Premium de 60 jours est toujours actif. Rendez-vous sur ",
    p3b: " — et si vous bloquez à une étape, répondez à cet e-mail et nous vous aiderons à tout connecter.",
    p4: "Si vous préférez répondre en 30 secondes, sans écrire d'e-mail : ",
    obrigado: "Merci d'avoir essayé,",
  },
};

function corpo(email: string, lang: Lang): { subject: string; html: string } {
  // Texto pedido pelo Gustavo (2026-09-13): humano, simpatico, e sempre a
  // convidar a voltar — mas com uma pergunta so, e sem prometer nada que o
  // produto nao faca. "Ha uns dias" de proposito: serve a quem entrou a 2 ou a
  // 10 de setembro. Dois links, o dominio em claro; o questionario na lingua
  // da pessoa, com o email pre-preenchido (e apagavel) para sabermos quem falou.
  const c = COPY[lang];
  const site = lang === "pt" ? "https://chainfolioai.com" : `https://chainfolioai.com/${lang}`;
  const feedback = `https://chainfolioai.com${pageUrl("feedback", lang)}`;
  const link = (href: string, label: string) => `<a href="${href}" style="color:#ea580c;text-decoration:underline">${esc(label)}</a>`;
  const p = (t: string) => `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#111">${t}</p>`;
  const html =
    `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px 20px">` +
    p(esc(c.ola)) + p(esc(c.p1)) + p(esc(c.p2)) +
    p(esc(c.p3a) + link(site, site.replace("https://", "")) + esc(c.p3b)) +
    p(esc(c.p4) + link(`${feedback}?e=${encodeURIComponent(email)}`, feedback.replace("https://", ""))) +
    p(esc(c.obrigado)) +
    p(`<strong>${esc("ChainFolioAI")}</strong>`) +
    `</div>`;
  return { subject: c.subject, html };
}

export async function POST(request: Request) {
  if (!(await verifyCronAuth(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let email = "";
  let force = false;
  try {
    const b = (await request.json()) as { email?: unknown; force?: unknown };
    email = String(b.email ?? "").trim().toLowerCase();
    force = b.force === true;
  } catch { /* corpo vazio */ }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "email invalido" }, { status: 400 });

  const admin = getSupabaseAdmin();
  // Tem de ser uma conta existente: nunca se envia para um endereco solto.
  const { data: list, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) return NextResponse.json({ error: "internal_error" }, { status: 500 });
  const user = list.users.find((u) => (u.email ?? "").toLowerCase() === email);
  if (!user) return NextResponse.json({ error: "sem conta com esse email" }, { status: 404 });

  // Um so: o registo e feito ANTES do envio, e so se for novo e que se envia.
  // `force` salta esta guarda — e para a conta do proprio dono ver o email
  // como o tester o recebe, nunca para insistir com um tester real.
  const novo = await markSent(admin, user.id, KIND, false);
  if (!novo && !force) return NextResponse.json({ ok: false, reason: "ja_enviado" });

  const lang = resolveLang(langFromMetadata(user.user_metadata), (await signupLangByEmail(admin)).get(email));
  const { subject, html } = corpo(email, lang);
  const ok = await sendEmail({ to: email, subject, html, from: FROM, replyTo: REPLY_TO, unsubscribe: false, tag: KIND });
  return NextResponse.json({ ok, to: email, lang });
}
