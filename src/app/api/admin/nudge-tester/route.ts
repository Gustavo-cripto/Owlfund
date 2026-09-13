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
  const subject = "Uma pergunta sobre o ChainFolioAI";
  const p = (t: string) => `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.55;color:#111">${esc(t)}</p>`;
  const html =
    `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px 20px">` +
    p("Olá,") +
    p("Criaste conta no ChainFolioAI a 2 de setembro e não voltaste a entrar. Não te escrevo para te pedir que voltes — escrevo para perceber o que te fez parar.") +
    p("Se tiveres um minuto, responde só com uma frase. Qualquer coisa serve: não percebeste o que fazer a seguir, faltava a exchange que usas, não carregou, achaste que não valia a pena, ou não era o que procuravas.") +
    p("É a informação mais útil que posso receber agora, e não há resposta errada.") +
    p("Obrigado,") +
    p("ChainFolioAI") +
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
