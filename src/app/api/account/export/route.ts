import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

// Exportação RGPD (portabilidade): devolve os dados do próprio utilizador.
// NUNCA inclui segredos — hashes de chaves de API, segredos/códigos 2FA, etc.
export async function GET() {
  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: { get: (name) => cookieStore.get(name)?.value, set: () => {}, remove: () => {} },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const userId = user.id;

  let admin: ReturnType<typeof getSupabaseAdmin>;
  try {
    admin = getSupabaseAdmin();
  } catch {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const [profile, subscriptions, walletConfig, snapshots, briefing, apiKeys, chatUsage, webhook, cryptoPayments] = await Promise.all([
    admin.from("profiles").select("email, avatar_url, auto_snapshot").eq("id", userId).maybeSingle(),
    admin.from("subscriptions").select("status, price_id, current_period_end, cancel_at_period_end").eq("user_id", userId),
    admin.from("wallet_config").select("data, updated_at").eq("user_id", userId).maybeSingle(),
    admin.from("portfolio_snapshots").select("created_at, data").eq("user_id", userId).order("created_at", { ascending: true }),
    admin.from("news_briefing_schedule").select("enabled, hour_utc, mode").eq("user_id", userId).maybeSingle(),
    // Só metadados das chaves — nunca o hash.
    admin.from("api_keys").select("name, key_prefix, created_at, last_used_at, is_active").eq("user_id", userId),
    admin.from("chat_usage").select("month, count").eq("user_id", userId),
    // Webhook: só o URL (nunca o segredo). Pagamentos cripto: histórico sem dados sensíveis.
    admin.from("webhook_config").select("url, enabled, updated_at").eq("user_id", userId).maybeSingle(),
    admin.from("crypto_payments").select("created_at, plan, period, chain, currency, amount, status, tx_hash").eq("user_id", userId),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    app: "ChainFolioAI",
    account: {
      id: user.id,
      email: user.email ?? null,
      createdAt: user.created_at ?? null,
    },
    profile: profile.data ?? null,
    subscriptions: subscriptions.data ?? [],
    walletConfig: walletConfig.data ?? null,
    portfolioSnapshots: snapshots.data ?? [],
    webhook: webhook.data ?? null,
    cryptoPayments: cryptoPayments.data ?? [],
    newsBriefingSchedule: briefing.data ?? null,
    apiKeys: apiKeys.data ?? [],
    chatUsage: chatUsage.data ?? [],
  };

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="chainfolioai-dados-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
