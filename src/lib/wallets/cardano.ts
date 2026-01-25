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

export const connectEternl = async () => {
  if (!window.cardano?.eternl) {
    throw new Error("Eternl não está disponível.");
  }

  const api = await window.cardano.eternl.enable();
  const changeAddressHex = await api.getChangeAddress();
  const CardanoWasm = await getCardanoWasm();
  const address = CardanoWasm.Address.from_bytes(hexToBytes(changeAddressHex)).to_bech32();
  return { api, address };
};

export const getAdaBalance = async (api: unknown) => {
  const balanceHex = await (api as { getBalance: () => Promise<string> }).getBalance();
  const CardanoWasm = await getCardanoWasm();
  const value = CardanoWasm.Value.from_bytes(hexToBytes(balanceHex));
  const lovelace = value.coin().to_str();
  return (Number(lovelace) / 1_000_000).toFixed(6);
};
