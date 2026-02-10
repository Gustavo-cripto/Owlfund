import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";

const SOLANA_RPC =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://rpc.ankr.com/solana";
const connection = new Connection(SOLANA_RPC, "confirmed");

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
  const lamports = await connection.getBalance(new PublicKey(address));
  return (lamports / LAMPORTS_PER_SOL).toFixed(4);
};
