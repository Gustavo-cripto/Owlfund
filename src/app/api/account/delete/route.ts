import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { apagarContaETudo } from "@/lib/account/apagar";
import { confirmarPalavraPasse } from "@/lib/auth/confirmarPalavraPasse";
import { falta2faNaSessao } from "@/lib/auth/nivelSessao";
import { resposta2fa } from "@/lib/auth/resposta2fa";
import { rateLimit } from "@/lib/utils/rateLimit";

// A lista de tabelas e a ordem dos passos estão em src/lib/account/apagar.ts.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: { get: (name) => cookieStore.get(name)?.value, set: () => {}, remove: () => {} },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (await falta2faNaSessao(supabase, user)) return resposta2fa();

  const userId = user.id;

  // Quem entra com palavra-passe confirma-a aqui, no servidor: com uma sessão roubada
  // bastava chamar esta rota. Google e carteira não têm palavra-passe para confirmar
  // (a mesma regra de needsCurrentPassword em /account).
  if ((user.app_metadata as { provider?: string } | undefined)?.provider === "email") {
    if (!rateLimit(`apagar-conta:${userId}`, 5, 60_000)) {
      return NextResponse.json({ error: "Demasiadas tentativas.", code: "RATE_LIMITED" }, { status: 429 });
    }
    const corpo = (await request.json().catch(() => null)) as { password?: unknown; captchaToken?: unknown } | null;
    const confirmacao = await confirmarPalavraPasse(user.email, corpo?.password, corpo?.captchaToken);
    if (confirmacao === "errada") return NextResponse.json({ error: "Palavra-passe errada.", code: "WRONG_PASSWORD" }, { status: 401 });
    if (confirmacao === "indisponivel") return NextResponse.json({ error: "Serviço indisponível.", code: "UNAVAILABLE" }, { status: 503 });
  }

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
