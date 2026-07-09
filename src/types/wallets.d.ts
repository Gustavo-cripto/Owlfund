export {};

declare global {
  interface Window {
    ethereum?: {
      isMetaMask?: boolean;
      request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
    };
    solana?: {
      isPhantom?: boolean;
      connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey?: { toString: () => string } }>;
      disconnect?: () => Promise<void>;
    };
    solflare?: {
      isSolflare?: boolean;
      isConnected?: boolean;
      connect: () => Promise<{ publicKey?: { toString: () => string }; address?: string } | undefined>;
      publicKey?: { toString: () => string } | null;
      on?: (event: string, cb: () => void) => void;
      off?: (event: string, cb: () => void) => void;
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
