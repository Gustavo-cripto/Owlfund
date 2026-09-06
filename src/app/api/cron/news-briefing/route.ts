import { NextResponse } from "next/server";
import { generateAiText } from "@/lib/ai/groq";
import { createClient } from "@supabase/supabase-js";
import { NO_ADVICE_RULE } from "@/lib/ai/disclaimer";
import { verifyCronAuth } from "@/lib/api/cron-auth";
import { esc, FROM_BRIEFING, sendEmail, TZ } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const COINGECKO_IDS: Record<string, string> = {
  BTC: "bitcoin", ETH: "ethereum", SOL: "solana",
  BNB: "binancecoin", ADA: "cardano", XRP: "ripple",
};

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch { return null; }
}

async function buildContext(mode: "crypto" | "tradicional"): Promise<string> {
  if (mode === "tradicional") return "Análise de mercado tradicional: foca em contexto macro, Fed, inflação e tendências setoriais.";

  const ids = Object.values(COINGECKO_IDS).join(",");
  type PriceData = Record<string, { usd: number; usd_24h_change: number }>;
  const prices = await fetchJson<PriceData>(
    `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`
  );
  type GlobalData = { data: { total_market_cap: { usd: number }; market_cap_change_percentage_24h_usd: number; market_cap_percentage: { btc: number } } };
  const global = await fetchJson<GlobalData>("https://api.coingecko.com/api/v3/global");
  type FG = { data: { value: string; value_classification: string }[] };
  const fg = await fetchJson<FG>("https://api.alternative.me/fng/?limit=1");

  const lines: string[] = [];
  if (prices) {
    for (const [sym, id] of Object.entries(COINGECKO_IDS)) {
      const p = prices[id];
      if (!p) continue;
      const sign = p.usd_24h_change >= 0 ? "+" : "";
      lines.push(`${sym}: $${p.usd.toLocaleString("en-US", { maximumFractionDigits: 2 })} (${sign}${p.usd_24h_change?.toFixed(2)}% 24h)`);
    }
  }
  if (global?.data) {
    lines.push(`Cap total: $${(global.data.total_market_cap.usd / 1e12).toFixed(2)}T (${global.data.market_cap_change_percentage_24h_usd?.toFixed(2)}% 24h)`);
    lines.push(`Dominância BTC: ${global.data.market_cap_percentage?.btc?.toFixed(1)}%`);
  }
  if (fg?.data?.[0]) lines.push(`Fear & Greed: ${fg.data[0].value}/100 — ${fg.data[0].value_classification}`);
  return lines.join("\n");
}

// Devolve null em falha — o caller NUNCA envia email com texto de erro.
async function generateBriefing(mode: "crypto" | "tradicional", context: string): Promise<string | null> {
  const today = new Date().toISOString().split("T")[0];
  const prompt = (mode === "crypto"
    ? `Briefing diário de mercado cripto em português europeu. Data: ${today}.\n\nDados reais:\n${context}\n\nEscreve um briefing conciso com: Resumo, Destaques (bullets), Análise BTC/ETH/SOL, Fear & Greed e Perspetiva 24h (descritiva: cenários e riscos, sem recomendações). Usa APENAS os preços fornecidos.`
    : `Briefing diário de mercado tradicional em português europeu. Data: ${today}.\n\nEscreve um briefing com: Resumo Macro, Destaques, Análise setorial (Tech, Ouro, Índices) e Perspetiva (descritiva). Não inventes cotações específicas.`)
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

function buildEmailHtml(briefing: string, mode: string, date: string): string {
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
      <h1 style="color:#fff;font-size:22px;margin:8px 0">Briefing ${mode === "crypto" ? "Cripto" : "Tradicional"}</h1>
      <p style="color:#64748b;font-size:12px;margin:0">${date}</p>
    </div>
    <div style="background:#1e293b;border-radius:16px;padding:24px;border:1px solid #334155">
      ${lines}
    </div>
    <div style="text-align:center;margin-top:20px">
      <a href="https://chainfolioai.com/mercado" style="background:#f97316;color:#0f172a;padding:10px 24px;border-radius:999px;text-decoration:none;font-size:13px;font-weight:700">Ver Mercado →</a>
    </div>
    <p style="text-align:center;color:#475569;font-size:11px;margin-top:20px">
      Não constitui aconselhamento financeiro. Para cancelar, vai a <a href="https://chainfolioai.com/account?section=notifications" style="color:#f97316">Conta → Notificações</a>
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
  const { data: users } = await supabase
    .from("news_briefing_schedule")
    .select("user_id, email, mode, hour_utc")
    .eq("enabled", true);

  if (!users || users.length === 0) {
    return NextResponse.json({ sent: 0, hour: currentHour });
  }

  const date = new Date().toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: TZ });
  let sent = 0;
  const errors: string[] = [];

  // O briefing é igual para todos → gera-se UMA vez por modo (antes: 1 chamada LLM por utilizador).
  const cache = new Map<"crypto" | "tradicional", string | null>();
  const briefingFor = async (mode: "crypto" | "tradicional") => {
    if (!cache.has(mode)) {
      const context = await buildContext(mode);
      const b = await generateBriefing(mode, context);
      if (!b) console.error(`[briefing] ${mode}: IA indisponível — briefing não enviado`);
      cache.set(mode, b ? buildEmailHtml(b, mode, date) : null);
    }
    return cache.get(mode) ?? null;
  };

  for (const user of users) {
    const rawMode = (user.mode ?? "crypto") as "crypto" | "tradicional" | "both";
    const modes: Array<"crypto" | "tradicional"> = rawMode === "both" ? ["crypto", "tradicional"] : [rawMode];
    for (const mode of modes) {
      const html = await briefingFor(mode);
      if (!html) continue;
      const ok = await sendEmail({ from: FROM_BRIEFING, to: user.email, subject: `Briefing ${mode === "crypto" ? "Cripto" : "Mercado Tradicional"} — ${date}`, html, tag: "briefing" });
      if (ok) sent++; else errors.push(`${user.email}/${mode}`);
    }
  }

  return NextResponse.json({ sent, total: users.length, hour: currentHour, errors });
}
