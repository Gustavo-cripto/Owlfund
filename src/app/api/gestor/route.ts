import { NextRequest, NextResponse } from "next/server";
import { PLATFORM_KNOWLEDGE } from "@/lib/ai/plataforma";
import { maskAddress } from "@/lib/api/data";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getPlan } from "@/lib/api/entitlement";
import { GESTOR_DAILY_LIMIT } from "@/lib/plans";
import { AiError, generateAiChat, generateAiChatStream, friendlyAiError, errorStatus, groqTokenLimit, hasGemini, type ChatMessage } from "@/lib/ai/groq";
import { scanWatchlist, type WatchEntry, type Movement } from "@/lib/api/whales";
import { cgFetch } from "@/lib/market/coingecko";
import { precoOkx } from "@/lib/market/okxSpot";
import { contextoBlockServidor } from "@/lib/ai/contextoBlock";
import { cortarHistorico, estimarTokens, partirSeccoes, selecionarSeccoes, temasDaPergunta } from "@/lib/ai/orcamentoBlock";
import { extrairEtiquetas } from "@/lib/ai/etiquetasBlock";
import { criarFerramentasBlock } from "@/lib/ai/ferramentasBlock";
import { promptSistemaBlock } from "@/lib/ai/promptBlock";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

type Message = { role: "user" | "assistant"; content: string };

// ── LLM (Groq → OpenAI → xAI, com fallback e erros tipados) ──────────────────
// Premium: teto de tokens mais alto para relatórios/análises completas sem corte.
// O Groq conta entrada + saída contra um teto de 8 000 tokens por pedido (413
// acima disso). A entrada é orçamentada em src/lib/ai/orcamentoBlock.ts contra
// o teto do fornecedor que vai responder: com GEMINI_API_KEY o Gestor pode
// receber o contexto todo (o Groq é saltado quando o pedido não lhe cabe).
const MAX_TOKENS_RESPOSTA = 1800;
// Rondas de ferramentas por mensagem (cada ronda é mais uma chamada ao modelo).
const MAX_RONDAS_FERRAMENTAS = 2;
// Orçamento de tempo de TODO o pedido (rondas de ferramentas incluídas): a
// função morre aos 60 s (maxDuration) e um stream cortado chegava ao cliente
// sem evento de fim. Guardam-se 50 s para o modelo e 10 s para o resto.
const PRAZO_TOTAL_MS = 50_000;
const TETO_COM_GEMINI = 40_000;
const tetoTokensPedido = () => (hasGemini() ? TETO_COM_GEMINI : groqTokenLimit());

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

const LOCALE_BY_LANG: Record<string, string> = { pt: "pt-PT", en: "en-GB", es: "es-ES", fr: "fr-FR" };
const API_ERR: Record<string, { auth: string; premium: string; internal: string; empty: string; daily: string; plan: string }> = {
  pt: { auth: "Não autenticado.", premium: "Requer Plano Premium.", internal: "Erro interno.", empty: "Sem mensagens.", daily: "Atingiste o limite de 150 mensagens por dia do Gestor IA. Volta amanhã.", plan: "Não foi possível verificar o teu plano agora. Tenta de novo dentro de instantes." },
  en: { auth: "Not authenticated.", premium: "Premium plan required.", internal: "Internal error.", empty: "No messages.", daily: "You reached the AI Manager limit of 150 messages per day. Come back tomorrow.", plan: "We could not verify your plan right now. Please try again in a moment." },
  es: { auth: "No autenticado.", premium: "Requiere Plan Premium.", internal: "Error interno.", empty: "Sin mensajes.", daily: "Alcanzaste el límite de 150 mensajes por día del Gestor IA. Vuelve mañana.", plan: "No se pudo verificar tu plan ahora. Inténtalo de nuevo en unos instantes." },
  fr: { auth: "Non authentifié.", premium: "Plan Premium requis.", internal: "Erreur interne.", empty: "Aucun message.", daily: "Vous avez atteint la limite de 150 messages par jour du Gestionnaire IA. Revenez demain.", plan: "Impossible de vérifier votre plan pour le moment. Réessayez dans un instant." },
};
const apiErr = (lang: string, k: keyof (typeof API_ERR)["pt"]) => (API_ERR[lang] ?? API_ERR.pt)[k];

function buildWatchlistContext(watchlist: WatchEntry[], movements: Movement[], locale = "pt-PT"): string {
  if (!watchlist.length) return "";
  const lines = ["\n=== SMART MONEY WATCHLIST ==="];
  lines.push(`Endereços monitorizados: ${watchlist.length}`);
  watchlist.slice(0, 10).forEach(e => lines.push(`  • ${e.label} (${e.chain.toUpperCase()}): ${e.address.slice(0, 10)}...`));
  if (movements.length) {
    lines.push("\nMovimentos recentes detetados:");
    movements.forEach(m => {
      const time = new Date(m.timestamp).toLocaleString(locale);
      lines.push(`  [${time}] ${m.label} (${m.chain.toUpperCase()}): ${m.description} — ${m.type}`);
    });
  } else {
    lines.push("\nSem movimentos significativos recentes na watchlist.");
  }
  return lines.join("\n");
}

// Mensagem de "conta vazia" — consciente da conta ativa e de outras contas.
// Se o utilizador tiver mais do que uma conta, sugere trocar de conta (os ativos
// podem estar noutro portefólio); caso contrário, sugere adicionar carteiras.
function buildEmptyAccountContext(accountName: string, accountCount: number): string {
  const acct = accountName || "ativa";
  const suggestion = accountCount > 1
    ? `Como o utilizador tem VÁRIAS contas/portefólios, sugere DUAS opções de forma clara: (1) se os ativos estão noutra conta, trocar de conta no seletor de contas no topo da página; (2) ou adicionar carteiras nesta conta em /wallets.`
    : `Sugere-lhe ir a /wallets para adicionar carteiras cripto (BTC, ETH, SOL, etc.) — e trata sempre o utilizador por tu.`;
  return `=== ESTADO DO PORTFOLIO ===
A conta/portefólio ATIVA ("${acct}") não tem carteiras nem ativos registados.
INSTRUÇÃO: Informa o utilizador de forma simpática e breve que a conta ATIVA (${acct}) ainda não tem carteiras. ${suggestion} Depois poderás analisar o portefólio real. Entretanto, responde a perguntas gerais sobre cripto, fiscalidade portuguesa e estratégias financeiras com base no que o utilizador te fornecer na conversa. NÃO digas genericamente que "não tens acesso ao portefólio" — refere sempre a conta ativa pelo nome.`;
}

function buildPortfolioContext(snapshot: SnapshotData | null, subscription: { price_id: string | null; current_period_end: string | null } | null, prices: Record<string, number>, accountName: string, accountCount: number, locale = "pt-PT"): string {
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
    // NUNCA o endereco: este texto vai para a Groq/OpenAI/xAI. A regra da casa
    // e que a plataforma nao expoe enderecos — so o pseudonimo estavel, que
    // chega para o modelo distinguir carteiras uma da outra.
    entries.slice(0, 3).forEach((e, i) => { if (e.address) lines.push(`    Carteira ${i + 1}: ${maskAddress(e.address)}`); });
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
    const d = new Date(subscription.current_period_end).toLocaleDateString(locale);
    lines.push(`Plano Premium ativo até: ${d}`);
  }

  return lines.join("\n");
}

// O prompt de sistema do Block vive em src/lib/ai/promptBlock.ts (puro, avaliado em scripts/testes/avaliacao*.test.ts).


// Preços em EUR por id do CoinGecko (bitcoin, ethereum, solana, cardano), que é
// a chave que buildPortfolioContext usa. OKX primeiro (pares -EUR, lote F); o
// CoinGecko só é chamado se faltar algum. Nunca lança: {} em erro.
const GESTOR_PARES: Record<string, string> = {
  bitcoin: "BTC-EUR", ethereum: "ETH-EUR", solana: "SOL-EUR", cardano: "ADA-EUR",
};
async function precosEurGestor(): Promise<Record<string, number>> {
  const ids = Object.keys(GESTOR_PARES);
  const okx = await Promise.all(ids.map((id) => precoOkx(GESTOR_PARES[id])));
  const prices: Record<string, number> = {};
  ids.forEach((id, i) => { const v = okx[i]; if (v != null) prices[id] = v; });
  const faltam = ids.filter((id) => prices[id] == null);
  if (!faltam.length) return prices;
  try {
    const res = await cgFetch(`https://api.coingecko.com/api/v3/simple/price?ids=${faltam.join(",")}&vs_currencies=eur`,
      { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return prices;
    const raw = await res.json() as Record<string, { eur?: number }>;
    for (const id of faltam) prices[id] = raw[id]?.eur ?? 0;
  } catch { /* fica o que a OKX deu */ }
  return prices;
}

// ── Route handler ─────────────────────────────────────────────────────────────

// Chamada a fornecedor de IA: pode demorar. Sem isto a funcao usa o tempo por
// omissao da plataforma e corta a meio uma resposta que ia chegar.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let lang = "pt";
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: { get: (name) => cookieStore.get(name)?.value, set: () => {}, remove: () => {} },
    });

    const { data: userData } = await supabase.auth.getUser();
    let user = userData.user;
    // Fallback Bearer (app mobile): valida o JWT e usa cliente com o token
    // para as queries (RLS do próprio utilizador).
    let db: Pick<typeof supabase, "from"> = supabase;
    if (!user) {
      const auth = req.headers.get("authorization") ?? "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
      if (token) {
        try {
          const viaTokenClient = createClient(supabaseUrl, supabaseAnonKey, {
            auth: { persistSession: false },
            global: { headers: { Authorization: `Bearer ${token}` } },
          });
          const { data: viaToken } = await viaTokenClient.auth.getUser(token);
          user = viaToken.user ?? null;
          if (user) db = viaTokenClient;
        } catch { /* fica null */ }
      }
    }
    lang = (req.headers.get("x-lang") ?? "").slice(0, 2) || "pt";
    if (!user) return NextResponse.json({ error: apiErr(lang, "auth") }, { status: 401 });

    // Plano no servidor (linha válida mais recente, não expirada). Antes um
    // maybeSingle() sem order/limit devolvia erro a quem tinha duas subscrições
    // ativas (ex.: beta + Stripe) e o Premium legítimo levava 403.
    let isPremium = false;
    try {
      isPremium = (await getPlan(db, user.id)) === "premium";
    } catch (e) {
      console.error("[gestor] plano indisponível:", e instanceof Error ? e.message : e);
      return NextResponse.json({ error: apiErr(lang, "plan"), code: "unavailable" }, { status: 503 });
    }
    // Só para o contexto ("plano válido até…"): a linha válida mais recente.
    const { data: sub } = await db
      .from("subscriptions").select("price_id, current_period_end")
      .eq("user_id", user.id).in("status", ["active", "trialing"])
      .or(`current_period_end.is.null,current_period_end.gt.${new Date().toISOString()}`)
      .order("current_period_end", { ascending: false, nullsFirst: false })
      .limit(1).maybeSingle();
    const body = await req.json() as { messages: Message[]; watchlist?: WatchEntry[]; lang?: string; portfolio?: string; nickname?: string; accountName?: string; accountId?: string; accountCount?: number; accountEmpty?: boolean; portfolioError?: boolean; totalEur?: number; memoria?: string; taxCountry?: string; stream?: boolean; simbolos?: string[] };
    lang = typeof body.lang === "string" && body.lang in API_ERR ? body.lang : lang;
    const locale = LOCALE_BY_LANG[lang] ?? "pt-PT";
    if (!isPremium) return NextResponse.json({ error: apiErr(lang, "premium") }, { status: 403 });

    // Uso razoável: teto diário por conta (muito acima de qualquer uso legítimo;
    // trava abuso de um plano de preço fixo). Falha fechado.
    try {
      const { data: withinLimit, error: rlErr } = await getSupabaseAdmin().rpc("api_rate_check", {
        p_key_hash: `gestor:${user.id}`,
        p_limit: GESTOR_DAILY_LIMIT,
        p_window_seconds: 86400,
      });
      if (rlErr) throw new Error(rlErr.message);
      if (withinLimit === false) {
        const res = NextResponse.json({ error: apiErr(lang, "daily"), code: "daily_limit" }, { status: 429 });
        res.headers.set("Retry-After", "86400");
        return res;
      }
    } catch (e) {
      console.error("[gestor] api_rate_check indisponível (fail-closed):", e instanceof Error ? e.message : e);
      return NextResponse.json({ error: apiErr(lang, "plan"), code: "unavailable" }, { status: 503 });
    }
    // O Block recebe o resumo COMPLETO da conta (carteiras, DeFi, NFTs, trades,
    // movimentos, FIRE…), montado no browser por src/lib/ai/resumoBlock.ts.
    const clientPortfolio = typeof body.portfolio === "string" ? body.portfolio.slice(0, 20_000) : "";
    const nickname = typeof body.nickname === "string" ? body.nickname.trim().slice(0, 40) : "";
    const accountName = typeof body.accountName === "string" ? body.accountName.trim().slice(0, 60) : "";
    const accountCount = typeof body.accountCount === "number" && body.accountCount > 0 ? Math.min(body.accountCount, 20) : 1;
    // Conta ativa (id) e total ao vivo: para o histórico das fotografias ser o
    // DESTA conta e a variação usar o valor de agora, não o da última fotografia.
    const accountId = typeof body.accountId === "string" ? body.accountId.trim().slice(0, 80) : "";
    const totalEur = typeof body.totalEur === "number" && Number.isFinite(body.totalEur) && body.totalEur > 0 ? body.totalEur : null;
    // Memória do Block (perfil + notas), montada no browser; entra sempre no prompt.
    const memoria = typeof body.memoria === "string" ? body.memoria.slice(0, 3000) : "";
    const taxCountry = typeof body.taxCountry === "string" && /^[A-Z]{2}$/.test(body.taxCountry) ? body.taxCountry : undefined;
    const simbolos = Array.isArray(body.simbolos) ? body.simbolos.filter((x): x is string => typeof x === "string").slice(0, 30) : [];
    // O cliente sinaliza quando a conta ATIVA está mesmo vazia — nesse caso não
    // caímos no snapshot global da Supabase (que é por-utilizador, não por-conta,
    // e poderia mostrar dados de OUTRA conta).
    const accountEmpty = body.accountEmpty === true;
    // Falha de LEITURA no cliente (≠ conta vazia): também não cair no snapshot global.
    const portfolioError = body.portfolioError === true;
    const LANG_NAME: Record<string, string> = { pt: "português europeu (PT-PT)", en: "English", es: "español", fr: "français" };
    const langDirective = `\n\nIDIOMA (REGRA ABSOLUTA, ignora o idioma do contexto/portfolio acima): Responde SEMPRE e EXCLUSIVAMENTE em ${LANG_NAME[lang] ?? "português europeu (PT-PT)"}. Toda a tua resposta — títulos, listas e texto — tem de estar nesse idioma, independentemente do idioma em que o contexto do portfolio ou a watchlist estejam escritos.`;
    // Papéis forçados: o cliente nunca injeta "system" nem "tool" (revisão 5 out 2026).
    const messages: Message[] = (body.messages ?? []).slice(-14).map(m => ({
      role: m.role === "assistant" ? "assistant" as const : "user" as const,
      content: String(m.content ?? "").slice(0, 4000),
    }));
    // Tema(s) da pergunta: decide que secções de dados entram no prompt.
    const ultimaPergunta = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const temas = temasDaPergunta(ultimaPergunta);
    // Com orçamento largo (Gemini) as baleias conhecidas vão sempre; a fiscalidade continua a pedido (FIFO + lista longa).
    if (tetoTokensPedido() > 10_000) temas.add("baleias");
    const watchlist: WatchEntry[] = (body.watchlist ?? []).slice(0, 10);

    if (!messages.length) return NextResponse.json({ error: apiErr(lang, "empty") }, { status: 400 });

    // Snapshot + preços só são precisos quando o cliente não enviou resumo nem
    // sinalizou conta vazia/erro (poupa 2 pedidos por mensagem no caso normal).
    const needSnapshot = !clientPortfolio && !accountEmpty && !portfolioError;
    const supabaseAdmin = getSupabaseAdmin();
    const [snapshotResult, priceResult, movements, historico] = await Promise.allSettled([
      needSnapshot
        ? supabaseAdmin.from("portfolio_snapshots").select("data").eq("user_id", user.id)
            .order("created_at", { ascending: false }).limit(1).maybeSingle()
        : Promise.resolve({ data: null }),
      needSnapshot ? precosEurGestor() : Promise.resolve({} as Record<string, number>),
      scanWatchlist(watchlist),
      // Histórico das fotografias, pontuação, fiscalidade e baleias conhecidas:
      // é o que faltava ao Block para responder "quanto subiu o portefólio"
      // sem pedir números ao utilizador.
      contextoBlockServidor({ userId: user.id, accountId, totalAtual: totalEur, locale, lang, temas, paisFiscal: taxCountry, simbolos }),
    ]);
    const historicoCtx = historico.status === "fulfilled" && historico.value ? `\n\n${historico.value}` : "";

    const snapshotRow = snapshotResult.status === "fulfilled" ? snapshotResult.value.data : null;

    const prices: Record<string, number> = priceResult.status === "fulfilled" ? priceResult.value : {};

    const movementsList = movements.status === "fulfilled" ? movements.value.movements : [];

    // Preferir o resumo enviado pelo cliente (inclui ativos manuais, CEX, DeFi,
    // stablecoins e tradicional lidos do localStorage). Se o cliente disser que a
    // conta ativa está vazia, usar a mensagem account-aware (nunca o snapshot
    // global, que é por-utilizador e poderia expor outra conta). Só cair no
    // snapshot da Supabase quando não há sinal nenhum do cliente.
    const portfolioCtx = clientPortfolio
      ? clientPortfolio
      : accountEmpty
        ? buildEmptyAccountContext(accountName, accountCount)
        : portfolioError
          ? `=== ESTADO DO PORTFOLIO ===\nNão foi possível ler o portefólio da conta ativa neste momento (erro temporário de leitura). Diz isso ao utilizador com naturalidade, sugere tentar de novo daqui a pouco, e responde na mesma ao que ele perguntar com base no que te disser.`
          : buildPortfolioContext(snapshotRow?.data as SnapshotData ?? null, sub, prices, accountName, accountCount, locale);
    const watchlistCtx = buildWatchlistContext(watchlist, movementsList, locale);
    const nameDirective = nickname
      ? `\n\nNOME DO UTILIZADOR: chama-se ${nickname}. Trata-o por esse nome de forma natural e amigável. Não inventes outro nome.`
      : "";
    const accountDirective = accountName
      ? `\n\nCONTA/PORTFÓLIO ATIVO: "${accountName}". Os dados de portfolio acima referem-se a esta conta. Se for "Todas as contas", é a soma de todos os portefólios do utilizador. Menciona a conta ativa quando ajudar a dar contexto.`
      : "";
    // ── Orçamento do pedido (ver orcamentoBlock.ts) ──
    // Base fixa (regras + diretivas) → conversa (até ~1/3 do que sobra) →
    // secções de dados escolhidas pela pergunta → conhecimento da plataforma
    // só quando a pergunta é sobre o site.
    // Com orçamento largo (Gemini) o conhecimento do site vai sempre; no Groq só quando a pergunta é sobre o site.
    const seccoes = partirSeccoes(`${memoria ? `${memoria}\n\n` : ""}${portfolioCtx}${historicoCtx}`);
    const montarPedido = (teto: number): { mensagens: ChatMessage[]; tokens: number } => {
      const largo = teto > 10_000;
      const plataforma = temas.has("plataforma") || largo ? PLATFORM_KNOWLEDGE.slice(0, 6000) : "";
      const base = promptSistemaBlock(locale, plataforma);
      const fixo = `${base}\n\n${watchlistCtx}${nameDirective}${accountDirective}${langDirective}`;
      const orcamentoChars = (teto - MAX_TOKENS_RESPOSTA - 400) * 2.6;
      const sobra = Math.max(2000, orcamentoChars - fixo.length);
      const conversa = cortarHistorico(messages, Math.min(largo ? 14_000 : 5000, Math.floor(sobra / 3)), largo ? 3000 : 1500);
      const usadoConversa = conversa.reduce((n, m) => n + m.content.length, 0);
      const paraDados = Math.max(1500, sobra - usadoConversa);
      const dados = seccoes.length
        ? selecionarSeccoes(seccoes, ultimaPergunta, paraDados, largo ? { maxTema: 9000, maxNucleo: 4000, maxResto: 2500, incluirResto: true } : undefined)
        : portfolioCtx;
      const systemPrompt = `${base}\n\n${dados}${watchlistCtx}${nameDirective}${accountDirective}${langDirective}`;
      const mensagens: ChatMessage[] = [{ role: "system", content: systemPrompt }, ...conversa];
      const tokens = mensagens.reduce((n, m) => n + estimarTokens(m.content), 0);
      if (tokens + MAX_TOKENS_RESPOSTA > teto) console.warn(`[gestor] pedido estimado em ${tokens} tokens de entrada (teto ${teto})`);
      return { mensagens, tokens };
    };

    const teto = tetoTokensPedido();
    const ferramentas = criarFerramentasBlock({ seccoes, userId: user.id });

    // Gera a resposta com até MAX_RONDAS_FERRAMENTAS rondas de ferramentas:
    // se o modelo pedir uma ferramenta em vez de texto, executa-se e volta-se
    // a chamar com o resultado. `onDelta` recebe o texto à medida que chega.
    const prazo = Date.now() + PRAZO_TOTAL_MS;
    const gerar = async (pedido: { mensagens: ChatMessage[]; tokens: number }, onDelta: (t: string) => void): Promise<string> => {
      let msgs: ChatMessage[] = pedido.mensagens;
      let tokens = pedido.tokens;
      let enviouAlgo = false;
      let total = ""; // texto de TODAS as rondas (o modelo pode escrever, pedir uma ferramenta e continuar)
      const entregar = (t: string) => { enviouAlgo = true; onDelta(t); };
      for (let ronda = 0; ; ronda++) {
        if (prazo - Date.now() < 8_000) throw new AiError(504, "sem tempo para mais uma ronda");
        const usarTools = ronda < MAX_RONDAS_FERRAMENTAS && ferramentas.defs.length > 0;
        const { eventos } = await generateAiChatStream(msgs, { maxTokens: MAX_TOKENS_RESPOSTA, temperature: 0.65, tokensEntrada: tokens, tools: usarTools ? ferramentas.defs : undefined, prazo });
        const reader = eventos.getReader();
        let texto = "";
        let motivo = "";
        const calls = new Map<number, { id: string; name: string; args: string }>();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value.tipo === "texto") { texto += value.texto; entregar(value.texto); continue; }
          if (value.tipo === "fim") { motivo = value.motivo; continue; }
          const c = calls.get(value.index) ?? { id: "", name: "", args: "" };
          if (value.id) c.id = value.id;
          if (value.name) c.name += value.name;
          if (value.args) c.args += value.args;
          calls.set(value.index, c);
        }
        total += texto;
        // Pedidos de ferramenta contam MESMO quando já veio texto: o modelo
        // escreve "Aqui tens a variação…", pede a secção e só depois continua.
        // Devolver só o texto deixava a resposta cortada a meio (visto a 5 out).
        const pedidos = usarTools ? [...calls.values()].filter((c) => c.name).slice(0, 3).map((c, k) => ({ ...c, id: c.id || `call_${ronda}_${k}` })) : [];
        if (!pedidos.length) {
          // Stream fechado sem "stop" (cortado pelo fornecedor ou pelo limite): o
          // ecrã ficava com meia frase ("24 horas −€ 47,"). Pede-se a resposta
          // inteira sem stream; o evento "done" substitui o texto parcial.
          if (total.trim() && motivo !== "stop" && prazo - Date.now() > 12_000) {
            console.warn(`[gestor] stream incompleto (finish_reason=${motivo || "nenhum"}, ${total.length} car.) — a pedir a resposta completa sem stream`);
            try {
              const completo = await generateAiChat(msgs, { maxTokens: MAX_TOKENS_RESPOSTA, temperature: 0.65, tokensEntrada: tokens });
              if (completo.trim().length > texto.trim().length) return total.slice(0, total.length - texto.length) + completo;
            } catch (e) { console.warn("[gestor] repetição sem stream falhou:", errorStatus(e) ?? (e instanceof Error ? e.message : e)); }
          }
          if (total.trim()) return total;
          // O fornecedor aceitou o pedido mas o stream veio vazio (ex.: o
          // raciocínio do Gemini gastou a saída). Sem nada enviado ainda, a
          // versão sem stream passa ao candidato seguinte — como no caminho JSON.
          if (enviouAlgo || prazo - Date.now() < 8_000) return total;
          console.warn("[gestor] stream vazio — a repetir sem stream pela cadeia de fornecedores");
          const completo = await generateAiChat(msgs, { maxTokens: MAX_TOKENS_RESPOSTA, temperature: 0.65, tokensEntrada: tokens });
          entregar(completo);
          return completo;
        }
        console.log(`[gestor] ferramentas (ronda ${ronda + 1}): ${pedidos.map((c) => c.name).join(", ")}${texto.trim() ? " (com texto antes)" : ""}`);
        const resultados: ChatMessage[] = await Promise.all(pedidos.map(async (c) => ({ role: "tool" as const, tool_call_id: c.id, content: await ferramentas.executar(c.name, c.args) })));
        const assistant: ChatMessage = { role: "assistant", content: texto, tool_calls: pedidos.map((c) => ({ id: c.id, type: "function" as const, function: { name: c.name, arguments: c.args || "{}" } })) };
        msgs = [...msgs, assistant, ...resultados];
        // A continuação começa em parágrafo novo, para não colar ao que já saiu.
        if (texto.trim() && !/\n$/.test(texto)) { total += "\n\n"; entregar("\n\n"); }
        tokens += estimarTokens(resultados.map((r) => r.content).join("")) + 200;
      }
    };

    // O pedido largo só o Gemini aceita; se o Gemini falhar (503 "high demand"
    // do escalão gratuito, quota…), refaz-se o pedido no tamanho do Groq em
    // vez de devolver erro ao utilizador — só enquanto nada tiver saído.
    const comReserva = async (onDelta: (t: string) => void, jaEnviou: () => boolean): Promise<string> => {
      try {
        return await gerar(montarPedido(teto), onDelta);
      } catch (e) {
        if (jaEnviou() || teto <= groqTokenLimit() || !(process.env.GROQ_API_KEY ?? "").trim()) throw e;
        console.warn(`[gestor] pedido largo falhou (${errorStatus(e) ?? "?"}); a repetir no tamanho do Groq`);
        return await gerar(montarPedido(groqTokenLimit()), onDelta);
      }
    };

    // Sem streaming (app móvel e clientes antigos): JSON como sempre.
    if (body.stream !== true) {
      const reply = await comReserva(() => {}, () => false);
      if (!reply.trim()) throw new AiError(502, "resposta vazia");
      const { texto, lembrar, sugestoes } = extrairEtiquetas(reply);
      return NextResponse.json({ reply: texto, lembrar, sugestoes });
    }

    // Streaming (página web): eventos SSE `data: {"delta"}` … `data: {"done", reply, lembrar, sugestoes}`
    // ou `data: {"error"}`. O texto final vai limpo de etiquetas no evento "done".
    const encoder = new TextEncoder();
    const langFinal = lang;
    const saida = new ReadableStream<Uint8Array>({
      async start(controller) {
        const envia = (obj: Record<string, unknown>) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        let enviou = false;
        try {
          const completo = await comReserva((t) => { enviou = true; envia({ delta: t }); }, () => enviou);
          if (!completo.trim()) {
            console.error("[gestor] stream vazio");
            envia({ error: friendlyAiError(502, langFinal) });
          } else {
            const { texto, lembrar, sugestoes } = extrairEtiquetas(completo);
            envia({ done: true, reply: texto, lembrar, sugestoes });
          }
        } catch (e) {
          console.error("[gestor] stream falhou:", e instanceof Error ? e.message : e);
          // O que já chegou fica; o cliente mostra o erro só se não tiver texto.
          envia({ error: friendlyAiError(errorStatus(e) ?? 502, langFinal) });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(saida, {
      headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" },
    });
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
    return NextResponse.json({ error: apiErr(lang, "internal") }, { status: 500 });
  }
}
