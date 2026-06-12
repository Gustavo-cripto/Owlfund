import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const premiumPriceId = process.env.STRIPE_PREMIUM_PRICE_ID ?? "";

type Message = { role: "user" | "assistant"; content: string };

// ── LLM helpers (same providers as /api/chat) ────────────────────────────────

const hasOpenAi = () => Boolean((process.env.OPENAI_API_KEY ?? "").trim());
const hasGroq = () => Boolean((process.env.GROQ_API_KEY ?? "").trim());
const hasXai = () => Boolean((process.env.XAI_API_KEY ?? "").trim());

async function callLLM(messages: Array<{ role: string; content: string }>): Promise<string> {
  if (hasGroq()) {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile", temperature: 0.65, max_tokens: 1024, messages }),
      signal: AbortSignal.timeout(25000),
    });
    if (res.ok) { const d = await res.json() as { choices: [{ message: { content: string } }] }; return d.choices[0].message.content; }
  }
  if (hasXai()) {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.XAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.XAI_MODEL ?? "grok-3-mini", temperature: 0.65, max_tokens: 1024, messages }),
      signal: AbortSignal.timeout(25000),
    });
    if (res.ok) { const d = await res.json() as { choices: [{ message: { content: string } }] }; return d.choices[0].message.content; }
  }
  if (hasOpenAi()) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.OPENAI_MODEL ?? "gpt-4o-mini", temperature: 0.65, max_tokens: 1024, messages }),
      signal: AbortSignal.timeout(25000),
    });
    if (res.ok) { const d = await res.json() as { choices: [{ message: { content: string } }] }; return d.choices[0].message.content; }
  }
  throw new Error("Nenhum provider LLM disponível.");
}

// ── Portfolio context builder ─────────────────────────────────────────────────

type SnapshotData = {
  eth?: Array<{ address?: string; balance?: string; network?: string }>;
  sol?: Array<{ address?: string; balance?: string }>;
  btc?: Array<{ address?: string; balance?: string }>;
  ada?: Array<{ address?: string; balance?: string }>;
  other?: Array<{ address?: string; balance?: string; network?: string; label?: string }>;
  cexUsd?: number;
  defiUsd?: number;
  _totalEur?: number;
};

function buildPortfolioContext(snapshot: SnapshotData | null, subscription: { price_id: string | null; current_period_end: string | null } | null, prices: Record<string, number>): string {
  if (!snapshot) return "Nenhum snapshot de portfolio disponível. O utilizador ainda não guardou dados de carteiras.";

  const lines: string[] = ["=== DADOS DO PORTFOLIO DO UTILIZADOR ==="];

  const totalEur = snapshot._totalEur;
  if (totalEur) lines.push(`Valor total estimado: €${totalEur.toFixed(2)}`);

  const addChain = (name: string, entries?: Array<{ balance?: string }>, priceKey?: string) => {
    if (!entries?.length) return;
    const total = entries.reduce((s, e) => s + parseFloat(e.balance ?? "0"), 0);
    const price = priceKey ? (prices[priceKey] ?? 0) : 0;
    const eur = total * price;
    lines.push(`${name}: ${total.toFixed(8)} (≈€${eur.toFixed(2)}, ${entries.length} carteira(s))`);
  };

  addChain("Bitcoin (BTC)", snapshot.btc, "bitcoin");
  addChain("Ethereum (ETH)", snapshot.eth, "ethereum");
  addChain("Solana (SOL)", snapshot.sol, "solana");
  addChain("Cardano (ADA)", snapshot.ada, "cardano");

  if (snapshot.cexUsd) lines.push(`CEX: $${snapshot.cexUsd.toFixed(2)} USD`);
  if (snapshot.defiUsd) lines.push(`DeFi: $${snapshot.defiUsd.toFixed(2)} USD`);
  if (snapshot.other?.length) {
    const others = snapshot.other.map(e => `${e.label ?? e.network ?? "?"}: ${e.balance ?? "?"}`).join(", ");
    lines.push(`Outras redes: ${others}`);
  }

  if (subscription?.current_period_end) {
    const d = new Date(subscription.current_period_end).toLocaleDateString("pt-PT");
    lines.push(`Plano Premium ativo até: ${d}`);
  }

  return lines.join("\n");
}

const GESTOR_SYSTEM = `És o Gestor Dedicado IA do Owlfund — um assistente financeiro premium especializado em cripto e gestão de portfolio.

PERSONALIDADE: Profissional mas acessível. Conciso e direto. Usa dados reais do portfolio do utilizador nas respostas. Fala em PT-PT.

CAPACIDADES:
- Análise de risco e alocação do portfolio
- Estimativas fiscais (IRS Portugal, regime de mais-valias cripto — isenção >365 dias para ativos adquiridos antes de 2023, 28% para os restantes)
- FIRE planning (regra dos 4%, projeção patrimonial)
- Estratégias de rebalanceamento
- Interpretação de movimentos on-chain / Smart Money
- Alertas e recomendações baseadas em dados reais

REGRAS:
- Usa SEMPRE os dados reais do portfolio fornecidos abaixo no contexto.
- Não inventes saldos ou valores — usa os dados disponíveis.
- Não dês recomendações diretas de compra/venda — apresenta análise e cenários com riscos.
- Respostas estruturadas: máx 4 parágrafos ou lista com bullets. Usa markdown.
- Para cálculos fiscais: indica sempre que são estimativas e recomendar validação com contabilista.
- Se o utilizador pedir ação (exportar PDF, criar alerta): confirma que vais processar e indica onde encontrar o resultado.`;

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: { get: (name) => cookieStore.get(name)?.value, set: () => {}, remove: () => {} },
    });

    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    // Verify Premium
    const { data: sub } = await supabase
      .from("subscriptions").select("status, price_id, current_period_end")
      .eq("user_id", user.id).eq("status", "active").maybeSingle();
    const isPremium = !!premiumPriceId && sub?.price_id === premiumPriceId;
    if (!isPremium) return NextResponse.json({ error: "Requer Plano Premium." }, { status: 403 });

    const body = await req.json() as { messages: Message[] };
    const messages = (body.messages ?? []).slice(-14).map(m => ({
      role: m.role,
      content: String(m.content ?? "").slice(0, 4000),
    }));

    if (!messages.length) return NextResponse.json({ error: "Sem mensagens." }, { status: 400 });

    // Fetch latest portfolio snapshot
    const supabaseAdmin = getSupabaseAdmin();
    const { data: snapshotRow } = await supabaseAdmin
      .from("portfolio_snapshots").select("data").eq("user_id", user.id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();

    // Fetch prices
    let prices: Record<string, number> = {};
    try {
      const priceRes = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,cardano&vs_currencies=eur", { signal: AbortSignal.timeout(5000) });
      if (priceRes.ok) prices = await priceRes.json() as Record<string, { eur: number }>;
      // flatten { bitcoin: { eur: N } } → { bitcoin: N }
      prices = Object.fromEntries(Object.entries(prices).map(([k, v]) => [k, (v as { eur: number }).eur ?? 0]));
    } catch { /* use empty prices */ }

    const portfolioCtx = buildPortfolioContext(snapshotRow?.data as SnapshotData ?? null, sub, prices);
    const systemPrompt = `${GESTOR_SYSTEM}\n\n${portfolioCtx}`;

    const reply = await callLLM([
      { role: "system", content: systemPrompt },
      ...messages,
    ]);

    return NextResponse.json({ reply });
  } catch (err) {
    console.error("[gestor]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
