// Leitura de uma carteira Cardano pela Blockfrost — pela CONTA, não pelo endereço.
//
// PORQUÊ: uma carteira Cardano não é um endereço, é um molho deles. Cada
// transação pode criar um endereço novo, e todos partilham a mesma chave de
// stake. O Eternl entrega-nos UM endereço (o de troco). Ler só esse via
// /addresses/{addr} dava o saldo e os NFTs que calhavam de estar nele — quase
// sempre uma fracção, muitas vezes nada — e a pessoa via "0 NFTs" com a
// carteira cheia deles. Descoberto a 21 de setembro de 2026.
//
// O caminho certo: /addresses/{addr} devolve o `stake_address`; a partir daí
// /accounts/{stake} dá o saldo total e /accounts/{stake}/addresses/assets dá
// todos os ativos, de todos os endereços. Endereços sem stake (enterprise)
// continuam a ler-se um a um, que é tudo o que existe nesses.
const BASE = "https://cardano-mainnet.blockfrost.io/api/v0";

export type AtivoCardano = { unit: string; quantity: string };

export type CarteiraCardano = {
  /** Chave de stake resolvida, ou null para endereços sem stake. */
  stake: string | null;
  lovelace: string;
  /** Todos os ativos nativos (sem o lovelace), somados por unit. */
  ativos: AtivoCardano[];
};

class BlockfrostErro extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function pedir<T>(path: string, projectId: string, revalidate = 60): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    headers: { project_id: projectId },
    next: { revalidate },
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) {
    const corpo = (await r.json().catch(() => ({}))) as { message?: string };
    throw new BlockfrostErro(r.status, corpo.message ?? `Blockfrost ${r.status}`);
  }
  return (await r.json()) as T;
}

export const eNaoEncontrado = (e: unknown) => e instanceof BlockfrostErro && e.status === 404;
export const statusDoErro = (e: unknown) => (e instanceof BlockfrostErro ? e.status : null);

/** Lê a carteira inteira a partir de um endereço qualquer dela. */
export async function lerCarteiraCardano(address: string, projectId: string): Promise<CarteiraCardano> {
  const addr = address.trim();
  const info = await pedir<{ stake_address?: string | null; amount?: AtivoCardano[] }>(
    `/addresses/${encodeURIComponent(addr)}`, projectId,
  );
  const stake = info.stake_address ?? null;

  if (!stake) {
    const amount = info.amount ?? [];
    return {
      stake: null,
      lovelace: amount.find((a) => a.unit === "lovelace")?.quantity ?? "0",
      ativos: amount.filter((a) => a.unit !== "lovelace"),
    };
  }

  const conta = await pedir<{ controlled_amount?: string }>(`/accounts/${encodeURIComponent(stake)}`, projectId);

  // Paginado a 100; uma carteira com colecções grandes passa das 100 unidades.
  const porUnit = new Map<string, bigint>();
  for (let page = 1; page <= 50; page += 1) {
    const lote = await pedir<AtivoCardano[]>(
      `/accounts/${encodeURIComponent(stake)}/addresses/assets?count=100&page=${page}`, projectId, 120,
    );
    for (const a of lote) porUnit.set(a.unit, (porUnit.get(a.unit) ?? BigInt(0)) + BigInt(a.quantity));
    if (lote.length < 100) break;
  }

  return {
    stake,
    lovelace: conta.controlled_amount ?? "0",
    ativos: [...porUnit.entries()].map(([unit, q]) => ({ unit, quantity: q.toString() })),
  };
}
