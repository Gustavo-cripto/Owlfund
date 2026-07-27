import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSessionUser, isUserPremium } from "@/lib/api/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isValidHttpsUrl(u: string): boolean {
  try {
    const url = new URL(u);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

// GET — devolve a config do webhook do utilizador (com o segredo, para ele
// poder verificar a assinatura HMAC).
export async function GET() {
  const { supabase, user } = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!(await isUserPremium(supabase, user.id))) return NextResponse.json({ error: "Requer Premium." }, { status: 403 });

  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("webhook_config")
    .select("url, secret, enabled, updated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({ webhook: data ?? null });
}

// POST — cria ou atualiza o webhook { url }. Gera um segredo na primeira vez.
export async function POST(req: NextRequest) {
  const { supabase, user } = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!(await isUserPremium(supabase, user.id))) return NextResponse.json({ error: "Requer Premium." }, { status: 403 });

  const body = await req.json().catch(() => ({})) as { url?: string; enabled?: boolean };
  const url = (body.url ?? "").trim();
  if (!isValidHttpsUrl(url)) {
    return NextResponse.json({ error: "URL inválido — tem de ser https://" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data: existing } = await admin.from("webhook_config").select("secret").eq("user_id", user.id).maybeSingle();
  const secret = existing?.secret ?? `whsec_${randomBytes(24).toString("hex")}`;

  const { error } = await admin.from("webhook_config").upsert({
    user_id: user.id,
    url,
    secret,
    enabled: body.enabled ?? true,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });

  if (error) return NextResponse.json({ error: "Erro ao guardar." }, { status: 500 });
  return NextResponse.json({ webhook: { url, secret, enabled: body.enabled ?? true } });
}

// DELETE — remove o webhook.
export async function DELETE() {
  const { supabase, user } = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const admin = getSupabaseAdmin();
  await admin.from("webhook_config").delete().eq("user_id", user.id);
  return NextResponse.json({ deleted: true });
}
