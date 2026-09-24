import { NextResponse } from "next/server";
import { alchemyNftUrl } from "@/lib/providers/alchemy";
import { rateLimitPublic } from "@/lib/api/requireUser";
import { cgFetch } from "@/lib/market/coingecko";

// Estado das fontes de que o site depende, para a pagina publica /estado.
//
// Cada verificacao e um pedido leve (um "ping") com 6 s de limite, feito no
// servidor — nunca expoe chaves. A resposta fica em cache 5 min: chega para
// quem quer saber "e comigo ou e o site?" e nao gasta quota das APIs.
// Nao substitui a monitorizacao (verificacao noturna + bot); complementa-a.

export const revalidate = 300;

type Estado = "ok" | "degradado" | "falha" | "nao_configurado";
type Servico = { id: string; nome: string; funcao: string; estado: Estado; ms: number | null; codigo?: number };

const TIMEOUT_MS = 6_000;

async function ping(fn: () => Promise<Response>): Promise<{ estado: Estado; ms: number; codigo?: number }> {
  const t0 = Date.now();
  try {
    const res = await fn();
    const ms = Date.now() - t0;
    if (res.ok) return { estado: ms > 3_000 ? "degradado" : "ok", ms, codigo: res.status };
    // 429 = a fonte esta viva mas a limitar; para quem le, "degradado" e mais honesto que "falha".
    return { estado: res.status === 429 ? "degradado" : "falha", ms, codigo: res.status };
  } catch {
    return { estado: "falha", ms: Date.now() - t0 };
  }
}

const get = (url: string, init: RequestInit = {}) =>
  fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });

export async function GET(req: Request) {
  const limitado = rateLimitPublic(req, "status", 30);
  if (limitado) return limitado;

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  const alchemyKey = (process.env.ALCHEMY_API_KEY ?? "").trim();
  const twelveKey = (process.env.TWELVEDATA_API_KEY ?? process.env.TWELVE_DATA_API_KEY ?? "").trim();
  const telegramToken = (process.env.TELEGRAM_BOT_TOKEN ?? "").trim();

  const checks: Array<{ id: string; nome: string; funcao: string; run: (() => Promise<Response>) | null }> = [
    // O /auth/v1/health responde 401 sem a chave publica (anon) no cabecalho.
    { id: "supabase", nome: "Supabase", funcao: "contas e dados",
      run: supabaseUrl ? () => get(`${supabaseUrl}/auth/v1/health`, { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "" } }) : null },
    { id: "okx", nome: "OKX", funcao: "cotações cripto e velas",
      run: () => get("https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT") },
    { id: "coingecko", nome: "CoinGecko", funcao: "mercado e sentimento",
      run: () => cgFetch("https://api.coingecko.com/api/v3/ping", { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" }) },
    { id: "mempool", nome: "mempool.space", funcao: "blocos e saldos Bitcoin",
      run: () => get("https://mempool.space/api/blocks/tip/height") },
    { id: "alchemy", nome: "Alchemy", funcao: "tokens e NFTs (9 redes EVM)",
      run: alchemyKey ? () => get(`https://eth-mainnet.g.alchemy.com/v2/${alchemyKey}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
      }) : null },
    // A API de NFTs e outro servico da Alchemy (nft/v3), com quota e permissoes
    // proprias: o eth_blockNumber acima pode estar OK e esta em baixo.
    { id: "alchemy_nft", nome: "Alchemy NFT", funcao: "NFTs e posicoes Uniswap V4 (API v3)",
      // O mesmo URL que a app usa (filtros incluidos): se este falhar, falha para todos.
      run: alchemyKey ? () => get(alchemyNftUrl("0xC36442b4a4522E871399CD717aBDD847Ab11FE88", "eth", 1)) : null },
    { id: "frankfurter", nome: "Frankfurter (BCE)", funcao: "câmbios históricos",
      run: () => get("https://api.frankfurter.dev/v1/latest?symbols=USD") },
    { id: "twelvedata", nome: "Twelve Data", funcao: "ações, ETFs e índices",
      run: twelveKey ? () => get(`https://api.twelvedata.com/api_usage?apikey=${twelveKey}`) : null },
    { id: "telegram", nome: "Telegram", funcao: "alertas e bot",
      run: telegramToken ? () => get(`https://api.telegram.org/bot${telegramToken}/getMe`) : null },
  ];

  const servicos: Servico[] = await Promise.all(checks.map(async (c) => {
    if (!c.run) return { id: c.id, nome: c.nome, funcao: c.funcao, estado: "nao_configurado" as Estado, ms: null };
    const r = await ping(c.run);
    return { id: c.id, nome: c.nome, funcao: c.funcao, estado: r.estado, ms: r.ms, ...(r.codigo && r.estado !== "ok" ? { codigo: r.codigo } : {}) };
  }));

  const geral: Estado = servicos.some((s) => s.estado === "falha") ? "falha"
    : servicos.some((s) => s.estado === "degradado") ? "degradado" : "ok";

  return NextResponse.json(
    { verificadoEm: new Date().toISOString(), geral, servicos },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
  );
}
