// Inscrição de beta testers. Recebe o formulário de /beta e envia um email para
// o ChainFolioAI (suporte@) para o Gustavo libertar Pro/Premium manualmente.
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

const TO = process.env.BETA_SIGNUP_TO ?? "suporte@chainfolioai.com";
const FROM = "ChainFolioAI Beta <noreply@chainfolioai.com>";

const hits = new Map<string, { count: number; resetAt: number }>();
const LIMIT = 5;
const WINDOW = 60_000;
function allowed(ip: string): boolean {
  const now = Date.now();
  const e = hits.get(ip);
  if (!e || now > e.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW });
    return true;
  }
  if (e.count >= LIMIT) return false;
  e.count++;
  return true;
}

const str = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n).trim() : "");
const isEmail = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!allowed(ip)) return NextResponse.json({ error: "Demasiados pedidos. Tenta daqui a pouco." }, { status: 429 });

  const key = process.env.RESEND_API_KEY ?? "";
  if (!key) return NextResponse.json({ error: "Email não configurado." }, { status: 503 });

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const email = str(body.email, 120);
  const name = str(body.name, 80);
  const note = str(body.note, 1000);
  if (!isEmail(email)) return NextResponse.json({ error: "Email inválido." }, { status: 400 });

  const html = `
    <h2>Novo beta tester 🎉</h2>
    <p><b>Email:</b> ${esc(email)}</p>
    ${name ? `<p><b>Nome:</b> ${esc(name)}</p>` : ""}
    ${note ? `<p><b>Nota:</b> ${esc(note)}</p>` : ""}
    <p style="color:#64748b;font-size:12px">IP: ${esc(ip)} · ${new Date().toISOString()}</p>
    <hr>
    <p>Para ativar: corre o SQL de atribuição (Supabase) com este email — 60 dias de Pro/Premium.</p>
  `;

  try {
    const resend = new Resend(key);
    const { error } = await resend.emails.send({
      from: FROM,
      to: TO,
      replyTo: email,
      subject: `Beta tester: ${email}`,
      html,
    });
    if (error) return NextResponse.json({ error: "Falha ao enviar." }, { status: 502 });
  } catch {
    return NextResponse.json({ error: "Falha ao enviar." }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
