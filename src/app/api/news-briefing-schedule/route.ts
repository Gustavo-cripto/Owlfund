import { NextResponse } from "next/server";
import { internalError } from "@/lib/api/response";
import { apiMsg } from "@/lib/api/apiMessages";
import { getPlanOrNull } from "@/lib/api/entitlement";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

async function getUser(authHeader: string | null) {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const client = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });
  const { data } = await client.auth.getUser(token);
  return data.user ?? null;
}

export async function GET(request: Request) {
  const user = await getUser(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data } = await admin
    .from("news_briefing_schedule")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json(data ?? { enabled: false, hour_utc: 7, mode: "crypto" });
}

export async function POST(request: Request) {
  const user = await getUser(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!serviceKey) return NextResponse.json({ error: apiMsg(request, "server_unconfigured") }, { status: 503 });

  const body = await request.json() as { enabled: boolean; hour_utc: number; mode: "crypto" | "tradicional" | "both" };

  // Validar o corpo: era tipado em TypeScript e gravado tal e qual, mas a
  // tipagem nao verifica nada em execucao. O `mode` e lido pelo cron.
  const MODOS = ["crypto", "tradicional", "both"];
  if (typeof body.enabled !== "boolean") return NextResponse.json({ error: "Invalid enabled" }, { status: 400 });
  if (!MODOS.includes(String(body.mode))) return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
  const hora = Number(body.hour_utc);
  if (!Number.isInteger(hora) || hora < 0 || hora > 23) return NextResponse.json({ error: "Invalid hour" }, { status: 400 });

  // Verificar se é Pro antes de ativar.
  //
  // Antes havia aqui uma consulta propria que pedia a linha mais recente de
  // subscriptions SEM filtrar por estado, e so depois testava o estado dessa
  // linha. Uma conta com mais do que uma subscricao (Stripe + cripto + beta
  // manual) podia ver a boa tapada por outra, e perdia o que pagou. Passa a
  // usar a mesma fonte que o resto da aplicacao.
  if (body.enabled) {
    const plan = await getPlanOrNull(user.id);
    if (!plan) return NextResponse.json({ error: apiMsg(request, "briefing_requires_pro"), requiresPro: true }, { status: 503 });
    if (plan === "free") {
      return NextResponse.json({ error: apiMsg(request, "briefing_requires_pro"), requiresPro: true }, { status: 403 });
    }
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { error } = await admin.from("news_briefing_schedule").upsert({
    user_id: user.id,
    email: user.email,
    enabled: body.enabled,
    hour_utc: hora,
    mode: body.mode,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });

  if (error) return internalError(error);
  return NextResponse.json({ ok: true });
}
