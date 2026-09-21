import { NextResponse } from "next/server";

import { verifyCronAuth } from "@/lib/api/cron-auth";
import { BUCKET, correrCopia, enviarPorEmail, espelhar, podar } from "@/lib/backup/dump";
import { sendTelegram, tgEsc } from "@/lib/notify/telegram";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Ler doze tabelas mais as contas e comprimir leva tempo; o valor por omissão cortava a meio.
export const maxDuration = 60;

// Cópia de segurança diária. Existe porque o plano gratuito do Supabase não
// inclui cópias nenhumas — ver src/lib/backup/dump.ts, que explica o alcance
// disto e o que NÃO cobre.
//
// Guarda 14 dias. Avisa no Telegram só quando há motivo: falhou, ou uma tabela
// encolheu de repente. Um sucesso silencioso não enche a conversa.
const DIAS_A_GUARDAR = 14;

export async function GET(request: Request) {
  if (!(await verifyCronAuth(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let admin: ReturnType<typeof getSupabaseAdmin>;
  try {
    admin = getSupabaseAdmin();
  } catch {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  // O balde é criado à primeira vez e fica PRIVADO. Se já existir, o Supabase
  // devolve erro e segue-se em frente.
  try {
    await admin.storage.createBucket(BUCKET, { public: false });
  } catch { /* já existe */ }

  const hoje = new Date().toISOString().slice(0, 10);

  try {
    const r = await correrCopia(admin, hoje);

    // Três destinos, e cada um cobre um desastre diferente:
    //   1. o balde deste projeto  → erro de migração, apagamento, corrupção;
    //   2. um segundo projeto     → perder ESTE projeto;
    //   3. o email                → perder a CONTA do Supabase.
    // Os dois últimos são melhorias: se não estiverem configurados, seguem-se
    // em frente sem se queixar.
    const [espelho, email] = await Promise.all([
      espelhar(r.ficheiro, r.gz),
      enviarPorEmail(r.ficheiro, r.gz, { linhas: Object.values(r.contagens).reduce((s, n) => s + n, 0), contagens: r.contagens, ausentes: r.ausentes }),
    ]);

    const apagados = await podar(admin, DIAS_A_GUARDAR);
    const kb = Math.round(r.bytes / 1024);
    const linhas = Object.values(r.contagens).reduce((s, n) => s + n, 0);

    // Avisar SÓ quando é preciso agir.
    if (r.encolheram.length > 0) {
      await sendTelegram(
        `⚠️ <b>Cópia de segurança: uma tabela encolheu</b>\n` +
        r.encolheram.map((e) => `• ${tgEsc(e.tabela)}: ${e.antes} → ${e.agora} linhas`).join("\n") +
        `\n\nA cópia de hoje (${hoje}) foi guardada de qualquer maneira. Se não apagaste nada, vale a pena verificar.`,
      ).catch(() => false);
    }
    // Se as duas vias de fora falharem, só resta a cópia que vive no mesmo
    // projeto — e isso é um risco que merece ser dito.
    if (espelho === "falhou" && (email === "falhou" || email === "desligado")) {
      await sendTelegram(
        "⚠️ <b>A cópia de hoje ficou só dentro do projeto</b>\n" +
        "O espelho e o email falharam, por isso não há cópia fora do Supabase. " +
        "A cópia local está feita, mas não protege contra perder o projeto.",
      ).catch(() => false);
    }
    if (r.falhas.length > 0) {
      await sendTelegram(
        `⚠️ <b>Cópia de segurança incompleta</b>\nTabelas que falharam: ${tgEsc(r.falhas.join(", "))}\n` +
        `O resto ficou guardado em ${hoje}.`,
      ).catch(() => false);
    }

    return NextResponse.json({
      ok: r.falhas.length === 0,
      ficheiro: r.ficheiro,
      kb,
      linhas,
      contagens: r.contagens,
      falhas: r.falhas,
      ausentes: r.ausentes,
      encolheram: r.encolheram,
      copiasApagadas: apagados,
      guardaDias: DIAS_A_GUARDAR,
      espelho,
      email,
      // Dito na própria resposta para não se esquecer: isto não protege contra
      // perder o projeto inteiro.
      aviso: espelho === "feito" || email === "enviado"
        ? "Há cópia fora deste projeto."
        : "A cópia vive só no mesmo projeto Supabase: protege contra erros e apagamentos, não contra perder o projeto.",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[backup] falhou:", msg);
    await sendTelegram(`🔴 <b>Cópia de segurança FALHOU</b>\n${tgEsc(msg)}\n\nHoje não há cópia nova.`).catch(() => false);
    return NextResponse.json({ ok: false, error: "backup_failed" }, { status: 500 });
  }
}
