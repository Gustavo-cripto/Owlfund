// Travão das contas novas (auditoria 6 nov 2026). Durante o beta cada conta nova
// fica Premium sozinha, envia um email e avisa o dono no Telegram, e os tetos de IA
// e de fornecedores são por conta: um script a criar contas multiplicava-os todos e
// inundava os avisos. Isto não tira a oferta a ninguém em condições normais.
//
// Conta por IP (com folga, por causa de casas e escritórios atrás do mesmo IP) e no
// total do dia. Acima do teto, a conta existe e entra normalmente, mas fica em Free
// e sem emails, e volta a tentar nas entradas seguintes dos primeiros 3 dias.
// Uma falha da base de dados deixa passar: entrar nunca falha por causa disto.
import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const DIA_S = 86_400;

function limite(nome: string, omissao: number): number {
  const n = Number(process.env[nome]);
  return Number.isFinite(n) && n > 0 ? n : omissao;
}

const hash = (texto: string) => createHash("sha256").update(texto).digest("hex").slice(0, 32);

async function dentroDoLimite(admin: SupabaseClient, chave: string, teto: number): Promise<boolean> {
  try {
    const { data, error } = await admin.rpc("api_rate_check", { p_key_hash: hash(chave), p_limit: teto, p_window_seconds: DIA_S });
    if (error) throw new Error(error.message);
    return data !== false;
  } catch (e) {
    console.error("[travao-contas] sem contador, deixa passar:", e instanceof Error ? e.message : e);
    return true;
  }
}

export type Travao = "ok" | "ip" | "global";

/** O IP primeiro: quem já passou o seu teto não gasta o teto de toda a gente. */
export async function travaoDeContas(admin: SupabaseClient, ip: string | null | undefined): Promise<Travao> {
  if (ip && ip !== "unknown" && !(await dentroDoLimite(admin, `conta-nova:ip:${ip}`, limite("CONTAS_NOVAS_POR_IP_DIA", 10)))) return "ip";
  if (!(await dentroDoLimite(admin, "conta-nova:global", limite("CONTAS_NOVAS_POR_DIA", 100)))) return "global";
  return "ok";
}

/** O aviso ao dono sai uma vez por dia e por motivo, para o travão não virar ele próprio uma inundação. */
export async function primeiroAvisoDoDia(admin: SupabaseClient, motivo: Exclude<Travao, "ok">): Promise<boolean> {
  try {
    const { data, error } = await admin.rpc("api_rate_check", { p_key_hash: hash(`conta-nova:aviso:${motivo}`), p_limit: 1, p_window_seconds: DIA_S });
    return !error && data !== false;
  } catch {
    return false;
  }
}
