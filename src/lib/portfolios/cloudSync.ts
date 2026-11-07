// Sync cloud multi-conta de TODOS os dados do portefólio (carteiras + ativos
// manuais: cripto, tradicional, stablecoins), via /api/wallet-sync (agnóstico
// ao formato do `data`).
//
// Blob v3:
//   { v: 3, registry: {accounts, activeId}, data: { [accountId]: { [baseKey]: rawString } } }
// Retrocompatível na leitura com:
//   v2  → { v:2, registry, wallets: { [id]: WalletSnapshot } }   (só carteiras)
//   antigo → WalletSnapshot "plano"                              (→ 1ª conta, carteiras)

import { SYNC_TS_BASE, adotarNuvem, lerCarimbos,
  NAMESPACED_BASE_KEYS,
  claimLocalData,
  getRegistry,
  juntarRegistoDaNuvem,
  readNamespaced,
  writeNamespaced,
  type Account,
} from "@/lib/portfolios/accounts";
import { getSupabase } from "@/lib/supabase/lazy";
import { TRADE_HISTORY_KEY, mergeTradeRaw } from "@/lib/portfolios/trades";
import { enviarDepoisDeLer, leituraValida, type UltimaLeitura } from "@/lib/portfolios/guardaNuvem";

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

// Envios adiados por a leitura ter falhado: a nova tentativa fica por aqui. Se
// nenhuma resultar, os dados continuam neste browser e seguem no próximo envio.
const ESPERAS_MS = [30_000, 120_000, 600_000];
let tentativas = 0;
let novaTentativa: ReturnType<typeof setTimeout> | null = null;

function agendarNovoEnvio() {
  if (novaTentativa || tentativas >= ESPERAS_MS.length) return;
  novaTentativa = setTimeout(() => {
    novaTentativa = null;
    void pushWalletCloud();
  }, ESPERAS_MS[tentativas++]);
}

/** Envia TODAS as contas (carteiras + ativos manuais) para a nuvem. Seguro na
 *  vista "Todas" — lê os dados reais por conta, nunca o agregado.
 *  Sem sessão não faz nada; com sessão, reclama primeiro os dados locais para
 *  nunca enviar dados de outro utilizador deste dispositivo (o blob é
 *  construído DEPOIS da limpeza, se ela ocorrer).
 *  Lê sempre a nuvem antes (ver guardaNuvem.ts): o blob substitui tudo o que lá
 *  está, e este browser pode ter só uma parte. */
export async function pushWalletCloud(): Promise<void> {
  try {
    const supabase = await getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    claimLocalData(user.id);
    const resultado = await enviarDepoisDeLer({
      leituraValida: leituraValida(ultimaLeitura, user.id, Date.now()),
      ler: lerNuvemAgora,
      enviar: () => fetch("/api/wallet-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: buildBlob(), leuNuvem: true }),
      }),
    });
    if (resultado === "adiado") agendarNovoEnvio();
    else tentativas = 0;
  } catch {
    // ignore
  }
}

// A última leitura da nuvem RESPONDEU (com ou sem dados)? `pullWalletCloud`
// devolve false tanto quando falha como quando não há nada para trazer; quem
// precisa de distinguir (o exemplo automático das contas novas não pode entrar
// numa conta com carteiras noutro aparelho) lê isto.
let ultimaLeituraOk = false;
export const leituraDaNuvemOk = (): boolean => ultimaLeituraOk;

let ultimaLeitura: UltimaLeitura = null;
let leitor: string | null = null;
let leituraEmCurso: Promise<boolean> | null = null;

/** Lê a nuvem agora e diz se a leitura respondeu (com ou sem dados). */
export async function lerNuvemAgora(): Promise<boolean> {
  await pullWalletCloud();
  return ultimaLeituraOk;
}

/** Restaura da nuvem (contas + carteiras + ativos manuais). true se restaurou.
 *  Pedidos ao mesmo tempo partilham a mesma leitura. */
export function pullWalletCloud(): Promise<boolean> {
  leituraEmCurso ??= lerDaNuvem().then((restaurou) => {
    if (ultimaLeituraOk && leitor) ultimaLeitura = { userId: leitor, em: Date.now() };
    return restaurou;
  }).finally(() => { leituraEmCurso = null; });
  return leituraEmCurso;
}

async function lerDaNuvem(): Promise<boolean> {
  ultimaLeituraOk = false;
  leitor = null;
  try {
    const supabase = await getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    leitor = user.id;
    // Se o dispositivo tiver dados de outro utilizador, limpa antes de fundir.
    claimLocalData(user.id);
    const res = await fetch("/api/wallet-sync");
    // A conta ganhou 2FA noutro aparelho: esta sessão tem de passar pelo código.
    if (res.status === 403) { window.location.href = "/login"; return false; }
    if (!res.ok) return false;
    const json = (await res.json()) as { data?: unknown };
    ultimaLeituraOk = true;
    const data = json?.data as
      | (Record<string, unknown> & { v?: number })
      | null;
    if (!data) return false;

    // v3 — todos os dados por conta
    if (data.v === 3 && data.registry && data.data) {
      const byAcc = data.data as Record<string, Record<string, string>>;
      // União do registo (nunca remove contas com dados), sem contas-fantasma:
      // a "Conta 1" vazia que um aparelho novo cria antes de a nuvem responder.
      const fora = new Set(juntarRegistoDaNuvem(data.registry as { accounts: Account[]; activeId: string }, byAcc));
      for (const [id, perAcc] of Object.entries(byAcc)) {
        if (fora.has(id)) continue;
        // Carimbos: o da nuvem diz quando cada chave foi gravada no outro
        // dispositivo; o local diz quando foi gravada aqui. Funde-se pelo máximo.
        const tsLocal = lerCarimbos(id);
        let tsNuvem: Record<string, number> = {};
        try { tsNuvem = perAcc[SYNC_TS_BASE] ? (JSON.parse(perAcc[SYNC_TS_BASE]) as Record<string, number>) : {}; } catch { tsNuvem = {}; }
        const tsFinal: Record<string, number> = { ...tsLocal };
        for (const [base, raw] of Object.entries(perAcc)) {
          if (typeof raw !== "string" || base === SYNC_TS_BASE) continue;
          const local = readNamespaced(id, base);
          if (base === TRADE_HISTORY_KEY) {
            // Histórico de trades: merge por id (updatedAt + lápides), para não
            // perder trades feitos noutro dispositivo nem ressuscitar apagados.
            if (local == null) writeNamespaced(id, base, raw);
            else { const merged = mergeTradeRaw(local, raw); if (merged !== local) writeNamespaced(id, base, merged); }
            continue;
          }
          // Antes: só preenchia o que faltava, nunca sobrescrevia — e um telemóvel
          // que já tinha visitado o site ficava para sempre com as carteiras de
          // então. Agora a gravação mais recente manda (ver adotarNuvem).
          if (adotarNuvem(local != null, tsLocal[base], tsNuvem[base])) {
            writeNamespaced(id, base, raw);
            if (tsNuvem[base]) tsFinal[base] = Math.max(tsFinal[base] ?? 0, tsNuvem[base]);
          }
        }
        for (const [base, t] of Object.entries(tsNuvem)) tsFinal[base] = Math.max(tsFinal[base] ?? 0, t);
        writeNamespaced(id, SYNC_TS_BASE, JSON.stringify(tsFinal));
      }
      return true;
    }

    // v2 — só carteiras por conta
    if (data.v === 2 && data.registry && data.wallets) {
      const wallets = data.wallets as Record<string, unknown>;
      const dadosV2 = Object.fromEntries(Object.entries(wallets).map(([id, snap]) => [id, { [WALLET_BASE]: JSON.stringify(snap) }]));
      const fora = new Set(juntarRegistoDaNuvem(data.registry as { accounts: Account[]; activeId: string }, dadosV2));
      for (const [id, snap] of Object.entries(wallets)) {
        if (fora.has(id)) continue;
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
    // Falhou a meio da fusão: não conta como lida.
    ultimaLeituraOk = false;
    return false;
  }
}
