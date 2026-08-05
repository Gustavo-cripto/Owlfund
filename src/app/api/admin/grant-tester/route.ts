// Atribui Pro/Premium a um tester (60 dias) a partir do email — substitui o SQL
// manual. Só para admins (ADMIN_EMAILS). O tester tem de já ter criado conta.
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const premiumPriceId = process.env.STRIPE_PREMIUM_PRICE_ID ?? process.env.NEXT_PUBLIC_STRIPE_PREMIUM_PRICE_ID ?? "";
const ADMINS = (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
const TRIAL_DAYS = 60;

async function getAdminEmail(): Promise<string | null> {
  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} },
  });
  const { data } = await supabase.auth.getUser();
  return data.user?.email?.toLowerCase() ?? null;
}

async function findUserByEmail(admin: ReturnType<typeof getSupabaseAdmin>, email: string) {
  // Procura por páginas (beta pequeno; cobre até alguns milhares).
  for (let page = 1; page <= 5; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    const u = data.users.find((x) => (x.email ?? "").toLowerCase() === email);
    if (u) return u;
    if (data.users.length < 1000) break;
  }
  return null;
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
  const target = (body.email ?? "").trim().toLowerCase();
  const plan = body.plan === "premium" ? "premium" : "pro";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(target)) return NextResponse.json({ error: "Email inválido." }, { status: 400 });

  const admin = getSupabaseAdmin();
  const user = await findUserByEmail(admin, target);
  if (!user) {
    return NextResponse.json(
      { error: "Este email ainda não tem conta no site. Pede ao tester para se registar primeiro." },
      { status: 404 },
    );
  }

  const end = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  const price_id = plan === "premium" ? premiumPriceId || "manual_premium" : "manual_pro";

  const { error } = await admin.from("subscriptions").upsert(
    {
      user_id: user.id,
      status: "active",
      price_id,
      current_period_end: end.toISOString(),
      cancel_at_period_end: false,
      source: "manual",
    },
    { onConflict: "user_id" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, email: target, plan, until: end.toISOString() });
}
