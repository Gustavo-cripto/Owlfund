import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Leituras dos dados do utilizador, partilhadas pela API REST e pelo MCP.

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
    portfolio: latest?.data ?? null,
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
    wallets: data?.data ?? null,
  };
}
