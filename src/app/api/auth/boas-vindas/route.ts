import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { enviarBoasVindas } from "@/lib/emails/boasVindas";

// Boas-vindas a quem acabou de criar conta com email e palavra-passe: esse
// registo não passa pelo servidor (o Supabase devolve logo a sessão ao browser),
// por isso o formulário chama esta rota antes de entrar. Só para a conta da
// própria sessão; as regras (uma vez, conta com menos de 3 dias, sem beta,
// sem opt-out) estão em enviarBoasVindas. Responde sempre 204.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (data.user) await enviarBoasVindas(getSupabaseAdmin(), data.user);
  } catch (e) {
    console.error("[auth/boas-vindas]", e instanceof Error ? e.message : e);
  }
  return new Response(null, { status: 204 });
}
