// "Conta nova → Carteiras": decidido pelo ESTADO da conta, nao pelo relogio.
//
// A regra anterior (created_at ha menos de 15 min) falhava no caso normal: o
// created_at fica fixado quando o email e PEDIDO, e quem o abre 20 minutos
// depois caia no /dashboard. Agora: sem linha em wallet_config (nunca guardou
// nada) e sem destino pedido → /wallets. Serve ao callback, a rota de
// confirmacao (com o cliente admin) e ao One Tap (com o cliente do proprio
// utilizador — a politica RLS deixa-o ler a sua linha).
//
// Em caso de duvida (erro, tabela em falta) responde false: nunca desviar
// alguem que ja tem carteiras.
import type { SupabaseClient } from "@supabase/supabase-js";

export async function contaSemCarteiras(client: SupabaseClient, userId: string): Promise<boolean> {
  if (!userId) return false;
  try {
    const { data, error } = await client.from("wallet_config").select("user_id").eq("user_id", userId).maybeSingle();
    if (error) return false;
    return !data;
  } catch { return false; }
}

const LANGS = ["pt", "en", "es", "fr"] as const;
export type LangCookie = (typeof LANGS)[number];

/** `?lang=` valido, ou null. */
export function langDoPedido(searchParams: URLSearchParams): LangCookie | null {
  const l = searchParams.get("lang");
  return l && (LANGS as readonly string[]).includes(l) ? (l as LangCookie) : null;
}

/** Cookie que leva a lingua ate ao browser onde o email foi aberto (1 ano). */
export const COOKIE_LANG = { name: "cfa-lang", path: "/", maxAge: 31536000, sameSite: "lax" as const };
