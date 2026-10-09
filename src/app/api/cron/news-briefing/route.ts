import { NextResponse } from "next/server";
import { activeSubscribers, type Plan } from "@/lib/api/entitlement";
import { generateAiText } from "@/lib/ai/groq";
import { createClient } from "@supabase/supabase-js";
import { verifyCronAuth } from "@/lib/api/cron-auth";
import { esc, fmtDate, FROM_BRIEFING, sendEmail } from "@/lib/email";
import type { Lang } from "@/lib/i18n/translations";
import { langFromMetadata, resolveLang, signupLangByEmail } from "@/lib/user/lang";
import { sendTelegram, tgEsc } from "@/lib/notify/telegram";
import { dadosCripto } from "@/lib/ai/briefingMercado";
import { lerNoticias } from "@/lib/news/feeds";
import { promptEmailCripto, promptEmailMacro, tituloMacro, type DadosCripto, type DadosTradicional } from "@/lib/ai/promptsMercado";
import { mascararEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Tudo o que o email diz por si (fora do texto da IA), nas 4 linguas.
const L: Record<Lang, { crypto: string; trad: string; briefing: string; cta: string; foot: string; unsub: string }> = {
  pt: { crypto: "Cripto", trad: "Mercado Tradicional", briefing: "Briefing", cta: "Ver Mercado →", foot: "Não constitui aconselhamento financeiro. Para cancelar, vai a", unsub: "Conta → Notificações" },
  en: { crypto: "Crypto", trad: "Traditional Markets", briefing: "Briefing", cta: "View Markets →", foot: "This is not financial advice. To unsubscribe, go to", unsub: "Account → Notifications" },
  es: { crypto: "Cripto", trad: "Mercado Tradicional", briefing: "Briefing", cta: "Ver Mercado →", foot: "No constituye asesoramiento financiero. Para cancelar, ve a", unsub: "Cuenta → Notificaciones" },
  fr: { crypto: "Crypto", trad: "Marchés traditionnels", briefing: "Briefing", cta: "Voir le marché →", foot: "Ceci ne constitue pas un conseil financier. Pour vous désabonner, allez dans", unsub: "Compte → Notifications" },
};
const BRIEFING_DATE: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long", year: "numeric" };

type Dados = { mode: "crypto"; d: DadosCripto } | { mode: "tradicional"; manchetes: DadosTradicional["manchetes"] };

// Dados reais de cada modo, ou null quando não há o mínimo para um email honesto
// (auditoria 8 out 2026, mercado-09): cripto sem preços NÃO sai; o tradicional
// só sai com manchetes reais dos feeds de economia, como "Contexto macro (sem
// cotações do dia)". O motivo vai para `avisos` (chega ao Telegram).
async function buildDados(mode: "crypto" | "tradicional", avisos: string[] = []): Promise<Dados | null> {
  if (mode === "tradicional") {
    const manchetes = await lerNoticias({ tipo: "macro", max: 15 }).catch(() => []);
    if (!manchetes.length) {
      avisos.push("tradicional: sem manchetes de economia (feeds sem resposta) — email não enviado");
      return null;
    }
    return { mode, manchetes };
  }
  // Mesmos dados do briefing do site: CoinGecko com a OKX de reserva (a OKX a
  // cobrir NÃO é aviso: o briefing sai completo), global com CoinPaprika de reserva.
  const d = await dadosCripto();
  if (!d.precos.length) {
    avisos.push("cripto: sem precos (CoinGecko e OKX sem resposta) — email não enviado");
    return null;
  }
  if (!d.global) avisos.push("contexto pobre: CoinGecko e CoinPaprika global sem resposta");
  return { mode, d };
}

// Devolve null em falha — o caller NUNCA envia email com texto de erro.
async function generateBriefing(dados: Dados, lang: Lang): Promise<string | null> {
  const today = new Date().toISOString().split("T")[0];
  const prompt = dados.mode === "crypto"
    ? promptEmailCripto(dados.d, lang, today)
    : promptEmailMacro(dados.manchetes, lang, today);
  try {
    // Cadeia completa: candidatos Groq (modelos vivos) → OpenAI → xAI.
    const text = await generateAiText({ prompt, maxTokens: 1000, temperature: 0.2 });
    return text || null;
  } catch (err) {
    console.error(`[briefing:${dados.mode}] geração falhou:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/** Título do email: o tradicional diz claramente que não traz cotações. */
const tituloEmail = (mode: "crypto" | "tradicional", lang: Lang) =>
  mode === "crypto" ? `${L[lang].briefing} ${L[lang].crypto}` : tituloMacro(lang);

function buildEmailHtml(briefing: string, mode: "crypto" | "tradicional", date: string, lang: Lang): string {
  const l = L[lang];
  // Output da IA é escapado antes de ir para HTML.
  const lines = briefing.split("\n").map((raw) => {
    const line = esc(raw);
    if (line.startsWith("## ")) return `<h2 style="color:#f97316;font-size:16px;margin:20px 0 8px">${line.replace("## ", "")}</h2>`;
    if (line.startsWith("- ") || line.startsWith("* ")) return `<p style="margin:4px 0;padding-left:12px;border-left:3px solid #f97316;color:#cbd5e1">${line.replace(/^[-*] /, "")}</p>`;
    if (line.trim() === "") return "<br/>";
    if (line.startsWith("**")) return `<p style="margin:6px 0;color:#e2e8f0;font-weight:600">${line.replace(/\*\*/g, "")}</p>`;
    return `<p style="margin:6px 0;color:#e2e8f0">${line}</p>`;
  }).join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="background:#0f172a;font-family:system-ui,sans-serif;padding:0;margin:0">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px">
    <div style="text-align:center;margin-bottom:24px">
      <img src="https://chainfolioai.com/chainfolioai-icon.png" alt="ChainFolioAI" width="48" height="48" style="border-radius:12px;object-fit:cover;margin-bottom:8px" />
      <p style="color:#f97316;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;margin:0">ChainFolioAI</p>
      <h1 style="color:#fff;font-size:22px;margin:8px 0">${tituloEmail(mode, lang)}</h1>
      <p style="color:#64748b;font-size:12px;margin:0">${date}</p>
    </div>
    <div style="background:#1e293b;border-radius:16px;padding:24px;border:1px solid #334155">
      ${lines}
    </div>
    <div style="text-align:center;margin-top:20px">
      <a href="https://chainfolioai.com/mercado" style="background:#f97316;color:#0f172a;padding:10px 24px;border-radius:999px;text-decoration:none;font-size:13px;font-weight:700">${l.cta}</a>
    </div>
    <p style="text-align:center;color:#475569;font-size:11px;margin-top:20px">
      ${l.foot} <a href="https://chainfolioai.com/account?section=notifications" style="color:#f97316">${l.unsub}</a>
    </p>
  </div>
</body>
</html>`;
}

export async function GET(request: Request) {
  // CRON_SECRET é obrigatório (fail-closed). O Vercel cron envia
  // Authorization: Bearer {CRON_SECRET} quando a env var está definida.
  // Não confiar no header x-vercel-cron (é falsificável por qualquer cliente).
  if (!(await verifyCronAuth(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const resendKey = process.env.RESEND_API_KEY ?? "";

  if (!supabaseUrl || !serviceKey || !resendKey) {
    return NextResponse.json({ error: "Env vars em falta: SUPABASE_SERVICE_ROLE_KEY e/ou RESEND_API_KEY não configuradas no Vercel." }, { status: 503 });
  }

  const currentHour = new Date().getUTCHours();
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Contas Hobby só permitem 1 cron/dia — não é possível respeitar a hora
  // escolhida por cada utilizador, por isso enviamos a todos os que têm o
  // briefing ativo nesta única execução diária.
  const { data: users, error: usersError } = await supabase
    .from("news_briefing_schedule")
    .select("user_id, email, mode, hour_utc")
    .eq("enabled", true);

  if (usersError) {
    console.error("[briefing] lista de subscritores indisponível:", usersError.message);
    await sendTelegram(`🔴 <b>Briefing diário FALHOU</b>\n${tgEsc(usersError.message)}\n\nNinguém recebeu o briefing.`).catch(() => false);
    return NextResponse.json({ error: "schedule unavailable" }, { status: 500 });
  }
  if (!users || users.length === 0) {
    return NextResponse.json({ sent: 0, hour: currentHour });
  }

  // O briefing é Pro/Premium: quem voltou ao Free deixa de o receber (e de
  // gastar IA + email) — a preferência é desligada para ficar coerente na Conta.
  let plans: Map<string, Plan>;
  try {
    plans = await activeSubscribers(supabase, users.map((u) => u.user_id));
  } catch (e) {
    console.error("[briefing] planos indisponíveis — nada enviado:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "subscriptions unavailable" }, { status: 503 });
  }
  const lapsed = users.filter((u) => !plans.has(u.user_id));
  if (lapsed.length > 0) {
    const { error: offErr } = await supabase
      .from("news_briefing_schedule")
      .update({ enabled: false })
      .in("user_id", lapsed.map((u) => u.user_id));
    if (offErr) console.error("[briefing] não desligou lapsos:", offErr.message);
  }
  const eligible = users.filter((u) => plans.has(u.user_id));

  // Lingua de cada subscritor: conta (user_metadata.lang) → inscricao no beta → pt.
  const langById = new Map<string, Lang | null>();
  try {
    const { data } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    for (const u of data.users) langById.set(u.id, langFromMetadata(u.user_metadata));
  } catch (e) { console.error("[briefing] listUsers", e instanceof Error ? e.message : e); }
  const signupLang = await signupLangByEmail(supabase);
  const langOf = (u: { user_id: string; email: string }) => resolveLang(langById.get(u.user_id), signupLang.get((u.email ?? "").toLowerCase()));

  let sent = 0;
  const errors: string[] = [];

  // O briefing é igual para todos na mesma lingua → gera-se UMA vez por
  // modo × lingua em uso (antes: 1 chamada LLM por utilizador). O contexto de
  // mercado (precos) vai buscar-se uma vez por modo.
  const contexts = new Map<"crypto" | "tradicional", Dados | null>();
  const cache = new Map<string, string | null>();
  const briefingFor = async (mode: "crypto" | "tradicional", lang: Lang) => {
    const key = `${mode}:${lang}`;
    if (!cache.has(key)) {
      if (!contexts.has(mode)) contexts.set(mode, await buildDados(mode, errors));
      const dados = contexts.get(mode) ?? null;
      // Sem dados reais o email deste modo não sai (o aviso já está em `errors`).
      const b = dados ? await generateBriefing(dados, lang) : null;
      if (dados && !b) { console.error(`[briefing] ${key}: IA indisponível — briefing não enviado`); errors.push(`${key}: IA indisponível`); }
      cache.set(key, b ? buildEmailHtml(b, mode, fmtDate(new Date(), lang, BRIEFING_DATE), lang) : null);
    }
    return cache.get(key) ?? null;
  };

  for (const user of eligible) {
    const rawMode = (user.mode ?? "crypto") as "crypto" | "tradicional" | "both";
    const modes: Array<"crypto" | "tradicional"> = rawMode === "both" ? ["crypto", "tradicional"] : [rawMode];
    const lang = langOf(user);
    for (const mode of modes) {
      const html = await briefingFor(mode, lang);
      if (!html) continue;
      const ok = await sendEmail({ from: FROM_BRIEFING, to: user.email, subject: `${tituloEmail(mode, lang)} — ${fmtDate(new Date(), lang, BRIEFING_DATE)}`, html, tag: "briefing" });
      // Email mascarado: os registos da Vercel e o Telegram não guardam dados pessoais.
      if (ok) sent++; else errors.push(`${mascararEmail(user.email)}/${mode}`);
    }
  }

  const resumo = { sent, total: users.length, eligible: eligible.length, lapsed: lapsed.length, hour: currentHour, errors };

  // Um cron so responde 200 se fez o que devia. Quem paga o briefing e nao o
  // recebe nao se queixa ao console.error: e preciso Telegram e um codigo que a
  // Vercel marque como falha (500 = ninguem recebeu; 207 = houve falhas parciais).
  if (eligible.length > 0 && sent === 0) {
    console.error("[briefing] FALHOU: nenhum email enviado", errors);
    await sendTelegram(`🔴 <b>Briefing diário FALHOU</b>\n${eligible.length} subscritor(es) elegíveis, 0 enviados.\n${tgEsc(errors.slice(0, 8).join("\n") || "sem motivo registado")}`).catch(() => false);
    return NextResponse.json({ ...resumo, error: "briefing_failed" }, { status: 500 });
  }
  if (errors.length > 0) {
    console.error("[briefing] falhas parciais", errors);
    await sendTelegram(`⚠️ <b>Briefing diário com falhas</b>\n${sent} enviado(s), ${errors.length} problema(s):\n${tgEsc(errors.slice(0, 8).join("\n"))}`).catch(() => false);
    return NextResponse.json(resumo, { status: 207 });
  }
  return NextResponse.json(resumo);
}
