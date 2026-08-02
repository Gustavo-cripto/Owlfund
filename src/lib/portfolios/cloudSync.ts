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
  claimLocalData,
  getRegistry,
  mergeRegistry,
  readNamespaced,
  writeNamespaced,
  type Account,
} from "@/lib/portfolios/accounts";
import { createClient } from "@/lib/supabase/client";

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
 *  vista "Todas" — lê os dados reais por conta, nunca o agregado.
 *  Sem sessão não faz nada; com sessão, reclama primeiro os dados locais para
 *  nunca enviar dados de outro utilizador deste dispositivo (o blob é
 *  construído DEPOIS da limpeza, se ela ocorrer). */
export function pushWalletCloud() {
  try {
    const supabase = createClient();
    supabase.auth
      .getUser()
      .then(({ data: { user } }: { data: { user: { id: string } | null } }) => {
        if (!user) return;
        claimLocalData(user.id);
        const blob = buildBlob();
        return fetch("/api/wallet-sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: blob }),
        });
      })
      .catch(() => {});
  } catch {
    // ignore
  }
}

/** Restaura da nuvem (contas + carteiras + ativos manuais). true se restaurou. */
export async function pullWalletCloud(): Promise<boolean> {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    // Se o dispositivo tiver dados de outro utilizador, limpa antes de fundir.
    claimLocalData(user.id);
    const res = await fetch("/api/wallet-sync");
    if (!res.ok) return false;
    const json = (await res.json()) as { data?: unknown };
    const data = json?.data as
      | (Record<string, unknown> & { v?: number })
      | null;
    if (!data) return false;

    // v3 — todos os dados por conta
    if (data.v === 3 && data.registry && data.data) {
      // União do registo (nunca remove contas locais).
      mergeRegistry(data.registry as { accounts: Account[]; activeId: string });
      const byAcc = data.data as Record<string, Record<string, string>>;
      for (const [id, perAcc] of Object.entries(byAcc)) {
        for (const [base, raw] of Object.entries(perAcc)) {
          // Só preenche o que falta localmente — nunca sobrescreve edições locais.
          if (typeof raw === "string" && readNamespaced(id, base) == null) {
            writeNamespaced(id, base, raw);
          }
        }
      }
      return true;
    }

    // v2 — só carteiras por conta
    if (data.v === 2 && data.registry && data.wallets) {
      mergeRegistry(data.registry as { accounts: Account[]; activeId: string });
      const wallets = data.wallets as Record<string, unknown>;
      for (const [id, snap] of Object.entries(wallets)) {
        if (readNamespaced(id, WALLET_BASE) == null) {
          writeNamespaced(id, WALLET_BASE, JSON.stringify(snap));
        }
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
