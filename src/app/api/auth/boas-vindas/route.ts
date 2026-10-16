import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { acolherContaNova } from "@/lib/beta/contaNova";

// Acolher quem acabou de criar conta por palavra-passe ou por carteira: esses
// registos não passam pelo servidor (o Supabase devolve logo a sessão ao
// browser), por isso o formulário chama esta rota antes de entrar. Só para a
// conta da própria sessão; Premium do beta, Telegram e boas-vindas, uma vez
// (src/lib/beta/contaNova.ts). Responde sempre 204.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (data.user) await acolherContaNova(getSupabaseAdmin(), data.user, { cookie: req.headers.get("cookie") });
    else console.info("[boas-vindas] pedido sem sessão (cookie ainda não chegou ao servidor?)");
  } catch (e) {
    console.error("[auth/boas-vindas]", e instanceof Error ? e.message : e);
  }
  return new Response(null, { status: 204 });
}
