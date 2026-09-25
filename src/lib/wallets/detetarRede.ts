// Reconhece a rede pelo formato de um endereço PÚBLICO colado pelo utilizador,
// e deteta os dois enganos perigosos: colar uma frase de recuperação ou uma
// chave privada. Nesses casos devolve um aviso e NUNCA o texto segue para lado
// nenhum (quem chama não o guarda nem o envia).
export type Deteccao =
  | { tipo: "rede"; rede: "eth" | "btc" | "sol" | "ada" }
  | { tipo: "frase" }       // 12/15/18/21/24 palavras: frase de recuperação
  | { tipo: "chave" }       // 64 hex (com ou sem 0x): chave privada EVM
  | { tipo: "desconhecido" };

export function detetarRede(texto: string): Deteccao {
  const a = texto.trim();
  if (!a) return { tipo: "desconhecido" };
  const palavras = a.split(/\s+/);
  if (palavras.length >= 12 && palavras.every((p) => /^[a-zA-Z]+$/.test(p))) return { tipo: "frase" };
  if (/^(0x)?[a-fA-F0-9]{64}$/.test(a)) return { tipo: "chave" };
  if (/^0x[a-fA-F0-9]{40}$/.test(a)) return { tipo: "rede", rede: "eth" };
  if (/^(bc1[a-z0-9]{25,90}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/.test(a)) return { tipo: "rede", rede: "btc" };
  if (/^(addr1|stake1)[0-9a-z]{20,}$/.test(a)) return { tipo: "rede", rede: "ada" };
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a)) return { tipo: "rede", rede: "sol" };
  return { tipo: "desconhecido" };
}
