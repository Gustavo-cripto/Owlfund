// Cancelamento dos emails do produto (boas-vindas, lembretes, inatividade,
// oferta). Ate aqui o cabecalho List-Unsubscribe apontava para uma pagina
// atras do login e o cron nao consultava lista nenhuma: quem carregava em
// "anular subscricao" no Gmail continuava a receber.
//
// Como funciona:
//  - cada email leva um URL assinado por destinatario: /api/email/unsubscribe
//    ?u=<user_id>&t=<HMAC-SHA256(user_id)>. Sem sessao — o Gmail faz o POST
//    sozinho (RFC 8058) e a pessoa pode abrir o GET noutro aparelho.
//  - a assinatura usa EMAIL_UNSUBSCRIBE_SECRET (ou CRON_SECRET, se nao houver).
//    Sem nenhum dos dois nao ha URL: o email sai so com o mailto.
//  - a decisao fica em public.email_optout (supabase/email-optout.sql). O cron
//    le a tabela UMA vez e salta esses utilizadores; o interruptor em Conta →
//    Notificacoes escreve na mesma tabela. Se a tabela ainda nao existir, tudo
//    continua a funcionar como antes (ninguem excluido, nada rebenta).
//
// Sem dependencias alem do node:crypto, para os testes correrem fora do Next.

import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function segredo(): string {
  return process.env.EMAIL_UNSUBSCRIBE_SECRET ?? process.env.CRON_SECRET ?? "";
}

/** Assinatura do user_id (hex). Vazia sem segredo configurado. */
export function unsubscribeToken(userId: string, secret = segredo()): string {
  if (!secret || !UUID.test(userId)) return "";
  return createHmac("sha256", secret).update(userId.toLowerCase()).digest("hex");
}

/** true so se `token` for a assinatura correta de `userId` (comparacao em tempo constante). */
export function verifyUnsubscribeToken(userId: string, token: string, secret = segredo()): boolean {
  const esperado = unsubscribeToken(userId, secret);
  if (!esperado || typeof token !== "string" || token.length !== esperado.length) return false;
  try { return timingSafeEqual(Buffer.from(esperado, "utf8"), Buffer.from(token, "utf8")); } catch { return false; }
}

/** URL publico de cancelamento para este destinatario, ou null sem segredo. */
export function unsubscribeUrl(userId: string, lang?: string, site?: string): string | null {
  const t = unsubscribeToken(userId);
  if (!t) return null;
  const base = (site ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://chainfolioai.com").replace(/\/$/, "");
  const l = lang && /^(pt|en|es|fr)$/.test(lang) ? `&lang=${lang}` : "";
  return `${base}/api/email/unsubscribe?u=${encodeURIComponent(userId)}&t=${t}${l}`;
}

/**
 * Conjunto de user_id que pediram para nao receber emails do produto.
 * Tabela em falta ou erro → conjunto vazio (e regista), nunca parte o cron.
 */
export async function loadOptouts(admin: SupabaseClient): Promise<Set<string>> {
  const out = new Set<string>();
  try {
    const { data, error } = await admin.from("email_optout").select("user_id");
    if (error) { console.error("[email_optout] ler:", error.message); return out; }
    for (const r of data ?? []) if (r.user_id) out.add(String(r.user_id));
  } catch (e) { console.error("[email_optout] ler:", e instanceof Error ? e.message : e); }
  return out;
}

/** Marca (ou desmarca) a exclusao de um utilizador. false se a tabela nao existir. */
export async function setOptout(admin: SupabaseClient, userId: string, optout: boolean): Promise<boolean> {
  try {
    const q = optout
      ? admin.from("email_optout").upsert({ user_id: userId, created_at: new Date().toISOString() }, { onConflict: "user_id", ignoreDuplicates: true })
      : admin.from("email_optout").delete().eq("user_id", userId);
    const { error } = await q;
    if (error) { console.error("[email_optout] gravar:", error.message); return false; }
    return true;
  } catch (e) { console.error("[email_optout] gravar:", e instanceof Error ? e.message : e); return false; }
}

/** Esta pessoa esta excluida? Erro/tabela em falta → false. */
export async function isOptedOut(admin: SupabaseClient, userId: string): Promise<boolean> {
  try {
    const { data, error } = await admin.from("email_optout").select("user_id").eq("user_id", userId).maybeSingle();
    if (error) { console.error("[email_optout] ler:", error.message); return false; }
    return !!data;
  } catch { return false; }
}
