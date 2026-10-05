import { accKey, gravarSeMudou, allAccountIds, isAllAccountsActive, readNamespaced } from "@/lib/portfolios/accounts";
import type { PosicaoDefi } from "@/lib/defi/posicoes";

export type StoredWalletEntry = {
  address?: string;
  balance?: string;
  network?: string;
  label?: string;
  /** Origem da adição. "cold" = adicionado via card Ledger/Trezor; "demo" = modo de exemplo (src/lib/demo/exemplo.ts). */
  source?: "cold" | "manual" | "demo";
};

export type WalletSnapshot = {
  eth?: StoredWalletEntry[];
  sol?: StoredWalletEntry[];
  btc?: StoredWalletEntry[];
  ada?: StoredWalletEntry[];
  other?: StoredWalletEntry[];
  cexUsd?: number;
  defiUsd?: number;
  /** Total dos ativos registados manualmente (já em EUR). */
  manualEur?: number;
  /** Tokens ERC-20/SPL das carteiras frias, sem o nativo (USD). */
  tokensUsd?: number;
  /** Total dos ativos tradicionais a valor de MERCADO (ja em EUR).
   *  So a pagina de Carteiras tem as cotacoes; as outras leem daqui. */
  traditionalEur?: number;
  /** Posições DeFi por carteira (chave "endereco:rede"), lidas nas Carteiras; o Portefólio mostra-as. */
  defiPosicoes?: Record<string, PosicaoDefi[]>;
  /** Quando foram lidas (ms). */
  defiPosicoesEm?: number;
};

const walletsKey = () => accKey("portfolio-wallets");

const normalizeEntry = (value: unknown): StoredWalletEntry[] | undefined => {
  if (!value) return undefined;
  if (Array.isArray(value)) return value as StoredWalletEntry[];
  if (typeof value === "object") return [value as StoredWalletEntry];
  return undefined;
};

const normalizeSnapshot = (value: unknown): WalletSnapshot => {
  const raw = (value ?? {}) as Record<string, unknown>;
  return {
    eth: normalizeEntry(raw.eth),
    sol: normalizeEntry(raw.sol),
    btc: normalizeEntry(raw.btc),
    ada: normalizeEntry(raw.ada),
    other: normalizeEntry(raw.other),
    cexUsd: typeof raw.cexUsd === "number" ? raw.cexUsd : undefined,
    defiUsd: typeof raw.defiUsd === "number" ? raw.defiUsd : undefined,
    manualEur: typeof raw.manualEur === "number" ? raw.manualEur : undefined,
    tokensUsd: typeof raw.tokensUsd === "number" ? raw.tokensUsd : undefined,
    // Sem isto o valor de mercado dos tradicionais nunca chegava ao localStorage
    // nem a nuvem: Painel, Portefolio e IA caiam sempre no valor investido.
    traditionalEur: typeof raw.traditionalEur === "number" ? raw.traditionalEur : undefined,
    defiPosicoes: raw.defiPosicoes && typeof raw.defiPosicoes === "object" && !Array.isArray(raw.defiPosicoes)
      ? (raw.defiPosicoes as Record<string, PosicaoDefi[]>) : undefined,
    defiPosicoesEm: typeof raw.defiPosicoesEm === "number" ? raw.defiPosicoesEm : undefined,
  };
};

export const loadWalletSnapshot = (): WalletSnapshot => {
  if (typeof window === "undefined") return {};
  try {
    // Vista combinada "Todas": junta as carteiras de todas as contas.
    if (isAllAccountsActive()) {
      const merged: WalletSnapshot = {};
      for (const id of allAccountIds()) {
        const raw = readNamespaced(id, "portfolio-wallets");
        if (!raw) continue;
        const snap = normalizeSnapshot(JSON.parse(raw));
        (["eth", "sol", "btc", "ada", "other"] as const).forEach((k) => {
          const arr = snap[k];
          if (arr?.length) merged[k] = [...(merged[k] ?? []), ...arr];
        });
        if (typeof snap.cexUsd === "number") merged.cexUsd = (merged.cexUsd ?? 0) + snap.cexUsd;
        if (typeof snap.defiUsd === "number") merged.defiUsd = (merged.defiUsd ?? 0) + snap.defiUsd;
        if (typeof snap.manualEur === "number") merged.manualEur = (merged.manualEur ?? 0) + snap.manualEur;
        if (typeof snap.tokensUsd === "number") merged.tokensUsd = (merged.tokensUsd ?? 0) + snap.tokensUsd;
        if (typeof snap.traditionalEur === "number") merged.traditionalEur = (merged.traditionalEur ?? 0) + snap.traditionalEur;
        // A mesma carteira em duas contas tem a mesma chave: fica uma vez.
        if (snap.defiPosicoes) merged.defiPosicoes = { ...(merged.defiPosicoes ?? {}), ...snap.defiPosicoes };
        if (snap.defiPosicoesEm) merged.defiPosicoesEm = Math.max(merged.defiPosicoesEm ?? 0, snap.defiPosicoesEm);
      }
      return merged;
    }
    const raw = window.localStorage.getItem(walletsKey());
    return raw ? normalizeSnapshot(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
};

export const saveWalletSnapshot = (next: WalletSnapshot) => {
  if (typeof window === "undefined") return;
  if (isAllAccountsActive()) return; // vista combinada é só leitura
  try {
    gravarSeMudou("portfolio-wallets", JSON.stringify(normalizeSnapshot(next)));
  } catch {
    // ignore storage errors
  }
};

export const updateWalletSnapshot = (patch: WalletSnapshot) => {
  const current = loadWalletSnapshot();
  const next: WalletSnapshot = { ...current };
  (["eth", "sol", "btc", "ada", "other"] as const).forEach((key) => {
    const value = normalizeEntry(patch[key]);
    if (value !== undefined) {
      next[key] = value;
    }
  });
  if (typeof patch.cexUsd === "number") next.cexUsd = patch.cexUsd;
  if (typeof patch.defiUsd === "number") next.defiUsd = patch.defiUsd;
  if (typeof patch.manualEur === "number") next.manualEur = patch.manualEur;
  if (typeof patch.tokensUsd === "number") next.tokensUsd = patch.tokensUsd;
  if (typeof patch.traditionalEur === "number") next.traditionalEur = patch.traditionalEur;
  if (patch.defiPosicoes) next.defiPosicoes = patch.defiPosicoes;
  if (typeof patch.defiPosicoesEm === "number") next.defiPosicoesEm = patch.defiPosicoesEm;
  // Nada mudou? Nao se grava nem se carimba. O carimbo diz "este aparelho tem a
  // versao mais recente" — renova-lo sem mudanca fazia este aparelho ganhar a
  // gravacoes reais feitas noutro (auditoria 28 set 2026).
  if (JSON.stringify(normalizeSnapshot(next)) === JSON.stringify(normalizeSnapshot(current))) return;
  saveWalletSnapshot(next);
};
