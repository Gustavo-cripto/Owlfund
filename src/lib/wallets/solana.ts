import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";

const RPC_PRIMARY =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://solana.publicnode.com";
const RPC_FALLBACK = "https://rpc.ankr.com/solana";
const connectionPrimary = new Connection(RPC_PRIMARY, "confirmed");
const connectionFallback = new Connection(RPC_FALLBACK, "confirmed");

const isRpcError = (err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("403") ||
    msg.includes("Access forbidden") ||
    msg.includes("API key") ||
    msg.includes("forbidden")
  );
};

export const isPhantomAvailable = () =>
  typeof window !== "undefined" && !!window.solana?.isPhantom;

export const connectPhantom = async () => {
  if (!window.solana?.isPhantom) {
    throw new Error("Phantom não está disponível.");
  }

  const response = await window.solana.connect();
  const address = response?.publicKey?.toString();
  if (!address) {
    throw new Error("Nenhuma conta retornada pelo Phantom.");
  }

  return address;
};

export const getSolBalance = async (address: string) => {
  const pubkey = new PublicKey(address);
  try {
    const lamports = await connectionPrimary.getBalance(pubkey);
    return (lamports / LAMPORTS_PER_SOL).toFixed(4);
  } catch (err) {
    if (!isRpcError(err)) throw err;
    const lamports = await connectionFallback.getBalance(pubkey);
    return (lamports / LAMPORTS_PER_SOL).toFixed(4);
  }
};
