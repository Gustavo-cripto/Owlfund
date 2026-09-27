// Validacao de formato de enderecos Solana e EVM, ao lado de isValidBtcAddress
// (btcAddress.ts). Sem dependencias: serve no servidor e no cliente.
//
// Existe porque tres proxies com sessao (sol-balance, hyperliquid-balance,
// token-balances) aceitavam qualquer string e gastavam 2-3 pedidos upstream
// por tentativa — e quem colava um endereco mal via "falha dos RPCs", como se
// a avaria fosse nossa, em vez de "endereco invalido".

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** Numero de bytes que a string base58 codifica (null se tiver caracteres fora do alfabeto). */
function base58Bytes(str: string): number | null {
  // Zeros a esquerda: cada "1" inicial e um byte 0x00.
  let zeros = 0;
  while (zeros < str.length && str[zeros] === "1") zeros++;
  const bytes: number[] = [];
  for (let i = zeros; i < str.length; i++) {
    let carry = B58.indexOf(str[i]);
    if (carry < 0) return null;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) { bytes.push(carry & 0xff); carry >>= 8; }
  }
  return zeros + bytes.length;
}

/** true se for uma chave publica Solana (base58, 32 bytes). */
export function isValidSolAddress(address: unknown): address is string {
  if (typeof address !== "string" || address.length < 32 || address.length > 44) return false;
  if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(address)) return false;
  return base58Bytes(address) === 32;
}

/** true se for um endereco EVM (0x + 40 hex). Nao valida o checksum EIP-55: enderecos em minusculas sao validos e comuns. */
export function isValidEvmAddress(address: unknown): address is string {
  return typeof address === "string" && /^0x[0-9a-fA-F]{40}$/.test(address);
}
