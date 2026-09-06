// Helpers de email partilhados (antes cada rota tinha o seu shell/esc/toText,
// com divergências). Inclui idempotência de envios por marco (notification_log).

import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";

export const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://chainfolioai.com").replace(/\/$/, "");
export const FROM = "ChainFolioAI <noreply@chainfolioai.com>";
export const FROM_BRIEFING = "ChainFolioAI <briefing@chainfolioai.com>";
export const FROM_BILLING = "ChainFolioAI <billing@chainfolioai.com>";
export const REPLY_TO = "suporte@chainfolioai.com";
export const TZ = "Europe/Lisbon";
export const EMAIL_LOCALE: Record<string, string> = { pt: "pt-PT", en: "en-GB", es: "es-ES", fr: "fr-FR" };

/** Cabeçalhos de opt-out (RFC 8058 one-click + mailto). */
export const UNSUB_HEADERS = {
  "List-Unsubscribe": `<${SITE}/account?section=notifications>, <mailto:${REPLY_TO}?subject=remover>`,
  "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
};

export const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Versão texto (multipart) — emails só-HTML pesam no score de spam. */
export const toText = (h: string) =>
  h
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|tr|div|table|h[1-6]|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/** Molde com a marca (fundo escuro, acento laranja). */
export function shell(inner: string, opts: { title?: string } = {}): string {
  return `<div style="background:#0f172a;padding:28px;font-family:-apple-system,Helvetica,Arial,sans-serif">
    <div style="max-width:560px;margin:0 auto;background:#111827;border:1px solid #1f2937;border-radius:16px;overflow:hidden">
      <div style="padding:18px 24px;border-bottom:1px solid #1f2937">
        <span style="color:#fff;font-weight:800;font-size:18px;letter-spacing:.3px">ChainFolio<span style="color:#f97316">AI</span></span>${opts.title ? `<span style="color:#64748b;font-size:12px"> · ${esc(opts.title)}</span>` : ""}
      </div>
      <div style="padding:24px;color:#cbd5e1;font-size:14px;line-height:1.6">${inner}</div>
      <div style="padding:14px 24px;border-top:1px solid #1f2937;color:#64748b;font-size:11px">
        ChainFolioAI · <a href="${SITE}" style="color:#fb923c;text-decoration:none">chainfolioai.com</a> · <a href="${SITE}/account?section=notifications" style="color:#64748b">preferências</a>
      </div>
    </div>
  </div>`;
}

export function fmtDate(d: Date, lang = "pt", opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "long", year: "numeric" }): string {
  return d.toLocaleDateString(EMAIL_LOCALE[lang] ?? "pt-PT", { timeZone: TZ, ...opts });
}

type SendOpts = { to: string; subject: string; html: string; from?: string; replyTo?: string; unsubscribe?: boolean; tag?: string };

/** Envia com multipart + (opcional) opt-out; regista falhas em vez de as engolir. */
export async function sendEmail(o: SendOpts): Promise<boolean> {
  const key = process.env.RESEND_API_KEY ?? "";
  if (!key) { console.error(`[email${o.tag ? ":" + o.tag : ""}] RESEND_API_KEY em falta`); return false; }
  try {
    const resend = new Resend(key);
    const { error } = await resend.emails.send({
      from: o.from ?? FROM,
      to: o.to,
      replyTo: o.replyTo ?? REPLY_TO,
      subject: o.subject,
      html: o.html,
      text: toText(o.html),
      headers: o.unsubscribe === false ? undefined : UNSUB_HEADERS,
    });
    if (error) { console.error(`[email${o.tag ? ":" + o.tag : ""}] ${o.to}: ${error.message}`); return false; }
    return true;
  } catch (e) {
    console.error(`[email${o.tag ? ":" + o.tag : ""}] ${o.to}:`, e instanceof Error ? e.message : e);
    return false;
  }
}

/**
 * Idempotência por marco: devolve true só na PRIMEIRA vez que (user, kind) é
 * registado (on conflict do nothing). Se a tabela notification_log ainda não
 * existir, devolve `fallback` (por omissão true) para não bloquear o cron.
 */
export async function markSent(admin: SupabaseClient, userId: string, kind: string, fallback = true): Promise<boolean> {
  try {
    const { data, error } = await admin
      .from("notification_log")
      .upsert({ user_id: userId, kind, sent_at: new Date().toISOString() }, { onConflict: "user_id,kind", ignoreDuplicates: true })
      .select("user_id");
    if (error) { console.error("[notification_log]", error.message); return fallback; }
    return Array.isArray(data) && data.length > 0;
  } catch { return fallback; }
}
