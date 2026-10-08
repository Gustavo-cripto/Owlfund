// Limite diário por utilizador, PARTILHADO entre instâncias (função
// api_rate_check na base de dados, janela alinhada à meia-noite UTC). Os
// contadores em memória só travam picos numa instância; isto trava o custo
// (auditoria 8 out 2026: Chain Pro/Premium, Assistente IA e Chat de Mercado não
// tinham teto diário). Falha FECHADO: sem base de dados, não há IA.
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type ResultadoLimite = "ok" | "excedido" | "indisponivel";

export async function limiteDiario(chave: string, limite: number): Promise<ResultadoLimite> {
  try {
    const { data, error } = await getSupabaseAdmin().rpc("api_rate_check", {
      p_key_hash: chave.slice(0, 120),
      p_limit: limite,
      p_window_seconds: 86400,
    });
    if (error) throw new Error(error.message);
    return data === false ? "excedido" : "ok";
  } catch (e) {
    console.error(`[limiteDiario] ${chave.split(":")[0]} indisponível (fail-closed):`, e instanceof Error ? e.message : e);
    return "indisponivel";
  }
}

/** Segundos até à próxima meia-noite UTC (quando a janela do api_rate_check recomeça). */
export function segundosAteMeiaNoiteUtc(agora = Date.now()): number {
  const d = new Date(agora);
  const meiaNoite = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  return Math.max(1, Math.ceil((meiaNoite - agora) / 1000));
}

/** Resposta 429 padrão para limite diário (code "daily_limit", Retry-After certo). */
export function respostaLimiteDiario(mensagem: string): NextResponse {
  const res = NextResponse.json({ error: mensagem, code: "daily_limit" }, { status: 429 });
  res.headers.set("Retry-After", String(segundosAteMeiaNoiteUtc()));
  return res;
}
