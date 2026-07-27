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
  -H "Authorization: Bearer owf_live_…"`,
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
  -H "Authorization: Bearer owf_live_…"`,
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
  -H "Authorization: Bearer owf_live_…" \\
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
  -H "Authorization: Bearer owf_live_…"`,
    response: `{
  "coins": [{ "rank": 1, "symbol": "BTC", "name": "Bitcoin", "priceUsd": 64000, "marketCap": 1.29e12, "change24h": -0.2, "change7d": 1.5 }],
  "count": 5,
  "source": "coingecko"
}`,
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
            <Code>{`Authorization: Bearer owf_live_…`}</Code>
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
              Liga-o como servidor MCP remoto no teu cliente, com o cabeçalho <code className="text-slate-300">Authorization: Bearer owf_live_…</code>.
              Ganhas as ferramentas:
            </p>
            <ul className="mt-3 space-y-1 text-sm text-slate-300">
              <li>• <code className="text-slate-400">get_portfolio</code> — o teu portefólio</li>
              <li>• <code className="text-slate-400">get_wallets</code> — as tuas carteiras</li>
              <li>• <code className="text-slate-400">get_whale_activity</code> — movimentos de endereços (argumento watchlist)</li>
              <li>• <code className="text-slate-400">get_market</code> — top criptoativos (argumento limit)</li>
            </ul>
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
