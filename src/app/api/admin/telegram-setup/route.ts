// Regista OU remove o webhook do bot cujo token está no ambiente (TELEGRAM_BOT_TOKEN).
// Só admins. action: "set" (default) = setWebhook; "delete" = deleteWebhook.
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { deleteWebhook, registerWebhook } from "@/lib/notify/telegramWebhook";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const ADMINS = (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

async function getAdminEmail(): Promise<string | null> {
  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} },
  });
  const { data } = await supabase.auth.getUser();
  return data.user?.email?.toLowerCase() ?? null;
}

export async function POST(req: Request) {
  const email = await getAdminEmail();
  if (!email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!ADMINS.length || !ADMINS.includes(email)) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  let action: "set" | "delete" = "set";
  try {
    const b = (await req.json()) as { action?: string };
    if (b?.action === "delete") action = "delete";
  } catch { /* sem body = set */ }

  try {
    // Mesma logica que a reparacao automatica (src/lib/notify/telegramWebhook.ts).
    const r = action === "delete" ? await deleteWebhook() : await registerWebhook(true);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error?.includes("não está definido") || r.error?.includes("getMe") ? 400 : 502 });
    return NextResponse.json({ ok: true, action, bot: r.bot });
  } catch {
    return NextResponse.json({ error: "Erro de rede a contactar o Telegram." }, { status: 502 });
  }
}
