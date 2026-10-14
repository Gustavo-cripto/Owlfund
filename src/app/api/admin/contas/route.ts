// Lista de contas para o /admin/beta (eliminar contas de teste). Só admins.
import { NextResponse } from "next/server";
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
  const contas: Array<{ id: string; email: string; via: string; criada: string | null; ultimaEntrada: string | null; interna: boolean; admin: boolean }> = [];
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
  return NextResponse.json({ contas });
}
