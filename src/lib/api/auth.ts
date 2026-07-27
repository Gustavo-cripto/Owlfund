import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { apiJson } from "@/lib/api/response";

// Preço Premium (o acesso à API/MCP é uma funcionalidade Premium).
const premiumPriceId =
  process.env.STRIPE_PREMIUM_PRICE_ID ??
  process.env.NEXT_PUBLIC_STRIPE_PREMIUM_PRICE_ID ??
  "";

// Formato da chave gerada em /api/api-keys: owf_live_<40 hex>.
const KEY_RE = /^owf_live_[a-f0-9]{40}$/i;

// Rate limit: pedidos por chave numa janela fixa.
const RATE_LIMIT = 60;
const RATE_WINDOW_SECONDS = 60;

export type KeyCheck =
  | { ok: true; userId: string }
  | { ok: false; reason: "invalid" | "premium" | "unavailable" | "rate_limited" };

/**
 * Núcleo de validação de uma chave `owf_live_…`, partilhado pela API REST e pelo MCP.
 * Usa o cliente admin (service role) porque quem chama não tem sessão por cookie.
 * Confirma que a chave existe, está ativa e que o dono ainda é Premium.
 */
export async function checkApiKey(token: string): Promise<KeyCheck> {
  if (!KEY_RE.test(token)) return { ok: false, reason: "invalid" };

  const keyHash = createHash("sha256").update(token).digest("hex");

  let admin: ReturnType<typeof getSupabaseAdmin>;
  try {
    admin = getSupabaseAdmin();
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  const { data: key } = await admin
    .from("api_keys")
    .select("user_id, is_active")
    .eq("key_hash", keyHash)
    .maybeSingle();

  if (!key || !key.is_active) return { ok: false, reason: "invalid" };

  const { data: sub } = await admin
    .from("subscriptions")
    .select("price_id")
    .eq("user_id", key.user_id)
    .eq("status", "active")
    .maybeSingle();

  const isPremium = !!premiumPriceId && sub?.price_id === premiumPriceId;
  if (!isPremium) return { ok: false, reason: "premium" };

  // Rate limit por chave (janela fixa). Falha ABERTO se a migração/RPC ainda
  // não existir — assim é seguro publicar antes de correr supabase-rate-limits.sql.
  try {
    const { data, error } = await admin.rpc("api_rate_check", {
      p_key_hash: keyHash,
      p_limit: RATE_LIMIT,
      p_window_seconds: RATE_WINDOW_SECONDS,
    });
    if (!error && data === false) return { ok: false, reason: "rate_limited" };
  } catch {
    // tabela/função ainda não existe → deixa passar
  }

  // Regista o uso sem bloquear a resposta.
  void admin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("key_hash", keyHash);

  return { ok: true, userId: key.user_id };
}

export type AuthResult =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse };

/**
 * Valida o cabeçalho `Authorization: Bearer owf_live_…` de um pedido à API REST,
 * devolvendo uma resposta de erro pronta (401 / 403 / 503) quando falha.
 */
export async function authenticateApiKey(req: NextRequest): Promise<AuthResult> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  const check = await checkApiKey(token);
  if (check.ok) return { ok: true, userId: check.userId };

  if (check.reason === "rate_limited") {
    const res = apiJson(
      { error: "rate_limited", message: `Demasiados pedidos. Limite: ${RATE_LIMIT} por ${RATE_WINDOW_SECONDS}s.` },
      { status: 429 });
    res.headers.set("Retry-After", String(RATE_WINDOW_SECONDS));
    return { ok: false, response: res };
  }
  if (check.reason === "premium") {
    return { ok: false, response: apiJson(
      { error: "premium_required", message: "O acesso à API requer um plano Premium ativo." }, { status: 403 }) };
  }
  if (check.reason === "unavailable") {
    return { ok: false, response: apiJson(
      { error: "service_unavailable", message: "Serviço temporariamente indisponível." }, { status: 503 }) };
  }
  const res = apiJson(
    { error: "invalid_key", message: "Chave de API em falta, inválida ou revogada. Usa: Authorization: Bearer owf_live_…" },
    { status: 401 });
  res.headers.set("WWW-Authenticate", 'Bearer realm="ChainFolioAI API"');
  return { ok: false, response: res };
}
