// Sync cloud multi-conta de TODOS os dados do portfólio (carteiras + ativos
// manuais: cripto, tradicional, stablecoins), via /api/wallet-sync (agnóstico
// ao formato do `data`).
//
// Blob v3:
//   { v: 3, registry: {accounts, activeId}, data: { [accountId]: { [baseKey]: rawString } } }
// Retrocompatível na leitura com:
//   v2  → { v:2, registry, wallets: { [id]: WalletSnapshot } }   (só carteiras)
//   antigo → WalletSnapshot "plano"                              (→ 1ª conta, carteiras)

import {
  NAMESPACED_BASE_KEYS,
  getRegistry,
  readNamespaced,
  replaceRegistry,
  writeNamespaced,
  type Account,
} from "@/lib/portfolios/accounts";

const WALLET_BASE = "portfolio-wallets";

type CloudBlobV3 = {
  v: 3;
  registry: { accounts: Account[]; activeId: string };
  data: Record<string, Record<string, string>>; // accountId -> baseKey -> raw
};

function buildBlob(): CloudBlobV3 {
  const registry = getRegistry();
  const data: Record<string, Record<string, string>> = {};
  for (const acc of registry.accounts) {
    const perAcc: Record<string, string> = {};
    for (const base of NAMESPACED_BASE_KEYS) {
      const raw = readNamespaced(acc.id, base);
      if (raw != null) perAcc[base] = raw;
    }
    if (Object.keys(perAcc).length > 0) data[acc.id] = perAcc;
  }
  return { v: 3, registry, data };
}

/** Envia TODAS as contas (carteiras + ativos manuais) para a nuvem. Seguro na
 *  vista "Todas" — lê os dados reais por conta, nunca o agregado. */
export function pushWalletCloud() {
  try {
    const blob = buildBlob();
    fetch("/api/wallet-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: blob }),
    }).catch(() => {});
  } catch {
    // ignore
  }
}

/** Restaura da nuvem (contas + carteiras + ativos manuais). true se restaurou. */
export async function pullWalletCloud(): Promise<boolean> {
  try {
    const res = await fetch("/api/wallet-sync");
    if (!res.ok) return false;
    const json = (await res.json()) as { data?: unknown };
    const data = json?.data as
      | (Record<string, unknown> & { v?: number })
      | null;
    if (!data) return false;

    // v3 — todos os dados por conta
    if (data.v === 3 && data.registry && data.data) {
      replaceRegistry(data.registry as { accounts: Account[]; activeId: string });
      const byAcc = data.data as Record<string, Record<string, string>>;
      for (const [id, perAcc] of Object.entries(byAcc)) {
        for (const [base, raw] of Object.entries(perAcc)) {
          if (typeof raw === "string") writeNamespaced(id, base, raw);
        }
      }
      return true;
    }

    // v2 — só carteiras por conta
    if (data.v === 2 && data.registry && data.wallets) {
      replaceRegistry(data.registry as { accounts: Account[]; activeId: string });
      const wallets = data.wallets as Record<string, unknown>;
      for (const [id, snap] of Object.entries(wallets)) {
        writeNamespaced(id, WALLET_BASE, JSON.stringify(snap));
      }
      return true;
    }

    // Antigo — WalletSnapshot "plano" → carteiras da 1ª conta
    const flat = data as { eth?: unknown; sol?: unknown; btc?: unknown; ada?: unknown; other?: unknown };
    if (flat.eth || flat.sol || flat.btc || flat.ada || flat.other) {
      const reg = getRegistry();
      const primary = reg.accounts[0]?.id;
      if (primary) {
        writeNamespaced(primary, WALLET_BASE, JSON.stringify(data));
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}
