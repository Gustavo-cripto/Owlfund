const hexToBytes = (hex: string) => {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(clean.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
};

let cardanoWasmPromise: Promise<typeof import("@emurgo/cardano-serialization-lib-browser")> | null =
  null;

const getCardanoWasm = () => {
  if (!cardanoWasmPromise) {
    cardanoWasmPromise = import("@emurgo/cardano-serialization-lib-browser");
  }
  return cardanoWasmPromise;
};

export const isEternlAvailable = () =>
  typeof window !== "undefined" && !!window.cardano?.eternl;

export type EternlApi = {
  getChangeAddress?: () => Promise<string>;
  getUnusedAddresses?: () => Promise<string[]>;
  getBalance: () => Promise<string>;
};

export type CardanoWalletId = "eternl" | "daedalus" | "yoroi" | "adalite" | "lace";

const getCardanoWalletKey = (id: CardanoWalletId): keyof NonNullable<typeof window.cardano> => {
  if (id === "eternl") return "eternl";
  if (id === "daedalus") return "daedalus";
  if (id === "yoroi") return "yoroi";
  if (id === "adalite") return "adalite";
  if (id === "lace") return "lace";
  return "eternl";
};

export const isCardanoWalletAvailable = (id: CardanoWalletId): boolean => {
  if (typeof window === "undefined" || !window.cardano) return false;
  const key = getCardanoWalletKey(id);
  return !!(window.cardano as Record<string, unknown>)[key];
};

export const connectEternl = async () => {
  if (!window.cardano?.eternl) {
    throw new Error("Eternl não está disponível.");
  }

  const api = (await window.cardano.eternl.enable()) as EternlApi;
  const changeAddressHex = await (api.getChangeAddress?.() ?? Promise.resolve(""));
  const unused = api.getUnusedAddresses?.();
  let addressHex = changeAddressHex;
  if (!addressHex && unused) {
    const addrs = await unused;
    addressHex = addrs?.[0] ?? "";
  }
  if (!addressHex) throw new Error("Nenhum endereço devolvido.");
  if (addressHex.startsWith("addr")) return { api, address: addressHex };
  const CardanoWasm = await getCardanoWasm();
  const address = CardanoWasm.Address.from_bytes(hexToBytes(addressHex)).to_bech32();
  return { api, address };
};

const connectCardanoWalletById = async (
  id: CardanoWalletId
): Promise<{ api: EternlApi; address: string }> => {
  const key = getCardanoWalletKey(id);
  const wallet = (window.cardano as Record<string, { enable: () => Promise<EternlApi> }>)[key];
  if (!wallet) {
    const labels: Record<CardanoWalletId, string> = {
      eternl: "Eternl",
      daedalus: "Daedalus",
      yoroi: "Yoroi",
      adalite: "Ada Lite",
      lace: "Lace",
    };
    throw new Error(`${labels[id]} não está disponível. Instala a extensão.`);
  }
  const api = (await wallet.enable()) as EternlApi;
  const changeAddressHex = await api.getChangeAddress?.().catch(() => "");
  const unused = await api.getUnusedAddresses?.().catch(() => []);
  const addressHex = changeAddressHex || (unused?.[0] ?? "");
  if (!addressHex) throw new Error("Nenhum endereço devolvido pela carteira.");
  if (typeof addressHex === "string" && addressHex.startsWith("addr"))
    return { api, address: addressHex };
  const CardanoWasm = await getCardanoWasm();
  const address = CardanoWasm.Address.from_bytes(hexToBytes(addressHex)).to_bech32();
  return { api, address };
};

export const connectCardanoWallet = async (id: CardanoWalletId) => {
  return connectCardanoWalletById(id);
};

export const getAdaBalance = async (api: EternlApi) => {
  const balanceHex = await api.getBalance();
  const CardanoWasm = await getCardanoWasm();
  const value = CardanoWasm.Value.from_bytes(hexToBytes(balanceHex));
  const lovelace = value.coin().to_str();
  return (Number(lovelace) / 1_000_000).toFixed(6);
};

/** Obtém saldo ADA por endereço (via API Blockfrost no servidor). */
export const getAdaBalanceByAddress = async (address: string): Promise<string> => {
  const res = await fetch(
    `${typeof window !== "undefined" ? window.location.origin : ""}/api/ada-balance?address=${encodeURIComponent(address)}`
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? "Erro ao obter saldo.");
  }
  const data = (await res.json()) as { balance?: string };
  return data.balance ?? "0";
};
