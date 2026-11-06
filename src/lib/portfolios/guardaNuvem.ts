// Regras que impedem um aparelho de apagar a conta na nuvem (auditoria 6 nov
// 2026). O envio é do blob inteiro, sem fusão no servidor: quem envia sem ter
// lido primeiro substitui tudo pelo que tem neste browser, que pode ser só uma
// "Conta 1" vazia ou o estado de há uma semana.

import { temConteudo } from "@/lib/portfolios/accounts";

/** Uma leitura com menos disto ainda serve de base para um envio. */
export const VALIDADE_LEITURA_MS = 5 * 60_000;

export type UltimaLeitura = { userId: string; em: number } | null;

export const leituraValida = (ultima: UltimaLeitura, userId: string, agora: number): boolean =>
  !!ultima && ultima.userId === userId && agora - ultima.em < VALIDADE_LEITURA_MS;

/** Envia só depois de ler a nuvem. Se a leitura falhar, nada segue: os dados ficam aqui e tenta-se mais tarde. */
export async function enviarDepoisDeLer(passos: {
  leituraValida: boolean;
  ler: () => Promise<boolean>;
  enviar: () => Promise<unknown>;
}): Promise<"enviado" | "adiado"> {
  if (!passos.leituraValida && !(await passos.ler())) return "adiado";
  await passos.enviar();
  return "enviado";
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

const idsDoRegisto = (blob: Record<string, unknown>): Set<string> => {
  const contas = isObj(blob.registry) && Array.isArray(blob.registry.accounts) ? blob.registry.accounts : [];
  return new Set(contas.flatMap((a) => (isObj(a) && typeof a.id === "string" ? [a.id] : [])));
};

// Os carimbos e a memória do Block não fazem de uma conta uma conta com dados.
const FORA_DO_CONTEUDO = new Set(["owlfund.sync.ts.v1", "gestor.memoria.v1"]);

const blobTemDados = (blob: Record<string, unknown>): boolean => {
  if (!isObj(blob.data)) return false;
  return Object.values(blob.data).some((conta) => isObj(conta)
    && Object.entries(conta).some(([base, raw]) => !FORA_DO_CONTEUDO.has(base) && typeof raw === "string" && temConteudo(raw)));
};

/**
 * Última defesa no servidor, para quem envia sem dizer que leu (separador aberto
 * com código antigo, app móvel): o blob novo não tem nenhuma conta em comum com
 * o guardado, e o guardado tem dados. Só pode ser um aparelho que não leu a
 * nuvem: quem apaga dados de propósito mantém pelo menos uma conta (deleteAccount).
 */
export function blobSemRelacao(guardado: unknown, novo: unknown): boolean {
  if (!isObj(guardado) || guardado.v !== 3 || !blobTemDados(guardado)) return false;
  if (!isObj(novo) || novo.v !== 3) return true;
  const novos = idsDoRegisto(novo);
  return ![...idsDoRegisto(guardado)].some((id) => novos.has(id));
}
