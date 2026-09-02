import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { rateLimit, clientIp } from "@/lib/utils/rateLimit";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

async function getAuthUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: { get: (name) => cookieStore.get(name)?.value, set: () => {}, remove: () => {} },
  });
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

type PortfolioContext = {
  totalEur: number;
  pnlPosition: number;
  pnlToday: number;
  pnl30d: number;
  roi?: number;
  cagr?: number;
  sharpe?: number;
  maxDrawdown?: number;
  volatility?: number;
  days?: number;
  allocations: Array<{ label: string; symbol: string; valueEur: number; percent: string }>;
};

type Body = {
  question: string;
  context: PortfolioContext;
  nickname?: string;
};

function buildSystemPrompt(ctx: PortfolioContext, nickname = ""): string {
  const fmt = (n: number) =>
    n.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = (n: number) => (n >= 0 ? `+€ ${fmt(n)}` : `-€ ${fmt(Math.abs(n))}`);

  const allocLines = ctx.allocations
    .filter((a) => a.valueEur > 0)
    .map((a) => `  • ${a.label} (${a.symbol}): € ${fmt(a.valueEur)} · ${a.percent}`)
    .join("\n");

  const metrics = [
    typeof ctx.roi === "number" ? `ROI: ${ctx.roi.toFixed(2)}%` : null,
    typeof ctx.cagr === "number" ? `CAGR: ${ctx.cagr.toFixed(2)}%` : null,
    typeof ctx.sharpe === "number" ? `Sharpe Ratio: ${ctx.sharpe.toFixed(2)}` : null,
    typeof ctx.maxDrawdown === "number" ? `Max Drawdown: ${ctx.maxDrawdown.toFixed(2)}%` : null,
    typeof ctx.volatility === "number" ? `Volatilidade anualizada: ${ctx.volatility.toFixed(2)}%` : null,
    typeof ctx.days === "number" ? `Período analisado: ${ctx.days} dias` : null,
  ]
    .filter(Boolean)
    .join("\n  ");

  const nameLine = nickname
    ? `\nO utilizador chama-se ${nickname} — trata-o por esse nome de forma natural. Não inventes outro nome.`
    : "";

  return `Tu és o assistente IA — analista financeiro pessoal do utilizador no ChainFolioAI. Tens acesso em tempo real aos dados do portfólio dele:${nameLine}

PORTFÓLIO ATUAL:
  Total: € ${fmt(ctx.totalEur)}
  PNL posição: ${sign(ctx.pnlPosition)}
  PNL hoje: ${sign(ctx.pnlToday)}
  PNL 30 dias: ${sign(ctx.pnl30d)}

MÉTRICAS AVANÇADAS:
  ${metrics || "Não disponíveis (poucos snapshots)"}

DISTRIBUIÇÃO DE ATIVOS:
${allocLines || "  Sem ativos registados"}

INSTRUÇÕES:
- IDIOMA (regra crítica): Responde SEMPRE no mesmo idioma em que o utilizador escreveu a pergunta (inglês→inglês, espanhol→espanhol, francês→francês, português→PT-PT). Deteta o idioma da pergunta; não assumas português por defeito.
- Responde de forma clara e objetiva.
- Usa os dados reais acima para fundamentar as tuas respostas.
- Quando perguntarem "porque caiu/subiu", analisa os ativos com maior peso.
- Não dês recomendações diretas de compra/venda — apresenta cenários e riscos.
- Se faltarem dados, diz o que precisas.
- Máximo 3 parágrafos curtos por resposta.`;
}

async function callAI(system: string, question: string): Promise<string> {
  const messages = [
    { role: "system", content: system },
    { role: "user", content: question },
  ];

  // Tenta Groq primeiro (free tier)
  const groqKey = (process.env.GROQ_API_KEY ?? "").trim();
  if (groqKey) {
    const model = (() => { const m = (process.env.GROQ_MODEL ?? "").trim(); return !m || m === "llama-3.1-8b-instant" ? "llama-3.3-70b-versatile" : m; })();
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${groqKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, temperature: 0.5, max_tokens: 500, messages }),
      signal: AbortSignal.timeout(12000),
    });
    if (res.ok) {
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const reply = data.choices?.[0]?.message?.content?.trim();
      if (reply) return reply;
    }
  }

  // Fallback OpenAI
  const openaiKey = (process.env.OPENAI_API_KEY ?? "").trim();
  if (openaiKey) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-4o-mini", temperature: 0.5, max_tokens: 500, messages }),
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const reply = data.choices?.[0]?.message?.content?.trim();
      if (reply) return reply;
    }
  }

  // Fallback xAI
  const xaiKey = (process.env.XAI_API_KEY ?? "").trim();
  if (xaiKey) {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${xaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "grok-4-fast-non-reasoning", temperature: 0.5, max_tokens: 500, messages }),
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const reply = data.choices?.[0]?.message?.content?.trim();
      if (reply) return reply;
    }
  }

  throw new Error("Nenhum provider de IA disponível. Configura GROQ_API_KEY, OPENAI_API_KEY ou XAI_API_KEY.");
}

export async function POST(request: Request) {
  // Rate limit por IP (trava abuso/custo de IA)
  if (!rateLimit(`portfolio-ai:${clientIp(request)}`, 20, 60_000)) {
    return NextResponse.json({ error: "Demasiados pedidos. Tenta novamente em 1 minuto." }, { status: 429 });
  }

  // Exigir sessão — endpoint usado apenas na página de portefólio (autenticada)
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  let body: Body | null = null;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const { question, context, nickname } = body ?? {};
  if (!question?.trim()) {
    return NextResponse.json({ error: "Pergunta obrigatória." }, { status: 400 });
  }
  if (!context) {
    return NextResponse.json({ error: "Contexto obrigatório." }, { status: 400 });
  }

  try {
    const system = buildSystemPrompt(context, typeof nickname === "string" ? nickname.trim().slice(0, 40) : "");
    const reply = await callAI(system, question.trim());
    return NextResponse.json({ reply });
  } catch (err) {
    // Log interno; nunca expor detalhes do erro ao cliente.
    console.error("[portfolio-ai]", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "Não foi possível gerar a análise agora. Tenta novamente." },
      { status: 503 }
    );
  }
}
