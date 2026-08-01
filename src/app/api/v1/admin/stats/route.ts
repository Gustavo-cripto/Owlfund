import { NextRequest } from "next/server";
import { apiJson } from "@/lib/api/response";
import { verifyAdminAuth } from "@/lib/api/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Endpoint interno de estatisticas do site. Protegido por ADMIN_STATS_TOKEN
// (ver src/lib/api/admin-auth.ts). Agrega contas, planos ativos, chaves de API,
// uso e pagamentos. Cada bloco falha de forma isolada: se uma tabela/coluna nao
// existir, esse campo vem a null em vez de derrubar a resposta toda.

// Mapa price_id -> etiqueta de plano (definido nas env vars do projeto).
function planLabel(priceId: string | null): string {
  if (!priceId) return "desconhecido";
  const map: Record<string, string> = {
    [process.env.STRIPE_PRICE_ID ?? "_pm"]: "pro_mensal",
    [process.env.STRIPE_PRICE_ID_ANNUAL ?? "_pa"]: "pro_anual",
    [process.env.STRIPE_PREMIUM_PRICE_ID ?? "_prm"]: "premium_mensal",
    [process.env.STRIPE_PREMIUM_PRICE_ID_ANNUAL ?? "_pra"]: "premium_anual",
  };
  return map[priceId] ?? "outro";
}

const ISO = (d: Date) => d.toISOString();
const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000);

type Admin = ReturnType<typeof getSupabaseAdmin>;

// Resolve uma contagem "head" (so COUNT, sem trazer linhas). Devolve null se a
// query falhar  p.ex. a coluna created_at nao existir na tabela  para nunca
// derrubar a resposta toda por causa de um unico bloco.
async function countOf(
  query: PromiseLike<{ count: number | null; error: unknown }>
): Promise<number | null> {
  try {
    const { count, error } = await query;
    return error ? null : count ?? 0;
  } catch {
    return null;
  }
}

// Atalho: `head(admin, "tabela")`  PostgrestFilterBuilder com count exato.
const head = (admin: Admin, table: string) =>
  admin.from(table).select("*", { count: "exact", head: true });

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    const res = apiJson(
      { error: "unauthorized", message: "Token de administracao em falta ou invalido." },
      { status: 401 });
    res.headers.set("WWW-Authenticate", 'Bearer realm="ChainFolioAI Admin"');
    return res;
  }

  let admin: Admin;
  try {
    admin = getSupabaseAdmin();
  } catch {
    return apiJson(
      { error: "service_unavailable", message: "Supabase nao configurado." },
      { status: 503 });
  }

  const now = new Date();

  // -- Contas ----------------------------------------------------------------
  const accounts = {
    total: await countOf(head(admin, "profiles")),
    new24h: await countOf(head(admin, "profiles").gte("created_at", ISO(daysAgo(1)))),
    new7d: await countOf(head(admin, "profiles").gte("created_at", ISO(daysAgo(7)))),
    new30d: await countOf(head(admin, "profiles").gte("created_at", ISO(daysAgo(30)))),
  };

  // -- Planos ativos (subscriptions) ------------------------------------------
  const plans: {
    activeTotal: number;
    byPlan: Record<string, number>;
    bySource: Record<string, number>;
    cancelingAtPeriodEnd: number;
    expiringSoon: Array<{ userId: string; plan: string; currentPeriodEnd: string }>;
  } = {
    activeTotal: 0,
    byPlan: {},
    bySource: {},
    cancelingAtPeriodEnd: 0,
    expiringSoon: [],
  };
  try {
    const { data: subs } = await admin
      .from("subscriptions")
      .select("user_id, price_id, status, source, current_period_end, cancel_at_period_end")
      .eq("status", "active");
    const soon = new Date(Date.now() + 7 * 86400_000);
    for (const s of subs ?? []) {
      plans.activeTotal++;
      const label = planLabel(s.price_id ?? null);
      plans.byPlan[label] = (plans.byPlan[label] ?? 0) + 1;
      const src = s.source ?? "stripe";
      plans.bySource[src] = (plans.bySource[src] ?? 0) + 1;
      if (s.cancel_at_period_end) plans.cancelingAtPeriodEnd++;
      if (s.current_period_end) {
        const end = new Date(s.current_period_end);
        if (end >= now && end <= soon) {
          plans.expiringSoon.push({
            userId: s.user_id,
            plan: label,
            currentPeriodEnd: s.current_period_end,
          });
        }
      }
    }
    plans.expiringSoon.sort((a, b) => a.currentPeriodEnd.localeCompare(b.currentPeriodEnd));
  } catch { /* deixa os defaults */ }

  // -- Chaves de API (dos clientes) -------------------------------------------
  // As chaves nao expiram; monitorizamos ativas, novas e utilizacao recente.
  const apiKeys = {
    active: await countOf(head(admin, "api_keys").eq("is_active", true)),
    createdLast7d: await countOf(head(admin, "api_keys").gte("created_at", ISO(daysAgo(7)))),
    usedLast7d: await countOf(head(admin, "api_keys").gte("last_used_at", ISO(daysAgo(7)))),
  };

  // -- Uso e atividade --------------------------------------------------------
  const usage: Record<string, number | null> = {
    snapshotsLast24h: await countOf(head(admin, "portfolio_snapshots").gte("created_at", ISO(daysAgo(1)))),
    snapshotsLast7d: await countOf(head(admin, "portfolio_snapshots").gte("created_at", ISO(daysAgo(7)))),
    chatUsers: await countOf(head(admin, "chat_usage")),
  };
  try {
    const { data: chat } = await admin.from("chat_usage").select("count");
    usage.chatMessagesTotal = (chat ?? []).reduce((n, r) => n + (r.count ?? 0), 0);
  } catch {
    usage.chatMessagesTotal = null;
  }

  // -- Pagamentos em cripto ---------------------------------------------------
  const payments = {
    cryptoPendingNow: await countOf(head(admin, "crypto_payments").eq("status", "pending")),
    cryptoConfirmedLast7d: await countOf(
      head(admin, "crypto_payments").eq("status", "confirmed").gte("confirmed_at", ISO(daysAgo(7)))),
  };

  return apiJson({
    generatedAt: ISO(now),
    accounts,
    plans,
    apiKeys,
    usage,
    payments,
  });
}
