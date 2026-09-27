// Leitor unico do blob de carteiras guardado em wallet_config.data — para a
// API REST, o MCP e o contador de "Uso & limites" lerem o MESMO formato que a
// app escreve (src/lib/portfolios/cloudSync.ts). Antes cada um procurava
// eth/sol/btc no topo do objeto, que no formato atual nao existe, e devolvia
// sempre vazio / "0 carteiras" (auditoria set 2026).
//
// Formatos aceites, do mais recente ao mais antigo:
//   v3   → { v: 3, registry: { accounts, activeId }, data: { [conta]: { "portfolio-wallets": rawJSON, … } } }
//   v2   → { v: 2, registry, wallets: { [conta]: WalletSnapshot } }
//   plano → WalletSnapshot (uma conta so, sem id)
//
// Sem base de dados nem segredos aqui: quem chama passa a funcao de mascarar.

const WALLETS_BASE = "portfolio-wallets";
export const WALLET_ARRAYS = ["eth", "sol", "btc", "ada", "other"] as const;
const ENTRY_FIELDS = ["address", "balance", "network", "label", "source"] as const;
const NUMBER_FIELDS = ["cexUsd", "defiUsd", "manualEur", "tokensUsd", "traditionalEur"] as const;

export type ContaCarteiras = {
  accountId: string;
  name: string | null;
  /** Snapshot tal como esta no blob (enderecos em claro — NUNCA sai da API assim). */
  snapshot: Record<string, unknown>;
};

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function nomesDoRegisto(blob: Record<string, unknown>): Map<string, string> {
  const out = new Map<string, string>();
  const reg = blob.registry;
  if (!isObj(reg) || !Array.isArray(reg.accounts)) return out;
  for (const a of reg.accounts) {
    if (isObj(a) && typeof a.id === "string" && typeof a.name === "string") out.set(a.id, a.name);
  }
  return out;
}

/** Contas e respetivos snapshots de carteiras, em claro. [] se o blob nao se entende. */
export function contasDoBlob(blob: unknown): ContaCarteiras[] {
  if (!isObj(blob)) return [];
  const nomes = nomesDoRegisto(blob);

  // v3: por conta, a chave "portfolio-wallets" e uma string JSON.
  if (blob.v === 3 && isObj(blob.data)) {
    const out: ContaCarteiras[] = [];
    for (const [accountId, porConta] of Object.entries(blob.data)) {
      if (!isObj(porConta)) continue;
      const raw = porConta[WALLETS_BASE];
      if (typeof raw !== "string") continue;
      try {
        const snap = JSON.parse(raw) as unknown;
        if (isObj(snap)) out.push({ accountId, name: nomes.get(accountId) ?? null, snapshot: snap });
      } catch { /* JSON estragado nesta conta: fica de fora, as outras continuam */ }
    }
    return out;
  }

  // v2: so carteiras, ja como objeto por conta.
  if (blob.v === 2 && isObj(blob.wallets)) {
    return Object.entries(blob.wallets)
      .filter((e): e is [string, Record<string, unknown>] => isObj(e[1]))
      .map(([accountId, snapshot]) => ({ accountId, name: nomes.get(accountId) ?? null, snapshot }));
  }

  // Plano: o proprio blob e o snapshot.
  const temAlgo = WALLET_ARRAYS.some((k) => Array.isArray(blob[k])) || NUMBER_FIELDS.some((k) => typeof blob[k] === "number");
  return temAlgo ? [{ accountId: "legacy", name: null, snapshot: blob }] : [];
}

/** Numero de carteiras on-chain (todas as cadeias, todas as contas). */
export function contarCarteiras(blob: unknown): number {
  let n = 0;
  for (const { snapshot } of contasDoBlob(blob)) {
    for (const k of WALLET_ARRAYS) {
      const arr = snapshot[k];
      if (Array.isArray(arr)) n += arr.length;
    }
  }
  return n;
}

/**
 * Lista branca de um snapshot: so os campos conhecidos saem, e os enderecos
 * saem sempre pela funcao `mask` (pseudonimo). Qualquer campo novo que venha a
 * ser guardado no blob NAO escapa por aqui.
 */
export function whitelistSnapshot(data: unknown, mask: (address: string) => string): Record<string, unknown> | null {
  if (!isObj(data)) return null;
  const out: Record<string, unknown> = {};
  for (const chain of WALLET_ARRAYS) {
    const arr = data[chain];
    if (!Array.isArray(arr)) continue;
    out[chain] = arr.map((raw) => {
      const entry = isObj(raw) ? raw : {};
      const picked: Record<string, unknown> = {};
      for (const field of ENTRY_FIELDS) {
        if (!(field in entry)) continue;
        picked[field] = field === "address" && typeof entry.address === "string"
          ? mask(entry.address)
          : entry[field];
      }
      return picked;
    });
  }
  for (const field of NUMBER_FIELDS) {
    if (typeof data[field] === "number") out[field] = data[field];
  }
  return out;
}

export type ContaMascarada = { accountId: string; name: string | null; wallets: Record<string, unknown> };

/** Contas do blob ja mascaradas/whitelist, prontas para a API. */
export function contasMascaradas(blob: unknown, mask: (address: string) => string): ContaMascarada[] {
  return contasDoBlob(blob)
    .map(({ accountId, name, snapshot }) => ({ accountId, name, wallets: whitelistSnapshot(snapshot, mask) ?? {} }));
}

/** Uniao de todas as contas (listas concatenadas, totais somados) — a vista "Todas". */
export function juntarContas(contas: ContaMascarada[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const { wallets } of contas) {
    for (const k of WALLET_ARRAYS) {
      const arr = wallets[k];
      if (Array.isArray(arr) && arr.length) out[k] = [...((out[k] as unknown[]) ?? []), ...arr];
    }
    for (const k of NUMBER_FIELDS) {
      const v = wallets[k];
      if (typeof v === "number") out[k] = ((out[k] as number | undefined) ?? 0) + v;
    }
  }
  return out;
}
