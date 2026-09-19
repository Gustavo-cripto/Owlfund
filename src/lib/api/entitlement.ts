// Direitos por plano no SERVIDOR — fonte única para as rotas que gastam
// dinheiro (IA, Moralis, Twelve Data). O cliente só mostra; quem decide é isto.
//
// Regras:
//   • o plano vem de `subscriptions` (ativa/trialing e não expirada, linha mais
//     recente) — igual a /api/subscription, para a UI e o servidor nunca divergirem;
//   • a quota mensal de IA do Free é UMA (Chain + análise do portefólio partilham
//     o contador em `chat_usage`);
//   • falha FECHADO: se a base de dados não responder, não se gasta IA a quem não
//     conseguimos verificar (antes abria e o custo ficava do nosso lado).

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { FREE_AI_LIMIT } from "@/lib/plans";
import { isPremiumPriceId } from "@/lib/payments/priceIds";

export type Plan = "free" | "pro" | "premium";

const notExpired = () => `current_period_end.is.null,current_period_end.gt.${new Date().toISOString()}`;

/** Plano de cada utilizador da lista (só os que têm subscrição válida aparecem). Lança em erro de BD. */
export async function activeSubscribers(client: Pick<SupabaseClient, "from">, userIds: string[]): Promise<Map<string, Plan>> {
  const plans = new Map<string, Plan>();
  if (userIds.length === 0) return plans;
  const { data, error } = await client
    .from("subscriptions")
    .select("user_id, price_id")
    .in("user_id", userIds)
    .in("status", ["active", "trialing"])
    .or(notExpired());
  if (error) throw new Error(error.message);
  for (const row of (data ?? []) as Array<{ user_id: string; price_id: string | null }>) {
    const plan: Plan = isPremiumPriceId(row.price_id) ? "premium" : "pro";
    if (plan === "premium" || !plans.has(row.user_id)) plans.set(row.user_id, plan);
  }
  return plans;
}

/** Plano efetivo de um utilizador. Lança em erro de BD. */
export async function getPlan(client: Pick<SupabaseClient, "from">, userId: string): Promise<Plan> {
  return (await activeSubscribers(client, [userId])).get(userId) ?? "free";
}

/** Igual a getPlan mas devolve null quando a BD falha (para a rota responder 503). */
export async function getPlanOrNull(userId: string): Promise<Plan | null> {
  try {
    return await getPlan(getSupabaseAdmin(), userId);
  } catch (e) {
    console.error("[entitlement] plano indisponível:", e instanceof Error ? e.message : e);
    return null;
  }
}

export type AiQuota =
  | { ok: true; plan: Plan; free: boolean; count: number; limit: number }
  | { ok: false; reason: "limit_reached"; count: number; limit: number }
  | { ok: false; reason: "unavailable" };

/** Verifica (sem gastar) a quota mensal de IA. Pro/Premium: sem limite. */
export async function checkAiQuota(userId: string): Promise<AiQuota> {
  try {
    const admin = getSupabaseAdmin();
    const plan = await getPlan(admin, userId);
    if (plan !== "free") return { ok: true, plan, free: false, count: 0, limit: 0 };

    const month = new Date().toISOString().slice(0, 7);
    const { data, error } = await admin
      .from("chat_usage")
      .select("count")
      .eq("user_id", userId)
      .eq("month", month)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const count = (data?.count as number | undefined) ?? 0;
    if (count >= FREE_AI_LIMIT) return { ok: false, reason: "limit_reached", count, limit: FREE_AI_LIMIT };
    return { ok: true, plan, free: true, count, limit: FREE_AI_LIMIT };
  } catch (e) {
    console.error("[entitlement] quota indisponível (fail-closed):", e instanceof Error ? e.message : e);
    return { ok: false, reason: "unavailable" };
  }
}

/**
 * RESERVA 1 análise do Free — chamar ANTES de falar com o fornecedor de IA.
 *
 * Antes havia um `checkAiQuota` que lia o contador e, 15 a 25 segundos depois
 * (o tempo da chamada à IA), um incremento que escrevia `lido + 1`. Trinta
 * pedidos ao mesmo tempo liam todos zero, passavam todos, e escreviam todos
 * "1": o limite de 3 por mês não existia, e as chamadas pagas eram todas
 * faturadas ao dono.
 *
 * Agora o incremento acontece dentro do Postgres numa só instrução e o valor
 * que decide é o que o Postgres devolve. Ver supabase-chat-usage-atomic.sql.
 */
export async function reserveAiUsage(userId: string): Promise<AiQuota> {
  try {
    const admin = getSupabaseAdmin();
    const plan = await getPlan(admin, userId);
    if (plan !== "free") return { ok: true, plan, free: false, count: 0, limit: 0 };

    const month = new Date().toISOString().slice(0, 7);
    const { data, error } = await admin.rpc("chat_usage_reserve", { p_user_id: userId, p_month: month });
    if (error) throw new Error(error.message);
    const count = Number(data);
    if (!Number.isFinite(count)) throw new Error("resposta inesperada de chat_usage_reserve");

    if (count > FREE_AI_LIMIT) {
      // Passou do limite: devolve-se já, para o contador não subir sem parar.
      await releaseAiUsage(userId);
      return { ok: false, reason: "limit_reached", count: FREE_AI_LIMIT, limit: FREE_AI_LIMIT };
    }
    return { ok: true, plan, free: true, count, limit: FREE_AI_LIMIT };
  } catch (e) {
    console.error("[entitlement] reserva de quota indisponível (fail-closed):", e instanceof Error ? e.message : e);
    return { ok: false, reason: "unavailable" };
  }
}

/** Devolve a análise reservada quando o fornecedor de IA não chegou a responder. */
export async function releaseAiUsage(userId: string): Promise<void> {
  try {
    const month = new Date().toISOString().slice(0, 7);
    const { error } = await getSupabaseAdmin().rpc("chat_usage_release", { p_user_id: userId, p_month: month });
    if (error) throw new Error(error.message);
  } catch (e) {
    console.error("[entitlement] devolução de quota falhou:", e instanceof Error ? e.message : e);
  }
}

/**
 * @deprecated Usar `reserveAiUsage` antes da chamada à IA. Mantido só para não
 * partir quem ainda chame; não protege contra pedidos em paralelo.
 */
export async function incrementAiUsage(userId: string, _currentCount: number): Promise<void> {
  await reserveAiUsage(userId);
}

export function quotaErrorResponse(q: Extract<AiQuota, { ok: false }>): NextResponse {
  if (q.reason === "limit_reached") {
    return NextResponse.json(
      {
        error: `Atingiste o limite de ${q.limit} análises IA/mês do plano Gratuito. Faz upgrade para Pro para análises ilimitadas.`,
        code: "limit_reached",
        limitReached: true,
        count: q.count,
        limit: q.limit,
      },
      { status: 429 },
    );
  }
  return NextResponse.json(
    { error: "Não foi possível verificar o teu plano agora. Tenta novamente dentro de instantes.", code: "unavailable" },
    { status: 503 },
  );
}

export function requiresPlanResponse(min: "pro" | "premium"): NextResponse {
  return NextResponse.json(
    {
      error: min === "pro" ? "Esta funcionalidade faz parte do plano Pro." : "Esta funcionalidade faz parte do plano Premium.",
      code: min === "pro" ? "requires_pro" : "requires_premium",
    },
    { status: 403 },
  );
}

export function planUnavailableResponse(): NextResponse {
  return NextResponse.json(
    { error: "Não foi possível verificar o teu plano agora. Tenta novamente dentro de instantes.", code: "unavailable" },
    { status: 503 },
  );
}
