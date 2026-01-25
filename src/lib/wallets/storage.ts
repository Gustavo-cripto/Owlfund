type StoredWallet = {
  address?: string;
  balance?: string;
};

type WalletSnapshot = {
  eth?: StoredWallet;
  sol?: StoredWallet;
  btc?: StoredWallet;
  ada?: StoredWallet;
};

const STORAGE_KEY = "portfolio-wallets";

export const loadWalletSnapshot = (): WalletSnapshot => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as WalletSnapshot) : {};
  } catch {
    return {};
  }
};

export const saveWalletSnapshot = (next: WalletSnapshot) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage errors
  }
};

export const updateWalletSnapshot = (patch: WalletSnapshot) => {
  const current = loadWalletSnapshot();
  saveWalletSnapshot({ ...current, ...patch });
};
