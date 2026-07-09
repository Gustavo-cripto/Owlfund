import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";

const _rpc = (process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "").trim();
const RPC_PRIMARY =
  _rpc.startsWith("http://") || _rpc.startsWith("https://") ? _rpc : "https://api.mainnet-beta.solana.com";
const RPC_FALLBACK = "https://solana.publicnode.com";
const RPC_FALLBACK2 = "https://solana-rpc.publicnode.com";
const connectionPrimary = new Connection(RPC_PRIMARY, "confirmed");
const connectionFallback = new Connection(RPC_FALLBACK, "confirmed");
const connectionFallback2 = new Connection(RPC_FALLBACK2, "confirmed");

const isRpcError = (err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("403") ||
    msg.includes("Access forbidden") ||
    msg.includes("API key") ||
    msg.includes("forbidden")
  );
};

export type SolanaWalletId = "phantom" | "backpack" | "solflare" | "glow" | "flint";

export const isPhantomAvailable = () =>
  typeof window !== "undefined" && !!window.solana?.isPhantom;

export const isSolflareAvailable = () =>
  typeof window !== "undefined" && (!!window.solflare?.isSolflare || !!window.solflare?.connect);

export const isBackpackAvailable = () =>
  typeof window !== "undefined" && !!window.backpack;

export const isGlowAvailable = () =>
  typeof window !== "undefined" && !!window.glow;

export const isFlintAvailable = () =>
  typeof window !== "undefined" && !!window.flint;

export const isSolanaWalletAvailable = (id: SolanaWalletId): boolean => {
  if (typeof window === "undefined") return false;
  switch (id) {
    case "phantom":
      return !!window.solana?.isPhantom;
    case "solflare":
      return !!window.solflare?.isSolflare || !!window.solflare?.connect;
    case "backpack":
      return !!window.backpack;
    case "glow":
      return !!window.glow;
    case "flint":
      return !!window.flint;
    default:
      return false;
  }
};

export const connectPhantom = async (): Promise<string> => {
  const provider = window.solana;
  if (!provider?.isPhantom) {
    throw new Error("Phantom não está disponível. Instala a extensão Phantom.");
  }
  // Força o popup de aprovação mesmo que o site já seja "trusted": desliga a
  // sessão atual antes de voltar a ligar (senão o Phantom religa em silêncio).
  try { await provider.disconnect?.(); } catch { /* ignore */ }
  const response = await provider.connect();
  const address = response?.publicKey?.toString();
  if (!address) throw new Error("Nenhuma conta retornada pelo Phantom.");
  return address;
};

export const connectSolflare = async (): Promise<string> => {
  if (!window.solflare) {
    throw new Error("Solflare não está disponível. Instala a extensão Solflare.");
  }
  try {
    await window.solflare.connect();
  } catch (err) {
    // Some versions throw on connect() if already connected — ignore and try to read publicKey
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("already") && !msg.includes("connected")) throw err;
  }
  // After connect(), publicKey is set on the window object (may take a tick)
  await new Promise((r) => setTimeout(r, 100));
  const address = window.solflare.publicKey?.toString();
  if (!address) throw new Error("Nenhuma conta retornada pela Solflare. Verifica se a extensão está desbloqueada.");
  return address;
};

export const connectBackpack = async (): Promise<string> => {
  if (!window.backpack) {
    throw new Error("Backpack não está disponível. Instala a extensão Backpack.");
  }
  const response = await window.backpack.connect();
  const address = response?.address ?? response?.publicKey?.toString();
  if (!address) throw new Error("Nenhuma conta retornada pela Backpack.");
  return address;
};

export const connectGlow = async (): Promise<string> => {
  if (!window.glow) {
    throw new Error("Glow Wallet não está disponível. Instala a extensão Glow.");
  }
  const response = await window.glow.connect();
  const address = response?.address ?? response?.publicKey?.toString();
  if (!address) throw new Error("Nenhuma conta retornada pela Glow.");
  return address;
};

export const connectFlint = async (): Promise<string> => {
  if (!window.flint) {
    throw new Error("Flint não está disponível. Instala a extensão Flint.");
  }
  const response = await window.flint.connect();
  const address =
    response?.publicKey?.toString() ??
    response?.address ??
    window.flint.publicKey?.toString();
  if (!address) throw new Error("Nenhuma conta retornada pela Flint.");
  return address;
};

export const connectSolanaWallet = async (providerId: SolanaWalletId): Promise<string> => {
  switch (providerId) {
    case "phantom":
      return connectPhantom();
    case "solflare":
      return connectSolflare();
    case "backpack":
      return connectBackpack();
    case "glow":
      return connectGlow();
    case "flint":
      return connectFlint();
    default:
      return connectPhantom();
  }
};

export const getSolBalance = async (address: string) => {
  const pubkey = new PublicKey(address);
  const connections = [connectionPrimary, connectionFallback, connectionFallback2];
  let lastErr: unknown;
  for (const conn of connections) {
    try {
      const lamports = await conn.getBalance(pubkey);
      return (lamports / LAMPORTS_PER_SOL).toFixed(4);
    } catch (err) {
      lastErr = err;
    }
  }
  // Last resort: proxy via API route
  try {
    const res = await fetch(`/api/sol-balance?address=${encodeURIComponent(address)}`);
    if (res.ok) {
      const data = (await res.json()) as { balance: number };
      return data.balance.toFixed(4);
    }
  } catch { /* ignore */ }
  throw lastErr;
};
