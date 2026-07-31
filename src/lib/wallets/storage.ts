import { accKey, allAccountIds, isAllAccountsActive, readNamespaced } from "@/lib/portfolios/accounts";

export type StoredWalletEntry = {
  address?: string;
  balance?: string;
  network?: string;
  label?: string;
  /** Origem da adição. "cold" = adicionado via card Ledger/Trezor. */
  source?: "cold" | "manual";
};

export type WalletSnapshot = {
  eth?: StoredWalletEntry[];
  sol?: StoredWalletEntry[];
  btc?: StoredWalletEntry[];
  ada?: StoredWalletEntry[];
  other?: StoredWalletEntry[];
  cexUsd?: number;
  defiUsd?: number;
  /** Total dos ativos registados manualmente (já em EUR). */
  manualEur?: number;
};

const walletsKey = () => accKey("portfolio-wallets");

const normalizeEntry = (value: unknown): StoredWalletEntry[] | undefined => {
  if (!value) return undefined;
  if (Array.isArray(value)) return value as StoredWalletEntry[];
  if (typeof value === "object") return [value as StoredWalletEntry];
  return undefined;
};

const normalizeSnapshot = (value: unknown): WalletSnapshot => {
  const raw = (value ?? {}) as Record<string, unknown>;
  return {
    eth: normalizeEntry(raw.eth),
    sol: normalizeEntry(raw.sol),
    btc: normalizeEntry(raw.btc),
    ada: normalizeEntry(raw.ada),
    other: normalizeEntry(raw.other),
    cexUsd: typeof raw.cexUsd === "number" ? raw.cexUsd : undefined,
    defiUsd: typeof raw.defiUsd === "number" ? raw.defiUsd : undefined,
    manualEur: typeof raw.manualEur === "number" ? raw.manualEur : undefined,
  };
};

export const loadWalletSnapshot = (): WalletSnapshot => {
  if (typeof window === "undefined") return {};
  try {
    // Vista combinada "Todas": junta as carteiras de todas as contas.
    if (isAllAccountsActive()) {
      const merged: WalletSnapshot = {};
      for (const id of allAccountIds()) {
        const raw = readNamespaced(id, "portfolio-wallets");
        if (!raw) continue;
        const snap = normalizeSnapshot(JSON.parse(raw));
        (["eth", "sol", "btc", "ada", "other"] as const).forEach((k) => {
          const arr = snap[k];
          if (arr?.length) merged[k] = [...(merged[k] ?? []), ...arr];
        });
        if (typeof snap.cexUsd === "number") merged.cexUsd = (merged.cexUsd ?? 0) + snap.cexUsd;
        if (typeof snap.defiUsd === "number") merged.defiUsd = (merged.defiUsd ?? 0) + snap.defiUsd;
        if (typeof snap.manualEur === "number") merged.manualEur = (merged.manualEur ?? 0) + snap.manualEur;
      }
      return merged;
    }
    const raw = window.localStorage.getItem(walletsKey());
    return raw ? normalizeSnapshot(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
};

export const saveWalletSnapshot = (next: WalletSnapshot) => {
  if (typeof window === "undefined") return;
  if (isAllAccountsActive()) return; // vista combinada é só leitura
  try {
    window.localStorage.setItem(walletsKey(), JSON.stringify(normalizeSnapshot(next)));
  } catch {
    // ignore storage errors
  }
};

export const updateWalletSnapshot = (patch: WalletSnapshot) => {
  const current = loadWalletSnapshot();
  const next: WalletSnapshot = { ...current };
  (["eth", "sol", "btc", "ada", "other"] as const).forEach((key) => {
    const value = normalizeEntry(patch[key]);
    if (value !== undefined) {
      next[key] = value;
    }
  });
  if (typeof patch.cexUsd === "number") next.cexUsd = patch.cexUsd;
  if (typeof patch.defiUsd === "number") next.defiUsd = patch.defiUsd;
  if (typeof patch.manualEur === "number") next.manualEur = patch.manualEur;
  saveWalletSnapshot(next);
};
