// Regista/atualiza o webhook do @ChainFolioAi_Bot usando o TELEGRAM_BOT_TOKEN do
// ambiente. Só admins. Usar depois de rodar o token (não expõe o token).
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://chainfolioai.com";
const ADMINS = (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

async function getAdminEmail(): Promise<string | null> {
  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} },
  });
  const { data } = await supabase.auth.getUser();
  return data.user?.email?.toLowerCase() ?? null;
}

export async function POST() {
  const email = await getAdminEmail();
  if (!email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!ADMINS.length || !ADMINS.includes(email)) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  const token = (process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
  if (!token) return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN não está definido na Vercel." }, { status: 400 });

  try {
    // Confirma que o token é válido (getMe).
    const me = await fetch(`https://api.telegram.org/bot${token}/getMe`).then((r) => r.json());
    if (!me.ok) return NextResponse.json({ error: "Token inválido (getMe falhou). Confirma o TELEGRAM_BOT_TOKEN e faz redeploy." }, { status: 400 });

    const set = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: `${SITE}/api/telegram-webhook`, allowed_updates: ["callback_query"], drop_pending_updates: true }),
    }).then((r) => r.json());
    if (!set.ok) return NextResponse.json({ error: set.description || "Falha no setWebhook." }, { status: 502 });

    const info = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`).then((r) => r.json());
    return NextResponse.json({ ok: true, bot: me.result?.username, url: info.result?.url, pending: info.result?.pending_update_count });
  } catch {
    return NextResponse.json({ error: "Erro de rede a contactar o Telegram." }, { status: 502 });
  }
}
