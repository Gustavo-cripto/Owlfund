import { NextRequest } from "next/server";
import { apiJson } from "@/lib/api/response";
import { verifyAdminAuth } from "@/lib/api/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isPremiumPriceId, launchReadiness, priceLabel } from "@/lib/payments/priceIds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Endpoint interno de estatisticas do site. Protegido por ADMIN_STATS_TOKEN
// (ver src/lib/api/admin-auth.ts). Agrega contas, planos ativos, chaves de API,
// uso e pagamentos. Cada bloco falha de forma isolada: se uma tabela/coluna nao
// existir, esse campo vem a null em vez de derrubar a resposta toda.

// Etiquetas de preço (inclui anual e fundador) — src/lib/payments/priceIds.ts
const planLabel = (priceId: string | null): string => priceLabel(priceId);

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
      { error: "unauthorized", message: "Token de administração em falta ou inválido." },
      { status: 401 });
    res.headers.set("WWW-Authenticate", 'Bearer realm="ChainFolioAI Admin"');
    return res;
  }

  let admin: Admin;
  try {
    admin = getSupabaseAdmin();
  } catch {
    return apiJson(
      { error: "service_unavailable", message: "Supabase não configurado." },
      { status: 503 });
  }

  const now = new Date();

  // -- Contas ----------------------------------------------------------------
  // Fonte autoritativa: auth.users (tem sempre created_at). Percorre paginas do
  // admin do GoTrue e conta o total + novos por janela. Devolve tudo a null se
  // a listagem falhar (fail-open).
  async function countAccounts() {
    const w: { total: number; new24h: number; new7d: number; new30d: number; bySource30d: Array<{ src: string; count: number }> } = { total: 0, new24h: 0, new7d: 0, new30d: 0, bySource30d: [] };
    const porCanal: Record<string, number> = {};
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
          if (c >= t30) {
            w.new30d++;
            // user_metadata.src = canal do primeiro toque (cookie cfa-src); sem
            // ele e "(direto)" — inclui quem chegou antes de isto existir.
            const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
            const src = typeof meta.src === "string" && meta.src ? meta.src : "(direto)";
            porCanal[src] = (porCanal[src] ?? 0) + 1;
          }
        }
        if (users.length < 1000) break;
      }
      w.bySource30d = Object.entries(porCanal).map(([src, count]) => ({ src, count })).sort((a, b) => b.count - a.count);
      return w;
    } catch {
      return null;
    }
  }
  const accounts = (await countAccounts()) ?? { total: null, new24h: null, new7d: null, new30d: null, bySource30d: [] };

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
  //
  // PESSOAS e ROBOS em numeros separados, em todo o lado. Ate 24 set 2026 os
  // totais (last24h/7d/30d, byDay, topPaths) somavam tudo, e foi assim que
  // "1.100 visitas por dia" chegou ao agente social como se fossem pessoas:
  // eram sobretudo rastreadores. As chaves antigas continuam a existir mas
  // passam a contar SO humanos; os robos ficam em `bots`.
  const views: {
    last24h: number | null;
    last7d: number | null;
    last30d: number | null;
    /** Pedidos de agentes automaticos (crawlers, agentes de IA, monitores), a parte. */
    bots: { last24h: number | null; last7d: number | null; last30d: number | null };
    topPaths: Array<{ path: string; count: number }>;
    bottomPaths: Array<{ path: string; count: number }>;
    byDay: Array<{ day: string; count: number; bots: number }>;
    /**
     * Visitas dos ultimos 7 dias por origem do link (?src=…), com as PESSOAS
     * separadas dos robos.
     *
     * Juntas, o numero engana e muito: a 20 set 2026, "threads-gust" tinha 60
     * visitas marcadas e ZERO humanas, e "threads" tinha 51 visitas com 2
     * humanas. Quem olhasse so para o total concluia que o Threads estava a
     * funcionar. E por `humans` que se decide onde vale a pena divulgar.
     */
    bySource: Array<{ src: string; humans: number; bots: number; count: number }>;
  } = {
    last24h: await countOf(head(admin, "page_views").eq("is_bot", false).gte("created_at", ISO(daysAgo(1)))),
    last7d: await countOf(head(admin, "page_views").eq("is_bot", false).gte("created_at", ISO(daysAgo(7)))),
    last30d: await countOf(head(admin, "page_views").eq("is_bot", false).gte("created_at", ISO(daysAgo(30)))),
    bots: {
      last24h: await countOf(head(admin, "page_views").eq("is_bot", true).gte("created_at", ISO(daysAgo(1)))),
      last7d: await countOf(head(admin, "page_views").eq("is_bot", true).gte("created_at", ISO(daysAgo(7)))),
      last30d: await countOf(head(admin, "page_views").eq("is_bot", true).gte("created_at", ISO(daysAgo(30)))),
    },
    topPaths: [],
    bottomPaths: [],
    byDay: [],
    bySource: [],
  };
  try {
    // Le TODAS as visitas dos ultimos 14 dias (serve o top de paginas 7d e a serie diaria 14d).
    // NB: o PostgREST devolve no maximo ~1000 linhas por pedido (max-rows) e IGNORA .limit(),
    // por isso paginamos com .range() ate ler tudo — senao os dias recentes ficavam a 0.
    type Row = { path: string; created_at: string; src?: string | null; is_bot?: boolean | null };
    const data: Row[] = [];
    const PAGE = 1000;
    // `src` e uma coluna nova (supabase-page-views-src.sql). Se ainda nao
    // existir, o pedido falha e repete-se sem ela — as visitas contam na mesma.
    let colunas = "path, created_at, src, is_bot";
    for (let from = 0; from < 100000; from += PAGE) {
      let { data: page, error } = await admin
        .from("page_views")
        .select(colunas)
        .gte("created_at", ISO(daysAgo(14)))
        .order("created_at", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error && colunas !== "path, created_at") {
        colunas = "path, created_at";
        ({ data: page, error } = await admin
          .from("page_views")
          .select(colunas)
          .gte("created_at", ISO(daysAgo(14)))
          .order("created_at", { ascending: true })
          .range(from, from + PAGE - 1));
      }
      if (error || !page || page.length === 0) break;
      data.push(...(page as unknown as Row[]));
      if (page.length < PAGE) break;
    }
    const sevenAgo = daysAgo(7).getTime();
    const pathCounts: Record<string, number> = {};
    const dayCounts: Record<string, number> = {};
    const dayBots: Record<string, number> = {};
    const srcCounts: Record<string, { humans: number; bots: number }> = {};
    for (const r of data ?? []) {
      const iso = String(r.created_at);
      const t = new Date(iso).getTime();
      const day = iso.slice(0, 10);
      if (r.is_bot) { dayBots[day] = (dayBots[day] ?? 0) + 1; }
      if (t >= sevenAgo && r.src) {
        const c = (srcCounts[r.src] ??= { humans: 0, bots: 0 });
        if (r.is_bot) c.bots++; else c.humans++;
      }
      if (r.is_bot) continue; // paginas mais/menos vistas e serie diaria: so pessoas
      if (t >= sevenAgo) pathCounts[r.path] = (pathCounts[r.path] ?? 0) + 1;
      dayCounts[day] = (dayCounts[day] ?? 0) + 1;
    }
    const ranked = Object.entries(pathCounts)
      .map(([path, count]) => ({ path, count }))
      .sort((a, b) => b.count - a.count);
    // Ordenado por PESSOAS, nao pelo total: e o numero que decide.
    views.bySource = Object.entries(srcCounts)
      .map(([src, c]) => ({ src, humans: c.humans, bots: c.bots, count: c.humans + c.bots }))
      .sort((a, b) => b.humans - a.humans || b.count - a.count);
    views.topPaths = ranked.slice(0, 5);
    // Menos vistas: as com menos visitas (asc), excluindo as que ja estao no top.
    const inTop = new Set(views.topPaths.map((p) => p.path));
    views.bottomPaths = ranked
      .filter((p) => !inTop.has(p.path))
      .sort((a, b) => a.count - b.count)
      .slice(0, 5);
    // Serie de 14 dias, do mais antigo ao mais recente, com zeros preenchidos.
    const byDay: Array<{ day: string; count: number; bots: number }> = [];
    for (let i = 13; i >= 0; i--) {
      const day = ISO(daysAgo(i)).slice(0, 10);
      byDay.push({ day, count: dayCounts[day] ?? 0, bots: dayBots[day] ?? 0 });
    }
    views.byDay = byDay;
  } catch { /* sem detalhe de views */ }

  // -- Beta testers (atribuições manuais): lista completa p/ o bot de gestão --
  type BetaTester = {
    email: string;
    plan: string;
    activatedAt: string | null;
    expiresAt: string | null;
    daysLeft: number | null;
    lastSignInAt: string | null;
    inactiveDays: number | null;
  };
  const betaTesters: BetaTester[] = [];
  try {
    const { data: manualSubs } = await admin
      .from("subscriptions")
      .select("user_id, price_id, current_period_end")
      .eq("source", "manual")
      .eq("status", "active")
      .order("current_period_end", { ascending: true });
    for (const sub of manualSubs ?? []) {
      let email = "";
      let lastSignInAt: string | null = null;
      try {
        const { data } = await admin.auth.admin.getUserById(sub.user_id as string);
        email = data.user?.email ?? "";
        lastSignInAt = (data.user?.last_sign_in_at as string | undefined) ?? null;
      } catch { /* ignore */ }
      const end = sub.current_period_end ? new Date(sub.current_period_end as string) : null;
      const daysLeft = end ? Math.ceil((end.getTime() - now.getTime()) / 86_400_000) : null;
      betaTesters.push({
        email,
        plan: isPremiumPriceId(sub.price_id) ? "premium" : "pro",
        activatedAt: end ? new Date(end.getTime() - 60 * 86_400_000).toISOString() : null,
        expiresAt: (sub.current_period_end as string) ?? null,
        daysLeft,
        lastSignInAt,
        inactiveDays: lastSignInAt
          ? Math.floor((now.getTime() - new Date(lastSignInAt).getTime()) / 86_400_000)
          : null,
      });
    }
  } catch { /* lista vazia em caso de erro */ }

  // -- Inscricoes no beta por origem ------------------------------------------
  // A origem (?src=) vai para o inicio da nota como "[via X]" desde o
  // lancamento; contar a partir dai nao exige coluna nova. E a outra metade
  // do que o marketing precisa: nao so que canal traz visitas, mas qual traz
  // inscricoes.
  const betaSignups: { last7d: number; last30d: number; bySource30d: Array<{ src: string; count: number }> } = {
    last7d: 0, last30d: 0, bySource30d: [],
  };
  try {
    const { data: rows } = await admin
      .from("beta_signups")
      .select("note, created_at")
      .gte("created_at", ISO(daysAgo(30)));
    const sevenAgo = daysAgo(7).getTime();
    const porOrigem: Record<string, number> = {};
    for (const r of (rows ?? []) as Array<{ note: string | null; created_at: string }>) {
      betaSignups.last30d++;
      if (new Date(r.created_at).getTime() >= sevenAgo) betaSignups.last7d++;
      const via = /^\[via ([a-zA-Z0-9_-]+)\]/.exec(r.note ?? "");
      const src = via ? via[1] : "(direto)";
      porOrigem[src] = (porOrigem[src] ?? 0) + 1;
    }
    betaSignups.bySource30d = Object.entries(porOrigem).map(([src, count]) => ({ src, count })).sort((a, b) => b.count - a.count);
  } catch { /* bloco vazio em caso de erro */ }

  return apiJson({
    generatedAt: ISO(now),
    // Prontidão para o lançamento (só sim/não por env var) — scripts/launch-check.sh
    launch: launchReadiness(),
    accounts,
    plans,
    betaTesters,
    apiKeys,
    usage,
    payments,
    views,
    betaSignups,
  });
}
