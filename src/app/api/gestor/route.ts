import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { generateAiChat, friendlyAiError, errorStatus, type ChatMessage } from "@/lib/ai/groq";
import { scanWatchlist, type WatchEntry, type Movement } from "@/lib/api/whales";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const premiumPriceId = process.env.STRIPE_PREMIUM_PRICE_ID ?? process.env.NEXT_PUBLIC_STRIPE_PREMIUM_PRICE_ID ?? "";

type Message = { role: "user" | "assistant"; content: string };

// ── LLM (Groq → OpenAI → xAI, com fallback e erros tipados) ──────────────────
// Premium: teto de tokens mais alto para relatórios/análises completas sem corte.
const callLLM = (messages: ChatMessage[]) =>
  generateAiChat(messages, { maxTokens: 2048, temperature: 0.65 });

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

// Deteção de movimentos on-chain (ETH via Moralis, BTC via mempool, SOL via RPC)
// é agora a partilhada de @/lib/api/whales (scanWatchlist) — inclui SOL e a
// validação/valorização em USD, sem cópias divergentes aqui.

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

// Mensagem de "conta vazia" — consciente da conta ativa e de outras contas.
// Se o utilizador tiver mais do que uma conta, sugere trocar de conta (os ativos
// podem estar noutro portfólio); caso contrário, sugere adicionar carteiras.
function buildEmptyAccountContext(accountName: string, accountCount: number): string {
  const acct = accountName || "ativa";
  const suggestion = accountCount > 1
    ? `Como o utilizador tem VÁRIAS contas/portfólios, sugere DUAS opções de forma clara: (1) se os ativos estão noutra conta, trocar de conta no seletor de contas no topo da página; (2) ou adicionar carteiras nesta conta em /wallets.`
    : `Sugere que vá a /wallets para adicionar as suas carteiras cripto (BTC, ETH, SOL, etc.).`;
  return `=== ESTADO DO PORTFOLIO ===
A conta/portfólio ATIVA ("${acct}") não tem carteiras nem ativos registados.
INSTRUÇÃO: Informa o utilizador de forma simpática e breve que a conta ATIVA (${acct}) ainda não tem carteiras. ${suggestion} Depois poderás analisar o portfolio real. Entretanto, responde a perguntas gerais sobre cripto, fiscalidade portuguesa e estratégias financeiras com base no que o utilizador te fornecer na conversa. NÃO digas genericamente que "não tens acesso ao portfolio" — refere sempre a conta ativa pelo nome.`;
}

function buildPortfolioContext(snapshot: SnapshotData | null, subscription: { price_id: string | null; current_period_end: string | null } | null, prices: Record<string, number>, accountName: string, accountCount: number): string {
  const hasData = snapshot && (
    (snapshot.btc?.length ?? 0) + (snapshot.eth?.length ?? 0) +
    (snapshot.sol?.length ?? 0) + (snapshot.ada?.length ?? 0) +
    (snapshot.other?.length ?? 0) + (snapshot.cexUsd ?? 0) + (snapshot.defiUsd ?? 0)
  ) > 0;

  if (!hasData) {
    return buildEmptyAccountContext(accountName, accountCount);
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

function getGestorSystem(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.toLocaleString("pt-PT", { month: "long" });
  const cryptoTaxCutoff = year - 1; // ativos adquiridos antes do ano anterior ficam isentos em PT
  return `És o Block, o Gestor Dedicado IA (premium) do ChainFolioAI — um assistente financeiro especializado em cripto e gestão de portfolio. Se te perguntarem o teu nome, chamas-te Block.

DATA ATUAL: ${month} de ${year}. Usa sempre o ano corrente nas respostas fiscais e de planeamento.

PERSONALIDADE: Profissional mas acessível. Conciso e direto. Respostas curtas e úteis — sem introduções longas.
IDIOMA (regra crítica): Responde SEMPRE no mesmo idioma em que o utilizador escreveu a última mensagem (inglês→inglês, espanhol→espanhol, francês→francês, português→PT-PT). Deteta o idioma da mensagem; não assumas português por defeito.

CAPACIDADES:
- Análise de risco e alocação do portfolio com dados reais das carteiras
- Análise de movimentos on-chain em tempo real (watchlist de baleias)
- Estimativas fiscais IRS Portugal ${year} — isenção >365 dias para ativos adquiridos antes de ${cryptoTaxCutoff}, taxa 28% para os restantes
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
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let lang = "pt";
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

    const body = await req.json() as { messages: Message[]; watchlist?: WatchEntry[]; lang?: string; portfolio?: string; nickname?: string; accountName?: string; accountCount?: number; accountEmpty?: boolean };
    lang = body.lang ?? "pt";
    const clientPortfolio = typeof body.portfolio === "string" ? body.portfolio.slice(0, 3000) : "";
    const nickname = typeof body.nickname === "string" ? body.nickname.trim().slice(0, 40) : "";
    const accountName = typeof body.accountName === "string" ? body.accountName.trim().slice(0, 60) : "";
    const accountCount = typeof body.accountCount === "number" && body.accountCount > 0 ? Math.min(body.accountCount, 20) : 1;
    // O cliente sinaliza quando a conta ATIVA está mesmo vazia — nesse caso não
    // caímos no snapshot global da Supabase (que é por-utilizador, não por-conta,
    // e poderia mostrar dados de OUTRA conta).
    const accountEmpty = body.accountEmpty === true;
    const LANG_NAME: Record<string, string> = { pt: "português europeu (PT-PT)", en: "English", es: "español", fr: "français" };
    const langDirective = `\n\nIDIOMA (REGRA ABSOLUTA, ignora o idioma do contexto/portfolio acima): Responde SEMPRE e EXCLUSIVAMENTE em ${LANG_NAME[lang] ?? "português europeu (PT-PT)"}. Toda a tua resposta — títulos, listas e texto — tem de estar nesse idioma, independentemente do idioma em que o contexto do portfolio ou a watchlist estejam escritos.`;
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
      scanWatchlist(watchlist),
    ]);

    const snapshotRow = snapshotResult.status === "fulfilled" ? snapshotResult.value.data : null;

    let prices: Record<string, number> = {};
    if (priceResult.status === "fulfilled" && priceResult.value.ok) {
      const raw = await priceResult.value.json() as Record<string, { eur: number }>;
      prices = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v.eur ?? 0]));
    }

    const movementsList = movements.status === "fulfilled" ? movements.value.movements : [];

    // Preferir o resumo enviado pelo cliente (inclui ativos manuais, CEX, DeFi,
    // stablecoins e tradicional lidos do localStorage). Se o cliente disser que a
    // conta ativa está vazia, usar a mensagem account-aware (nunca o snapshot
    // global, que é por-utilizador e poderia expor outra conta). Só cair no
    // snapshot da Supabase quando não há sinal nenhum do cliente.
    const portfolioCtx = clientPortfolio
      ? `=== DADOS DO PORTFOLIO DO UTILIZADOR (tempo real, inclui ativos adicionados manualmente) ===\n${clientPortfolio}`
      : accountEmpty
        ? buildEmptyAccountContext(accountName, accountCount)
        : buildPortfolioContext(snapshotRow?.data as SnapshotData ?? null, sub, prices, accountName, accountCount);
    const watchlistCtx = buildWatchlistContext(watchlist, movementsList);
    const nameDirective = nickname
      ? `\n\nNOME DO UTILIZADOR: chama-se ${nickname}. Trata-o por esse nome de forma natural e amigável. Não inventes outro nome.`
      : "";
    const accountDirective = accountName
      ? `\n\nCONTA/PORTFÓLIO ATIVO: "${accountName}". Os dados de portfolio acima referem-se a esta conta. Se for "Todas as contas", é a soma de todos os portfólios do utilizador. Menciona a conta ativa quando ajudar a dar contexto.`
      : "";
    const systemPrompt = `${getGestorSystem()}\n\n${portfolioCtx}${watchlistCtx}${nameDirective}${accountDirective}${langDirective}`;

    const reply = await callLLM([
      { role: "system", content: systemPrompt },
      ...messages,
    ]);

    return NextResponse.json({ reply });
  } catch (err) {
    console.error("[gestor]", err);
    const status = errorStatus(err);
    if (status !== undefined) {
      // Falha de provider de IA (ex.: Groq rate-limited) → mensagem amigável.
      return NextResponse.json(
        { error: friendlyAiError(status, lang) },
        { status: status === 429 ? 429 : 502 },
      );
    }
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
