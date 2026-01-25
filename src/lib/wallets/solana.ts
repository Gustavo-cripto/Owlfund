import { Connection, LAMPORTS_PER_SOL, PublicKey, clusterApiUrl } from "@solana/web3.js";

const connection = new Connection(clusterApiUrl("mainnet-beta"), "confirmed");

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
