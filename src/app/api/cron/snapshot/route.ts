import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Vercel Cron Job — corre todos os dias às 00:00 UTC
// Configurado em vercel.json: { "crons": [{ "path": "/api/cron/snapshot", "schedule": "0 0 * * *" }] }
//
// Segurança: a Vercel envia o header Authorization: Bearer <CRON_SECRET>
// Configura CRON_SECRET nas env vars da Vercel (qualquer string aleatória segura).

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  // Verificar autorização (Vercel envia automaticamente o CRON_SECRET)
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let supabase: ReturnType<typeof getSupabaseAdmin>;
  try {
    supabase = getSupabaseAdmin();
  } catch {
    return NextResponse.json({ error: "Supabase admin não configurado." }, { status: 500 });
  }

  // Buscar todos os utilizadores que tenham pelo menos uma carteira guardada
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id");

  if (profilesError) {
    return NextResponse.json({ error: profilesError.message }, { status: 500 });
  }

  if (!profiles || profiles.length === 0) {
    return NextResponse.json({ ok: true, saved: 0, skipped: 0 });
  }

  const cutoff = Date.now() - 20 * 60 * 60 * 1000; // 20h atrás (evitar duplicados)
  let saved = 0;
  let skipped = 0;

  for (const profile of profiles) {
    const userId = profile.id as string;

    // Verificar se já existe snapshot nas últimas 20h
    const { data: recent } = await supabase
      .from("portfolio_snapshots")
      .select("id, created_at")
      .eq("user_id", userId)
      .gte("created_at", new Date(cutoff).toISOString())
      .limit(1);

    if (recent && recent.length > 0) {
      skipped++;
      continue;
    }

    // Buscar o snapshot mais recente para reutilizar a estrutura de dados
    // (o cron não tem acesso ao browser — usa os dados do último snapshot como base)
    const { data: lastSnapshot } = await supabase
      .from("portfolio_snapshots")
      .select("data")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (!lastSnapshot || lastSnapshot.length === 0) {
      // Utilizador sem snapshots — nada a guardar
      skipped++;
      continue;
    }

    // Guardar novo snapshot com os dados mais recentes disponíveis
    const { error: insertError } = await supabase
      .from("portfolio_snapshots")
      .insert({
        user_id: userId,
        data: lastSnapshot[0].data,
      });

    if (!insertError) {
      saved++;
    }
  }

  return NextResponse.json({
    ok: true,
    saved,
    skipped,
    total: profiles.length,
    timestamp: new Date().toISOString(),
  });
}
