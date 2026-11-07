import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/api/cron-auth";
import { avaliarBots, decidirAviso, textoDoAviso, type UltimoAviso } from "@/lib/bots/vigiaMac";
import { cronVigiado } from "@/lib/cron/cronVigiado";
import { sendTelegram, tgEsc } from "@/lib/notify/telegram";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// De 30 em 30 minutos. Sem segredo na Vercel, sem tabela ou sem nenhum batimento
// recebido até hoje, não há nada a vigiar: não avisa, para não insistir enquanto
// a ligação ao Mac não estiver feita.
async function executar(request: Request) {
  if (!(await verifyCronAuth(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(process.env.BOTS_HEARTBEAT_SECRET ?? "").trim()) return NextResponse.json({ skipped: "sem_segredo" });

  const admin = getSupabaseAdmin();
  const { data, error } = await admin.from("bots_status").select("payload, received_at, ultimo_aviso").eq("id", 1).maybeSingle();
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return NextResponse.json({ skipped: "sem_tabela" });
    return NextResponse.json({ error: `bots_status: ${error.message}` }, { status: 503 });
  }
  if (!data) return NextResponse.json({ skipped: "sem_batimento" });

  const agora = Date.now();
  const atual = avaliarBots(data.payload, data.received_at as string, agora);
  const decisao = decidirAviso(atual, (data.ultimo_aviso ?? null) as UltimoAviso | null, agora);
  if (!decisao) return NextResponse.json({ estado: atual.estado, avisou: false });

  // Só fica registado se saiu: um Telegram em baixo volta a tentar daqui a 30 minutos.
  const saiu = await sendTelegram(textoDoAviso(atual, data.received_at as string, tgEsc)).catch(() => false);
  if (saiu) {
    const { error: e2 } = await admin
      .from("bots_status")
      .update({ ultimo_aviso: { estado: atual.estado, em: new Date(agora).toISOString() } })
      .eq("id", 1);
    if (e2) return NextResponse.json({ error: `bots_status: ${e2.message}` }, { status: 503 });
  }
  return NextResponse.json({ estado: atual.estado, avisou: saiu });
}

export const GET = cronVigiado("bots-watch", executar);
