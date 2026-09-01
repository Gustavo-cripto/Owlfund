// Multi-portfólio ("contas") — Etapa 1: fundação.
//
// Cada "conta" é um conjunto isolado dos dados do portfólio (carteiras + ativos
// manuais), guardado no localStorage sob chaves prefixadas por conta:
//   cf.acct.<accountId>.<baseKey>
//
// As funções de storage (wallets/crypto/traditional) passam a usar accKey(base)
// em vez de uma chave fixa, por isso operam sempre na conta ativa sem os callers
// mudarem. A migração dos dados antigos (não-prefixados) para a "Conta 1" é feita
// COPIANDO — nunca apaga as chaves legadas.

export type Account = { id: string; name: string };

/** Id especial da vista combinada ("Todas as contas"). Agregação em etapa posterior. */
export const ALL_ACCOUNTS_ID = "__all__";

/** Chaves base (não-prefixadas) que compõem os dados de uma conta. */
export const NAMESPACED_BASE_KEYS = [
  "portfolio-wallets",
  "owlfund.crypto.holdings.v1",
  "owlfund.traditional.holdings.v1",
  "owlfund.stablecoin.addresses.v1",
  "trade-history-v1",
] as const;

const REGISTRY_KEY = "cf.accounts.v1";
const OWNER_KEY = "cf.owner.v1";
/** Evento disparado quando a conta ativa (ou a lista) muda. */
export const ACCOUNTS_EVENT = "cf-accounts-changed";

type Registry = { accounts: Account[]; activeId: string };

const hasWindow = () => typeof window !== "undefined";

const uid = () =>
  `a_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const nsKey = (accountId: string, base: string) => `cf.acct.${accountId}.${base}`;

function readRegistry(): Registry | null {
  if (!hasWindow()) return null;
  try {
    const raw = window.localStorage.getItem(REGISTRY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Registry;
    if (!parsed || !Array.isArray(parsed.accounts) || parsed.accounts.length === 0) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeRegistry(reg: Registry) {
  if (!hasWindow()) return;
  try {
    window.localStorage.setItem(REGISTRY_KEY, JSON.stringify(reg));
  } catch {
    // ignore
  }
}

function emitChange() {
  if (!hasWindow()) return;
  try {
    window.dispatchEvent(new Event(ACCOUNTS_EVENT));
  } catch {
    // ignore
  }
}

/**
 * Garante que existe pelo menos uma conta. Na primeira vez cria a "Conta 1" e
 * MIGRA (copiando) os dados legados não-prefixados para ela. Idempotente.
 */
export function ensureAccounts(): Registry {
  const existing = readRegistry();
  if (existing) return existing;

  const id = uid();
  const reg: Registry = { accounts: [{ id, name: "Conta 1" }], activeId: id };

  if (hasWindow()) {
    for (const base of NAMESPACED_BASE_KEYS) {
      try {
        const target = nsKey(id, base);
        if (window.localStorage.getItem(target) === null) {
          const legacy = window.localStorage.getItem(base);
          if (legacy !== null) window.localStorage.setItem(target, legacy);
        }
      } catch {
        // ignore
      }
    }
  }

  writeRegistry(reg);
  return reg;
}

/**
 * Associa os dados locais deste dispositivo ao utilizador autenticado.
 * Os dados de portfólio no localStorage são partilhados por todo o browser;
 * sem esta guarda, um login de OUTRO utilizador no mesmo dispositivo veria
 * (e sincronizaria para a nuvem dele) as contas do utilizador anterior.
 * - 1.º login no dispositivo: reclama os dados existentes (migração legada).
 * - Mesmo utilizador: no-op.
 * - Utilizador diferente: limpa registo, contas e chaves legadas primeiro.
 * Retorna true se limpou dados de outro utilizador.
 */
export function claimLocalData(userId: string): boolean {
  if (!hasWindow() || !userId) return false;
  try {
    const owner = window.localStorage.getItem(OWNER_KEY);
    if (owner === userId) return false;
    if (owner === null) {
      window.localStorage.setItem(OWNER_KEY, userId);
      return false;
    }
    const toRemove: string[] = [REGISTRY_KEY, ...NAMESPACED_BASE_KEYS];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith("cf.acct.")) toRemove.push(k);
    }
    for (const k of toRemove) {
      try { window.localStorage.removeItem(k); } catch { /* ignore */ }
    }
    window.localStorage.setItem(OWNER_KEY, userId);
    emitChange();
    return true;
  } catch {
    return false;
  }
}

export function listAccounts(): Account[] {
  return ensureAccounts().accounts;
}

export function getActiveAccountId(): string {
  return ensureAccounts().activeId;
}

export function isAllAccountsActive(): boolean {
  return getActiveAccountId() === ALL_ACCOUNTS_ID;
}

export function setActiveAccountId(id: string) {
  const reg = ensureAccounts();
  if (id !== ALL_ACCOUNTS_ID && !reg.accounts.some((a) => a.id === id)) return;
  if (reg.activeId === id) return;
  writeRegistry({ ...reg, activeId: id });
  emitChange();
}

/** Chave de storage prefixada para a conta ativa (ou a indicada). */
export function accKey(base: string, accountId?: string): string {
  const id = accountId ?? getActiveAccountId();
  return nsKey(id, base);
}

/** Ids de todas as contas (para a vista combinada "Todas"). */
export function allAccountIds(): string[] {
  return ensureAccounts().accounts.map((a) => a.id);
}

/** Lê o valor bruto de uma chave base para uma conta específica. */
export function readNamespaced(accountId: string, base: string): string | null {
  if (!hasWindow()) return null;
  try {
    return window.localStorage.getItem(nsKey(accountId, base));
  } catch {
    return null;
  }
}

/** Escreve o valor bruto de uma chave base para uma conta específica. */
export function writeNamespaced(accountId: string, base: string, raw: string) {
  if (!hasWindow()) return;
  try {
    window.localStorage.setItem(nsKey(accountId, base), raw);
  } catch {
    // ignore
  }
}

/** Snapshot do registo (para sync). */
export function getRegistry(): { accounts: Account[]; activeId: string } {
  const r = ensureAccounts();
  return { accounts: r.accounts, activeId: r.activeId };
}

/** Substitui a lista de contas pela vinda da nuvem, mantendo a conta ativa
 *  local se ainda existir. Nunca fica sem contas. */
export function replaceRegistry(reg: { accounts: Account[]; activeId?: string }) {
  if (!reg || !Array.isArray(reg.accounts) || reg.accounts.length === 0) return;
  const current = ensureAccounts();
  const localStillValid = reg.accounts.some((a) => a.id === current.activeId);
  const cloudValid = reg.activeId && reg.accounts.some((a) => a.id === reg.activeId);
  const activeId = localStillValid
    ? current.activeId
    : cloudValid
      ? (reg.activeId as string)
      : reg.accounts[0].id;
  writeRegistry({ accounts: reg.accounts, activeId });
  emitChange();
}

/** Funde o registo da nuvem com o local por UNIÃO — nunca remove contas locais
 *  (evita que um dispositivo com menos contas apague as dos outros). Mantém a
 *  conta ativa local se ainda existir, e o nome local em ids partilhados.
 *  Retorna true se acrescentou alguma conta. */
export function mergeRegistry(cloud: { accounts: Account[]; activeId?: string }): boolean {
  if (!cloud || !Array.isArray(cloud.accounts) || cloud.accounts.length === 0) return false;
  const current = ensureAccounts();
  const byId = new Map<string, Account>();
  for (const a of current.accounts) byId.set(a.id, a);
  let changed = false;
  for (const a of cloud.accounts) {
    if (!a || !a.id) continue;
    if (!byId.has(a.id)) {
      byId.set(a.id, { id: a.id, name: (a.name ?? "").trim() || "Conta" });
      changed = true;
    }
  }
  if (!changed) return false;
  const accounts = Array.from(byId.values());
  const activeId = accounts.some((a) => a.id === current.activeId)
    ? current.activeId
    : accounts[0].id;
  writeRegistry({ accounts, activeId });
  emitChange();
  return true;
}

export function createAccount(name?: string): Account {
  const reg = ensureAccounts();
  const id = uid();
  const acc: Account = {
    id,
    name: (name ?? "").trim() || `Conta ${reg.accounts.length + 1}`,
  };
  writeRegistry({ accounts: [...reg.accounts, acc], activeId: id });
  emitChange();
  return acc;
}

export function renameAccount(id: string, name: string) {
  const reg = ensureAccounts();
  const trimmed = name.trim();
  if (!trimmed) return;
  writeRegistry({
    ...reg,
    accounts: reg.accounts.map((a) => (a.id === id ? { ...a, name: trimmed } : a)),
  });
  emitChange();
}

export function deleteAccount(id: string) {
  const reg = ensureAccounts();
  if (reg.accounts.length <= 1) return; // mantém sempre pelo menos uma conta
  const accounts = reg.accounts.filter((a) => a.id !== id);
  const activeId =
    reg.activeId === id || reg.activeId === ALL_ACCOUNTS_ID
      ? accounts[0].id
      : reg.activeId;

  if (hasWindow()) {
    for (const base of NAMESPACED_BASE_KEYS) {
      try {
        window.localStorage.removeItem(nsKey(id, base));
      } catch {
        // ignore
      }
    }
  }

  writeRegistry({ accounts, activeId });
  emitChange();
}
