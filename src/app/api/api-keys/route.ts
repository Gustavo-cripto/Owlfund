import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createHash, randomBytes } from "crypto";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const premiumPriceId = process.env.STRIPE_PREMIUM_PRICE_ID ?? process.env.NEXT_PUBLIC_STRIPE_PREMIUM_PRICE_ID ?? "";

async function getUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: { get: (name) => cookieStore.get(name)?.value, set: () => {}, remove: () => {} },
  });
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user };
}

async function checkPremium(supabase: ReturnType<typeof createServerClient>, userId: string) {
  const { data: sub } = await supabase.from("subscriptions")
    .select("status, price_id").eq("user_id", userId).eq("status", "active")
    .order("current_period_end", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
  return !!premiumPriceId && sub?.price_id === premiumPriceId;
}

// GET — list user's API keys (masked)
export async function GET() {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado.", code: "UNAUTHENTICATED" }, { status: 401 });
  const isPremium = await checkPremium(supabase, user.id);
  if (!isPremium) return NextResponse.json({ error: "Requer Premium.", code: "PREMIUM_REQUIRED" }, { status: 403 });

  const supabaseAdmin = getSupabaseAdmin();
  const { data: keys } = await supabaseAdmin
    .from("api_keys")
    .select("id, name, key_prefix, created_at, last_used_at, is_active")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return NextResponse.json({ keys: keys ?? [] });
}

// POST — create new API key
export async function POST(req: NextRequest) {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado.", code: "UNAUTHENTICATED" }, { status: 401 });
  const isPremium = await checkPremium(supabase, user.id);
  if (!isPremium) return NextResponse.json({ error: "Requer Premium.", code: "PREMIUM_REQUIRED" }, { status: 403 });

  const body = await req.json().catch(() => ({})) as { name?: string };
  const name = (body.name ?? "").slice(0, 64).trim() || "API key";

  const supabaseAdmin = getSupabaseAdmin();

  // Max 5 keys per user
  const { count } = await supabaseAdmin.from("api_keys")
    .select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("is_active", true);
  if ((count ?? 0) >= 5) return NextResponse.json({ error: "Máximo de 5 chaves atingido.", code: "MAX_KEYS" }, { status: 400 });

  // Generate key: cfa_live_<40 hex> (cfa = ChainFolioAI)
  const rawKey = `cfa_live_${randomBytes(20).toString("hex")}`;
  const keyHash = createHash("sha256").update(rawKey).digest("hex");
  const keyPrefix = rawKey.slice(0, 16); // "cfa_live_" + first 7 chars

  const { data: inserted, error } = await supabaseAdmin.from("api_keys").insert({
    user_id: user.id,
    name,
    key_hash: keyHash,
    key_prefix: keyPrefix,
    is_active: true,
  }).select("id, name, key_prefix, created_at, last_used_at, is_active").single();

  if (error) return NextResponse.json({ error: "Erro ao criar chave." }, { status: 500 });

  // Return the full raw key only once
  return NextResponse.json({ key: rawKey, meta: inserted });
}

// DELETE — revoke a key
export async function DELETE(req: NextRequest) {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { keyId } = await req.json() as { keyId?: string };
  if (!keyId) return NextResponse.json({ error: "keyId obrigatório." }, { status: 400 });

  const supabaseAdmin = getSupabaseAdmin();
  const { error } = await supabaseAdmin.from("api_keys")
    .update({ is_active: false }).eq("id", keyId).eq("user_id", user.id);

  if (error) return NextResponse.json({ error: "Erro ao revogar." }, { status: 500 });
  return NextResponse.json({ revoked: true });
}
