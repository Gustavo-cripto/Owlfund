// Multi-portefólio ("contas") — Etapa 1: fundação.
//
// Cada "conta" é um conjunto isolado dos dados do portefólio (carteiras + ativos
// manuais), guardado no localStorage sob chaves prefixadas por conta:
//   cf.acct.<accountId>.<baseKey>
//
// As funções de storage (wallets/crypto/traditional) passam a usar accKey(base)
// em vez de uma chave fixa, por isso operam sempre na conta ativa sem os callers
// mudarem. A migração dos dados antigos (não-prefixados) para a "Conta 1" é feita
// COPIANDO — nunca apaga as chaves legadas.

import { contasRedundantes, identidades, NOME_AUTOMATICO, type Conteudo, type ContaParaDedupe } from "@/lib/portfolios/duplicados";

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
  "owlfund.venue.holdings.v1",
  // Memória do Gestor IA (perfil + notas que o Block aprendeu). Viaja entre
  // aparelhos como o resto; não conta para "conta vazia".
  "gestor.memoria.v1",
  // Carimbos de "quando foi gravado" por chave, para o merge entre dispositivos
  // (ver marcarAlterado e cloudSync.pullWalletCloud). Viaja no blob como as outras.
  "owlfund.sync.ts.v1",
] as const;

export const SYNC_TS_BASE = "owlfund.sync.ts.v1";
export const MEMORIA_BLOCK_BASE = "gestor.memoria.v1";

/**
 * Chaves PESSOAIS que não são de portefólio e por isso nunca foram prefixadas
 * por conta — mas pertencem a uma pessoa. Sem entrarem na limpeza do
 * claimLocalData, quem entrasse depois no mesmo browser via as escolhas do
 * anterior: a lista de baleias dele, os favoritos dele, e a IA a tratá-lo pelo
 * nome dele. É o mesmo defeito que o plano FIRE tinha (corrigido a 26/09/2026),
 * na mesma família de chaves fixas.
 */
export const PERSONAL_KEYS = [
  "smart-money-watchlist",        // lista de baleias (o /gestor também a lê)
  "smart-money-alerts",           // alertas dessa lista
  "owlfund.market.favorites.v1",  // favoritos do /mercado
  "owlfund.nickname",             // o nome por que a IA trata a pessoa
  // `cfa-demo-address` fica de fora de propósito: é quase sempre de quem está
  // a criar conta agora (demonstração → registo → Carteiras pré-preenchida),
  // e é um endereço público. Apagá-lo aqui partia esse passo em qualquer
  // computador que já tivesse tido outro dono. A página de Carteiras apaga-o
  // depois de o usar.
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
 * Os dados de portefólio no localStorage são partilhados por todo o browser;
 * sem esta guarda, um login de OUTRO utilizador no mesmo dispositivo veria
 * (e sincronizaria para a nuvem dele) as contas do utilizador anterior.
 * - 1.º login no dispositivo: reclama os dados existentes (migração legada).
 * - Mesmo utilizador: no-op.
 * - Utilizador diferente: limpa registo, contas, chaves legadas e as chaves
 *   pessoais de PERSONAL_KEYS (lista de baleias, favoritos, nickname, …).
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
    const toRemove: string[] = [REGISTRY_KEY, ...NAMESPACED_BASE_KEYS, ...PERSONAL_KEYS];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      // `fire-plan-v1:<userId>`: já não se vê trocado (tem o id lá dentro), mas
      // é o plano de reforma de outra pessoa a ficar no browser dela. Sai também.
      if (k && (k.startsWith("cf.acct.") || k.startsWith("fire-plan-v1:"))) toRemove.push(k);
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

/** Um valor guardado tem conteúdo? (listas/objetos vazios e zeros não contam) */
export function temConteudo(raw: string | null | undefined): boolean {
  if (raw == null || raw.trim() === "") return false;
  let v: unknown;
  try { v = JSON.parse(raw); } catch { return true; }  // não sei ler: trato como conteúdo
  const tem = (x: unknown): boolean => {
    if (x == null || typeof x === "boolean") return false;
    if (typeof x === "number") return x !== 0;
    if (typeof x === "string") return x.trim() !== "";
    if (Array.isArray(x)) return x.length > 0;
    if (typeof x === "object") return Object.values(x as Record<string, unknown>).some(tem);
    return false;
  };
  return tem(v);
}

/** A conta não tem nada — nem neste aparelho, nem (se dados) na nuvem. Os carimbos não contam. */
export function contaVazia(accountId: string, daNuvem?: Record<string, string>): boolean {
  for (const base of NAMESPACED_BASE_KEYS) {
    if (base === SYNC_TS_BASE || base === MEMORIA_BLOCK_BASE) continue;
    if (temConteudo(readNamespaced(accountId, base))) return false;
    if (daNuvem && temConteudo(daNuvem[base])) return false;
  }
  return true;
}

/**
 * Junta o registo da nuvem com o local, SEM contas-fantasma nem duplicadas.
 *
 * Porquê (auditoria 28–29 set 2026): num aparelho/browser novo o ensureAccounts
 * cria uma "Conta 1" vazia e ativa-a ANTES de a nuvem responder. O merge por
 * união mantinha-a ativa — a pessoa via "saldo a 0", voltava a juntar as mesmas
 * carteiras, e o push mandava mais uma "Conta 1" para a nuvem. Havia contas com
 * 11 portefólios, quase todos iguais.
 *
 * Regras (ver src/lib/portfolios/duplicados.ts):
 * - união como antes: contas com nome dado pela pessoa, ou com algo que mais
 *   nenhuma tem, nunca saem; o nome local ganha;
 * - uma "Conta 1" sai quando tudo o que tem já existe noutra "Conta 1" que fica
 *   (uma vazia está sempre coberta);
 * - a conta ativa local mantém-se se sobreviver; senão a da nuvem; senão a 1.ª.
 * Devolve os ids removidos (para não se escreverem dados neles).
 */
export function juntarRegistoDaNuvem(
  cloud: { accounts: Account[]; activeId?: string },
  dadosNuvem: Record<string, Record<string, string>> = {},
): string[] {
  if (!cloud || !Array.isArray(cloud.accounts) || cloud.accounts.length === 0) return [];
  const local = readRegistry();
  const porId = new Map<string, Account>();
  for (const a of cloud.accounts) {
    if (a && a.id) porId.set(a.id, { id: a.id, name: (a.name ?? "").trim() || "Conta" });
  }
  for (const a of local?.accounts ?? []) porId.set(a.id, a);   // nome local ganha; só-locais entram
  // Ordem: as da nuvem primeiro (a ordem de quem já usava o site), depois as só-locais.
  const todas = Array.from(porId.values());
  const naNuvem = new Set(cloud.accounts.map((a) => a?.id));
  todas.sort((x, y) => Number(naNuvem.has(y.id)) - Number(naNuvem.has(x.id)));

  const ativaLocal = local?.activeId;
  const ativaRef = ativaLocal && porId.has(ativaLocal) ? ativaLocal : cloud.activeId;
  const carimbosDaNuvem = (id: string): Record<string, number> => {
    try { const r = dadosNuvem[id]?.[SYNC_TS_BASE]; return r ? (JSON.parse(r) as Record<string, number>) : {}; } catch { return {}; }
  };
  const paraDedupe: ContaParaDedupe[] = todas.map((a) => {
    const possivel: Conteudo = {};
    const final: Conteudo = {};
    const tsLocal = lerCarimbos(a.id);
    const tsNuvem = carimbosDaNuvem(a.id);
    for (const base of NAMESPACED_BASE_KEYS) {
      if (base === SYNC_TS_BASE) continue;
      const doLocal = readNamespaced(a.id, base);
      const daNuvem = dadosNuvem[a.id]?.[base] ?? null;
      const iLocal = identidades(base, doLocal);
      const iNuvem = identidades(base, daNuvem);
      possivel[base] = new Set([...iLocal, ...iNuvem]);
      // O que fica depois do merge por chave (a mesma decisão do pullWalletCloud):
      // os trades fundem-se; no resto manda a gravação mais recente.
      final[base] = base === "trade-history-v1" ? possivel[base]
        : daNuvem == null ? iLocal
        : adotarNuvem(doLocal != null, tsLocal[base], tsNuvem[base]) ? iNuvem : iLocal;
    }
    return { id: a.id, name: a.name, ativa: a.id === ativaRef, naNuvem: naNuvem.has(a.id), possivel, final };
  });

  let removidos = contasRedundantes(paraDedupe);
  // Nunca se fica sem contas.
  if (removidos.length >= todas.length) removidos = removidos.filter((id) => id !== (ativaRef && porId.has(ativaRef) ? ativaRef : todas[0].id));
  const fora = new Set(removidos);
  const finais = todas.filter((a) => !fora.has(a.id));

  if (hasWindow()) {
    for (const id of removidos) {
      for (const base of NAMESPACED_BASE_KEYS) {
        try { window.localStorage.removeItem(nsKey(id, base)); } catch { /* ignore */ }
      }
    }
  }

  const ficam = new Set(finais.map((a) => a.id));
  const activeId =
    ativaLocal && (ativaLocal === ALL_ACCOUNTS_ID || ficam.has(ativaLocal)) ? ativaLocal
    : cloud.activeId && ficam.has(cloud.activeId) ? cloud.activeId
    // A ativa era uma duplicada: passa para a "Conta 1" que ficou (a que a cobria).
    : (finais.find((a) => a.name === NOME_AUTOMATICO) ?? finais[0]).id;

  const antes = JSON.stringify(local);
  const depois: Registry = { accounts: finais, activeId };
  if (JSON.stringify(depois) !== antes) {
    writeRegistry(depois);
    emitChange();
  }
  return removidos;
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

/**
 * Regista que uma chave desta conta foi gravada AGORA neste dispositivo.
 *
 * PORQUÊ: a sincronização com a nuvem só preenchia o que faltava localmente e
 * nunca sobrescrevia — o que quer dizer que um telemóvel que já tinha visitado
 * o site ficava para sempre com as carteiras de então. Ligar uma carteira no
 * computador não chegava ao telemóvel. Com o carimbo, quem tem a gravação mais
 * recente manda; o outro dispositivo adota-a no próximo carregamento.
 */
export function marcarAlterado(base: string, accountId?: string): void {
  if (!hasWindow()) return;
  const id = accountId ?? getActiveAccountId();
  if (id === ALL_ACCOUNTS_ID) return;
  const mapa = lerCarimbos(id);
  mapa[base] = Date.now();
  try { window.localStorage.setItem(nsKey(id, SYNC_TS_BASE), JSON.stringify(mapa)); } catch { /* ignore */ }
}

/**
 * Grava uma chave da conta ativa SÓ se o conteúdo mudou, e carimba-a.
 *
 * O carimbo diz "este aparelho tem a versão mais recente desta chave". As
 * páginas gravavam ao abrir (com o que tinham acabado de ler, ou com o estado
 * inicial vazio), renovando o carimbo sem mudança nenhuma — e a partir daí a
 * versão da nuvem, gravada noutro aparelho, nunca mais era adotada (auditoria
 * 28 set 2026). Gravar "nada" onde não havia nada também não conta.
 * Devolve true se gravou.
 */
export function gravarSeMudou(base: string, raw: string): boolean {
  if (!hasWindow()) return false;
  const id = getActiveAccountId();
  if (id === ALL_ACCOUNTS_ID) return false;
  const chave = nsKey(id, base);
  const atual = window.localStorage.getItem(chave);
  if (atual === raw) return false;
  if (atual == null && !temConteudo(raw)) return false;
  window.localStorage.setItem(chave, raw);
  marcarAlterado(base, id);
  return true;
}

export function lerCarimbos(accountId: string): Record<string, number> {
  const raw = readNamespaced(accountId, SYNC_TS_BASE);
  if (!raw) return {};
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v === "number" && Number.isFinite(v))) as Record<string, number>;
  } catch { return {}; }
}

/** Decisão do merge para uma chave: adotar a versão da nuvem? (função pura, com teste) */
export function adotarNuvem(localExiste: boolean, tsLocal: number | undefined, tsNuvem: number | undefined): boolean {
  if (!localExiste) return true;                                  // só preenche o que falta
  if (!tsNuvem) return false;                                     // a nuvem não sabe quando foi gravada
  return tsNuvem > (tsLocal ?? 0);                                // a gravação mais recente manda
}
