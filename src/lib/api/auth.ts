import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { apiJson } from "@/lib/api/response";
import { getPlan } from "@/lib/api/entitlement";


// Formato da chave: cfa_live_<40 hex> (ChainFolioAI). Aceita também o prefixo
// antigo owf_live_ para não invalidar chaves já geradas.
const KEY_RE = /^(cfa|owf)_live_[a-f0-9]{40}$/i;

// Rate limit: pedidos por chave numa janela fixa.
const RATE_LIMIT = 60;
const RATE_WINDOW_SECONDS = 60;

export type KeyCheck =
  | { ok: true; userId: string }
  | { ok: false; reason: "invalid" | "premium" | "unavailable" | "rate_limited" };

/** O que checkApiKey usa do cliente Supabase (para os testes poderem passar um falso). */
type ClienteChave = Pick<ReturnType<typeof getSupabaseAdmin>, "from" | "rpc">;

/**
 * Núcleo de validação de uma chave `cfa_live_…`, partilhado pela API REST e pelo MCP.
 * Usa o cliente admin (service role) porque quem chama não tem sessão por cookie.
 * Confirma que a chave existe, está ativa e que o dono ainda é Premium.
 * `cliente` só é passado pelos testes (scripts/testes/chaveApi.test.ts).
 */
export async function checkApiKey(token: string, cliente?: ClienteChave): Promise<KeyCheck> {
  if (!KEY_RE.test(token)) return { ok: false, reason: "invalid" };

  const keyHash = createHash("sha256").update(token).digest("hex");

  let admin: ClienteChave;
  try {
    admin = cliente ?? getSupabaseAdmin();
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  // Uma falha da BD é 503 (unavailable), não "chave inválida" nem "requer Premium".
  let userId: string;
  try {
    const { data: key, error } = await admin
      .from("api_keys")
      .select("user_id, is_active")
      .eq("key_hash", keyHash)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!key || !key.is_active) return { ok: false, reason: "invalid" };
    userId = String(key.user_id);

    // O plano vem da fonte única (entitlement.getPlan): ativa OU trialing, todas
    // as linhas válidas, Premium ganha — o mesmo que o site e o Block (api-06).
    // Antes só lia "active" e uma linha, e um Premium em trialing levava 403.
    if ((await getPlan(admin, userId)) !== "premium") return { ok: false, reason: "premium" };
  } catch (e) {
    console.error("[api-auth] chave/plano indisponível (fail-closed):", e instanceof Error ? e.message : e);
    return { ok: false, reason: "unavailable" };
  }

  // Rate limit por chave (janela fixa). Falha FECHADO (503): sem o contador não
  // há como travar abuso, e a API gasta fornecedores pagos por pedido.
  try {
    const { data, error } = await admin.rpc("api_rate_check", {
      p_key_hash: keyHash,
      p_limit: RATE_LIMIT,
      p_window_seconds: RATE_WINDOW_SECONDS,
    });
    if (error) {
      console.error("[api-auth] api_rate_check indisponível (fail-closed):", error.message);
      return { ok: false, reason: "unavailable" };
    }
    if (data === false) return { ok: false, reason: "rate_limited" };
  } catch (e) {
    console.error("[api-auth] api_rate_check lançou (fail-closed):", e instanceof Error ? e.message : e);
    return { ok: false, reason: "unavailable" };
  }

  // Regista o uso sem bloquear a resposta. (O builder é lazy: só executa no .then —
  // com `void` nunca corria e last_used_at ficava sempre vazio.)
  admin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("key_hash", keyHash)
    .then(({ error: e }) => { if (e) console.error("[api-auth] last_used_at", e.message); }, () => {});

  return { ok: true, userId };
}

export type AuthResult =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse };

/**
 * Valida o cabeçalho `Authorization: Bearer cfa_live_…` de um pedido à API REST,
 * devolvendo uma resposta de erro pronta (401 / 403 / 503) quando falha.
 * Mensagens em inglês (a API e o MCP falam inglês), com `error`/`code` estáveis.
 */
export async function authenticateApiKey(req: NextRequest): Promise<AuthResult> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  const check = await checkApiKey(token);
  if (check.ok) return { ok: true, userId: check.userId };

  if (check.reason === "rate_limited") {
    const res = apiJson(
      { error: "rate_limited", code: "rate_limited", message: `Too many requests. Limit: ${RATE_LIMIT} per ${RATE_WINDOW_SECONDS}s.` },
      { status: 429 });
    res.headers.set("Retry-After", String(RATE_WINDOW_SECONDS));
    return { ok: false, response: res };
  }
  if (check.reason === "premium") {
    return { ok: false, response: apiJson(
      { error: "premium_required", code: "premium_required", message: "API access requires an active Premium plan." }, { status: 403 }) };
  }
  if (check.reason === "unavailable") {
    return { ok: false, response: apiJson(
      { error: "service_unavailable", code: "service_unavailable", message: "Service temporarily unavailable. Try again shortly." }, { status: 503 }) };
  }
  const res = apiJson(
    { error: "invalid_key", code: "invalid_key", message: "Missing, invalid or revoked API key. Use: Authorization: Bearer cfa_live_…" },
    { status: 401 });
  res.headers.set("WWW-Authenticate", 'Bearer realm="ChainFolioAI API"');
  return { ok: false, response: res };
}
