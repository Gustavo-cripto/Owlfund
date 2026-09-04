// Marca/desmarca um tester como fundador a partir do painel /admin/beta.
// Mesmo modelo de autorização das outras rotas admin: sessão + ADMIN_EMAILS.
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { setFounder, unsetFounder } from "@/lib/beta/founder";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const ADMINS = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

async function getUserEmail(): Promise<string | null> {
  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} },
  });
  const { data } = await supabase.auth.getUser();
  return data.user?.email?.toLowerCase() ?? null;
}

export async function POST(request: Request) {
  const email = await getUserEmail();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMINS.length || !ADMINS.includes(email)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { email?: string; founder?: boolean };
  const target = (body.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(target)) {
    return NextResponse.json({ error: "Email inválido." }, { status: 400 });
  }

  // Resolve o user_id pelo email (mesma abordagem do grantTester).
  const admin = getSupabaseAdmin();
  let userId: string | null = null;
  for (let page = 1; page <= 5; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    const u = data.users.find((x) => (x.email ?? "").toLowerCase() === target);
    if (u) { userId = u.id; break; }
    if (data.users.length < 1000) break;
  }
  if (!userId) return NextResponse.json({ error: "Este email não tem conta." }, { status: 404 });

  const res = body.founder === false ? await unsetFounder(userId) : await setFounder(userId);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 500 });
  return NextResponse.json({ ok: true, founder: body.founder !== false });
}
