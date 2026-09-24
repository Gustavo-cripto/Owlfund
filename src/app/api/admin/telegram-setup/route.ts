// Regista OU remove o webhook do bot cujo token está no ambiente (TELEGRAM_BOT_TOKEN).
// Só admins. action: "set" (default) = setWebhook; "delete" = deleteWebhook;
// "test" = manda uma mensagem de teste ao chat configurado e devolve o erro real se falhar.
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { deleteWebhook, registerWebhook } from "@/lib/notify/telegramWebhook";
import { sendTelegram, ultimoErroTelegram } from "@/lib/notify/telegram";

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

  let action: "set" | "delete" | "test" = "set";
  try {
    const b = (await req.json()) as { action?: string };
    if (b?.action === "delete" || b?.action === "test") action = b.action;
  } catch { /* sem body = set */ }

  if (action === "test") {
    const token = (process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
    const chatId = (process.env.TELEGRAM_CHAT_ID ?? "").trim();
    if (!token || !chatId) return NextResponse.json({ error: `Falta ${!token ? "TELEGRAM_BOT_TOKEN" : "TELEGRAM_CHAT_ID"} na Vercel.` }, { status: 400 });
    const ok = await sendTelegram(`🔔 <b>Teste do aviso de novos testers</b>\nSe estás a ler isto, as inscrições no beta chegam a este chat.`);
    if (!ok) return NextResponse.json({ error: `O Telegram recusou o envio: ${ultimoErroTelegram() ?? "sem detalhe"}. Chat ID termina em …${chatId.slice(-3)}.` }, { status: 502 });
    return NextResponse.json({ ok: true, action, chatTail: chatId.slice(-3) });
  }

  try {
    // Mesma logica que a reparacao automatica (src/lib/notify/telegramWebhook.ts).
    const r = action === "delete" ? await deleteWebhook() : await registerWebhook(true);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error?.includes("não está definido") || r.error?.includes("getMe") ? 400 : 502 });
    return NextResponse.json({ ok: true, action, bot: r.bot });
  } catch {
    return NextResponse.json({ error: "Erro de rede a contactar o Telegram." }, { status: 502 });
  }
}
