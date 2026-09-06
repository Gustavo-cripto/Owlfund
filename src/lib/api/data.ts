import { createHmac } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Leituras dos dados do utilizador, partilhadas pela API REST e pelo MCP.

// Segurança máxima: o endereço real NUNCA sai na API. Devolvemos um pseudónimo
// estável derivado por hash (não reversível) — não revela nenhum caractere do
// endereço, mas é sempre o mesmo para a mesma carteira, para o bot as distinguir.
// HMAC com segredo do servidor: um sha256 puro era confirmável por dicionário
// (endereços são públicos). Continua estável para a mesma carteira.
const PSEUDONYM_KEY = process.env.API_PSEUDONYM_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "chainfolioai";
function maskAddress(value: string): string {
  return `wallet_${createHmac("sha256", PSEUDONYM_KEY).update(value.toLowerCase()).digest("hex").slice(0, 10)}`;
}

// Lista branca: a API só devolve estes campos conhecidos. Qualquer outro campo
// que venha a ser guardado no blob NÃO escapa pela API. Endereços saem sempre
// mascarados.
const WALLET_ARRAYS = ["eth", "sol", "btc", "ada", "other"] as const;
const ENTRY_FIELDS = ["address", "balance", "network", "label", "source"] as const;
const NUMBER_FIELDS = ["cexUsd", "defiUsd", "manualEur"] as const;

function whitelistWalletData(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== "object") return null;
  const src = data as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const chain of WALLET_ARRAYS) {
    const arr = src[chain];
    if (!Array.isArray(arr)) continue;
    out[chain] = arr.map((raw) => {
      const entry = (raw && typeof raw === "object") ? raw as Record<string, unknown> : {};
      const picked: Record<string, unknown> = {};
      for (const field of ENTRY_FIELDS) {
        if (!(field in entry)) continue;
        picked[field] = field === "address" && typeof entry.address === "string"
          ? maskAddress(entry.address)
          : entry[field];
      }
      return picked;
    });
  }

  for (const field of NUMBER_FIELDS) {
    if (typeof src[field] === "number") out[field] = src[field];
  }

  return out;
}

export type PortfolioResult = {
  updatedAt: string | null;
  snapshotCount: number;
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
  return {
    updatedAt: latest?.created_at ?? null,
    snapshotCount: count ?? 0,
    portfolio: latest?.data != null ? whitelistWalletData(latest.data) : null,
  };
}

export type WalletsResult = {
  updatedAt: string | null;
  wallets: unknown | null;
};

export async function getWallets(userId: string): Promise<WalletsResult> {
  const admin = getSupabaseAdmin();

  const { data } = await admin
    .from("wallet_config")
    .select("data, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  return {
    updatedAt: data?.updated_at ?? null,
    wallets: data?.data != null ? whitelistWalletData(data.data) : null,
  };
}
