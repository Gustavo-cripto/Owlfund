import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Verificação LEVE "sou admin?" para a Sidebar (antes fazia GET à listagem
// completa de testers — N chamadas ao Auth Admin — em todas as páginas).
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const ADMINS = (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: { get: (name) => cookieStore.get(name)?.value, set: () => {}, remove: () => {} },
    });
    const { data } = await supabase.auth.getUser();
    const email = data.user?.email?.toLowerCase() ?? null;
    return NextResponse.json({ admin: !!email && ADMINS.length > 0 && ADMINS.includes(email) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ admin: false });
  }
}
