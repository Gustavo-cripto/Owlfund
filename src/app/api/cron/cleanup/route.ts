import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

// GET  chamado por um cron (Vercel ou externo) com Authorization: Bearer <CRON_SECRET>.
// Poda as tabelas que crescem sem fim: janelas de rate-limit ja passadas, o log
// de deduplicacao de alertas antigo e as visualizacoes de pagina antigas.
// Correr uma vez por dia e suficiente.
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!safeEqual(request.headers.get("authorization") ?? "", `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let admin: ReturnType<typeof getSupabaseAdmin>;
  try {
    admin = getSupabaseAdmin();
  } catch {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const now = Date.now();
  const rateCutoff = new Date(now - 24 * 60 * 60 * 1000).toISOString();        // janelas > 1 dia
  const alertCutoff = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();   // logs > 7 dias
  const viewsCutoff = new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString();  // page views > 90 dias

  const [rate, alerts, views] = await Promise.all([
    admin.from("api_rate_limits").delete({ count: "exact" }).lt("window_start", rateCutoff),
    admin.from("whale_alert_log").delete({ count: "exact" }).lt("sent_at", alertCutoff),
    admin.from("page_views").delete({ count: "exact" }).lt("created_at", viewsCutoff),
  ]);

  return NextResponse.json({
    ok: true,
    deleted: {
      rateLimits: rate.count ?? 0,
      whaleAlerts: alerts.count ?? 0,
      pageViews: views.count ?? 0,
    },
    timestamp: now,
  });
}
