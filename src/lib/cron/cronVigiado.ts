// O vigia dos crons (ver vigia.ts) ligado ao Telegram e à base de dados. A tabela
// cron_runs é opcional (supabase-crons-bots.sql): sem ela não há registo, mas os
// avisos funcionam e nenhum cron falha por isso.
import { createHash } from "crypto";
import { sendTelegram, tgEsc } from "@/lib/notify/telegram";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { criarVigia } from "@/lib/cron/vigia";

const DIA_S = 86_400;

export const cronVigiado = criarVigia({
  registar: async (nome, ok, detalhe) => {
    const agora = new Date().toISOString();
    await getSupabaseAdmin()
      .from("cron_runs")
      .upsert({ cron: nome, ultimo_em: agora, detalhe, ...(ok ? { ultimo_ok_em: agora } : {}) }, { onConflict: "cron" });
  },
  podeAvisar: async (nome) => {
    const chave = createHash("sha256").update(`cron-aviso:${nome}`).digest("hex").slice(0, 32);
    const { data, error } = await getSupabaseAdmin().rpc("api_rate_check", { p_key_hash: chave, p_limit: 1, p_window_seconds: DIA_S });
    return Boolean(error) || data !== false;
  },
  avisar: (nome, detalhe) => sendTelegram(`🔴 <b>Cron ${tgEsc(nome)} falhou</b>\n${tgEsc(detalhe)}\n\nPróximo aviso deste cron só amanhã.`),
});
