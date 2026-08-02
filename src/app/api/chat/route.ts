import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createHash } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const FREE_CHAT_LIMIT = 1;
// Teto diário por IP para visitantes não autenticados. Generoso o suficiente
// para o assistente pré-registo, baixo o suficiente para não expor o custo de IA.
const ANON_DAILY_CHAT_LIMIT = 10;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const premiumPriceId = process.env.STRIPE_PREMIUM_PRICE_ID ?? process.env.NEXT_PUBLIC_STRIPE_PREMIUM_PRICE_ID ?? "";

async function checkAndIncrementChatUsage(userId: string): Promise<{ allowed: boolean; count: number }> {
  try {
    const admin = getSupabaseAdmin();
    const month = new Date().toISOString().slice(0, 7); // "YYYY-MM"

    // Check if user has active subscription
    const { data: sub } = await admin
      .from("subscriptions")
      .select("status, current_period_end, price_id")
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();

    const isActive = sub?.status === "active" || sub?.status === "trialing";
    const notExpired = !sub?.current_period_end || new Date(sub.current_period_end).getTime() > Date.now();
    if (isActive && notExpired) return { allowed: true, count: 0 }; // Pro/Premium: unlimited

    // Free user: check monthly count
    const { data: usage } = await admin
      .from("chat_usage")
      .select("count")
      .eq("user_id", userId)
      .eq("month", month)
      .maybeSingle();

    const currentCount = usage?.count ?? 0;
    if (currentCount >= FREE_CHAT_LIMIT) return { allowed: false, count: currentCount };

    // Upsert incremented count
    await admin.from("chat_usage").upsert(
      { user_id: userId, month, count: currentCount + 1, updated_at: new Date().toISOString() },
      { onConflict: "user_id,month" }
    );
    return { allowed: true, count: currentCount + 1 };
  } catch {
    return { allowed: true, count: 0 }; // fail open — don't block on DB error
  }
}

type IncomingMessage = {
  role: "user" | "assistant";
  content: string;
  context?: string; // página ou contexto extra enviado pelo frontend
};

const PLATFORM_KNOWLEDGE = `
PLATAFORMA CHAINFOLIOAI — CONHECIMENTO COMPLETO:

O ChainFolioAI é uma plataforma de gestão de portfólio multi-chain (cripto + mercado tradicional).

PÁGINAS E FUNCIONALIDADES:
• /dashboard — Centro de controlo principal. Mostra PNL em tempo real, acesso rápido a todas as secções e chat de mercado (tu próprio).
• /portfolio — Visão consolidada de todos os ativos. Inclui: valor total em EUR, PNL da posição/dia/30d, gráficos interativos (área, barras, pizza), Score do portfólio 0-100, benchmark vs BTC/ETH/S&P500/Ouro, métricas avançadas (ROI, CAGR, Sharpe Ratio, Max Drawdown, Volatilidade), simulador de cenários, exportação PDF.
• /wallets — Conectar carteiras blockchain. Suporta: ETH + 15 redes EVM (Arbitrum, Optimism, Base, Polygon, BSC, Avalanche, Fantom, zkSync, Linea, Scroll, Mantle, Blast, Gnosis, Celo, Cronos), Solana, Bitcoin, Cardano. Carteiras: MetaMask, Rabby, Rainbow, OKX, Bybit, Coinbase, Trust + WalletConnect QR. Mostra saldos, tokens, posições DeFi e NFTs. Modo só leitura — nunca pede chaves privadas.
• /smart-money — Watchlist de baleias e traders profissionais. Pré-carregada com 50+ carteiras conhecidas (Binance, Vitalik, Jump Trading, Wintermute, etc.). Monitoriza holdings e movimentos on-chain. Alertas em tempo real (Premium).
• /gestor — Gestor Dedicado IA (exclusivo Premium). Chat privado com IA especializada no teu portfolio real. Analisa alocação, risco, fiscalidade, FIRE planning com os teus dados reais de carteiras.
• /mercado — Tabela de mercado em tempo real com preços, variações 1h/24h/7d, volume, sparklines e gráfico TradingView.
• /fiscalidade — Calculadora de mais-valias cripto por método FIFO. Suporta regras fiscais de PT (isenção >1 ano), ES, FR, DE. Exportação para declaração de IRS.
• /fire — Calculadora FIRE (Financial Independence, Retire Early). Regra dos 4%, projeção de património, CAGR ajustado à inflação.
• /account — Conta do utilizador, preferências, gestão do plano, API Keys (Premium).

PLANOS E FUNCIONALIDADES:

Plano Gratuito (€0):
- Até 3 carteiras on-chain
- 1 análise IA do portfolio/mês
- 30 dias de histórico de portfolio
- FIFO últimos 30 dias
- 3 endereços na watchlist de baleias
- Calculadora fiscal básica (PT, ES, FR, DE)
- Calculadora FIRE (3 cenários)

Plano Pro (€14,99/mês):
- Carteiras ilimitadas
- Análise IA do portfolio ilimitada
- Análise IA de notícias em tempo real
- Briefing IA diário (cripto & tradicional)
- FIFO ilimitado + exportação CSV/PDF
- 365 dias de histórico de portfolio
- Watchlist de baleias ilimitada
- Snapshots automáticos diários
- Suporte prioritário

Plano Premium (€39/mês) — inclui tudo do Pro, mais:
- /gestor — Gestor Dedicado IA com acesso ao teu portfolio real
- Smart Money em tempo real (movimentos de baleias ao vivo)
- API REST (chaves em /account > secção Premium)
- Integração MCP para agentes de IA externos
- Webhooks para alertas instantâneos
- Acesso antecipado a novas funcionalidades

COMO FUNCIONA O PNL:
- O PNL calcula-se a partir de snapshots guardados no Supabase.
- Um snapshot automático é guardado diariamente pelo cron job às 00:00 UTC.
- Métricas avançadas (ROI, CAGR, Sharpe, Drawdown) precisam de pelo menos 2 snapshots.
- Para começar a ver PNL histórico, o utilizador deve guardar o primeiro snapshot manualmente na página Portfolio.

SEGURANÇA:
- Modo só leitura em todas as carteiras — o ChainFolioAI nunca pede chaves privadas nem pode fazer transações.
- Autenticação via Supabase (email + Google).

SUPORTE:
- Problemas com MetaMask: instalar extensão no browser, clicar Conectar no card Ethereum.
- Problemas com Phantom: instalar extensão, clicar Conectar no card Solana.
- WalletConnect: precisas de NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID configurado (cloud.walletconnect.com gratuito).
- Saldo a zeros: verificar se o endereço foi adicionado corretamente; clicar "Atualizar saldo".
- Para DeFi Solana: precisas de SHYFT_API_KEY (shyft.to gratuito).
- Para DeFi ETH: precisas de MORALIS_API_KEY (moralis.io gratuito).
- Plano não atualizado após pagamento: recarregar /account (sincroniza automaticamente ao abrir); se persistir, ir a /pricing e clicar "↻ Sincronizar plano".

NAVEGAÇÃO (ajuda o utilizador a CHEGAR onde quer — indica sempre a página/secção exata):
- "Adicionar/ligar carteira" → página Carteiras (/wallets), escolhe a rede e clica Conectar (ou cola o endereço em modo só-leitura).
- "Adicionar cripto/ativo manualmente" → Carteiras (/wallets), secção de ativos manuais.
- "Ver o meu lucro/PNL, gráficos e métricas" → Portfólio (/portfolio).
- "Guardar snapshot / começar histórico" → Portfólio (/portfolio), botão de guardar snapshot.
- "Impostos / mais-valias" → Fiscalidade (/fiscalidade).
- "Independência financeira / reforma" → FIRE (/fire).
- "Preços e mercado ao vivo" → Mercado (/mercado).
- "Baleias / carteiras a seguir" → Smart Money (/smart-money).
- "Mudar de plano, API keys, preferências, apagar conta" → Conta (/account).
- "Trocar entre portfólios / criar nova conta" → seletor de contas no topo (Pro: 3, Premium: 10).
- Multi-portfólio: o utilizador pode ter várias "contas" (portfólios isolados) e uma vista "Todas as contas" que soma tudo (só leitura).

GLOSSÁRIO DE MÉTRICAS (explica em linguagem simples quando perguntarem):
- PNL: lucro/prejuízo — diferença entre o valor atual e o que foi investido.
- ROI: retorno sobre o investimento, em %.
- CAGR: taxa de crescimento anual composta (retorno médio por ano).
- Sharpe Ratio: retorno ajustado ao risco; quanto maior, melhor o retorno face à volatilidade.
- Max Drawdown: maior queda do pico ao fundo; mede o pior momento da carteira.
- Volatilidade: quão bruscas são as variações de valor.
- Score do portfólio (0-100): nota de saúde da carteira (diversificação, risco, etc.).
- Benchmark: compara o desempenho da tua carteira com BTC, ETH, S&P 500 e Ouro.
`;

const SYSTEM_PROMPT = `Tu és o Chain — analista de cripto/mercados E assistente da plataforma ChainFolioAI. Respondes de forma clara, direta e amigável.

IDIOMA (regra crítica): Responde SEMPRE no MESMO idioma em que o utilizador escreveu a última mensagem. Se ele escrever em inglês, responde em inglês; em espanhol, responde em espanhol; em francês, responde em francês; em português, responde em português (PT-PT). Deteta o idioma a partir da mensagem do utilizador, não assumas português por defeito.

${PLATFORM_KNOWLEDGE}

REGRAS:
1. Se a pergunta for sobre a plataforma (como funciona, onde está X, como adicionar carteira, etc.) — responde com base no conhecimento do ChainFolioAI acima. Quando o utilizador quer FAZER ou ENCONTRAR algo, guia-o de forma acionável: indica a página/secção exata e o passo a dar (usa a lista NAVEGAÇÃO).
2. Se a pergunta for sobre mercados (BTC, ETH, DeFi, notícias, análise técnica) ou métricas — responde como analista; para métricas usa o GLOSSÁRIO em linguagem simples.
3. Se a pergunta for mista (ex: "o meu portfolio caiu — o que aconteceu com o ETH?") — combina ambos.
4. Apresentação: quando o utilizador disser apenas olá/oi, responde EXATAMENTE com esta apresentação e NADA MAIS — não acrescentes perguntas extra nem menciones em que página ele está: "Olá! Eu sou o Chain, o teu assistente da ChainFolioAI. Posso ajudar-te com a plataforma (carteiras, portfolio, fiscalidade...) ou analisar o mercado cripto. O que precisas?"
5. Não dês recomendações diretas de compra/venda — apresenta cenários e riscos.
6. Respostas curtas e objetivas (máx. 3 parágrafos). Usa listas quando fizer sentido.
7. Se o utilizador indicar a página onde está (ex: "estou no Portfolio"), usa esse contexto para dar respostas mais relevantes — mas nunca perguntes ao utilizador em que página está.
8. O nome da plataforma é SEMPRE "ChainFolioAI". Nunca lhe chames outro nome.`;

type ProviderName = "openai" | "groq" | "ollama" | "xai";

const hasOpenAi = () => Boolean((process.env.OPENAI_API_KEY ?? "").trim());
const hasGroq = () => Boolean((process.env.GROQ_API_KEY ?? "").trim());
const hasXai = () => Boolean((process.env.XAI_API_KEY ?? "").trim());
// Para Ollama funcionar na Vercel, precisa de um host remoto; 127.0.0.1 não serve.
const hasOllama = () => Boolean((process.env.OLLAMA_BASE_URL ?? "").trim());

const parseProvider = (value: string): ProviderName | null => {
  const v = value.trim().toLowerCase();
  if (v === "ollama") return "ollama";
  if (v === "groq") return "groq";
  if (v === "xai") return "xai";
  if (v === "openai") return "openai";
  return null;
};

const getForcedProvider = (): ProviderName | null => {
  const forced = (process.env.CHAT_PROVIDER ?? "").trim().toLowerCase();
  return parseProvider(forced);
};

const pickProvider = (): ProviderName => {
  const forced = getForcedProvider();
  if (forced) return forced;

  // Auto: prefer Ollama (local), then Groq, then xAI, then OpenAI.
  if (hasOllama()) return "ollama";
  if (hasGroq()) return "groq";
  if (hasXai()) return "xai";
  if (hasOpenAi()) return "openai";
  return "openai";
};

const toChatMessages = (recentMessages: IncomingMessage[], pageContext?: string, portfolio?: string, nickname?: string, accountName?: string) => {
  let systemContent = SYSTEM_PROMPT;
  if (nickname) {
    systemContent += `\n\nNOME DO UTILIZADOR: chama-se ${nickname}. Trata-o por esse nome de forma natural e amigável (ex.: cumprimenta-o pelo nome). Não inventes outro nome.`;
  }
  if (accountName) {
    systemContent += `\n\nCONTA/PORTFÓLIO ATIVO: "${accountName}". Os dados de portfólio abaixo referem-se a esta conta. Se for "Todas as contas", é a soma de todos os portfólios (vista de leitura). Menciona a conta ativa quando ajudar a dar contexto.`;
  }
  if (portfolio) {
    systemContent += `\n\nPORTFÓLIO REAL DO UTILIZADOR (dados em tempo real — inclui carteiras on-chain, exchanges, DeFi e ativos adicionados manualmente). Usa estes valores para responder a qualquer pergunta sobre "o meu portfolio", saldo total, alocação ou PNL. NÃO peças ao utilizador para adicionar carteiras se estes dados existirem:\n${portfolio}`;
  }
  if (pageContext) {
    systemContent += `\n\nCONTEXTO ATUAL: O utilizador está na página ${pageContext}.`;
  }
  return [
    { role: "system", content: systemContent },
    // Remover campo 'context' das mensagens antes de enviar à API
    ...recentMessages.map(({ role, content }) => ({ role, content })),
  ];
};

async function callOpenAi(messages: Array<{ role: string; content: string }>) {
  const apiKey = (process.env.OPENAI_API_KEY ?? "").trim();
  if (!apiKey) {
    return {
      ok: false as const,
      status: 500,
      error: "OPENAI_API_KEY não configurada.",
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    signal: controller.signal,
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      temperature: 0.6,
      messages,
    }),
  }).finally(() => clearTimeout(timeoutId));

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const msg = payload?.error?.message as unknown;
    const message = typeof msg === "string" ? msg : "";

    if (response.status === 401) {
      return {
        ok: false as const,
        status: 401,
        error:
          "Chave OpenAI inválida. Na Vercel, confirma `OPENAI_API_KEY` (sem espaços/linhas a mais e sem aspas) e faz Redeploy.",
      };
    }

    if (/exceeded your current quota/i.test(message)) {
      return {
        ok: false as const,
        status: 402,
        error:
          "A tua conta OpenAI está sem créditos/quota. Se queres não pagar, usa `GROQ_API_KEY` (free tier) ou `OLLAMA_BASE_URL` (local).",
      };
    }

    return {
      ok: false as const,
      status: response.status,
      error: message || "Erro ao chamar OpenAI.",
    };
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const reply = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!reply) {
    return { ok: false as const, status: 502, error: "Resposta vazia da IA." };
  }
  return { ok: true as const, reply };
}

async function callGroq(messages: Array<{ role: string; content: string }>) {
  const apiKey = (process.env.GROQ_API_KEY ?? "").trim();
  if (!apiKey) {
    return {
      ok: false as const,
      status: 500,
      error: "GROQ_API_KEY não configurada.",
    };
  }

  const model = (process.env.GROQ_MODEL ?? "").trim() || "llama-3.1-8b-instant";
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  let response: Response;
  try {
    response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0.6,
        messages,
      }),
    }).finally(() => clearTimeout(timeoutId));
  } catch (err) {
    const hint =
      err instanceof DOMException && err.name === "AbortError"
        ? "Timeout a contactar Groq."
        : "Falha de rede a contactar Groq.";
    return { ok: false as const, status: 502, error: `${hint} Confirma ` + "`GROQ_API_KEY`" + " e tenta novamente." };
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const msg = payload?.error?.message as unknown;
    const message = typeof msg === "string" ? msg : "";
    if (response.status === 401) {
      return {
        ok: false as const,
        status: 401,
        error:
          "Chave Groq inválida. Confirma se a `GROQ_API_KEY` é mesmo da Groq (começa por `gsk_...`) e faz Redeploy.",
      };
    }
    return {
      ok: false as const,
      status: response.status,
      error: message || "Erro ao chamar Groq.",
    };
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const reply = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!reply) {
    return { ok: false as const, status: 502, error: "Resposta vazia da IA." };
  }
  return { ok: true as const, reply };
}

async function callXai(messages: Array<{ role: string; content: string }>) {
  const apiKey = (process.env.XAI_API_KEY ?? "").trim();
  if (!apiKey) {
    return {
      ok: false as const,
      status: 500,
      error: "XAI_API_KEY não configurada.",
    };
  }

  // xAI é compatível com o SDK/OpenAI via base_url=https://api.x.ai/v1
  const baseUrl = (process.env.XAI_BASE_URL ?? "").trim() || "https://api.x.ai/v1";
  const model =
    (process.env.XAI_MODEL ?? "").trim() || "grok-4-fast-non-reasoning";

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  let response: Response;
  try {
    response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0.6,
        messages,
      }),
    }).finally(() => clearTimeout(timeoutId));
  } catch (err) {
    const hint =
      err instanceof DOMException && err.name === "AbortError"
        ? "Timeout a contactar xAI."
        : "Falha de rede a contactar xAI.";
    return { ok: false as const, status: 502, error: `${hint} Confirma ` + "`XAI_API_KEY`" + " e tenta novamente." };
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const msg = payload?.error?.message as unknown;
    const message = typeof msg === "string" ? msg : "";
    return {
      ok: false as const,
      status: response.status,
      error: message || "Erro ao chamar xAI (Grok).",
    };
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const reply = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!reply) {
    return { ok: false as const, status: 502, error: "Resposta vazia da IA." };
  }
  return { ok: true as const, reply };
}

async function callOllama(messages: Array<{ role: string; content: string }>) {
  const baseUrl = (process.env.OLLAMA_BASE_URL ?? "").trim() || "http://127.0.0.1:11434";
  const model = (process.env.OLLAMA_MODEL ?? "").trim() || "llama3.1:8b";
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  let response: Response;
  try {
    response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    }).finally(() => clearTimeout(timeoutId));
  } catch (err) {
    const hint =
      err instanceof DOMException && err.name === "AbortError"
        ? "Timeout a contactar Ollama."
        : "Falha de rede a contactar Ollama.";
    return {
      ok: false as const,
      status: 502,
      error:
        `${hint} Para usar Ollama na Vercel, tens de apontar ` +
        "`OLLAMA_BASE_URL`" +
        " para um servidor Ollama remoto (não `127.0.0.1`).",
    };
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return {
      ok: false as const,
      status: response.status,
      error:
        "Não foi possível contactar o Ollama. Confirma que está a correr e define `OLLAMA_BASE_URL` (ex: http://127.0.0.1:11434). " +
        (text ? `Detalhes: ${text.slice(0, 200)}` : ""),
    };
  }

  const data = (await response.json()) as {
    message?: { content?: string };
  };
  const reply = data.message?.content?.trim() ?? "";
  if (!reply) {
    return { ok: false as const, status: 502, error: "Resposta vazia do Ollama." };
  }
  return { ok: true as const, reply };
}

// Rate limiting simples em memória (por IP, sem dependências externas)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30;        // max requests
const RATE_WINDOW = 60_000;   // por minuto

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

export async function POST(request: Request) {
  // Rate limiting por IP
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: "Demasiados pedidos. Tenta novamente em 1 minuto." }, { status: 429 });
  }

  // Verificar limite mensal para utilizadores Free (autenticados)
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: { get: (name) => cookieStore.get(name)?.value, set: () => {}, remove: () => {} },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { allowed, count } = await checkAndIncrementChatUsage(user.id);
      if (!allowed) {
        return NextResponse.json({
          error: `Atingiste o limite de ${FREE_CHAT_LIMIT} análise IA/mês do plano Gratuito. Faz upgrade para Pro para análises ilimitadas.`,
          limitReached: true,
          count,
        }, { status: 429 });
      }
    } else {
      // Anónimos (visitantes das páginas públicas): o chat continua disponível
      // como assistente pré-registo, mas com teto DIÁRIO por IP persistido na
      // BD. O checkRateLimit acima é um Map em memória — na Vercel é por
      // instância e efémero, logo não trava abuso distribuído do custo de IA.
      try {
        const admin = getSupabaseAdmin();
        const ipHash = createHash("sha256").update(`anon-chat:${ip}`).digest("hex").slice(0, 32);
        const { data, error } = await admin.rpc("api_rate_check", {
          p_key_hash: ipHash,
          p_limit: ANON_DAILY_CHAT_LIMIT,
          p_window_seconds: 86400,
        });
        if (!error && data === false) {
          const res = NextResponse.json({
            error: "Limite diário de mensagens atingido. Cria uma conta gratuita para continuares a usar o assistente.",
            limitReached: true,
          }, { status: 429 });
          res.headers.set("Retry-After", "86400");
          return res;
        }
      } catch { /* função ainda não migrada → não bloquear o funil */ }
    }
  } catch { /* fail open */ }

  let body: { messages?: IncomingMessage[]; pageContext?: string; portfolio?: string; nickname?: string; accountName?: string } | null = null;
  try {
    body = (await request.json()) as { messages?: IncomingMessage[]; pageContext?: string; portfolio?: string; nickname?: string; accountName?: string };
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const incoming = body?.messages ?? [];
  const pageContext = typeof body?.pageContext === "string"
    ? body.pageContext.slice(0, 200)  // limitar comprimento
    : undefined;
  const portfolio = typeof body?.portfolio === "string"
    ? body.portfolio.slice(0, 3000)  // limitar comprimento
    : undefined;
  const nickname = typeof body?.nickname === "string"
    ? body.nickname.trim().slice(0, 40)
    : undefined;
  const accountName = typeof body?.accountName === "string"
    ? body.accountName.trim().slice(0, 60)
    : undefined;

  // Limitar tamanho das mensagens para prevenir abuso
  const recentMessages = incoming.slice(-12).map(m => ({
    role: m.role,
    content: String(m.content ?? "").slice(0, 4000),
  })) as IncomingMessage[];

  try {
    const messages = toChatMessages(recentMessages, pageContext, portfolio, nickname, accountName);
    const provider = pickProvider();
    const forcedProvider = getForcedProvider();

    let result:
      | { ok: true; reply: string }
      | { ok: false; status: number; error: string };

    const isEnabled = (p: ProviderName) => {
      switch (p) {
        case "groq":
          return hasGroq();
        case "xai":
          return hasXai();
        case "ollama":
          return hasOllama();
        case "openai":
          return hasOpenAi();
        default:
          return false;
      }
    };

    const baseOrder: ProviderName[] = [provider, "groq", "xai", "openai", "ollama"];
    const order: ProviderName[] = [];
    const seen = new Set<ProviderName>();
    for (const p of baseOrder) {
      if (seen.has(p)) continue;
      seen.add(p);
      order.push(p);
    }

    const candidates = forcedProvider
      ? isEnabled(forcedProvider)
        ? [forcedProvider]
        : []
      : order.filter(isEnabled);
    if (candidates.length === 0) {
      // Não expor quais chaves estão/não estão configuradas
      console.error("[chat] Nenhum provider disponível. forcedProvider:", forcedProvider);
      return NextResponse.json(
        { error: "Serviço de IA temporariamente indisponível." },
        { status: 503 }
      );
    }

    const callProvider = async (p: ProviderName) => {
      if (p === "groq") return callGroq(messages);
      if (p === "xai") return callXai(messages);
      if (p === "ollama") return callOllama(messages);
      return callOpenAi(messages);
    };

    const attempts: Array<{ provider: ProviderName; ok: boolean; status?: number; error?: string }> = [];

    // tenta por ordem até um responder
    let usedProvider = candidates[0]!;
    result = await callProvider(usedProvider);
    attempts.push(
      result.ok
        ? { provider: usedProvider, ok: true }
        : { provider: usedProvider, ok: false, status: result.status, error: result.error }
    );
    for (let i = 1; i < candidates.length && !result.ok; i += 1) {
      usedProvider = candidates[i]!;
      result = await callProvider(usedProvider);
      attempts.push(
        result.ok
          ? { provider: usedProvider, ok: true }
          : { provider: usedProvider, ok: false, status: result.status, error: result.error }
      );
    }

    if (!result.ok) {
      // Log interno com detalhes, resposta pública sem info sensível
      console.error("[chat] Falha providers:", attempts.map(a => `${a.provider}:${a.status}`).join(", "));
      const publicError = result.status === 429
        ? "Limite de pedidos à IA excedido. Tenta novamente em breve."
        : result.status >= 500
          ? "Serviço de IA temporariamente indisponível."
          : result.error;
      return NextResponse.json({ error: publicError }, { status: result.status });
    }

    return NextResponse.json({ reply: result.reply });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return NextResponse.json({ error: "Timeout ao contactar o serviço de IA." }, { status: 504 });
    }
    console.error("[chat] Erro inesperado:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
