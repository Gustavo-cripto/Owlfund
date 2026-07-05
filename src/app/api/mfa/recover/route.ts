import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const normalize = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "");
const hash = (code: string) => createHash("sha256").update(normalize(code)).digest("hex");

async function getUser(authHeader: string | null) {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const client = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });
  const { data } = await client.auth.getUser(token);
  return data.user ?? null;
}

export async function POST(request: Request) {
  const user = await getUser(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!serviceKey) return NextResponse.json({ error: "Service role key não configurada." }, { status: 503 });

  const body = await request.json().catch(() => ({})) as { code?: string };
  const code = (body.code ?? "").trim();
  if (!code) return NextResponse.json({ error: "Código em falta." }, { status: 400 });

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Procurar um código de recuperação válido (não usado) para este utilizador.
  const { data: match } = await admin
    .from("mfa_recovery_codes")
    .select("id")
    .eq("user_id", user.id)
    .eq("code_hash", hash(code))
    .is("used_at", null)
    .limit(1)
    .maybeSingle();

  if (!match) return NextResponse.json({ error: "Código inválido ou já usado." }, { status: 400 });

  // Marcar como usado.
  await admin.from("mfa_recovery_codes").update({ used_at: new Date().toISOString() }).eq("id", match.id);

  // Remover os fatores TOTP do utilizador (2FA passa a estar desligado; deve reativar).
  try {
    const { data: factors } = await admin.auth.admin.mfa.listFactors({ userId: user.id });
    for (const f of factors?.factors ?? []) {
      await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId: user.id });
    }
  } catch {
    // se falhar a remoção, o código já foi consumido; o utilizador contacta suporte
  }

  // Códigos restantes deixam de fazer sentido (2FA desligado).
  await admin.from("mfa_recovery_codes").delete().eq("user_id", user.id);

  return NextResponse.json({ ok: true });
}
