import type { CostMethod } from "./countries";

// Motor dos métodos de custo de aquisição (30 set 2026).
//
// Até aqui a app aplicava FIFO a todos os países. A verificação dos 21 regimes
// mostrou que 8 exigem outro método (preço médio, LIFO, pool britânico, soma
// anual polaca). Este módulo é a única implementação: o histórico
// (computeFifo), a página de Fiscalidade e a API chamam-no com o método do
// país. Puro, sem React nem câmbios: quem chama já converteu os valores para a
// moeda do relatório e ordenou as operações por data.
//
// Cada venda produz um ou mais "lotes realizados" (compra emparelhada com a
// venda). Nos métodos de custo médio o lote tem o preço médio, mas conserva a
// data de compra pela ordem FIFO: é o que permite ao Luxemburgo (preço médio E
// prazo de 6 meses por unidade) classificar cada parte da venda.

export type Operacao = {
  type: "compra" | "venda" | "taxa";
  asset: string;
  amount: number;
  /** Preço unitário, já na moeda do relatório e à taxa da data. */
  price: number;
  /** Taxa da operação, na mesma moeda (0 se não houver). */
  fee: number;
  /** Taxa paga em token: sai do saldo desse token, sem ganho. */
  feeAsset?: string;
  feeQty?: number;
  date: string; // YYYY-MM-DD
  /**
   * As duas pernas de uma troca cripto↔cripto (venda de uma moeda, compra de
   * outra) partilham este id. Nos países onde a troca não é tributada (PT, AT,
   * PL) a venda não realiza ganho e o custo passa para a moeda recebida.
   */
  swapId?: string;
};

export type OpcoesRealizar = {
  /** Troca cripto↔cripto neutra: sem ganho, custo transita (PT art. 10.º n.º 23; AT; PL). */
  permutaNeutra?: boolean;
};

export type LoteRealizado = {
  asset: string;
  buyDate: string;
  sellDate: string;
  buyPrice: number;
  sellPrice: number;
  amount: number;
  buyFees: number;
  sellFees: number;
  fees: number;
  gain: number;
  /**
   * Nos métodos de custo médio a taxa de compra já está dentro de `buyPrice`
   * (e `buyFees` é 0, para não contar duas vezes). Fica aqui a parte
   * proporcional que entrou na média, só para o total "taxas deduzidas".
   */
  feesNoPreco: number;
  /** Índice da operação de venda em `ops` (para agrupar por venda). */
  venda: number;
};

export type LoteAberto = { amount: number; price: number; feePerUnit: number; date: string };

export type Resultado = {
  lotes: LoteRealizado[];
  /** Vendas sem compra registada (quantidade), por ativo. */
  unmatched: Record<string, number>;
  /** Lotes ainda por vender, por ativo, com o custo que o método lhes dá. */
  abertos: Record<string, LoteAberto[]>;
};

const EPS = 1e-12;
const DIA_MS = 86_400_000;
const dias = (de: string, ate: string): number => Math.round((Date.parse(ate) - Date.parse(de)) / DIA_MS);

/** Família de cada método: decide o algoritmo. */
export function familia(m: CostMethod): "fifo" | "lifo" | "media" | "pool" | "fifo_4w" {
  switch (m) {
    case "lifo": return "lifo";
    case "wavg": case "wavg_global": case "acb": case "avg_moving": return "media";
    case "pool": return "pool";
    case "fifo_4w": return "fifo_4w";
    default: return "fifo"; // fifo, fifo_wallet, spec_id, annual (lotes FIFO, base anual à parte), none
  }
}

/**
 * Empareilha as vendas com as compras pelo método pedido.
 * As operações têm de vir por ordem cronológica (compra antes de venda no mesmo dia).
 */
export function realizar(ops: readonly Operacao[], metodo: CostMethod, opcoes: OpcoesRealizar = {}): Resultado {
  const fam = familia(metodo);
  // Nas trocas neutras a venda tem de vir antes da compra da mesma troca (a
  // ordem cronológica põe as compras primeiro no mesmo dia): é ela que diz
  // que custo passa para a moeda recebida. Índices originais preservados.
  const ordem = ops.map((op, idx) => ({ op, idx }));
  if (opcoes.permutaNeutra) {
    for (let i = 0; i < ordem.length; i++) {
      const o = ordem[i].op;
      if (o.type !== "compra" || !o.swapId) continue;
      const j = ordem.findIndex((x, k) => k > i && x.op.swapId === o.swapId && x.op.type === "venda");
      if (j > i) { const [v] = ordem.splice(j, 1); ordem.splice(i, 0, v); i++; }
    }
  }
  const custoTroca = new Map<string, number>();
  const pool: Record<string, LoteAberto[]> = {};
  const lotes: LoteRealizado[] = [];
  const unmatched: Record<string, number> = {};
  const tira = (asset: string, qty: number) => { unmatched[asset] = (unmatched[asset] ?? 0) + qty; };

  // Pool britânico: as compras do mesmo dia e dos 30 dias seguintes a uma venda
  // emparelham com essa venda ANTES do pool médio. Pré-reserva-se quanto de cada
  // compra fica para essas vendas, para não entrar no pool.
  const reservas = fam === "pool" ? reservarPool(ops) : null;

  // Custo médio por ativo (métodos de média e a parte "pool" do Reino Unido):
  // quantidade, custo total (com taxas) e taxas incluídas. As datas de compra
  // ficam numa fila FIFO só para o prazo de detenção.
  const usaMedia = fam === "media" || fam === "pool";
  const media: Record<string, { qty: number; custo: number; taxas: number }> = {};

  const consumirSemGanho = (asset: string, qty: number) => {
    let resto = qty;
    const fila = pool[asset] ?? [];
    while (resto > EPS && fila.length) {
      const i = fam === "lifo" ? fila.length - 1 : 0;
      const l = fila[i];
      const usa = Math.min(resto, l.amount);
      l.amount -= usa; resto -= usa;
      if (usaMedia && media[asset]) {
        // Sai ao custo médio, para o custo total acompanhar a quantidade.
        const m = media[asset];
        const unit = m.qty > EPS ? m.custo / m.qty : 0;
        const tx = m.qty > EPS ? m.taxas / m.qty : 0;
        m.qty = Math.max(0, m.qty - usa); m.custo = Math.max(0, m.custo - unit * usa); m.taxas = Math.max(0, m.taxas - tx * usa);
      }
      if (l.amount <= EPS) fila.splice(i, 1);
    }
  };

  ordem.forEach(({ op, idx }) => {
    if (op.type === "taxa") { consumirSemGanho(op.asset, op.amount); return; }
    if (op.feeAsset && (op.feeQty ?? 0) > 0) consumirSemGanho(op.feeAsset, op.feeQty ?? 0);
    const feePerUnit = op.amount > 0 ? op.fee / op.amount : 0;

    if (op.type === "compra") {
      const reservado = reservas?.get(idx) ?? 0;
      const livre = op.amount - reservado;
      // Moeda recebida numa troca neutra: herda o custo da entregue. A data de
      // aquisição conta a partir da troca (a lei portuguesa só diz que passa
      // o VALOR; é a leitura prudente — ressalvada no ecrã).
      const herdado = opcoes.permutaNeutra && op.swapId ? custoTroca.get(op.swapId) : undefined;
      const preco = herdado != null && op.amount > 0 ? herdado / op.amount : op.price;
      if (livre > EPS) {
        (pool[op.asset] ??= []).push({ amount: livre, price: preco, feePerUnit, date: op.date });
        if (usaMedia) {
          const m = (media[op.asset] ??= { qty: 0, custo: 0, taxas: 0 });
          m.qty += livre; m.custo += livre * (preco + feePerUnit); m.taxas += livre * feePerUnit;
        }
      }
      return;
    }

    // venda
    let resto = op.amount;
    const neutra = !!(opcoes.permutaNeutra && op.swapId);
    const registar = (usa: number, buyPrice: number, buyFeePerUnit: number, buyDate: string, feesNoPreco = 0) => {
      const buyFees = usa * buyFeePerUnit;
      const sellFees = usa * feePerUnit;
      if (neutra) {
        // Sem ganho: o custo (com as taxas das duas pernas) passa para a moeda recebida.
        custoTroca.set(op.swapId!, (custoTroca.get(op.swapId!) ?? 0) + usa * buyPrice + buyFees + sellFees);
        return;
      }
      const gain = usa * (op.price - buyPrice) - buyFees - sellFees;
      lotes.push({ asset: op.asset, buyDate, sellDate: op.date, buyPrice, sellPrice: op.price, amount: usa, buyFees, sellFees, fees: buyFees + sellFees, gain, feesNoPreco, venda: idx });
    };

    if (fam === "pool" && reservas) {
      // 1) mesmo dia, 2) 30 dias seguintes (por ordem), 3) pool médio.
      for (const r of reservas.paraVenda(idx)) {
        if (resto <= EPS) break;
        const usa = Math.min(resto, r.amount);
        registar(usa, r.price, r.feePerUnit, r.date);
        r.amount -= usa; resto -= usa;
      }
    }

    const fila = pool[op.asset] ?? [];
    if (usaMedia) {
      const m = media[op.asset];
      const unit = m && m.qty > EPS ? m.custo / m.qty : null;
      const tx = m && m.qty > EPS ? m.taxas / m.qty : 0;
      // O preço é o médio (taxas de compra já dentro), a data vem da fila FIFO.
      while (resto > EPS && fila.length && unit != null) {
        const l = fila[0];
        const usa = Math.min(resto, l.amount);
        registar(usa, unit, 0, l.date, usa * tx);
        l.amount -= usa; resto -= usa;
        if (l.amount <= EPS) fila.shift();
        m.qty = Math.max(0, m.qty - usa); m.custo = Math.max(0, m.custo - unit * usa); m.taxas = Math.max(0, m.taxas - tx * usa);
      }
    } else {
      // FIFO, LIFO e FIFO com regra das 4 semanas.
      while (resto > EPS && fila.length) {
        const i = escolherLote(fila, fam, op.date);
        const l = fila[i];
        const usa = Math.min(resto, l.amount);
        registar(usa, l.price, l.feePerUnit, l.date);
        l.amount -= usa; resto -= usa;
        if (l.amount <= EPS) fila.splice(i, 1);
      }
    }
    if (resto > 1e-9) tira(op.asset, resto);
  });

  // Nos métodos de média (e no pool), os lotes abertos saem ao custo médio corrente.
  if (usaMedia) {
    for (const [asset, fila] of Object.entries(pool)) {
      const m = media[asset];
      const unit = m && m.qty > EPS ? m.custo / m.qty : 0;
      for (const l of fila) { l.price = unit; l.feePerUnit = 0; }
    }
  }
  return { lotes, unmatched, abertos: pool };
}

function escolherLote(fila: LoteAberto[], fam: ReturnType<typeof familia>, sellDate: string): number {
  if (fam === "lifo") return fila.length - 1;
  if (fam === "fifo_4w") {
    // Irlanda: compras nos 28 dias anteriores à venda consideram-se vendidas
    // primeiro (a mais recente delas primeiro); só depois o FIFO normal.
    let melhor = -1;
    for (let i = fila.length - 1; i >= 0; i--) {
      const d = dias(fila[i].date, sellDate);
      if (d >= 0 && d <= 28) { melhor = i; break; }
    }
    if (melhor >= 0) return melhor;
  }
  return 0;
}

// ── Pool britânico (Section 104 + same-day + 30 dias) ────────────────────────

type Reserva = { amount: number; price: number; feePerUnit: number; date: string };

function reservarPool(ops: readonly Operacao[]) {
  // Quanto de cada compra (por índice) está reservado para vendas anteriores
  // (mesmo dia ou até 30 dias antes da compra).
  const porCompra = new Map<number, number>();
  const porVenda = new Map<number, Reserva[]>();
  const compras = ops
    .map((op, idx) => ({ op, idx, livre: op.amount }))
    .filter((c) => c.op.type === "compra");
  ops.forEach((op, idx) => {
    if (op.type !== "venda") return;
    let resto = op.amount;
    const lista: Reserva[] = [];
    // mesmo dia primeiro, depois os 30 dias seguintes por ordem de data.
    const candidatas = compras
      .filter((c) => c.op.asset === op.asset && c.livre > EPS)
      .map((c) => ({ c, d: dias(op.date, c.op.date) }))
      .filter(({ d }) => d >= 0 && d <= 30)
      .sort((a, b) => a.d - b.d || a.c.idx - b.c.idx);
    for (const { c } of candidatas) {
      if (resto <= EPS) break;
      const usa = Math.min(resto, c.livre);
      c.livre -= usa; resto -= usa;
      porCompra.set(c.idx, (porCompra.get(c.idx) ?? 0) + usa);
      lista.push({ amount: usa, price: c.op.price, feePerUnit: c.op.amount > 0 ? c.op.fee / c.op.amount : 0, date: c.op.date });
    }
    porVenda.set(idx, lista);
  });
  return {
    get: (idx: number) => porCompra.get(idx),
    paraVenda: (idx: number) => porVenda.get(idx) ?? [],
  };
}

// ── Polónia: soma anual ──────────────────────────────────────────────────────

export type AnoPolaco = {
  ano: number;
  /** Produto líquido das vendas do ano (já sem taxas de venda). */
  receitas: number;
  /** Custo de TODAS as compras do ano (com taxas), vendidas ou não. */
  custos: number;
  /** Excedente de custos vindo de anos anteriores. */
  custosTransitados: number;
  /** Base tributável (0 se os custos excederem as receitas). */
  base: number;
  /** Excedente que transita para o ano seguinte. */
  transita: number;
  /** Taxas de compra e de venda do ano, já dentro de `custos`/`receitas` (só para exibição). */
  taxas: number;
};

/**
 * Art. 30b ust. 1a PIT: receitas do ano menos custos documentados do ano; o
 * excedente de custos transita. Não há lotes: uma compra conta no ano em que
 * é paga, mesmo que ainda não tenha sido vendida. Os registos "só taxa" (gás
 * de swaps falhados, etc.) ficam de fora, como nos outros países: a página
 * mostra-os à parte, por deduzir à mão.
 */
export function resumoAnualPolaco(ops: readonly Operacao[]): AnoPolaco[] {
  const porAno = new Map<number, { receitas: number; custos: number; taxas: number }>();
  for (const op of ops) {
    if (op.type === "taxa") continue;
    // Troca cripto↔cripto: não é receita nem custo (art. 17 ust. 1 pkt 11 PIT).
    if (op.swapId) continue;
    const ano = new Date(op.date).getUTCFullYear();
    const a = porAno.get(ano) ?? { receitas: 0, custos: 0, taxas: 0 };
    if (op.type === "compra") a.custos += op.amount * op.price + op.fee;
    else a.receitas += op.amount * op.price - op.fee;
    a.taxas += op.fee;
    porAno.set(ano, a);
  }
  const anos = [...porAno.keys()].sort((x, y) => x - y);
  let transita = 0;
  return anos.map((ano) => {
    const { receitas, custos, taxas } = porAno.get(ano)!;
    const saldo = receitas - custos - transita;
    const linha: AnoPolaco = { ano, receitas, custos, custosTransitados: transita, base: Math.max(0, saldo), transita: Math.max(0, -saldo), taxas };
    transita = linha.transita;
    return linha;
  });
}
