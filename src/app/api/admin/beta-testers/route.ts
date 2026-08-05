// Lista de beta testers ativos (atribuições manuais). Só para admins — definidos
// na env ADMIN_EMAILS (emails separados por vírgula). Sem ADMIN_EMAILS => ninguém.
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const premiumPriceId = process.env.STRIPE_PREMIUM_PRICE_ID ?? process.env.NEXT_PUBLIC_STRIPE_PREMIUM_PRICE_ID ?? "";
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

export async function GET() {
  const email = await getUserEmail();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMINS.length || !ADMINS.includes(email)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = getSupabaseAdmin();
  const { data: subs, error } = await admin
    .from("subscriptions")
    .select("user_id, price_id, current_period_end")
    .eq("source", "manual")
    .eq("status", "active")
    .order("current_period_end", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const now = Date.now();
  const testers = [];
  for (const s of subs ?? []) {
    let em = "";
    try {
      const { data } = await admin.auth.admin.getUserById(s.user_id as string);
      em = data.user?.email ?? "";
    } catch {
      /* ignore */
    }
    const end = s.current_period_end ? new Date(s.current_period_end as string) : null;
    const daysLeft = end ? Math.ceil((end.getTime() - now) / 86_400_000) : null;
    testers.push({
      email: em,
      plan: premiumPriceId && s.price_id === premiumPriceId ? "premium" : "pro",
      expiresAt: s.current_period_end ?? null,
      daysLeft,
    });
  }

  // Inscrições pendentes (best-effort; vazio se a tabela não existir).
  let pending: { email: string; name: string | null; note: string | null; createdAt: string }[] = [];
  try {
    const { data: sig } = await admin
      .from("beta_signups")
      .select("email, name, note, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(100);
    pending = (sig ?? []).map((s) => ({
      email: s.email as string,
      name: (s.name as string) ?? null,
      note: (s.note as string) ?? null,
      createdAt: s.created_at as string,
    }));
  } catch { /* tabela ainda não criada */ }

  return NextResponse.json({ admin: true, count: testers.length, testers, pending });
}
