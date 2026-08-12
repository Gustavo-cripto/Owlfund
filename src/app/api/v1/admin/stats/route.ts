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
  // Fonte autoritativa: auth.users (tem sempre created_at). Percorre paginas do
  // admin do GoTrue e conta o total + novos por janela. Devolve tudo a null se
  // a listagem falhar (fail-open).
  async function countAccounts() {
    const w = { total: 0, new24h: 0, new7d: 0, new30d: 0 };
    const t1 = daysAgo(1).getTime();
    const t7 = daysAgo(7).getTime();
    const t30 = daysAgo(30).getTime();
    try {
      for (let page = 1; page <= 50; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) return null;
        const users = data?.users ?? [];
        for (const u of users) {
          w.total++;
          const c = u.created_at ? new Date(u.created_at).getTime() : 0;
          if (c >= t1) w.new24h++;
          if (c >= t7) w.new7d++;
          if (c >= t30) w.new30d++;
        }
        if (users.length < 1000) break;
      }
      return w;
    } catch {
      return null;
    }
  }
  const accounts = (await countAccounts()) ?? { total: null, new24h: null, new7d: null, new30d: null };

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

  // -- Visualizacoes (page_views, gravadas pelo middleware) -------------------
  const views: {
    last24h: number | null;
    last7d: number | null;
    last30d: number | null;
    topPaths: Array<{ path: string; count: number }>;
    bottomPaths: Array<{ path: string; count: number }>;
    byDay: Array<{ day: string; count: number }>;
  } = {
    last24h: await countOf(head(admin, "page_views").gte("created_at", ISO(daysAgo(1)))),
    last7d: await countOf(head(admin, "page_views").gte("created_at", ISO(daysAgo(7)))),
    last30d: await countOf(head(admin, "page_views").gte("created_at", ISO(daysAgo(30)))),
    topPaths: [],
    bottomPaths: [],
    byDay: [],
  };
  try {
    // Le TODAS as visitas dos ultimos 14 dias (serve o top de paginas 7d e a serie diaria 14d).
    // NB: o PostgREST devolve no maximo ~1000 linhas por pedido (max-rows) e IGNORA .limit(),
    // por isso paginamos com .range() ate ler tudo — senao os dias recentes ficavam a 0.
    const data: Array<{ path: string; created_at: string }> = [];
    const PAGE = 1000;
    for (let from = 0; from < 100000; from += PAGE) {
      const { data: page, error } = await admin
        .from("page_views")
        .select("path, created_at")
        .gte("created_at", ISO(daysAgo(14)))
        .order("created_at", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error || !page || page.length === 0) break;
      data.push(...(page as Array<{ path: string; created_at: string }>));
      if (page.length < PAGE) break;
    }
    const sevenAgo = daysAgo(7).getTime();
    const pathCounts: Record<string, number> = {};
    const dayCounts: Record<string, number> = {};
    for (const r of data ?? []) {
      const iso = String(r.created_at);
      const t = new Date(iso).getTime();
      if (t >= sevenAgo) pathCounts[r.path] = (pathCounts[r.path] ?? 0) + 1;
      const day = iso.slice(0, 10);
      dayCounts[day] = (dayCounts[day] ?? 0) + 1;
    }
    const ranked = Object.entries(pathCounts)
      .map(([path, count]) => ({ path, count }))
      .sort((a, b) => b.count - a.count);
    views.topPaths = ranked.slice(0, 5);
    // Menos vistas: as com menos visitas (asc), excluindo as que ja estao no top.
    const inTop = new Set(views.topPaths.map((p) => p.path));
    views.bottomPaths = ranked
      .filter((p) => !inTop.has(p.path))
      .sort((a, b) => a.count - b.count)
      .slice(0, 5);
    // Serie de 14 dias, do mais antigo ao mais recente, com zeros preenchidos.
    const byDay: Array<{ day: string; count: number }> = [];
    for (let i = 13; i >= 0; i--) {
      const day = ISO(daysAgo(i)).slice(0, 10);
      byDay.push({ day, count: dayCounts[day] ?? 0 });
    }
    views.byDay = byDay;
  } catch { /* sem detalhe de views */ }

  return apiJson({
    generatedAt: ISO(now),
    accounts,
    plans,
    apiKeys,
    usage,
    payments,
    views,
  });
}
