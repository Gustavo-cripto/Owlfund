"use client";

// Resumo COMPLETO da conta ativa para o Block (Gestor Dedicado IA, Premium).
//
// O Chain recebe só os totais por categoria (summaryText.ts). O Block tem de
// responder a tudo: carteira a carteira, tokens, exchanges, posições DeFi
// (abertas/fechadas, pares), NFTs, cripto manual por carteira, stablecoins,
// tradicional, transações registadas e mais-valias FIFO, movimentos recentes
// do histórico de carteiras e o plano FIRE. Tudo isto vive no browser
// (localStorage por conta), por isso é o cliente que o monta e envia.
//
// Regra da casa: NUNCA sai um endereço — só o nome/etiqueta da carteira.

import { buildPortfolioSummary } from "@/lib/portfolio/summaryText";
import { loadWalletSnapshot, type StoredWalletEntry } from "@/lib/wallets/storage";
import { loadCryptoHoldings, loadStablecoinEntries, linhasManuais } from "@/lib/crypto/storage";
import { loadTraditionalHoldings } from "@/lib/traditional/storage";
import { lerEventos, lerFoto, type Evento } from "@/lib/wallets/historico";
import { computeFifo, loadTrades } from "@/lib/portfolios/trades";
import { ALL_ACCOUNTS_ID, getActiveAccountId, listAccounts } from "@/lib/portfolios/accounts";

export type ResumoBlock = { texto: string | null; totalEur: number; vazio: boolean; simbolos: string[] };

const LIMITE = 16_000;

const n = (v: number, dec = 2) => v.toLocaleString("pt-PT", { minimumFractionDigits: dec, maximumFractionDigits: dec });
const q = (v: number) => v.toLocaleString("pt-PT", { maximumFractionDigits: 8 });
const data = (ms: number | string, locale: string) => new Date(ms).toLocaleDateString(locale);

// Nomes dados pelo utilizador ou por terceiros (etiquetas, tokens, NFTs,
// exchanges) vão ao prompt como DADOS: sem quebras de linha nem caracteres de
// controlo, sem "==" (a marca de secção é "===") e curtos, para que um nome
// malicioso não se consiga fazer passar por instrução ou por secção nova.
export const limpo = (s: unknown, max = 60): string =>
  String(s ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/={2,}/g, "=").replace(/\s+/g, " ").trim().slice(0, max);

// Nome que o modelo pode ver: etiqueta da carteira, senão "Carteira N (rede)".
const nomeCarteira = (e: StoredWalletEntry, i: number) =>
  (e.label?.trim() || `Carteira ${i + 1}`) + (e.source === "cold" ? " (fria)" : "");

function carteirasOnChain(locale: string): string[] {
  const snap = loadWalletSnapshot();
  const foto = lerFoto();
  const out: string[] = [];
  const grupos: Array<[string, string, StoredWalletEntry[] | undefined]> = [
    ["Ethereum e redes EVM", "ETH", snap.eth], ["Solana", "SOL", snap.sol], ["Bitcoin", "BTC", snap.btc],
    ["Cardano", "ADA", snap.ada], ["Outras redes", "", snap.other],
  ];
  for (const [rotulo, sim, lista] of grupos) {
    if (!lista?.length) continue;
    out.push(`${rotulo} (${lista.length} carteira${lista.length > 1 ? "s" : ""}):`);
    lista.forEach((e, i) => {
      const nome = nomeCarteira(e, i);
      const saldo = e.balance != null && e.balance !== "" ? `${q(Number(e.balance) || 0)} ${sim || e.network || ""}`.trim() : "saldo não lido";
      const rede = e.network && e.network !== sim.toLowerCase() ? ` · rede ${e.network}` : "";
      out.push(`  - ${limpo(nome)}: ${saldo}${rede}`);
      // Tokens da carteira (da última fotografia do histórico), top 12 por nome.
      const tok = foto?.tokens ? Object.values(foto.tokens).find((t) => t.nome === nome || t.nome.startsWith(nome)) : null;
      if (tok?.saldos) {
        const lista = Object.entries(tok.saldos).filter(([, v]) => v > 0).slice(0, 12).map(([s, v]) => `${q(v)} ${limpo(s, 16)}`);
        if (lista.length) out.push(`      tokens: ${lista.join(", ")}`);
      }
    });
  }
  if (typeof snap.tokensUsd === "number" && snap.tokensUsd > 0) out.push(`Tokens nas carteiras (sem o nativo): $${n(snap.tokensUsd)} USD`);
  void locale;
  return out;
}

function exchangesECorretoras(): string[] {
  const foto = lerFoto();
  const snap = loadWalletSnapshot();
  const out: string[] = [];
  const grupo = (titulo: string, g: Record<string, { nome: string; saldos: Record<string, number> | null }> | null | undefined) => {
    if (!g) return;
    for (const x of Object.values(g)) {
      const saldos = x.saldos ? Object.entries(x.saldos).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 15) : [];
      out.push(`  - ${titulo} ${limpo(x.nome)}: ${saldos.length ? saldos.map(([s, v]) => `${q(v)} ${limpo(s, 16)}`).join(", ") : x.saldos ? "sem saldo" : "saldo ainda não lido"}`);
    }
  };
  grupo("Exchange", foto?.exchanges);
  grupo("Corretora", foto?.corretoras);
  if (typeof snap.cexUsd === "number" && snap.cexUsd > 0) out.push(`Total em exchanges (API): $${n(snap.cexUsd)} USD`);
  return out;
}

function posicoesDefi(locale: string): string[] {
  const snap = loadWalletSnapshot();
  const out: string[] = [];
  const porCarteira = snap.defiPosicoes ?? {};
  let i = 0;
  for (const posicoes of Object.values(porCarteira)) {
    i++;
    for (const p of posicoes) {
      const partes = [
        limpo(p.protocolo ?? p.name), p.rede ? `rede ${limpo(p.rede, 24)}` : null, p.tipo ?? null,
        p.estado ?? null, p.par?.length ? `par ${limpo(p.par.join("/"), 40)}` : null,
        `$${n(p.usd)}${p.valorEstimado ? " (estimado)" : ""}`,
        p.taxaPool != null ? `taxa ${p.taxaPool} %` : null,
        p.noIntervalo === true ? "no intervalo" : p.noIntervalo === false ? "FORA do intervalo" : null,
        p.intervalo ? `intervalo ${q(p.intervalo.min)}–${q(p.intervalo.max)}${p.intervalo.atual != null ? ` (atual ${q(p.intervalo.atual)})` : ""}` : null,
        p.quantidades?.length ? p.quantidades.map((x) => `${q(x.qtd)} ${limpo(x.simbolo, 16)}`).join(" + ") : null,
        p.taxasPorReclamar?.length ? `taxas por reclamar ${p.taxasPorReclamar.map((x) => `${q(x.qtd)} ${limpo(x.simbolo, 16)}`).join(" + ")}` : null,
        p.depositadoUsd != null ? `depositado $${n(p.depositadoUsd)}` : null,
        p.emprestadoUsd != null ? `emprestado $${n(p.emprestadoUsd)}` : null,
        p.fatorSaude != null ? `fator de saúde ${n(p.fatorSaude)}` : null,
      ].filter(Boolean);
      out.push(`  - [carteira ${i}] ${partes.join(" · ")}`);
    }
  }
  if (snap.defiPosicoesEm) out.push(`Posições lidas em ${data(snap.defiPosicoesEm, locale)}.`);
  if (typeof snap.defiUsd === "number" && snap.defiUsd > 0) out.push(`Total DeFi: $${n(snap.defiUsd)} USD`);
  return out;
}

function nfts(): string[] {
  const foto = lerFoto();
  if (!foto?.nfts) return [];
  return Object.values(foto.nfts).map((x) => {
    const nomes = x.ids ? Object.values(x.ids).slice(0, 8).map((n) => limpo(n, 40)) : [];
    return `  - ${limpo(x.nome)}: ${x.total ?? "?"} NFT${x.total === 1 ? "" : "s"}${nomes.length ? ` (${nomes.join(", ")}${(x.total ?? 0) > nomes.length ? ", …" : ""})` : ""}`;
  });
}

function criptoManual(locale: string): string[] {
  const out: string[] = [];
  for (const [sym, h] of Object.entries(loadCryptoHoldings())) {
    const linhas = linhasManuais(h);
    if (!linhas.length) continue;
    out.push(`  - ${limpo(sym, 16)}: ` + linhas.map((l) => [
      limpo(l.nome) || "carteira sem nome",
      l.quantity ? `${q(l.quantity)} moedas` : null,
      l.buyValue ? `investido € ${n(l.buyValue)}` : null,
      l.buyDate ? `comprado em ${data(l.buyDate, locale)}` : null,
    ].filter(Boolean).join(", ")).join(" | "));
  }
  return out;
}

function stablecoins(): string[] {
  return loadStablecoinEntries().map((e) => `  - ${limpo(e.symbol, 16)} em ${limpo(e.network, 24)}: ${e.balance ? q(Number(e.balance) || 0) : "saldo não lido"}`);
}

function tradicional(locale: string): string[] {
  return Object.entries(loadTraditionalHoldings()).map(([sym, h]) => `  - ${sym}: ${[
    h.quantity ? `${q(h.quantity)} unidades` : null,
    h.buyValue ? `investido € ${n(h.buyValue)}` : null,
    h.buyDate ? `desde ${data(h.buyDate, locale)}` : null,
  ].filter(Boolean).join(", ") || "sem dados"}`);
}

function transacoes(locale: string): string[] {
  const trades = loadTrades().filter((t) => !t.deleted);
  if (!trades.length) return [];
  const out: string[] = [`Total registado: ${trades.length} transações.`];
  const fifo = computeFifo(trades);
  const anoAtual = new Date().getFullYear();
  const porAno = new Map<number, { ganho: number; vendas: number }>();
  for (const l of fifo.lots) {
    const ano = new Date(l.sellDate).getUTCFullYear();
    const a = porAno.get(ano) ?? { ganho: 0, vendas: 0 };
    a.ganho += l.gain; a.vendas += 1; porAno.set(ano, a);
  }
  out.push(`Mais-valias realizadas (FIFO, em EUR): ${[...porAno.entries()].sort((a, b) => b[0] - a[0]).slice(0, 4).map(([ano, a]) => `${ano}: ${a.ganho >= 0 ? "+" : "−"}€ ${n(Math.abs(a.ganho))} em ${a.vendas} venda${a.vendas > 1 ? "s" : ""}${ano === anoAtual ? " (ano corrente)" : ""}`).join(" · ") || "sem vendas emparelhadas"}. Total: ${fifo.realizedPnl >= 0 ? "+" : "−"}€ ${n(Math.abs(fifo.realizedPnl))}.`);
  const semCompra = Object.entries(fifo.unmatched).filter(([, v]) => v > 0);
  if (semCompra.length) out.push(`Vendas sem compra registada (o FIFO não as emparelha): ${semCompra.map(([a, v]) => `${q(v)} ${a}`).join(", ")}.`);
  const porAtivo = Object.entries(fifo.byAsset).filter(([, a]) => a.qtyNet > 0 || a.realizedPnl !== 0).slice(0, 20);
  if (porAtivo.length) out.push("Por ativo: " + porAtivo.map(([sym, a]) => `${sym} posição aberta ${q(a.qtyNet)} (custo € ${n(a.costOpen)}), realizado ${a.realizedPnl >= 0 ? "+" : "−"}€ ${n(Math.abs(a.realizedPnl))}`).join(" · "));
  const recentes = [...trades].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 15);
  out.push("Últimas transações: " + recentes.map((t) => `${data(t.date, locale)} ${t.type} ${q(t.quantity)} ${t.asset} a € ${n(t.priceEur)}${t.exchange ? ` (${t.exchange})` : ""}`).join("; "));
  return out;
}

const TIPO_EVENTO: Record<Evento["tipo"], string> = {
  inicio: "início do histórico",
  carteira_adicionada: "carteira adicionada", carteira_removida: "carteira removida", saldo: "saldo alterado",
  token_entrou: "token entrou", token_saiu: "token saiu", token_saldo: "saldo de token alterado",
  exchange_ligada: "exchange ligada", exchange_removida: "exchange removida", exchange_ativo_entrou: "ativo entrou na exchange",
  exchange_ativo_saiu: "ativo saiu da exchange", exchange_saldo: "saldo na exchange alterado",
  manual_adicionado: "registo manual adicionado", manual_removido: "registo manual removido", manual_alterado: "registo manual alterado",
  defi_aberta: "posição DeFi aberta", defi_fechada: "posição DeFi fechada", defi_removida: "posição DeFi removida",
  nft_entrou: "NFT entrou", nft_saiu: "NFT saiu",
};

function movimentos(locale: string): string[] {
  const eventos = lerEventos().slice(0, 30);
  if (!eventos.length) return [];
  return eventos.map((e) => {
    const valores = e.antes != null || e.depois != null ? ` ${e.antes == null ? "—" : q(e.antes)} → ${e.depois == null ? "—" : q(e.depois)}${e.simbolo ? ` ${limpo(e.simbolo, 16)}` : ""}` : e.simbolo ? ` ${limpo(e.simbolo, 16)}` : "";
    const nomes = e.nomes?.length ? ` (${e.nomes.map((n) => limpo(n, 40)).join(", ")}${e.quantos && e.quantos > e.nomes.length ? ` +${e.quantos - e.nomes.length}` : ""})` : "";
    return `  - ${new Date(e.em).toLocaleString(locale)}: ${TIPO_EVENTO[e.tipo] ?? e.tipo}${e.alvo ? ` · ${limpo(e.alvo)}` : ""}${valores}${nomes}`;
  });
}

type PlanoFire = { exp?: number; inv?: number; ret?: number; inf?: number; age?: number; pv?: string; mult?: number; cur?: string };
function planoFire(userId: string): string[] {
  try {
    const raw = localStorage.getItem(`fire-plan-v1:${userId}`);
    if (!raw) return [];
    const g = JSON.parse(raw) as PlanoFire;
    const cur = g.cur ?? "EUR";
    const out: string[] = [];
    if (g.exp != null) out.push(`Despesas mensais: ${n(g.exp)} ${cur}`);
    if (g.inv != null) out.push(`Investimento mensal: ${n(g.inv)} ${cur}`);
    if (g.ret != null) out.push(`Retorno anual esperado: ${g.ret} %`);
    if (g.inf != null) out.push(`Inflação: ${g.inf} %`);
    if (g.age != null) out.push(`Idade atual: ${g.age}`);
    if (g.mult != null) out.push(`Múltiplo FIRE: ${g.mult}× despesas anuais (regra dos ${g.mult ? n(100 / g.mult, 1) : "4"} %)`);
    if (g.pv) out.push(`Património de partida indicado pelo utilizador: ${g.pv} ${cur}`);
    if (g.exp != null && g.mult != null) out.push(`Número FIRE (despesas × 12 × múltiplo): ${n(g.exp * 12 * g.mult, 0)} ${cur}`);
    return out.length ? out.map((l) => `  - ${l}`) : [];
  } catch { return []; }
}

/** Símbolos que o utilizador detém (on-chain, exchanges, DeFi, manuais, tradicionais), para o "mercado agora". */
function simbolosDetidos(): string[] {
  const out = new Set<string>();
  try {
    const snap = loadWalletSnapshot();
    if (snap.btc?.length) out.add("BTC");
    if (snap.eth?.length) out.add("ETH");
    if (snap.sol?.length) out.add("SOL");
    if (snap.ada?.length) out.add("ADA");
    for (const posicoes of Object.values(snap.defiPosicoes ?? {})) for (const p of posicoes) for (const s of p.par ?? []) out.add(s);
    const foto = lerFoto();
    for (const g of [foto?.exchanges, foto?.corretoras]) for (const x of Object.values(g ?? {})) for (const s of Object.keys(x.saldos ?? {})) out.add(s);
    for (const t of Object.values(foto?.tokens ?? {})) for (const s of Object.keys(t.saldos ?? {})) out.add(s);
    for (const s of Object.keys(loadCryptoHoldings())) out.add(s);
  } catch { /* o que houver */ }
  return [...out].map((s) => s.toUpperCase()).slice(0, 30);
}

/** Monta o resumo completo da conta ativa. Nunca lança: cada secção falha sozinha. */
export async function resumoCompletoBlock(userId: string, locale = "pt-PT"): Promise<ResumoBlock> {
  if (typeof window === "undefined") return { texto: null, totalEur: 0, vazio: true, simbolos: [] };
  const base = await buildPortfolioSummary();
  const seccao = (titulo: string, f: () => string[]) => {
    try { const l = f(); return l.length ? [`=== ${titulo} ===`, ...l, ""] : []; } catch { return []; }
  };
  const acctId = getActiveAccountId();
  const nome = acctId === ALL_ACCOUNTS_ID ? "Todas as contas" : limpo(listAccounts().find((a) => a.id === acctId)?.name ?? "");
  const partes: string[] = [];
  if (base.text) partes.push(`=== PORTEFÓLIO${nome ? ` (conta "${nome}")` : ""} — totais por categoria ===`, base.text, "");
  partes.push(
    ...seccao("CARTEIRAS ON-CHAIN (nomes/etiquetas, nunca endereços)", () => carteirasOnChain(locale)),
    ...seccao("EXCHANGES E CORRETORAS", exchangesECorretoras),
    ...seccao("POSIÇÕES DEFI (abertas e fechadas, com pares)", () => posicoesDefi(locale)),
    ...seccao("NFTs", nfts),
    ...seccao("CRIPTO REGISTADA MANUALMENTE (por carteira)", () => criptoManual(locale)),
    ...seccao("STABLECOINS (endereços vigiados)", stablecoins),
    ...seccao("MERCADO TRADICIONAL", () => tradicional(locale)),
    ...seccao("TRANSAÇÕES REGISTADAS E MAIS-VALIAS (conta ativa)", () => transacoes(locale)),
    ...seccao("MOVIMENTOS RECENTES (histórico de carteiras, últimos 30)", () => movimentos(locale)),
    ...seccao("PLANO FIRE (parâmetros guardados pelo utilizador)", () => planoFire(userId)),
  );
  if (acctId === ALL_ACCOUNTS_ID) partes.push("NOTA: vista \"Todas as contas\" — o histórico de movimentos e as posições DeFi são por conta; troca de conta para o detalhe.");
  const vazio = partes.length === 0 && base.totalEur <= 0;
  let texto = partes.join("\n").trim();
  if (texto.length > LIMITE) texto = texto.slice(0, LIMITE) + "\n[… resumo truncado por tamanho]";
  return { texto: texto || null, totalEur: base.totalEur, vazio, simbolos: simbolosDetidos() };
}
