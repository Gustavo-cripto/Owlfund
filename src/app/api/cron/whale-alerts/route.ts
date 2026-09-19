import { NextResponse } from "next/server";
import { activeSubscribers } from "@/lib/api/entitlement";
import { createHmac, createHash } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { scanWatchlist, type WatchEntry } from "@/lib/api/whales";
import { verifyCronAuth } from "@/lib/api/cron-auth";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// GET — chamado por um cron (Vercel ou externo) com Authorization: Bearer <CRON_SECRET>.
// Varre a watchlist de cada utilizador com webhook ativo, deteta movimentos
// grandes ("large_transfer") e faz POST assinado para o URL do utilizador.
export async function GET(request: Request) {
  if (!(await verifyCronAuth(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  // Os webhooks sao exclusivos do Premium, mas nada apagava a configuracao
  // quando a subscricao acabava: o cron continuava a varrer e a entregar de
  // graca. Salta-se em memoria (nao se desativa) para quem renovar voltar a
  // receber sem ter de regravar o URL.
  //
  // Fail-closed com cuidado: se a consulta de planos rebentar, nao se entrega a
  // ninguem nesta passagem, mas o cron nao estoira.
  let premium = new Set<string>();
  const ids = [...new Set((configs ?? []).map((c) => c.user_id as string))];
  if (ids.length > 0) {
    try {
      const planos = await activeSubscribers(admin, ids);
      premium = new Set([...planos.entries()].filter(([, p]) => p === "premium").map(([id]) => id));
    } catch (e) {
      console.error("[whale-alerts] planos indisponiveis, nada entregue nesta passagem:", e instanceof Error ? e.message : e);
      return NextResponse.json({ ok: true, usersScanned: 0, sent: 0, skipped: "plans_unavailable" });
    }
  }

  let usersScanned = 0;
  let sent = 0;
  let semPlano = 0;

  for (const cfg of configs ?? []) {
    if (!premium.has(cfg.user_id as string)) { semPlano++; continue; }
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

      let delivered = false;
      try {
        const res = await fetch(cfg.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-ChainFolioAI-Signature": `sha256=${signature}`,
            "User-Agent": "ChainFolioAI-Webhook/1",
          },
          body: payload,
          // Sem isto, o fetch seguia redirecionamentos e anulava o filtro
          // anti-SSRF do registo: bastava o host do utilizador responder 302
          // para um endereco interno. Em manual, um 3xx ja chega como falha.
          redirect: "manual",
          signal: AbortSignal.timeout(5000),
        });
        delivered = res.ok;
        if (delivered) sent++;
      } catch {
        // falha de rede do recetor — não bloqueia os outros
      }

      // Só marca como enviado se o recetor confirmou (2xx). Assim um recetor em
      // downtime não perde o alerta — reenvia no próximo cron até entregar. O
      // movimento sai da janela de scan naturalmente, por isso não há retry infinito.
      if (delivered) {
        await admin.from("whale_alert_log").insert({ user_id: cfg.user_id, dedup_key: dedupKey });
      }
    }
  }

  return NextResponse.json({ ok: true, usersScanned, sent, semPlano, timestamp: Date.now() });
}
