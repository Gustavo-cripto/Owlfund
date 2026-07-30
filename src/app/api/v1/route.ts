import { apiJson } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Índice de descoberta da API pública (sem autenticação).
export async function GET() {
  return apiJson({
    name: "ChainFolioAI API",
    version: "v1",
    documentation: "https://chainfolioai.com/account",
    authentication:
      "Bearer token — cabeçalho 'Authorization: Bearer cfa_live_…'. Gera chaves em Conta → API & MCP (plano Premium).",
    endpoints: [
      { method: "GET", path: "/api/v1", description: "Este índice." },
      { method: "GET", path: "/api/v1/portfolio", description: "Último snapshot do portefólio: saldos por rede, CEX, DeFi e ativos manuais." },
      { method: "GET", path: "/api/v1/wallets", description: "Carteiras e endereços ligados à tua conta." },
      { method: "GET", path: "/api/v1/whales", description: "Movimentos on-chain recentes dos endereços dados (?watchlist=<JSON>). ETH e BTC." },
      { method: "GET", path: "/api/v1/market", description: "Top criptoativos por capitalização (?limit=N, 1–250). Preço, market cap, volume, variação 24h/7d." },
      { method: "GET", path: "/api/v1/known-whales", description: "Baleias conhecidas pré-carregadas (exchanges, fundos, figuras, governos)." },
      { method: "GET", path: "/api/v1/price", description: "Preço e variação de um criptoativo (?symbol=btc)." },
      { method: "GET", path: "/api/v1/fear-greed", description: "Índice Fear & Greed (atual + histórico)." },
      { method: "GET", path: "/api/v1/news", description: "Últimas notícias de cripto (?limit=N)." },
      { method: "GET", path: "/api/v1/btc-blocks", description: "Blocos Bitcoin recentes + taxas da mempool." },
      { method: "GET", path: "/api/v1/fire", description: "Anos até à independência financeira (regra dos 4%)." },
      { method: "POST", path: "/api/v1/chat", description: "Pergunta à IA sobre o teu portefólio ({ message }). Máx. 50/dia por conta." },
    ],
  });
}
