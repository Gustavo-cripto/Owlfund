import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

import { FREE_AI_LIMIT } from "@/lib/plans";
import { contarCarteiras } from "@/lib/api/walletBlob";

export async function GET() {
  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: { get: (name) => cookieStore.get(name)?.value, set: () => {}, remove: () => {} },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const userId = user.id;

  let admin: ReturnType<typeof getSupabaseAdmin>;
  try {
    admin = getSupabaseAdmin();
  } catch {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const month = new Date().toISOString().slice(0, 7); // "YYYY-MM"

  const [usageRes, snapRes, walletRes] = await Promise.all([
    admin.from("chat_usage").select("count").eq("user_id", userId).eq("month", month).maybeSingle(),
    admin.from("portfolio_snapshots").select("id", { count: "exact", head: true }).eq("user_id", userId),
    admin.from("wallet_config").select("data").eq("user_id", userId).maybeSingle(),
  ]);

  const aiUsed = (usageRes.data?.count as number | undefined) ?? 0;
  const snapshots = snapRes.count ?? 0;

  // Todas as contas, no formato que a app escreve (leitor unico: walletBlob.ts).
  // Antes contava eth/sol/… no topo do blob v3 → "0 carteiras" para toda a gente.
  const wallets = contarCarteiras(walletRes.data?.data);

  return NextResponse.json({ aiUsed, aiLimit: FREE_AI_LIMIT, snapshots, wallets });
}
