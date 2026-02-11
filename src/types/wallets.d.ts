export {};

declare global {
  interface Window {
    ethereum?: {
      isMetaMask?: boolean;
      request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
    };
    solana?: {
      isPhantom?: boolean;
      connect: () => Promise<{ publicKey?: { toString: () => string } }>;
    };
    solflare?: {
      connect: () => Promise<{ publicKey?: { toString: () => string }; address?: string }>;
      publicKey?: { toString: () => string } | null;
    };
    backpack?: {
      connect: () => Promise<{ publicKey?: { toString: () => string }; address?: string }>;
    };
    glow?: {
      connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ address?: string; publicKey?: { toString: () => string } }>;
    };
    flint?: {
      connect: () => Promise<{ publicKey?: { toString: () => string }; address?: string }>;
      publicKey?: { toString: () => string } | null;
    };
    cardano?: {
      eternl?: { enable: () => Promise<unknown> };
      daedalus?: { enable: () => Promise<unknown> };
      yoroi?: { enable: () => Promise<unknown> };
      adalite?: { enable: () => Promise<unknown> };
      lace?: { enable: () => Promise<unknown> };
      ledger?: { enable: () => Promise<unknown> };
    };
  }
}
