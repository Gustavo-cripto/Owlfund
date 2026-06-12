import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const premiumPriceId = process.env.STRIPE_PREMIUM_PRICE_ID ?? process.env.NEXT_PUBLIC_STRIPE_PREMIUM_PRICE_ID ?? "";

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

type WatchEntry = { address: string; label: string; chain: "eth" | "sol" | "btc" };
type Movement = { address: string; label: string; chain: string; type: string; description: string; usdValue: number; timestamp: number };

// ── On-chain movement fetchers (reused from /api/smart-money-rt) ──────────────

async function fetchBtcMovements(address: string, label: string): Promise<Movement[]> {
  try {
    const res = await fetch(`https://mempool.space/api/address/${address}/txs`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const txs = await res.json() as Array<{ status: { block_time: number }; vout: Array<{ value: number }> }>;
    if (!txs?.length) return [];
    const latest = txs[0];
    const btcValue = (latest.vout ?? []).reduce((s, o) => s + (o.value ?? 0), 0) / 1e8;
    if (btcValue < 0.01) return [];
    return [{ address, label, chain: "btc", type: btcValue > 1 ? "large_transfer" : "accumulation",
      description: `${btcValue.toFixed(4)} BTC`, usdValue: 0,
      timestamp: (latest.status?.block_time ?? Date.now() / 1000) * 1000 }];
  } catch { return []; }
}

async function fetchEthMovements(address: string, label: string): Promise<Movement[]> {
  try {
    const apiKey = process.env.MORALIS_API_KEY ?? "";
    if (!apiKey) return [];
    const res = await fetch(`https://deep-index.moralis.io/api/v2.2/${address}/erc20/transfers?chain=eth&limit=5`,
      { headers: { "X-API-Key": apiKey }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const data = await res.json() as { result?: Array<{ value: string; token_decimals: string; token_symbol: string; block_timestamp: string }> };
    return (data.result ?? []).slice(0, 2).map(tx => {
      const amount = parseInt(tx.value ?? "0") / Math.pow(10, parseInt(tx.token_decimals ?? "18"));
      return { address, label, chain: "eth", type: amount > 100000 ? "large_transfer" : "accumulation",
        description: `${amount.toFixed(2)} ${tx.token_symbol}`, usdValue: 0,
        timestamp: new Date(tx.block_timestamp).getTime() };
    }).filter(m => parseFloat(m.description) > 0);
  } catch { return []; }
}

async function fetchWatchlistMovements(watchlist: WatchEntry[]): Promise<Movement[]> {
  if (!watchlist.length) return [];
  const results = await Promise.allSettled(
    watchlist.slice(0, 8).map(e => {
      if (e.chain === "btc") return fetchBtcMovements(e.address, e.label);
      if (e.chain === "eth") return fetchEthMovements(e.address, e.label);
      return Promise.resolve([] as Movement[]);
    })
  );
  return results.flatMap(r => r.status === "fulfilled" ? r.value : [])
    .sort((a, b) => b.timestamp - a.timestamp).slice(0, 15);
}

function buildWatchlistContext(watchlist: WatchEntry[], movements: Movement[]): string {
  if (!watchlist.length) return "";
  const lines = ["\n=== SMART MONEY WATCHLIST ==="];
  lines.push(`Endereços monitorados: ${watchlist.length}`);
  watchlist.slice(0, 10).forEach(e => lines.push(`  • ${e.label} (${e.chain.toUpperCase()}): ${e.address.slice(0, 10)}...`));
  if (movements.length) {
    lines.push("\nMovimentos recentes detetados:");
    movements.forEach(m => {
      const time = new Date(m.timestamp).toLocaleString("pt-PT");
      lines.push(`  [${time}] ${m.label} (${m.chain.toUpperCase()}): ${m.description} — ${m.type}`);
    });
  } else {
    lines.push("\nSem movimentos significativos recentes na watchlist.");
  }
  return lines.join("\n");
}

function buildPortfolioContext(snapshot: SnapshotData | null, subscription: { price_id: string | null; current_period_end: string | null } | null, prices: Record<string, number>): string {
  const hasData = snapshot && (
    (snapshot.btc?.length ?? 0) + (snapshot.eth?.length ?? 0) +
    (snapshot.sol?.length ?? 0) + (snapshot.ada?.length ?? 0) +
    (snapshot.other?.length ?? 0) + (snapshot.cexUsd ?? 0) + (snapshot.defiUsd ?? 0)
  ) > 0;

  if (!hasData) {
    return `=== ESTADO DO PORTFOLIO ===
Sem carteiras registadas ainda.
INSTRUÇÃO: Informa o utilizador de forma simpática que ainda não tem carteiras adicionadas na app. Sugere que vá a /wallets para adicionar as suas carteiras cripto (BTC, ETH, SOL, etc.) e que depois poderás analisar o portfolio real. Entretanto, podes responder a perguntas gerais sobre cripto, fiscalidade portuguesa e estratégias financeiras com base nas informações que o utilizador fornecer na conversa.`;
  }

  const lines: string[] = ["=== DADOS DO PORTFOLIO DO UTILIZADOR ==="];

  const totalEur = snapshot!._totalEur;
  if (totalEur) lines.push(`Valor total estimado: €${totalEur.toFixed(2)}`);

  const addChain = (name: string, entries?: Array<{ address?: string; balance?: string }>, priceKey?: string) => {
    if (!entries?.length) return;
    const total = entries.reduce((s, e) => s + parseFloat(e.balance ?? "0"), 0);
    const price = priceKey ? (prices[priceKey] ?? 0) : 0;
    const eur = total * price;
    lines.push(`${name}: ${total.toFixed(8)} (≈€${eur.toFixed(2)}, ${entries.length} carteira(s))`);
    entries.slice(0, 3).forEach(e => { if (e.address) lines.push(`    Endereço: ${e.address}`); });
  };

  addChain("Bitcoin (BTC)", snapshot!.btc, "bitcoin");
  addChain("Ethereum (ETH)", snapshot!.eth, "ethereum");
  addChain("Solana (SOL)", snapshot!.sol, "solana");
  addChain("Cardano (ADA)", snapshot!.ada, "cardano");

  if (snapshot!.cexUsd) lines.push(`CEX: $${snapshot!.cexUsd.toFixed(2)} USD`);
  if (snapshot!.defiUsd) lines.push(`DeFi: $${snapshot!.defiUsd.toFixed(2)} USD`);
  if (snapshot!.other?.length) {
    const others = snapshot!.other.map(e => `${e.label ?? e.network ?? "?"}: ${e.balance ?? "?"}`).join(", ");
    lines.push(`Outras redes: ${others}`);
  }

  if (subscription?.current_period_end) {
    const d = new Date(subscription.current_period_end).toLocaleDateString("pt-PT");
    lines.push(`Plano Premium ativo até: ${d}`);
  }

  return lines.join("\n");
}

const GESTOR_SYSTEM = `És o Gestor Dedicado IA do Owlfund — um assistente financeiro premium especializado em cripto e gestão de portfolio.

PERSONALIDADE: Profissional mas acessível. Conciso e direto. Fala em PT-PT (Portugal). Respostas curtas e úteis — sem introduções longas.

CAPACIDADES:
- Análise de risco e alocação do portfolio com dados reais das carteiras
- Análise de movimentos on-chain em tempo real (watchlist de baleias)
- Estimativas fiscais (IRS Portugal — isenção >365 dias para ativos adquiridos antes de 2023, taxa 28% para os restantes)
- FIRE planning (regra dos 4%, projeção patrimonial)
- Estratégias de rebalanceamento e diversificação
- Interpretação de movimentos Smart Money / baleias

REGRAS:
- Se houver dados reais do portfolio, usa-os sempre. Menciona endereços e valores.
- Se houver movimentos on-chain da watchlist, analisa-os e interpreta o que significam.
- Se não houver dados, sê útil na mesma — responde com base no que o utilizador te diz.
- Nunca inventes saldos ou movimentos que não existam no contexto.
- Não dês recomendações diretas de compra/venda — apresenta análise e cenários com riscos.
- Respostas estruturadas: máx 4 parágrafos ou lista com bullets. Usa markdown.
- Para cálculos fiscais: indica sempre que são estimativas e recomenda validação com contabilista.`;

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

    const body = await req.json() as { messages: Message[]; watchlist?: WatchEntry[] };
    const messages = (body.messages ?? []).slice(-14).map(m => ({
      role: m.role,
      content: String(m.content ?? "").slice(0, 4000),
    }));
    const watchlist: WatchEntry[] = (body.watchlist ?? []).slice(0, 10);

    if (!messages.length) return NextResponse.json({ error: "Sem mensagens." }, { status: 400 });

    // Fetch portfolio snapshot + prices + watchlist movements in parallel
    const supabaseAdmin = getSupabaseAdmin();
    const [snapshotResult, priceResult, movements] = await Promise.allSettled([
      supabaseAdmin.from("portfolio_snapshots").select("data").eq("user_id", user.id)
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
      fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,cardano&vs_currencies=eur",
        { signal: AbortSignal.timeout(5000) }),
      fetchWatchlistMovements(watchlist),
    ]);

    const snapshotRow = snapshotResult.status === "fulfilled" ? snapshotResult.value.data : null;

    let prices: Record<string, number> = {};
    if (priceResult.status === "fulfilled" && priceResult.value.ok) {
      const raw = await priceResult.value.json() as Record<string, { eur: number }>;
      prices = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v.eur ?? 0]));
    }

    const movementsList = movements.status === "fulfilled" ? movements.value : [];

    const portfolioCtx = buildPortfolioContext(snapshotRow?.data as SnapshotData ?? null, sub, prices);
    const watchlistCtx = buildWatchlistContext(watchlist, movementsList);
    const systemPrompt = `${GESTOR_SYSTEM}\n\n${portfolioCtx}${watchlistCtx}`;

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
