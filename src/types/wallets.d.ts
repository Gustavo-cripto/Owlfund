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
    cardano?: {
      eternl?: {
        enable: () => Promise<unknown>;
      };
    };
  }
}
