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

// Registo formal e humano, em todas as linguas (regra do Gustavo, 15 set 2026):
// trata-se a pessoa com cortesia (PT-PT sem "tu"; usted; vous), sem expressoes
// coloquiais, e sem marcar genero ("o que fez com que nao continuasse", nao
// "o que o levou a parar").
const COPY: Record<Lang, { subject: string; ola: string; p1: string; p2: string; p3a: string; p3b: string; p4: string; obrigado: string; despedida: string }> = {
  pt: {
    subject: "Uma pergunta sobre a sua experiência no ChainFolioAI",
    ola: "Olá,",
    p1: "Há alguns dias criou uma conta no ChainFolioAI e, desde então, não voltou a entrar. Compreendemos perfeitamente. Ainda assim, esteve entre as primeiras pessoas a experimentar a plataforma e, por isso, a sua opinião tem para nós um valor especial.",
    p2: "Melhoramos o produto todos os dias, em grande parte com base no que os primeiros utilizadores nos transmitem. Permita-nos, por isso, uma única pergunta: o que fez com que não continuasse? Pode ter sido não saber qual o passo seguinte, a sua corretora não estar disponível, algo não ter carregado ou, simplesmente, não ser o que procurava. Qualquer resposta nos ajuda, e uma frase é suficiente.",
    p3a: "Caso queira dar-nos uma nova oportunidade, o seu acesso Premium de 60 dias continua ativo em ",
    p3b: ". Se encontrar alguma dificuldade, basta responder a este email e teremos todo o gosto em ajudar.",
    p4: "Se preferir, pode responder em cerca de 30 segundos, sem escrever um email: ",
    obrigado: "Agradecemos desde já a sua atenção.",
    despedida: "Com os melhores cumprimentos,",
  },
  en: {
    subject: "A question about your experience with ChainFolioAI",
    ola: "Hello,",
    p1: "A few days ago you created a ChainFolioAI account and have not signed in since. We completely understand. Even so, you were among the first people to try the platform, which is why your opinion is especially valuable to us.",
    p2: "We improve the product every day, largely based on what our first users tell us. May we therefore ask a single question: what made you decide not to continue? Perhaps the next step was unclear, your exchange was not available, something did not load, or it simply was not what you were looking for. Any answer helps, and one sentence is enough.",
    p3a: "Should you wish to give us another chance, your 60-day Premium access is still active at ",
    p3b: ". If you run into any difficulty, simply reply to this email and we will be glad to help.",
    p4: "If you prefer, you can answer in about 30 seconds without writing an email: ",
    obrigado: "Thank you in advance for your time.",
    despedida: "Kind regards,",
  },
  es: {
    subject: "Una pregunta sobre su experiencia con ChainFolioAI",
    ola: "Hola:",
    p1: "Hace unos días creó una cuenta en ChainFolioAI y, desde entonces, no ha vuelto a entrar. Lo entendemos perfectamente. Aun así, estuvo entre las primeras personas en probar la plataforma y, por eso, su opinión tiene para nosotros un valor especial.",
    p2: "Mejoramos el producto cada día, en gran parte gracias a lo que nos cuentan los primeros usuarios. Permítanos, por tanto, una única pregunta: ¿qué hizo que no continuara? Quizá no tenía claro el siguiente paso, su exchange no estaba disponible, algo no cargó o, sencillamente, no era lo que buscaba. Cualquier respuesta nos ayuda, y basta con una frase.",
    p3a: "Si desea darnos una nueva oportunidad, su acceso Premium de 60 días sigue activo en ",
    p3b: ". Si encuentra cualquier dificultad, basta con responder a este email y le ayudaremos con mucho gusto.",
    p4: "Si lo prefiere, puede responder en unos 30 segundos, sin escribir un email: ",
    obrigado: "Le agradecemos de antemano su atención.",
    despedida: "Un cordial saludo,",
  },
  fr: {
    subject: "Une question sur votre expérience avec ChainFolioAI",
    ola: "Bonjour,",
    p1: "Il y a quelques jours, vous avez créé un compte ChainFolioAI et ne vous êtes pas reconnecté depuis. Nous le comprenons tout à fait. Vous avez toutefois été parmi les premières personnes à essayer la plateforme, et votre avis a donc pour nous une valeur particulière.",
    p2: "Nous améliorons le produit chaque jour, en grande partie grâce aux retours de nos premiers utilisateurs. Permettez-nous donc une seule question : qu'est-ce qui vous a amené à ne pas poursuivre ? Peut-être l'étape suivante n'était-elle pas claire, votre plateforme d'échange n'était pas disponible, quelque chose ne s'est pas chargé, ou ce n'était tout simplement pas ce que vous cherchiez. Toute réponse nous aide, et une phrase suffit.",
    p3a: "Si vous souhaitez nous accorder une nouvelle chance, votre accès Premium de 60 jours est toujours actif sur ",
    p3b: ". En cas de difficulté, il vous suffit de répondre à cet e-mail : nous vous aiderons avec plaisir.",
    p4: "Si vous le préférez, vous pouvez répondre en 30 secondes environ, sans écrire d'e-mail : ",
    obrigado: "Nous vous remercions par avance de votre attention.",
    despedida: "Bien cordialement,",
  },
};

function corpo(email: string, lang: Lang): { subject: string; html: string } {
  // Formal e humano (15 set 2026), sempre a convidar a voltar — mas com uma
  // pergunta so, e sem prometer nada que o produto nao faca. "Ha uns dias" de proposito: serve a quem entrou a 2 ou a
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
    p(esc(c.despedida) + `<br><strong>${esc("ChainFolioAI")}</strong>`) +
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
