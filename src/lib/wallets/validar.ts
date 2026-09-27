// Validacao rapida de formato e limpeza de nomes para a pagina de carteiras.
// Sem dependencias: funcoes puras, testadas em scripts/testes/validarCarteira.test.ts.
// (Extraido de src/app/(pt)/wallets/page.tsx sem alteracoes de comportamento.)

export const isEvmAddress = (address?: string) => /^0x[a-fA-F0-9]{40}$/.test(address ?? "");
export const isSolAddress = (address?: string) =>
  typeof address === "string" && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
export const isBtcAddress = (address?: string) =>
  typeof address === "string" && /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,}$/.test(address);

// Sanitiza labels inseridos pelo utilizador — remove HTML e limita comprimento
export const sanitizeLabel = (label: string): string =>
  label.replace(/[<>"'`]/g, "").replace(/javascript:/gi, "").trim().slice(0, 64);
export const isAdaAddress = (address?: string) =>
  typeof address === "string" && /^(addr1|stake1)[0-9a-z]+$/i.test(address);
export const getAllowedHosts = () =>
  (process.env.NEXT_PUBLIC_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);
