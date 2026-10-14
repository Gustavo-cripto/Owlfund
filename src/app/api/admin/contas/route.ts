// Lista de contas para o /admin/beta (eliminar contas de teste). Só admins.
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { adminDaSessao, emailsAdmin } from "@/lib/auth/adminSessao";
import { eContaInterna, emailsInternos } from "@/lib/analytics/internas";

export const dynamic = "force-dynamic";

export async function GET() {
  const a = await adminDaSessao();
  if (!a.ok) return NextResponse.json({ error: a.status === 401 ? "Não autenticado." : "Sem permissão." }, { status: a.status });
  const admin = getSupabaseAdmin();
  const internos = emailsInternos();
  const admins = new Set(emailsAdmin());
  const contas: Array<{ id: string; email: string; via: string; criada: string | null; ultimaEntrada: string | null; interna: boolean; admin: boolean; boasVindas?: string | null; entregaBoasVindas?: string | null; devolvido?: boolean }> = [];
  for (let page = 1; page <= 5; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return NextResponse.json({ error: "Falhou a listar as contas." }, { status: 500 });
    for (const u of data.users) {
      const email = (u.email ?? "").toLowerCase();
      contas.push({
        id: u.id,
        email,
        via: String(u.app_metadata?.provider ?? "email"),
        criada: u.created_at ?? null,
        ultimaEntrada: u.last_sign_in_at ?? null,
        interna: eContaInterna(email, internos, u.id),
        admin: Boolean(email) && admins.has(email),
      });
    }
    if (data.users.length < 1000) break;
  }
  contas.sort((x, y) => String(y.criada ?? "").localeCompare(String(x.criada ?? "")));
  // Quando saiu o email de boas-vindas (notification_log), para se ver no ecrã.
  const boasVindas = new Map<string, string>();
  try {
    const { data } = await admin.from("notification_log").select("user_id, sent_at").eq("kind", "welcome_account");
    for (const r of data ?? []) boasVindas.set(r.user_id as string, r.sent_at as string);
  } catch { /* sem tabela: fica vazio */ }
  // O que aconteceu DEPOIS de sair (Resend, últimos 100 envios): "enviado" só
  // diz que saiu; "delivered" diz que chegou; "bounced" quer dizer, na prática,
  // que o endereço não existe (com a confirmação de email desligada, é a única
  // forma de apanhar um email mal escrito). Sem chave ou se falhar: fica vazio.
  const entregaBoasVindas = new Map<string, string>();
  const devolvidos = new Set<string>();
  try {
    const key = process.env.RESEND_API_KEY;
    if (key) {
      const { data } = await new Resend(key).emails.list({ limit: 100 });
      for (const e of data?.data ?? []) {
        const boasVindasEmail = /^(Bem-vindo|Welcome|Bienvenid|Bienvenue)/i.test(e.subject ?? "");
        for (const to of e.to ?? []) {
          const a = to.toLowerCase();
          if (e.last_event === "bounced" || e.last_event === "failed" || e.last_event === "suppressed") devolvidos.add(a);
          if (boasVindasEmail && !entregaBoasVindas.has(a)) entregaBoasVindas.set(a, e.last_event);
        }
      }
    }
  } catch (e) { console.error("[admin/contas] resend:", e instanceof Error ? e.message : e); }
  for (const c of contas) {
    c.boasVindas = boasVindas.get(c.id) ?? null;
    c.entregaBoasVindas = c.email ? entregaBoasVindas.get(c.email) ?? null : null;
    c.devolvido = Boolean(c.email) && devolvidos.has(c.email);
  }
  return NextResponse.json({ contas });
}
