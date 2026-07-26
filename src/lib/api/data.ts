import { createHash } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Leituras dos dados do utilizador, partilhadas pela API REST e pelo MCP.

// Segurança máxima: o endereço real NUNCA sai na API. Devolvemos um pseudónimo
// estável derivado por hash (não reversível) — não revela nenhum caractere do
// endereço, mas é sempre o mesmo para a mesma carteira, para o bot as distinguir.
function maskAddress(value: string): string {
  return `wallet_${createHash("sha256").update(value).digest("hex").slice(0, 10)}`;
}

// Percorre a estrutura (qualquer forma) e mascara todos os campos "address".
function maskAddressesDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(maskAddressesDeep);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = key === "address" && typeof val === "string" ? maskAddress(val) : maskAddressesDeep(val);
    }
    return out;
  }
  return value;
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
    portfolio: latest?.data != null ? maskAddressesDeep(latest.data) : null,
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
    wallets: data?.data != null ? maskAddressesDeep(data.data) : null,
  };
}
