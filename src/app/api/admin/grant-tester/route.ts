// Atribui Pro/Premium a um tester (60 dias) a partir do email. Só admins.
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { grantTester } from "@/lib/beta/grant";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const ADMINS = (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

async function getAdminEmail(): Promise<string | null> {
  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} },
  });
  const { data } = await supabase.auth.getUser();
  return data.user?.email?.toLowerCase() ?? null;
}

export async function POST(req: NextRequest) {
  const adminEmail = await getAdminEmail();
  if (!adminEmail) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!ADMINS.length || !ADMINS.includes(adminEmail)) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  let body: { email?: string; plan?: string } = {};
  try {
    body = (await req.json()) as { email?: string; plan?: string };
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  const plan = body.plan === "premium" ? "premium" : "pro";
  const res = await grantTester(body.email ?? "", plan);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.error?.includes("conta") ? 404 : 400 });
  return NextResponse.json({ ok: true, plan, until: res.until });
}
