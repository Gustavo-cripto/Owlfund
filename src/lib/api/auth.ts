import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Preço Premium (o acesso à API é uma funcionalidade Premium).
const premiumPriceId =
  process.env.STRIPE_PREMIUM_PRICE_ID ??
  process.env.NEXT_PUBLIC_STRIPE_PREMIUM_PRICE_ID ??
  "";

// Formato da chave gerada em /api/api-keys: owf_live_<40 hex>.
const KEY_RE = /^owf_live_[a-f0-9]{40}$/i;

export type AuthResult =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse };

function fail(status: number, error: string, message: string): { ok: false; response: NextResponse } {
  const res = NextResponse.json({ error, message }, { status });
  if (status === 401) res.headers.set("WWW-Authenticate", 'Bearer realm="ChainFolioAI API"');
  return { ok: false, response: res };
}

/**
 * Valida o cabeçalho `Authorization: Bearer owf_live_…` de um pedido à API pública.
 * Usa o cliente admin (service role) porque quem chama não tem sessão por cookie.
 * Confirma que a chave existe, está ativa e que o dono ainda é Premium.
 */
export async function authenticateApiKey(req: NextRequest): Promise<AuthResult> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!KEY_RE.test(token)) {
    return fail(401, "invalid_key", "Chave de API em falta ou mal formada. Usa: Authorization: Bearer owf_live_…");
  }

  const keyHash = createHash("sha256").update(token).digest("hex");

  let admin: ReturnType<typeof getSupabaseAdmin>;
  try {
    admin = getSupabaseAdmin();
  } catch {
    return fail(503, "service_unavailable", "Serviço temporariamente indisponível.");
  }

  const { data: key } = await admin
    .from("api_keys")
    .select("user_id, is_active")
    .eq("key_hash", keyHash)
    .maybeSingle();

  if (!key || !key.is_active) {
    return fail(401, "invalid_key", "Chave de API inválida ou revogada.");
  }

  const { data: sub } = await admin
    .from("subscriptions")
    .select("price_id")
    .eq("user_id", key.user_id)
    .eq("status", "active")
    .maybeSingle();

  const isPremium = !!premiumPriceId && sub?.price_id === premiumPriceId;
  if (!isPremium) {
    return fail(403, "premium_required", "O acesso à API requer um plano Premium ativo.");
  }

  // Regista o uso sem bloquear a resposta.
  void admin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("key_hash", keyHash);

  return { ok: true, userId: key.user_id };
}
