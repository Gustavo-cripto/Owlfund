import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { verifyCronAuth } from "@/lib/api/cron-auth";
import { sendTelegram, tgEsc } from "@/lib/notify/telegram";

// Vercel Cron Job — corre todos os dias às 00:00 UTC
// Configurado em vercel.json: { "crons": [{ "path": "/api/cron/snapshot", "schedule": "0 0 * * *" }] }
// CRON_SECRET deve estar definido nas env vars da Vercel. Gerar com: openssl rand -hex 32

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  // Autenticação partilhada (lib/api/cron-auth): CRON_SECRET obrigatório e
  // comparação em tempo constante. Antes existia aqui uma cópia local que
  // rebentava com 500 quando o header vinha vazio (zero-length key).
  if (!(await verifyCronAuth(request))) {
    // Sem detalhe no erro para não confirmar existência do endpoint
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let supabase: ReturnType<typeof getSupabaseAdmin>;
  try {
    supabase = getSupabaseAdmin();
  } catch {
    // Não expor detalhes de configuração interna
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  // Usar admin client (bypassa RLS) — justificado: cron legítimo com secret verificado
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, auto_snapshot")
    .neq("auto_snapshot", false);

  if (profilesError) {
    console.error("[cron/snapshot] DB error:", profilesError.code);
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  if (!profiles || profiles.length === 0) {
    return NextResponse.json({ ok: true, saved: 0, skipped: 0 });
  }

  const cutoff = Date.now() - 20 * 60 * 60 * 1000; // 20h atrás (evitar duplicados)
  let saved = 0;
  let skipped = 0;
  // Erros de SELECT/INSERT contam-se em vez de se engolirem: antes, uma
  // coluna renomeada ou uma politica RLS nova deixavam o cron a responder
  // {ok:true, saved:0} durante meses sem ninguem dar por isso.
  let failed = 0;
  const motivos = new Set<string>();

  for (const profile of profiles) {
    const userId = profile.id as string;

    // Verificar se já existe snapshot COM total nas últimas 20h. Um snapshot
    // sem _totalEur (os antigos gravados por visita) não conta como recente
    // nem serve de "último" — copiá-lo só perpetuava um ponto sem valor.
    const { data: recent, error: recentError } = await supabase
      .from("portfolio_snapshots")
      .select("id")
      .eq("user_id", userId)
      .not("data->_totalEur", "is", null)
      .gte("created_at", new Date(cutoff).toISOString())
      .limit(1);

    if (recentError) {
      console.error("[cron/snapshot] select recente:", recentError.code);
      failed++; motivos.add(`select: ${recentError.code ?? recentError.message}`);
      continue;
    }
    if (recent && recent.length > 0) {
      skipped++;
      continue;
    }

    const { data: lastSnapshot, error: lastError } = await supabase
      .from("portfolio_snapshots")
      .select("data")
      .eq("user_id", userId)
      .not("data->_totalEur", "is", null)
      .order("created_at", { ascending: false })
      .limit(1);

    if (lastError) {
      console.error("[cron/snapshot] select ultimo:", lastError.code);
      failed++; motivos.add(`select: ${lastError.code ?? lastError.message}`);
      continue;
    }
    if (!lastSnapshot || lastSnapshot.length === 0) {
      skipped++;
      continue;
    }

    // Copiamos o total (não dá para recalcular o valor real server-side — os
    // ativos manuais vivem no browser), mas removemos o benchmark antigo: como
    // o valor do portefólio é apenas copiado, guardar um _bench com timestamp
    // novo criaria pontos desalinhados e distorceria o Beta. O Beta usa só os
    // snapshots gravados ao vivo na página (com valor e benchmark reais).
    const copied = { ...(lastSnapshot[0].data as Record<string, unknown>) };
    delete copied._bench;
    const { error: insertError } = await supabase
      .from("portfolio_snapshots")
      .insert({ user_id: userId, data: copied });

    if (insertError) {
      console.error("[cron/snapshot] insert:", insertError.code);
      failed++; motivos.add(`insert: ${insertError.code ?? insertError.message}`);
    } else {
      saved++;
    }
  }

  // Um cron so responde 200 se fez o que devia (padrao de cron/backup): sem
  // nenhuma gravacao e com falhas, avisa e devolve 500 para a Vercel o marcar.
  if (profiles.length > 0 && saved === 0 && failed > 0) {
    const msg = `${failed} falha(s) em ${profiles.length} conta(s); nada gravado. ${[...motivos].slice(0, 5).join(" · ")}`;
    console.error("[cron/snapshot] FALHOU:", msg);
    await sendTelegram(`🔴 <b>Cron de snapshots FALHOU</b>\n${tgEsc(msg)}\n\nO histórico do Portefólio não ganhou pontos hoje.`).catch(() => false);
    return NextResponse.json({ ok: false, saved, skipped, failed, total: profiles.length, error: "snapshot_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, saved, skipped, failed, total: profiles.length });
}
