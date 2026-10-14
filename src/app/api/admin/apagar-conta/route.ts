// Apaga uma conta e todos os dados dela, a partir do /admin/beta (contas de
// teste, ou um cliente que pediu para sair). Só admins; irreversível.
// Travões: o pedido leva o email da conta (ou o id, nas contas por carteira)
// que está no ecrã, para um id trocado não apagar outra conta; nunca se apaga
// uma conta de admin nem a da própria sessão. No ecrã: botão + confirmar.
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { adminDaSessao, emailsAdmin } from "@/lib/auth/adminSessao";
import { apagarContaETudo } from "@/lib/account/apagar";
import { mascararEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const a = await adminDaSessao();
  if (!a.ok) return NextResponse.json({ error: a.status === 401 ? "Não autenticado." : "Sem permissão." }, { status: a.status });

  let body: { id?: string; confirmacao?: string } = {};
  try { body = (await req.json()) as typeof body; } catch { return NextResponse.json({ error: "JSON inválido." }, { status: 400 }); }
  const id = String(body.id ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Conta inválida." }, { status: 400 });

  const admin = getSupabaseAdmin();
  const { data, error } = await admin.auth.admin.getUserById(id);
  if (error || !data.user) return NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });
  const email = (data.user.email ?? "").toLowerCase();

  if (id === a.id) return NextResponse.json({ error: "Não podes apagar a conta com que estás a entrar." }, { status: 400 });
  if (email && emailsAdmin().includes(email)) return NextResponse.json({ error: "Contas de administrador não se apagam por aqui." }, { status: 400 });
  const esperado = email || id;
  if (String(body.confirmacao ?? "").trim().toLowerCase() !== esperado) {
    return NextResponse.json({ error: "A conta mudou entretanto. Recarrega a página e tenta de novo." }, { status: 400 });
  }

  const { apagada, falhas } = await apagarContaETudo(admin, id, email);
  console.warn(`[admin/apagar-conta] ${mascararEmail(a.email)} apagou ${email ? mascararEmail(email) : id}: ${apagada ? "ok" : "falhou"}${falhas.length ? ` (parcial: ${falhas.join(", ")})` : ""}`);
  if (!apagada) return NextResponse.json({ error: "Não foi possível apagar a conta." }, { status: 500 });
  return NextResponse.json({ ok: true, parcial: falhas.length > 0, falhas });
}
