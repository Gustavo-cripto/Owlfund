// Estado de fundador do utilizador com sessão iniciada (para a página de planos).
// Auth por Bearer token (app móvel) ou cookies SSR (site).
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isFounder } from "@/lib/beta/founder";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export async function GET(request: Request) {
  let userId: string | null = null;

  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (token && supabaseUrl && supabaseAnonKey) {
    try {
      const client = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });
      const { data } = await client.auth.getUser(token);
      if (data.user) userId = data.user.id;
    } catch { /* fallback cookies */ }
  }

  if (!userId) {
    try {
      const cookieStore = await cookies();
      const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
        cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} },
      });
      const { data } = await supabase.auth.getUser();
      if (data.user) userId = data.user.id;
    } catch { /* ignore */ }
  }

  if (!userId) return NextResponse.json({ founder: false });
  return NextResponse.json({ founder: await isFounder(userId) });
}
