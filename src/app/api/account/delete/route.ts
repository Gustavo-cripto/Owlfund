import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { apagarContaETudo } from "@/lib/account/apagar";

// A lista de tabelas e a ordem dos passos estão em src/lib/account/apagar.ts.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export async function POST() {
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

  const { apagada, falhas } = await apagarContaETudo(admin, userId, user.email);
  if (!apagada) {
    return NextResponse.json({ error: "Não foi possível apagar a conta." }, { status: 500 });
  }

  // Diz-se a verdade sobre o que ficou. Uma tabela que falhou nao pode passar
  // por "apagado tudo" — o utilizador tem direito a saber e a voltar a pedir.
  if (falhas.length > 0) {
    console.error("[account/delete] apagamento PARCIAL:", userId, falhas.join(", "));
    return NextResponse.json({ deleted: true, partial: true, tables: falhas.length });
  }
  return NextResponse.json({ deleted: true });
}
