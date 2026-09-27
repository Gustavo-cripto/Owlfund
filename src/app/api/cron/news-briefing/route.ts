import { NextResponse } from "next/server";
import { activeSubscribers, type Plan } from "@/lib/api/entitlement";
import { generateAiText } from "@/lib/ai/groq";
import { createClient } from "@supabase/supabase-js";
import { NO_ADVICE_RULE } from "@/lib/ai/disclaimer";
import { verifyCronAuth } from "@/lib/api/cron-auth";
import { esc, fmtDate, FROM_BRIEFING, sendEmail } from "@/lib/email";
import type { Lang } from "@/lib/i18n/translations";
import { langFromMetadata, resolveLang, signupLangByEmail } from "@/lib/user/lang";
import { sendTelegram, tgEsc } from "@/lib/notify/telegram";
import { cgFetch } from "@/lib/market/coingecko";
import { getGlobalMarket } from "@/lib/api/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const COINGECKO_IDS: Record<string, string> = {
  BTC: "bitcoin", ETH: "ethereum", SOL: "solana",
  BNB: "binancecoin", ADA: "cardano", XRP: "ripple",
};

// O CoinGecko vai SEMPRE pelo cgFetch (lote F): chave Demo — sem ela conta no
// IP partilhado da Vercel —, cache mínima por tipo de pedido e travão após 429.
async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = url.startsWith("https://api.coingecko.com/")
      ? await cgFetch(url, { signal: AbortSignal.timeout(6000) })
      : await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch { return null; }
}

// Tudo o que o email diz por si (fora do texto da IA), nas 4 linguas.
const L: Record<Lang, { in: string; crypto: string; trad: string; briefing: string; cta: string; foot: string; unsub: string }> = {
  pt: { in: "em português europeu", crypto: "Cripto", trad: "Mercado Tradicional", briefing: "Briefing", cta: "Ver Mercado →", foot: "Não constitui aconselhamento financeiro. Para cancelar, vai a", unsub: "Conta → Notificações" },
  en: { in: "in English", crypto: "Crypto", trad: "Traditional Markets", briefing: "Briefing", cta: "View Markets →", foot: "This is not financial advice. To unsubscribe, go to", unsub: "Account → Notifications" },
  es: { in: "en español", crypto: "Cripto", trad: "Mercado Tradicional", briefing: "Briefing", cta: "Ver Mercado →", foot: "No constituye asesoramiento financiero. Para cancelar, ve a", unsub: "Cuenta → Notificaciones" },
  fr: { in: "en français", crypto: "Crypto", trad: "Marchés traditionnels", briefing: "Briefing", cta: "Voir le marché →", foot: "Ceci ne constitue pas un conseil financier. Pour vous désabonner, allez dans", unsub: "Compte → Notifications" },
};
const BRIEFING_DATE: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long", year: "numeric" };

// `avisos` recebe o que faltou (CoinGecko em 429, por exemplo): o briefing sai
// na mesma, mas com contexto pobre — e isso tem de chegar ao Telegram.
async function buildContext(mode: "crypto" | "tradicional", avisos: string[] = []): Promise<string> {
  if (mode === "tradicional") return "Análise de mercado tradicional: foca em contexto macro, Fed, inflação e tendências setoriais.";

  const ids = Object.values(COINGECKO_IDS).join(",");
  type PriceData = Record<string, { usd: number; usd_24h_change: number }>;
  const prices = await fetchJson<PriceData>(
    `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`
  );
  // Global partilhado com /api/v1/global: cache 30 min e CoinPaprika de reserva.
  const global = await getGlobalMarket();
  type FG = { data: { value: string; value_classification: string }[] };
  const fg = await fetchJson<FG>("https://api.alternative.me/fng/?limit=1");
  if (!prices) avisos.push("contexto pobre: CoinGecko simple/price sem resposta");
  if (!global.source) avisos.push("contexto pobre: CoinGecko e CoinPaprika global sem resposta");

  const lines: string[] = [];
  if (prices) {
    for (const [sym, id] of Object.entries(COINGECKO_IDS)) {
      const p = prices[id];
      if (!p) continue;
      const sign = p.usd_24h_change >= 0 ? "+" : "";
      lines.push(`${sym}: $${p.usd.toLocaleString("en-US", { maximumFractionDigits: 2 })} (${sign}${p.usd_24h_change?.toFixed(2)}% 24h)`);
    }
  }
  if (global.totalMarketCapUsd != null) {
    lines.push(`Cap total: $${(global.totalMarketCapUsd / 1e12).toFixed(2)}T (${global.marketCapChange24h?.toFixed(2)}% 24h)`);
    if (global.btcDominance != null) lines.push(`Dominância BTC: ${global.btcDominance.toFixed(1)}%`);
  }
  if (fg?.data?.[0]) lines.push(`Fear & Greed: ${fg.data[0].value}/100 — ${fg.data[0].value_classification}`);
  return lines.join("\n");
}

// Devolve null em falha — o caller NUNCA envia email com texto de erro.
async function generateBriefing(mode: "crypto" | "tradicional", context: string, lang: Lang): Promise<string | null> {
  const today = new Date().toISOString().split("T")[0];
  // O pedido fica em portugues (a IA segue-o bem); so a lingua DO TEXTO muda.
  const prompt = (mode === "crypto"
    ? `Briefing diário de mercado cripto, escrito ${L[lang].in}. Data: ${today}.\n\nDados reais:\n${context}\n\nEscreve um briefing conciso com: Resumo, Destaques (bullets), Análise BTC/ETH/SOL, Fear & Greed e Perspetiva 24h (descritiva: cenários e riscos, sem recomendações). Usa APENAS os preços fornecidos. Todo o texto, incluindo títulos, ${L[lang].in}.`
    : `Briefing diário de mercado tradicional, escrito ${L[lang].in}. Data: ${today}.\n\nEscreve um briefing com: Resumo Macro, Destaques, Análise setorial (Tech, Ouro, Índices) e Perspetiva (descritiva). Não inventes cotações específicas. Todo o texto, incluindo títulos, ${L[lang].in}.`)
    + `\n\n${NO_ADVICE_RULE}`;
  try {
    // Cadeia completa: candidatos Groq (modelos vivos) → OpenAI → xAI.
    const text = await generateAiText({ prompt, maxTokens: 1000, temperature: 0.2 });
    return text || null;
  } catch (err) {
    console.error(`[briefing:${mode}] geração falhou:`, err instanceof Error ? err.message : err);
    return null;
  }
}

function buildEmailHtml(briefing: string, mode: string, date: string, lang: Lang): string {
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
      <h1 style="color:#fff;font-size:22px;margin:8px 0">${l.briefing} ${mode === "crypto" ? l.crypto : l.trad}</h1>
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
  const contexts = new Map<"crypto" | "tradicional", string>();
  const cache = new Map<string, string | null>();
  const briefingFor = async (mode: "crypto" | "tradicional", lang: Lang) => {
    const key = `${mode}:${lang}`;
    if (!cache.has(key)) {
      if (!contexts.has(mode)) contexts.set(mode, await buildContext(mode, errors));
      const b = await generateBriefing(mode, contexts.get(mode) ?? "", lang);
      if (!b) { console.error(`[briefing] ${key}: IA indisponível — briefing não enviado`); errors.push(`${key}: IA indisponível`); }
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
      const ok = await sendEmail({ from: FROM_BRIEFING, to: user.email, subject: `${L[lang].briefing} ${mode === "crypto" ? L[lang].crypto : L[lang].trad} — ${fmtDate(new Date(), lang, BRIEFING_DATE)}`, html, tag: "briefing" });
      if (ok) sent++; else errors.push(`${user.email}/${mode}`);
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
