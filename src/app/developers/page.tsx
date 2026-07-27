import Link from "next/link";
import AppShell from "@/components/AppShell";

export const metadata = {
  title: "API & MCP — Documentação · ChainFolioAI",
  description: "Documentação da API REST e do servidor MCP do ChainFolioAI.",
};

const BASE = "https://owlfund.vercel.app";

function Code({ children }: { children: string }) {
  return (
    <pre className="mt-3 overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/80 p-4 text-xs leading-relaxed text-slate-300">
      <code>{children}</code>
    </pre>
  );
}

function Method({ children }: { children: string }) {
  return <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] font-bold text-emerald-400">{children}</span>;
}

type Endpoint = { method: string; path: string; desc: string; example: string; response: string };

const ENDPOINTS: Endpoint[] = [
  {
    method: "GET",
    path: "/api/v1",
    desc: "Índice de descoberta — lista os endpoints. Não exige chave.",
    example: `curl ${BASE}/api/v1`,
    response: `{
  "name": "ChainFolioAI API",
  "version": "v1",
  "endpoints": [ /* … */ ]
}`,
  },
  {
    method: "GET",
    path: "/api/v1/portfolio",
    desc: "Último snapshot do portefólio: saldos por rede, CEX, DeFi e ativos manuais.",
    example: `curl ${BASE}/api/v1/portfolio \\
  -H "Authorization: Bearer cfa_live_…"`,
    response: `{
  "updatedAt": "2026-07-27T00:00:00Z",
  "snapshotCount": 365,
  "portfolio": {
    "eth": [{ "address": "wallet_8815840fa2", "balance": "1.5", "network": "eth", "label": "Principal" }],
    "cexUsd": 1000,
    "manualEur": 500
  }
}`,
  },
  {
    method: "GET",
    path: "/api/v1/wallets",
    desc: "Carteiras e endereços ligados à conta.",
    example: `curl ${BASE}/api/v1/wallets \\
  -H "Authorization: Bearer cfa_live_…"`,
    response: `{
  "updatedAt": "2026-07-27T00:00:00Z",
  "wallets": {
    "eth": [{ "address": "wallet_8815840fa2", "balance": "1.5", "network": "eth", "label": "Principal" }],
    "btc": [{ "address": "wallet_86ef685f59", "balance": "0.2" }]
  }
}`,
  },
  {
    method: "GET",
    path: "/api/v1/whales",
    desc: "Movimentos on-chain recentes dos endereços dados. Parâmetro watchlist = array JSON url-encoded de { address, chain, label }. Máx. 10, chains eth/btc/sol.",
    example: `curl ${BASE}/api/v1/whales \\
  -H "Authorization: Bearer cfa_live_…" \\
  --data-urlencode 'watchlist=[{"address":"0x…","chain":"eth","label":"Baleia"}]' -G`,
    response: `{
  "movements": [{ "address": "0x…", "label": "Baleia", "chain": "eth", "type": "large_transfer", "description": "1250.00 USDC", "timestamp": 1769… }],
  "scanned": 1,
  "timestamp": 1769…
}`,
  },
  {
    method: "GET",
    path: "/api/v1/market",
    desc: "Top criptoativos por capitalização. Parâmetro limit = 1–250 (por omissão 50).",
    example: `curl "${BASE}/api/v1/market?limit=5" \\
  -H "Authorization: Bearer cfa_live_…"`,
    response: `{
  "coins": [{ "rank": 1, "symbol": "BTC", "name": "Bitcoin", "priceUsd": 64000, "marketCap": 1.29e12, "change24h": -0.2, "change7d": 1.5 }],
  "count": 5,
  "source": "coingecko"
}`,
  },
  {
    method: "GET",
    path: "/api/v1/known-whales",
    desc: "Baleias conhecidas pré-carregadas (exchanges, fundos, figuras públicas, governos). Usa os endereços como input do /whales.",
    example: `curl ${BASE}/api/v1/known-whales \\
  -H "Authorization: Bearer cfa_live_…"`,
    response: `{
  "whales": [{ "address": "0x47ac…D503", "label": "Binance Cold Wallet", "chain": "eth" }],
  "count": 50
}`,
  },
  {
    method: "GET",
    path: "/api/v1/price",
    desc: "Preço, capitalização, volume e variação (24h/7d) de um criptoativo pelo símbolo.",
    example: `curl "${BASE}/api/v1/price?symbol=btc" \\
  -H "Authorization: Bearer cfa_live_…"`,
    response: `{ "symbol": "BTC", "name": "Bitcoin", "priceUsd": 64000, "change24h": -0.2, "change7d": 1.5, "rank": 1 }`,
  },
  {
    method: "GET",
    path: "/api/v1/fear-greed",
    desc: "Índice Fear & Greed do mercado cripto — valor atual (0–100) e histórico recente.",
    example: `curl ${BASE}/api/v1/fear-greed \\
  -H "Authorization: Bearer cfa_live_…"`,
    response: `{ "now": { "value": 29, "classification": "Fear", "timestamp": 1769… }, "history": [ … ] }`,
  },
  {
    method: "GET",
    path: "/api/v1/news",
    desc: "Últimas notícias de cripto (CoinDesk, CoinTelegraph). Parâmetro limit = 1–30.",
    example: `curl "${BASE}/api/v1/news?limit=10" \\
  -H "Authorization: Bearer cfa_live_…"`,
    response: `{ "news": [{ "title": "…", "url": "https://…", "source": "CoinDesk", "publishedAt": "2026-07-27T…" }], "count": 10 }`,
  },
  {
    method: "GET",
    path: "/api/v1/btc-blocks",
    desc: "Blocos Bitcoin recentes (altura, nº de transações, taxa mediana, pool) e taxas recomendadas da mempool.",
    example: `curl ${BASE}/api/v1/btc-blocks \\
  -H "Authorization: Bearer cfa_live_…"`,
    response: `{ "blocks": [{ "height": 958892, "txCount": 4448, "medianFee": 2, "pool": "Foundry USA" }], "fees": { "fastestFee": 3 } }`,
  },
  {
    method: "GET",
    path: "/api/v1/fire",
    desc: "Anos até à independência financeira (regra dos 4%). Parâmetros: monthlyExpenses, monthlyInvestment, annualReturn, inflation, currentAge, currentPortfolio.",
    example: `curl "${BASE}/api/v1/fire?monthlyExpenses=2000&monthlyInvestment=500&annualReturn=7&inflation=3&currentAge=30" \\
  -H "Authorization: Bearer cfa_live_…"`,
    response: `{ "fireTarget": 600000, "realReturnPct": 4, "yearsToFire": 41, "retirementAge": 71, "retirementYear": 2067 }`,
  },
  {
    method: "POST",
    path: "/api/v1/chat",
    desc: "Assistente de IA que responde sobre o teu portefólio real. Não dá ordens de compra/venda. Máx. 50 mensagens/dia por conta.",
    example: `curl -X POST ${BASE}/api/v1/chat \\
  -H "Authorization: Bearer cfa_live_…" \\
  -H "Content-Type: application/json" \\
  -d '{"message":"Como está diversificado o meu portefólio?"}'`,
    response: `{ "reply": "O teu portefólio está concentrado em… (análise). Não é conselho de compra/venda." }`,
  },
];

export default function DevelopersPage() {
  return (
    <AppShell>
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <main className="mx-auto w-full max-w-3xl px-6 py-16">
          <Link href="/" className="text-sm text-orange-300/90 transition hover:text-orange-200">
            ← Voltar ao início
          </Link>

          <h1 className="mt-6 text-3xl font-bold text-white md:text-4xl">API & MCP</h1>
          <p className="mt-3 text-slate-400">
            Acede aos teus dados do ChainFolioAI por API REST ou por MCP (Claude, Cursor…). Funcionalidade do plano Premium.
          </p>

          {/* Autenticação */}
          <section className="mt-12">
            <h2 className="text-lg font-bold text-white">Autenticação</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Gera uma chave em <Link href="/account?section=api" className="text-orange-300 hover:text-orange-200">Conta → API & MCP</Link>{" "}
              (só aparece uma vez). Envia-a no cabeçalho de cada pedido:
            </p>
            <Code>{`Authorization: Bearer cfa_live_…`}</Code>
            <p className="mt-3 text-sm text-slate-400">Base: <code className="text-slate-300">{BASE}/api/v1</code></p>
          </section>

          {/* Endpoints */}
          <section className="mt-12">
            <h2 className="text-lg font-bold text-white">Endpoints REST</h2>
            <div className="mt-4 space-y-8">
              {ENDPOINTS.map((e) => (
                <div key={e.path} className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
                  <div className="flex items-center gap-2">
                    <Method>{e.method}</Method>
                    <code className="text-sm font-semibold text-white">{e.path}</code>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">{e.desc}</p>
                  <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Exemplo</p>
                  <Code>{e.example}</Code>
                  <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Resposta</p>
                  <Code>{e.response}</Code>
                </div>
              ))}
            </div>
          </section>

          {/* MCP */}
          <section className="mt-12">
            <h2 className="text-lg font-bold text-white">MCP (Claude, Cursor…)</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              O servidor MCP vive em <code className="text-slate-300">{BASE}/api/mcp</code> (Streamable HTTP), autenticado pela mesma chave.
              Liga-o como servidor MCP remoto no teu cliente, com o cabeçalho <code className="text-slate-300">Authorization: Bearer cfa_live_…</code>.
              Ganhas as ferramentas:
            </p>
            <ul className="mt-3 space-y-1 text-sm text-slate-300">
              <li>• <code className="text-slate-400">get_portfolio</code> — o teu portefólio</li>
              <li>• <code className="text-slate-400">get_wallets</code> — as tuas carteiras</li>
              <li>• <code className="text-slate-400">get_whale_activity</code> — movimentos de endereços (argumento watchlist)</li>
              <li>• <code className="text-slate-400">get_market</code> — top criptoativos (argumento limit)</li>
              <li>• <code className="text-slate-400">list_known_whales</code> — baleias conhecidas pré-carregadas</li>
              <li>• <code className="text-slate-400">get_asset</code> — preço de um ativo (argumento symbol)</li>
              <li>• <code className="text-slate-400">get_fear_greed</code> — índice Fear & Greed</li>
              <li>• <code className="text-slate-400">get_news</code> — últimas notícias (argumento limit)</li>
              <li>• <code className="text-slate-400">get_btc_blocks</code> — blocos Bitcoin + taxas</li>
              <li>• <code className="text-slate-400">get_fire</code> — anos até à independência financeira</li>
              <li>• <code className="text-slate-400">ask_ai</code> — pergunta à IA sobre o teu portefólio (máx. 50/dia)</li>
            </ul>

            <p className="mt-6 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Ligar no Claude Code / Claude Desktop</p>
            <Code>{`claude mcp add --transport http chainfolioai ${BASE}/api/mcp \\
  --header "Authorization: Bearer cfa_live_…"`}</Code>

            <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Ligar no Cursor (~/.cursor/mcp.json)</p>
            <Code>{`{
  "mcpServers": {
    "chainfolioai": {
      "url": "${BASE}/api/mcp",
      "headers": { "Authorization": "Bearer cfa_live_…" }
    }
  }
}`}</Code>
          </section>

          {/* Erros + limites */}
          <section className="mt-12">
            <h2 className="text-lg font-bold text-white">Erros e limites</h2>
            <ul className="mt-3 space-y-1.5 text-sm text-slate-300">
              <li><code className="text-rose-300">401</code> — chave em falta, inválida ou revogada</li>
              <li><code className="text-rose-300">403</code> — a conta não tem Premium ativo</li>
              <li><code className="text-rose-300">429</code> — limite de pedidos excedido (60 por minuto por chave; vê o cabeçalho <code className="text-slate-400">Retry-After</code>)</li>
              <li><code className="text-rose-300">400</code> — parâmetros inválidos (ex.: watchlist mal formada)</li>
            </ul>
          </section>

          {/* Segurança */}
          <section className="mt-12">
            <h2 className="text-lg font-bold text-white">Segurança e privacidade</h2>
            <ul className="mt-3 space-y-1.5 text-sm text-slate-400">
              <li>Os endereços de carteira nunca saem inteiros — são substituídos por um pseudónimo estável (ex.: <code className="text-slate-300">wallet_8815840fa2</code>).</li>
              <li>Todas as respostas usam <code className="text-slate-300">Cache-Control: no-store</code>.</li>
              <li>As chaves guardam-se como hash; podes revogá-las a qualquer momento na tua conta.</li>
              <li>Os endpoints <code className="text-slate-300">/portfolio</code> e <code className="text-slate-300">/wallets</code> devolvem os dados do <strong className="text-slate-300">dono da chave</strong> — um bot multi-utilizador precisa de uma chave por pessoa.</li>
            </ul>
          </section>

          <div className="mt-14 border-t border-slate-800 pt-6">
            <Link href="/account?section=api" className="text-sm font-semibold text-orange-300 hover:text-orange-200">
              Gerir as minhas chaves →
            </Link>
          </div>
        </main>
      </div>
    </AppShell>
  );
}
