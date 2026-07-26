import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Leituras dos dados do utilizador, partilhadas pela API REST e pelo MCP.

// Por segurança/privacidade, os endereços de carteira nunca saem inteiros na
// API — devolvemos só uma forma truncada (ex.: "0x1a2b3c…7f8e"), suficiente
// para distinguir carteiras sem expor o endereço completo.
function maskAddress(value: string): string {
  if (value.length <= 12) return "…";
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
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
