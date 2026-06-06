import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Vercel Cron Job — corre todos os dias às 00:00 UTC
// Configurado em vercel.json: { "crons": [{ "path": "/api/cron/snapshot", "schedule": "0 0 * * *" }] }
// CRON_SECRET deve estar definido nas env vars da Vercel. Gerar com: openssl rand -hex 32

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Comparação em tempo constante para prevenir timing attacks
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  if (typeof crypto?.subtle?.importKey !== "function") {
    // Fallback sem subtle crypto — ainda protege contra timing via padding
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  }
  const enc = new TextEncoder();
  const [ka, kb] = await Promise.all([
    crypto.subtle.importKey("raw", enc.encode(a).buffer as ArrayBuffer, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]),
    crypto.subtle.importKey("raw", enc.encode(b).buffer as ArrayBuffer, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]),
  ]);
  const [sa, sb] = await Promise.all([
    crypto.subtle.sign("HMAC", ka, enc.encode("owlfund-cron").buffer as ArrayBuffer),
    crypto.subtle.sign("HMAC", kb, enc.encode("owlfund-cron").buffer as ArrayBuffer),
  ]);
  const va = new Uint8Array(sa);
  const vb = new Uint8Array(sb);
  if (va.length !== vb.length) return false;
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

export async function GET(request: Request) {
  // CRON_SECRET é obrigatório — se não estiver configurado, recusa sempre
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[cron/snapshot] CRON_SECRET não configurado — endpoint bloqueado.");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${cronSecret}`;

  const authorized = await timingSafeEqual(authHeader, expected);
  if (!authorized) {
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
    .select("id");

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

  for (const profile of profiles) {
    const userId = profile.id as string;

    // Verificar se já existe snapshot nas últimas 20h
    const { data: recent } = await supabase
      .from("portfolio_snapshots")
      .select("id")
      .eq("user_id", userId)
      .gte("created_at", new Date(cutoff).toISOString())
      .limit(1);

    if (recent && recent.length > 0) {
      skipped++;
      continue;
    }

    const { data: lastSnapshot } = await supabase
      .from("portfolio_snapshots")
      .select("data")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (!lastSnapshot || lastSnapshot.length === 0) {
      skipped++;
      continue;
    }

    const { error: insertError } = await supabase
      .from("portfolio_snapshots")
      .insert({ user_id: userId, data: lastSnapshot[0].data });

    if (!insertError) saved++;
  }

  return NextResponse.json({ ok: true, saved, skipped, total: profiles.length });
}
