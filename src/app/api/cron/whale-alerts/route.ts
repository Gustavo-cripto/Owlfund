import { NextResponse } from "next/server";
import { createHmac, createHash, timingSafeEqual } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { scanWatchlist, type WatchEntry } from "@/lib/api/whales";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

// GET — chamado por um cron (Vercel ou externo) com Authorization: Bearer <CRON_SECRET>.
// Varre a watchlist de cada utilizador com webhook ativo, deteta movimentos
// grandes ("large_transfer") e faz POST assinado para o URL do utilizador.
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

  const { data: configs } = await admin
    .from("webhook_config")
    .select("user_id, url, secret")
    .eq("enabled", true)
    .limit(200);

  let usersScanned = 0;
  let sent = 0;

  for (const cfg of configs ?? []) {
    usersScanned++;

    const { data: rows } = await admin
      .from("smart_money_watchlist")
      .select("address, chain, label")
      .eq("user_id", cfg.user_id)
      .limit(10);

    const watchlist: WatchEntry[] = (rows ?? []).map((r) => ({
      address: r.address,
      chain: r.chain as WatchEntry["chain"],
      label: r.label ?? "",
    }));
    if (!watchlist.length) continue;

    const { movements } = await scanWatchlist(watchlist);
    const large = movements.filter((m) => m.type === "large_transfer");

    for (const m of large) {
      const dedupKey = createHash("sha256")
        .update(`${cfg.user_id}|${m.chain}|${m.address}|${m.description}|${m.timestamp}`)
        .digest("hex")
        .slice(0, 32);

      // Já enviado?
      const { data: seen } = await admin
        .from("whale_alert_log")
        .select("dedup_key")
        .eq("user_id", cfg.user_id)
        .eq("dedup_key", dedupKey)
        .maybeSingle();
      if (seen) continue;

      const payload = JSON.stringify({
        event: "whale_movement",
        movement: {
          chain: m.chain,
          label: m.label,
          type: m.type,
          description: m.description,
          timestamp: m.timestamp,
        },
        sentAt: Date.now(),
      });
      const signature = createHmac("sha256", cfg.secret).update(payload).digest("hex");

      try {
        await fetch(cfg.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-ChainFolioAI-Signature": `sha256=${signature}`,
            "User-Agent": "ChainFolioAI-Webhook/1",
          },
          body: payload,
          signal: AbortSignal.timeout(5000),
        });
        sent++;
      } catch {
        // falha de rede do recetor — não bloqueia os outros
      }

      // Regista para não reenviar (mesmo que o POST tenha falhado, evita spam).
      await admin.from("whale_alert_log").insert({ user_id: cfg.user_id, dedup_key: dedupKey });
    }
  }

  return NextResponse.json({ ok: true, usersScanned, sent, timestamp: Date.now() });
}
