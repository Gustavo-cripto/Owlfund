import { NextResponse } from "next/server";
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

  if (!serviceKey) return NextResponse.json({ error: "Service role key não configurada." }, { status: 503 });

  const body = await request.json() as { enabled: boolean; hour_utc: number; mode: "crypto" | "tradicional" | "both" };

  // Verificar se é Pro antes de ativar
  if (body.enabled) {
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: sub } = await admin
      .from("subscriptions")
      .select("status, current_period_end")
      .eq("user_id", user.id)
      .order("current_period_end", { ascending: false })
      .limit(1)
      .maybeSingle();
    const isActive = sub?.status === "active" || sub?.status === "trialing";
    const notExpired = !sub?.current_period_end || new Date(sub.current_period_end).getTime() > Date.now();
    if (!isActive || !notExpired) {
      return NextResponse.json({ error: "O briefing diário requer o Plano Pro.", requiresPro: true }, { status: 403 });
    }
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { error } = await admin.from("news_briefing_schedule").upsert({
    user_id: user.id,
    email: user.email,
    enabled: body.enabled,
    hour_utc: body.hour_utc,
    mode: body.mode,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
