import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/api/cron-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { FROM, REPLY_TO, esc, markSent, sendEmail } from "@/lib/email";

// Um email, uma pergunta, a um tester que entrou uma vez e nao voltou:
// "o que te fez parar?". E a informacao mais barata que existe sobre o produto.
//
// Regras do dono para tudo o que sai para fora (cumpridas aqui):
//   - o mesmo remetente dos outros emails do beta (noreply@), resposta para
//     suporte@; nunca um endereco pessoal, nunca um nome de pessoa na assinatura;
//   - um email so, sem seguimento: o `notification_log` recusa um segundo envio
//     a mesma pessoa, mesmo que a rota seja chamada duas vezes;
//   - sem links, sem pixel — o objetivo e a frase que a pessoa escrever.
//
// Nao e cron: dispara-se a mao, com o CRON_SECRET, quando se decide a quem.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KIND = "nudge-inactive";

function corpo(): { subject: string; html: string } {
  // Texto pedido pelo Gustavo (2026-09-13): humano, simpatico, e sempre a
  // convidar a voltar — mas com uma pergunta so, e sem prometer nada que o
  // produto nao faca. "Ha uns dias" de proposito: serve a quem entrou a 2 ou a
  // 10 de setembro. Um unico link, o dominio em claro, sem parametros.
  const subject = "Ficámos com saudades — e com uma pergunta";
  const p = (t: string) => `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#111">${t}</p>`;
  const html =
    `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px 20px">` +
    p(esc("Olá,")) +
    p(esc("Criaste conta no ChainFolioAI há uns dias, deste uma volta e não voltaste. Acontece — e não há problema nenhum. Mas foste das primeiras pessoas de fora a experimentar isto, e isso conta muito para nós.")) +
    p(esc("Estamos a melhorar o produto todos os dias, em grande parte com o que os primeiros testers nos dizem. Por isso a pergunta, e podes responder com uma frase só: o que te fez parar? Não percebeste o que fazer a seguir, faltava a tua exchange, algo não carregou, ou simplesmente não era o que procuravas — tudo serve, e não há resposta errada.")) +
    p(esc("E se quiseres dar uma segunda oportunidade, o teu acesso Premium dos 60 dias continua ativo. Entra em ") +
      `<a href="https://chainfolioai.com" style="color:#ea580c;text-decoration:underline">chainfolioai.com</a>` +
      esc(" — e se ficares preso em algum passo, responde a este email e ajudamos-te a ligar tudo.")) +
    p(esc("Obrigado por teres experimentado,")) +
    p(`<strong>${esc("ChainFolioAI")}</strong>`) +
    `</div>`;
  return { subject, html };
}

export async function POST(request: Request) {
  if (!(await verifyCronAuth(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let email = "";
  try { email = String(((await request.json()) as { email?: unknown }).email ?? "").trim().toLowerCase(); } catch { /* corpo vazio */ }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "email invalido" }, { status: 400 });

  const admin = getSupabaseAdmin();
  // Tem de ser uma conta existente: nunca se envia para um endereco solto.
  const { data: list, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) return NextResponse.json({ error: "internal_error" }, { status: 500 });
  const user = list.users.find((u) => (u.email ?? "").toLowerCase() === email);
  if (!user) return NextResponse.json({ error: "sem conta com esse email" }, { status: 404 });

  // Um so: o registo e feito ANTES do envio, e so se for novo e que se envia.
  const novo = await markSent(admin, user.id, KIND, false);
  if (!novo) return NextResponse.json({ ok: false, reason: "ja_enviado" });

  const { subject, html } = corpo();
  const ok = await sendEmail({ to: email, subject, html, from: FROM, replyTo: REPLY_TO, unsubscribe: false, tag: KIND });
  return NextResponse.json({ ok, to: email });
}
