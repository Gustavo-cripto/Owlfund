import { createHmac } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { contasMascaradas, juntarContas, whitelistSnapshot } from "@/lib/api/walletBlob";

// Leituras dos dados do utilizador, partilhadas pela API REST e pelo MCP.

// Segurança máxima: o endereço real NUNCA sai na API. Devolvemos um pseudónimo
// estável derivado por hash (não reversível) — não revela nenhum caractere do
// endereço, mas é sempre o mesmo para a mesma carteira, para o bot as distinguir.
// HMAC com segredo do servidor: um sha256 puro era confirmável por dicionário
// (endereços são públicos). Continua estável para a mesma carteira.
const PSEUDONYM_KEY = process.env.API_PSEUDONYM_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "chainfolioai";
export function maskAddress(value: string): string {
  return `wallet_${createHmac("sha256", PSEUDONYM_KEY).update(value.toLowerCase()).digest("hex").slice(0, 10)}`;
}

// Lista branca (só campos conhecidos, endereços sempre mascarados) e leitura
// dos formatos do blob: src/lib/api/walletBlob.ts — o mesmo leitor para a API
// REST, o MCP e o contador da Conta.
const whitelistWalletData = (data: unknown) => whitelistSnapshot(data, maskAddress);

export type PortfolioResult = {
  updatedAt: string | null;
  snapshotCount: number;
  accountId: string | null;
  note: string;
  portfolio: unknown | null;
};

export async function getPortfolio(userId: string): Promise<PortfolioResult> {
  const admin = getSupabaseAdmin();

  const [{ data: snaps }, { count }] = await Promise.all([
    admin
      .from("portfolio_snapshots")
      .select("created_at, data")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1),
    admin
      .from("portfolio_snapshots")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
  ]);

  const latest = snaps?.[0] ?? null;
  // Uma conta pode ter varios portefolios (Free 1 · Pro 3 · Premium 10). O
  // snapshot guarda qual estava ativo quando foi tirado; dizer qual e melhor do
  // que devolver um numero sem dono.
  const conta = (latest?.data as { _account?: unknown } | null)?._account;

  return {
    updatedAt: latest?.created_at ?? null,
    snapshotCount: count ?? 0,
    accountId: typeof conta === "string" ? conta : null,
    // A API e o MCP falam ingles (como o catalogo e os erros das rotas v1).
    note: "Latest saved snapshot, of the portfolio that was active at that moment (accountId). An account can have several portfolios; this read does not add them up.",
    portfolio: latest?.data != null ? whitelistWalletData(latest.data) : null,
  };
}

export type WalletsResult = {
  updatedAt: string | null;
  /** Uma entrada por portefólio ("conta"), com as carteiras mascaradas. */
  accounts: Array<{ accountId: string; name: string | null; wallets: Record<string, unknown> }>;
  /** União de todas as contas (listas juntas, totais somados). null sem blob. */
  wallets: Record<string, unknown> | null;
  note: string;
};

export async function getWallets(userId: string): Promise<WalletsResult> {
  const admin = getSupabaseAdmin();

  const { data } = await admin
    .from("wallet_config")
    .select("data, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  // O blob e o v3 por conta que a app sincroniza (cloudSync.ts); antes lia-se
  // como se fosse o formato plano e a API devolvia sempre {}.
  const accounts = data?.data != null ? contasMascaradas(data.data, maskAddress) : [];
  return {
    updatedAt: data?.updated_at ?? null,
    accounts,
    wallets: data?.data != null ? juntarContas(accounts) : null,
    note: "wallets merges every account; accounts keeps them apart. Addresses are pseudonymised (wallet_…), never in clear text.",
  };
}
