// Quem está a pedir é admin (ADMIN_EMAILS)? Devolve o id e o email da sessão,
// ou o código HTTP a responder. Para as rotas novas de /api/admin.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export function emailsAdmin(): string[] {
  return (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export async function adminDaSessao(): Promise<{ ok: true; id: string; email: string } | { ok: false; status: 401 | 403 }> {
  const cookieStore = await cookies();
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "", {
    cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} },
  });
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email?.toLowerCase() ?? "";
  if (!data.user || !email) return { ok: false, status: 401 };
  const admins = emailsAdmin();
  if (!admins.length || !admins.includes(email)) return { ok: false, status: 403 };
  return { ok: true, id: data.user.id, email };
}
