import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Sessão por cookie + verificação Premium, partilhada pelas rotas de webhooks
// e sincronização (que são chamadas pela app com o utilizador autenticado).

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const premiumPriceId =
  process.env.STRIPE_PREMIUM_PRICE_ID ??
  process.env.NEXT_PUBLIC_STRIPE_PREMIUM_PRICE_ID ??
  "";

export async function getSessionUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: { get: (name) => cookieStore.get(name)?.value, set: () => {}, remove: () => {} },
  });
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user };
}

export async function isUserPremium(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
): Promise<boolean> {
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("price_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  return !!premiumPriceId && sub?.price_id === premiumPriceId;
}
