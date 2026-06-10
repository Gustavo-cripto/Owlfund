export type StoredWalletEntry = {
  address?: string;
  balance?: string;
  network?: string;
  label?: string;
};

export type WalletSnapshot = {
  eth?: StoredWalletEntry[];
  sol?: StoredWalletEntry[];
  btc?: StoredWalletEntry[];
  ada?: StoredWalletEntry[];
  cexUsd?: number;
  defiUsd?: number;
};

const STORAGE_KEY = "portfolio-wallets";

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
    cexUsd: typeof raw.cexUsd === "number" ? raw.cexUsd : undefined,
    defiUsd: typeof raw.defiUsd === "number" ? raw.defiUsd : undefined,
  };
};

export const loadWalletSnapshot = (): WalletSnapshot => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeSnapshot(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
};

export const saveWalletSnapshot = (next: WalletSnapshot) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeSnapshot(next)));
  } catch {
    // ignore storage errors
  }
};

export const updateWalletSnapshot = (patch: WalletSnapshot) => {
  const current = loadWalletSnapshot();
  const next: WalletSnapshot = { ...current };
  (["eth", "sol", "btc", "ada"] as const).forEach((key) => {
    const value = normalizeEntry(patch[key]);
    if (value !== undefined) {
      next[key] = value;
    }
  });
  if (typeof patch.cexUsd === "number") next.cexUsd = patch.cexUsd;
  if (typeof patch.defiUsd === "number") next.defiUsd = patch.defiUsd;
  saveWalletSnapshot(next);
};
