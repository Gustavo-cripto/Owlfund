import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const COINGECKO_IDS: Record<string, string> = {
  BTC: "bitcoin", ETH: "ethereum", SOL: "solana",
  BNB: "binancecoin", ADA: "cardano", XRP: "ripple",
};

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
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

async function generateBriefing(mode: "crypto" | "tradicional", context: string): Promise<string> {
  const apiKey = (process.env.GROQ_API_KEY ?? "").trim();
  if (!apiKey) return "GROQ_API_KEY não configurada.";
  const today = new Date().toISOString().split("T")[0];
  const prompt = mode === "crypto"
    ? `Briefing diário de mercado cripto em português europeu. Data: ${today}.\n\nDados reais:\n${context}\n\nEscreve um briefing conciso com: Resumo, Destaques (bullets), Análise BTC/ETH/SOL, Fear & Greed e Perspetiva 24h. Usa APENAS os preços fornecidos.`
    : `Briefing diário de mercado tradicional em português europeu. Data: ${today}.\n\nEscreve um briefing com: Resumo Macro, Destaques, Análise setorial (Tech, Ouro, Índices) e Perspetiva. Não inventes cotações específicas.`;

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1000,
      temperature: 0.2,
    }),
  });
  if (!res.ok) return "Erro ao gerar briefing.";
  const data = await res.json() as { choices: { message: { content: string } }[] };
  return data.choices[0]?.message?.content ?? "";
}

function buildEmailHtml(briefing: string, mode: string, date: string): string {
  const lines = briefing.split("\n").map((line) => {
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
      Para cancelar, vai a <a href="https://chainfolioai.com/account" style="color:#f97316">Conta → Notificações</a>
    </p>
  </div>
</body>
</html>`;
}

export async function GET(request: Request) {
  // CRON_SECRET é obrigatório (fail-closed). O Vercel cron envia
  // Authorization: Bearer {CRON_SECRET} quando a env var está definida.
  // Não confiar no header x-vercel-cron (é falsificável por qualquer cliente).
  const cronSecret = (process.env.CRON_SECRET ?? "").trim();
  if (!cronSecret) {
    console.error("[cron/news-briefing] CRON_SECRET não configurado — endpoint bloqueado.");
    return NextResponse.json({ error: "CRON_SECRET não configurado." }, { status: 503 });
  }
  const authHeader = request.headers.get("authorization") ?? "";
  const querySecret = new URL(request.url).searchParams.get("secret") ?? "";
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const resendKey = process.env.RESEND_API_KEY ?? "";

  if (!supabaseUrl || !serviceKey || !resendKey) {
    return NextResponse.json({ error: "Env vars em falta: SUPABASE_SERVICE_ROLE_KEY e/ou RESEND_API_KEY não configuradas no Vercel." }, { status: 503 });
  }

  const currentHour = new Date().getUTCHours();
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const resend = new Resend(resendKey);

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

  const date = new Date().toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  let sent = 0;
  const errors: string[] = [];

  for (const user of users) {
    const rawMode = (user.mode ?? "crypto") as "crypto" | "tradicional" | "both";

    // "both" = envia dois emails (cripto + tradicional)
    const modes: Array<"crypto" | "tradicional"> = rawMode === "both"
      ? ["crypto", "tradicional"]
      : [rawMode];

    for (const mode of modes) {
      const context = await buildContext(mode);
      const briefing = await generateBriefing(mode, context);
      const html = buildEmailHtml(briefing, mode, date);

      const { error } = await resend.emails.send({
        from: "ChainFolioAI <briefing@owlfund.app>",
        to: user.email,
        subject: `Briefing ${mode === "crypto" ? "Cripto" : "Mercado Tradicional"} — ${date}`,
        html,
      });

      if (error) errors.push(`${user.email}/${mode}: ${error.message}`);
      else sent++;
    }
  }

  return NextResponse.json({ sent, total: users.length, hour: currentHour, errors });
}
