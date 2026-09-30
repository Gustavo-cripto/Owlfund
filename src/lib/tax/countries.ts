// Fonte ÚNICA dos regimes fiscais por país.
//
// Serve dois consumidores muito diferentes:
//   • a calculadora em /fiscalidade (privada, precisa das taxas para calcular);
//   • os guias públicos em /guias/impostos-cripto (conteúdo indexável).
//
// Antes as taxas viviam dentro do componente da calculadora. Duplicá-las para
// os guias garantiria que, um dia, o site diria 28 % num sítio e 30 % no outro.
//
// Os TEXTOS vêm das traduções (chaves fc_<code>_*), para não haver duas versões
// da mesma frase. As TAXAS e isenções estão aqui porque são cálculo, não texto.
//
// Só o TIPO Lang é importado (apagado em runtime): este ficheiro entra em
// páginas cliente e não pode puxar as quatro línguas. Os textos por país
// ficam em countryText.ts, só para o servidor.
import { fxSuportada } from "@/lib/fx/supported";
import type { Lang } from "@/lib/i18n/translations";

export type Plan = "free" | "pro" | "premium";

export type Allowance = {
  /**
   * Valor anual na MOEDA DO PAÍS (a mesma de `Country.currency`).
   *
   * Antes estava em euros aproximados: a isenção britânica de £3.000 entrava
   * na conta como €3.500, e o imposto saía errado por causa da conversão. Como
   * o relatório passou a ser feito na moeda do país, o valor nativo é o certo.
   */
  amount: number;
  /** "deduct" abate ao ganho tributável; "threshold" isenta tudo se ficar ABAIXO (estritamente). */
  kind: "deduct" | "threshold";
  /**
   * A aplicação a cripto não está confirmada (MX): mostra-se no guia, mas a
   * calculadora NÃO a abate — um erro a favor do contribuinte é o pior tipo de
   * erro num relatório que alguém vai entregar.
   */
  disputada?: boolean;
  /** Rótulo nas 4 línguas da app (os guias públicos só usam pt/en). */
  label: Record<Lang, string>;
};

export type TaxRegime = {
  /** Taxa aplicada a ganhos de curto prazo (0–1). */
  short: number;
  /** Taxa aplicada depois de `longDays` (0–1). */
  long: number;
  /** Dias de detenção a partir dos quais vale `long`. 0 = sem distinção temporal. */
  longDays: number;
  /** Descrição do regime de longo prazo, nas 4 línguas da app. */
  longLabel: Record<Lang, string>;
  allowance?: Allowance;
};

/** [limite superior do escalão, taxa]; o último usa Infinity. */
export type Escalao = [number, number];

/**
 * Regras de cálculo que não cabem numa taxa curta + longa. Aplicadas em
 * src/lib/tax/regras.ts (auditoria de 30 set 2026). Tudo opcional.
 */
export type RegrasPais = {
  /** Prazo de detenção. "meses" = por calendário e ESTRITO (vende depois do aniversário). Por omissão: `longDays` dias, ≥. */
  prazo?: { tipo: "dias"; n: number } | { tipo: "meses"; n: number };
  /** Escala progressiva sobre a base do ano (ES). */
  escaloes?: Escalao[];
  /** Isento se o total de VENDAS do ano não passar deste valor (FR €305). */
  isencaoVendas?: number;
  /** Brasil: apuração mensal, isenção por vendas do mês, escala por ganho; exterior à parte. */
  brMensal?: { isencaoVendasMes: number; escaloes: Escalao[]; taxaExterior: number };
  /** Início do ano fiscal "MM-DD" quando não é 1 de janeiro (GB 04-06, AU 07-01). */
  anoFiscalInicio?: string;
  /** Troca cripto↔cripto sem imposto; o custo passa para a moeda recebida. */
  permutaNeutra?: boolean;
  /** As perdas que sobram passam para anos seguintes (a calculadora não as transita; o ecrã diz). */
  perdasTransitam?: boolean;
  /** EUA: perdas compensam primeiro dentro de curto/longo prazo. */
  ordemPerdasUS?: boolean;
  /**
   * A taxa depende do rendimento: a calculadora usa a máxima (com sobretaxas)
   * e deixa a pessoa escrever a sua. `longo` diz o que acontece à taxa longa.
   */
  taxaMarginal?: { longo: "igual" | "metade" | "separado" | "fixo" };
  /** Áustria: compras antes desta data (Altbestand) isentas se detidas mais de 1 ano. */
  altbestand?: { antes: string };
  /** Taxa própria para alguns ativos (IT: e-money tokens em euro a 26%). */
  taxaAtivos?: { simbolos: string[]; taxa: number; desde?: string };
  /** Regras de anos anteriores: aplicam-se a vendas ANTES de `ate`. */
  historico?: Array<{ ate: string; short?: number; long?: number; allowance?: Allowance | null; escaloes?: Escalao[]; semImposto?: boolean }>;
};

export type Country = {
  code: string;
  /**
   * Moeda em que se declara neste país — a do relatório fiscal.
   * Um relatório do IRS em euros não serve para declarar nos EUA.
   */
  currency: string;
  /** Slug por idioma. PT: /guias/impostos-cripto/<slug>; EN: /guides/crypto-tax/<slug>. */
  slug: { pt: string; en: string };
  flag: string;
  /** Referência legal (lei, artigo, circular). */
  law: string;
  /** Plano mínimo para ver o país DENTRO da app (os guias públicos são livres). */
  plan: Plan;
  regime: TaxRegime;
  /**
   * Método de custo de aquisição que a lei do país exige. O motor em
   * src/lib/tax/metodos.ts aplica-o (FIFO, LIFO, preço médio, pool britânico,
   * soma anual); COST_METHOD_CAVEAT diz onde ainda é aproximação. Verificado
   * em fontes de 2026 (30 set 2026).
   */
  costMethod: CostMethod;
  /** Regras de cálculo específicas (prazo por calendário, escalas, histórico…). */
  regras?: RegrasPais;
};

export type CostMethod = "fifo" | "fifo_wallet" | "fifo_4w" | "wavg" | "wavg_global" | "avg_moving" | "acb" | "lifo" | "pool" | "annual" | "spec_id" | "none";
/** Rótulos do método, nas 4 línguas. */
export const COST_METHOD_LABEL: Record<CostMethod, Record<Lang, string>> = {
  fifo:        { pt: "FIFO", en: "FIFO", es: "FIFO", fr: "FIFO" },
  fifo_wallet: { pt: "FIFO, por carteira/corretora", en: "FIFO, per wallet/exchange", es: "FIFO, por monedero/exchange", fr: "FIFO, par portefeuille/plateforme" },
  fifo_4w:     { pt: "FIFO com regra das 4 semanas", en: "FIFO with the 4-week rule", es: "FIFO con la regla de 4 semanas", fr: "FIFO avec la règle des 4 semaines" },
  wavg:        { pt: "Preço médio ponderado (FIFO não aceite)", en: "Weighted average cost (FIFO not accepted)", es: "Precio medio ponderado (FIFO no aceptado)", fr: "Prix moyen pondéré (FIFO non accepté)" },
  wavg_global: { pt: "Preço médio ponderado do portefólio global (FIFO não aceite)", en: "Weighted average cost of the whole portfolio (FIFO not accepted)", es: "Precio medio ponderado de la cartera global (FIFO no aceptado)", fr: "Prix moyen pondéré du portefeuille global (FIFO non accepté)" },
  avg_moving:  { pt: "Custo médio móvel, por carteira (FIFO não aceite)", en: "Moving average cost, per wallet (FIFO not accepted)", es: "Coste medio móvil, por monedero (FIFO no aceptado)", fr: "Coût moyen mobile, par portefeuille (FIFO non accepté)" },
  acb:         { pt: "Custo médio ajustado (ACB); FIFO não aceite", en: "Adjusted cost base (ACB); FIFO not accepted", es: "Coste medio ajustado (ACB); FIFO no aceptado", fr: "Prix de base rajusté (PBR) ; FIFO non accepté" },
  lifo:        { pt: "LIFO (obrigatório)", en: "LIFO (mandatory)", es: "LIFO (obligatorio)", fr: "LIFO (obligatoire)" },
  pool:        { pt: "Section 104 pool (custo médio) + regras same-day e 30 dias", en: "Section 104 pool (average cost) + same-day and 30-day rules", es: "Section 104 pool (coste medio) + reglas same-day y 30 días", fr: "Section 104 pool (coût moyen) + règles same-day et 30 jours" },
  annual:      { pt: "Receitas e custos somados por ano (sem lotes)", en: "Proceeds and costs totalled per year (no lots)", es: "Ingresos y costes sumados por año (sin lotes)", fr: "Recettes et coûts totalisés par an (sans lots)" },
  spec_id:     { pt: "FIFO ou identificação específica (com registos)", en: "FIFO or specific identification (with records)", es: "FIFO o identificación específica (con registros)", fr: "FIFO ou identification spécifique (avec justificatifs)" },
  none:        { pt: "Não aplicável (sem imposto sobre mais-valias)", en: "Not applicable (no capital gains tax)", es: "No aplicable (sin impuesto sobre plusvalías)", fr: "Sans objet (pas d'impôt sur les plus-values)" },
};
/** Nome curto do método, para o cartão da calculadora e o PDF. */
export const COST_METHOD_SHORT: Record<CostMethod, string> = {
  fifo: "FIFO", fifo_wallet: "FIFO", fifo_4w: "FIFO +4 sem.", wavg: "PMP", wavg_global: "PMP", avg_moving: "PMP", acb: "ACB", lifo: "LIFO", pool: "Pool S104", annual: "Anual", spec_id: "FIFO", none: "—",
};
/**
 * Onde o motor ainda simplifica face à lei. Sem entrada = o cálculo segue o
 * método do país tal como está descrito.
 */
export const COST_METHOD_CAVEAT: Partial<Record<CostMethod, Record<Lang, string>>> = {
  wavg_global: {
    pt: "A lei francesa calcula o preço médio sobre o portefólio inteiro e o seu valor global no dia de cada venda; a calculadora usa o preço médio por ativo, por isso o resultado é uma aproximação.",
    en: "French law computes the average price over the whole portfolio and its total value on the day of each sale; the calculator uses the average price per asset, so the result is an approximation.",
    es: "La ley francesa calcula el precio medio sobre toda la cartera y su valor global el día de cada venta; la calculadora usa el precio medio por activo, así que el resultado es una aproximación.",
    fr: "La loi française calcule le prix moyen sur l'ensemble du portefeuille et sa valeur globale au jour de chaque cession ; la calculatrice utilise le prix moyen par actif, le résultat est donc une approximation.",
  },
  avg_moving: {
    pt: "A lei austríaca calcula o custo médio por carteira; a calculadora calcula-o por ativo, juntando todas as carteiras.",
    en: "Austrian law computes the average cost per wallet; the calculator computes it per asset, across all wallets.",
    es: "La ley austriaca calcula el coste medio por monedero; la calculadora lo calcula por activo, juntando todos los monederos.",
    fr: "La loi autrichienne calcule le coût moyen par portefeuille ; la calculatrice le calcule par actif, tous portefeuilles confondus.",
  },
  acb: {
    pt: "A calculadora não inclui a regra da perda superficial (recompra em 30 dias).",
    en: "The calculator does not include the superficial loss rule (repurchase within 30 days).",
    es: "La calculadora no incluye la regla de pérdida superficial (recompra en 30 días).",
    fr: "La calculatrice n'inclut pas la règle de la perte apparente (rachat sous 30 jours).",
  },
  fifo_wallet: {
    pt: "A lei manda aplicar o FIFO por corretora ou carteira; a calculadora aplica-o ao conjunto, porque as transferências entre carteiras não ficam registadas como operações.",
    en: "The law applies FIFO per exchange or wallet; the calculator applies it to the whole, because transfers between wallets are not recorded as trades.",
    es: "La ley aplica el FIFO por exchange o monedero; la calculadora lo aplica al conjunto, porque las transferencias entre monederos no quedan registradas como operaciones.",
    fr: "La loi applique le FIFO par plateforme ou portefeuille ; la calculatrice l'applique à l'ensemble, car les transferts entre portefeuilles ne sont pas enregistrés comme opérations.",
  },
};
/** Ressalvas que dependem do país e não só do método. */
export const COUNTRY_CAVEAT: Partial<Record<string, Record<Lang, string>>> = {
  BE: {
    pt: "Para ativos comprados antes de 2026 a lei belga usa como custo o valor a 31/12/2025 (só o ganho desde então conta); a calculadora usa o preço real de compra, por isso sobrestima o ganho desses ativos.",
    en: "For assets bought before 2026, Belgian law uses the value on 31/12/2025 as cost (only the gain since then counts); the calculator uses the real purchase price, so it overstates the gain on those assets.",
    es: "Para activos comprados antes de 2026 la ley belga usa como coste el valor a 31/12/2025 (solo cuenta la ganancia desde entonces); la calculadora usa el precio real de compra, así que sobreestima la ganancia de esos activos.",
    fr: "Pour les actifs achetés avant 2026, la loi belge retient comme coût la valeur au 31/12/2025 (seul le gain depuis compte) ; la calculatrice utilise le prix d'achat réel et surestime donc le gain sur ces actifs.",
  },
  IE: {
    pt: "Falta a segunda parte da regra: quando se recompra nas 4 semanas a seguir a uma venda com perda, essa perda só abate a ganhos dessa recompra, e a calculadora abate-a normalmente.",
    en: "The second part of the rule is missing: when you buy back within 4 weeks after a sale at a loss, that loss only offsets gains on the repurchase, and the calculator offsets it normally.",
    es: "Falta la segunda parte de la regla: si se recompra en las 4 semanas siguientes a una venta con pérdida, esa pérdida solo compensa ganancias de esa recompra, y la calculadora la compensa normalmente.",
    fr: "Il manque la seconde partie de la règle : en cas de rachat dans les 4 semaines suivant une vente à perte, cette perte ne s'impute que sur les gains de ce rachat, et la calculatrice l'impute normalement.",
  },
  PT: {
    pt: "Nas trocas cripto↔cripto importadas como troca, a calculadora não tributa e passa o custo para a moeda recebida; o prazo dos 365 dias conta a partir da troca, porque a lei só diz que passa o valor.",
    en: "For crypto-to-crypto swaps imported as swaps, the calculator does not tax them and carries the cost to the coin received; the 365-day period counts from the swap, because the law only says the value carries over.",
    es: "En los cambios cripto↔cripto importados como cambio, la calculadora no los grava y pasa el coste a la moneda recibida; el plazo de 365 días cuenta desde el cambio, porque la ley solo dice que pasa el valor.",
    fr: "Pour les échanges crypto↔crypto importés comme échanges, la calculatrice ne les impose pas et reporte le coût sur la crypto reçue ; le délai de 365 jours court à partir de l'échange, car la loi dit seulement que la valeur est reportée.",
  },
  AT: {
    pt: "Nas trocas cripto↔cripto importadas como troca, a calculadora não tributa e passa o custo para a moeda recebida. Moedas compradas antes de 1 mar 2021 (Altbestand) contam como isentas depois de 1 ano.",
    en: "For crypto-to-crypto swaps imported as swaps, the calculator does not tax them and carries the cost to the coin received. Coins bought before 1 Mar 2021 (Altbestand) count as exempt after 1 year.",
    es: "En los cambios cripto↔cripto importados como cambio, la calculadora no los grava y pasa el coste a la moneda recibida. Las monedas compradas antes del 1 mar 2021 (Altbestand) cuentan como exentas tras 1 año.",
    fr: "Pour les échanges crypto↔crypto importés comme échanges, la calculatrice ne les impose pas et reporte le coût sur la crypto reçue. Les cryptos achetées avant le 1er mars 2021 (Altbestand) comptent comme exonérées après 1 an.",
  },
  MX: {
    pt: "A lei mexicana não fixa o método; a calculadora usa FIFO. Não aplica o art. 120 LISR (custo atualizado pelo INPC e ganho repartido pelos anos de detenção), que baixa o imposto de quem detém há mais tempo.",
    en: "Mexican law sets no method; the calculator uses FIFO. It does not apply art. 120 LISR (cost indexed by INPC and gain spread over the years held), which lowers the tax for longer holdings.",
    es: "La ley mexicana no fija el método; la calculadora usa FIFO. No aplica el art. 120 LISR (costo actualizado por el INPC y ganancia repartida entre los años de tenencia), que reduce el impuesto de quien mantiene más tiempo.",
    fr: "La loi mexicaine ne fixe pas de méthode ; la calculatrice utilise le FIFO. Elle n'applique pas l'art. 120 LISR (coût indexé sur l'INPC et gain réparti sur les années de détention), qui réduit l'impôt pour les détentions longues.",
  },
  US: {
    pt: "Desde 2025 a base de custo é por carteira ou conta; a calculadora aplica o FIFO ao conjunto, porque as transferências entre carteiras não ficam registadas como operações.",
    en: "Since 2025 cost basis is per wallet or account; the calculator applies FIFO to the whole, because transfers between wallets are not recorded as trades.",
    es: "Desde 2025 la base de coste es por monedero o cuenta; la calculadora aplica el FIFO al conjunto, porque las transferencias entre monederos no quedan registradas como operaciones.",
    fr: "Depuis 2025 le prix de revient se calcule par portefeuille ou compte ; la calculatrice applique le FIFO à l'ensemble, car les transferts entre portefeuilles ne sont pas enregistrés comme opérations.",
  },
};
/** Ressalva do método para o país e a língua pedidos (null = cálculo exato face à lei). */
export const metodoRessalva = (m: CostMethod, lang: Lang, code?: string): string | null =>
  [COST_METHOD_CAVEAT[m]?.[lang], code ? COUNTRY_CAVEAT[code]?.[lang] : null].filter(Boolean).join(" ") || null;

// Os rótulos vivem aqui e não nas traduções porque andam sempre colados à taxa
// que está nesta mesma linha: separá-los seria convidar a que um mudasse sem o
// outro. Uma vez saíram só em português nos PDFs em EN/ES/FR — daí as 4 línguas.
const LONG_LABEL: Record<string, Record<Lang, string>> = {
  PT: { pt: "Isento (≥ 365 dias)", en: "Exempt (≥ 365 days)", es: "Exento (≥ 365 días)", fr: "Exonéré (≥ 365 jours)" },
  ES: { pt: "19–30% (escala, sem distinção temporal)", en: "19–30% (progressive, no holding-period distinction)", es: "19–30% (escala, sin distinción temporal)", fr: "19–30 % (barème, sans distinction de durée)" },
  FR: { pt: "31,4% (flat tax / PFU)", en: "31.4% (flat tax / PFU)", es: "31,4% (flat tax / PFU)", fr: "31,4 % (flat tax / PFU)" },
  DE: { pt: "Isento (>1 ano)", en: "Exempt (>1 year)", es: "Exento (>1 año)", fr: "Exonéré (>1 an)" },
  GB: { pt: "18%/24% (sem distinção temporal)", en: "18%/24% (no holding-period distinction)", es: "18%/24% (sin distinción temporal)", fr: "18/24 % (sans distinction de durée)" },
  NL: { pt: "Box 3 tributa património, não mais-valias", en: "Box 3 taxes wealth, not capital gains", es: "Box 3 grava el patrimonio, no las plusvalías", fr: "Box 3 impose le patrimoine, pas les plus-values" },
  IT: { pt: "33% (flat, desde 2026)", en: "33% (flat, from 2026)", es: "33% (flat, desde 2026)", fr: "33 % (forfaitaire, depuis 2026)" },
  BR: { pt: "15–22,5% (isenção se vendas ≤ R$35k/mês)", en: "15–22.5% (exempt if sales ≤ R$35k/month)", es: "15–22,5% (exención si ventas ≤ R$35k/mes)", fr: "15–22,5 % (exonéré si ventes ≤ 35 000 R$/mois)" },
  BE: { pt: "10% (gestão privada; especulativo 33%)", en: "10% (private management; speculative 33%)", es: "10% (gestión privada; especulativo 33%)", fr: "10 % (gestion privée ; spéculatif 33 %)" },
  IE: { pt: "33% (CGT, sem distinção temporal)", en: "33% (CGT, no holding-period distinction)", es: "33% (CGT, sin distinción temporal)", fr: "33 % (CGT, sans distinction de durée)" },
  AT: { pt: "27,5% (flat, sem distinção temporal)", en: "27.5% (flat, no holding-period distinction)", es: "27,5% (flat, sin distinción temporal)", fr: "27,5 % (forfaitaire, sans distinction de durée)" },
  PL: { pt: "19% (flat, PIT-38)", en: "19% (flat, PIT-38)", es: "19% (flat, PIT-38)", fr: "19 % (forfaitaire, PIT-38)" },
  LU: { pt: "Isento (>6 meses)", en: "Exempt (>6 months)", es: "Exento (>6 meses)", fr: "Exonéré (>6 mois)" },
  US: { pt: "0–20% (>1 ano)", en: "0–20% (>1 year)", es: "0–20% (>1 año)", fr: "0–20 % (>1 an)" },
  CA: { pt: "até ~27% (taxa de inclusão de 50%)", en: "~27% (50% inclusion rate)", es: "~27% (tasa de inclusión del 50%)", fr: "~27 % (taux d'inclusion de 50 %)" },
  AU: { pt: "50% desconto (>1 ano)", en: "50% discount (>1 year)", es: "50% de descuento (>1 año)", fr: "Abattement de 50 % (>1 an)" },
  CH: { pt: "Isento (investidor privado)", en: "Exempt (private investor)", es: "Exento (inversor privado)", fr: "Exonéré (investisseur privé)" },
  AE: { pt: "0% (sem imposto sobre mais-valias)", en: "0% (no capital gains tax)", es: "0% (sin impuesto sobre plusvalías)", fr: "0 % (pas d'impôt sur les plus-values)" },
  SG: { pt: "0% (investidor privado)", en: "0% (private investor)", es: "0% (inversor privado)", fr: "0 % (investisseur privé)" },
  MX: { pt: "1,92–35% (ISR progressivo)", en: "1.92–35% (progressive ISR)", es: "1,92–35% (ISR progresivo)", fr: "1,92–35 % (ISR progressif)" },
  AR: { pt: "15% cedular (5% se em pesos sem ajuste)", en: "15% cedular (5% if in pesos without adjustment)", es: "15% cedular (5% si en pesos sin ajuste)", fr: "15 % cédulaire (5 % si en pesos sans ajustement)" },
};

// Isenções/abatimentos anuais, no formato como cada país lhes chama.
const ALLOWANCE_LABEL: Record<string, Record<Lang, string>> = {
  DE: { pt: "Freigrenze €1.000/ano", en: "Freigrenze €1,000/year", es: "Freigrenze 1.000 €/año", fr: "Freigrenze 1 000 €/an" },
  GB: { pt: "Isenção anual £3.000 (valor fixo desde 2024/25)", en: "Annual exemption £3,000 (fixed since 2024/25)", es: "Exención anual £3.000 (valor fijo desde 2024/25)", fr: "Abattement annuel 3 000 £ (montant fixe depuis 2024/25)" },
  BE: { pt: "Isenção anual €10.000 (indexada a partir de 2027; +€1.000 por cada ano não usado, até €15.000)", en: "Annual exemption €10,000 (indexed from 2027; +€1,000 per unused year, up to €15,000)", es: "Exención anual 10.000 € (indexada desde 2027; +1.000 € por cada año sin usar, hasta 15.000 €)", fr: "Abattement annuel 10 000 € (indexé dès 2027 ; +1 000 € par année non utilisée, jusqu'à 15 000 €)" },
  IE: { pt: "Isenção anual €1.270", en: "Annual exemption €1,270", es: "Exención anual 1.270 €", fr: "Abattement annuel 1 270 €" },
  LU: { pt: "isento se o total de ganhos especulativos do ano for inferior a €500 (tudo ou nada)", en: "exempt if the year's total speculative gains are below €500 (all or nothing)", es: "exento si el total de ganancias especulativas del año es inferior a 500 € (todo o nada)", fr: "exonéré si le total des gains spéculatifs de l'année est inférieur à 500 € (tout ou rien)" },
  MX: { pt: "Isenção de 3 UMA/ano ≈ MX$128.384 (2026), se aplicável a cripto", en: "3× annual UMA exemption ≈ MX$128,384 (2026), if applicable to crypto", es: "Exención de 3 UMA anuales ≈ MX$128.384 (2026), si aplica a cripto", fr: "Abattement de 3 UMA/an ≈ 128 384 MX$ (2026), si applicable aux cryptos" },
};

const alwHist = (amount: number, kind: Allowance["kind"], pt: string, en: string, es: string, fr: string): Allowance => ({ amount, kind, label: { pt, en, es, fr } });
const INF = Number.POSITIVE_INFINITY;

const REGRAS: Record<string, RegrasPais> = {
  PT: { prazo: { tipo: "dias", n: 365 }, permutaNeutra: true, historico: [{ ate: "2023-01-01", semImposto: true }] },
  ES: {
    escaloes: [[6000, 0.19], [50000, 0.21], [200000, 0.23], [300000, 0.27], [INF, 0.30]],
    perdasTransitam: true,
    historico: [
      { ate: "2025-01-01", escaloes: [[6000, 0.19], [50000, 0.21], [200000, 0.23], [300000, 0.27], [INF, 0.28]] },
      { ate: "2023-01-01", escaloes: [[6000, 0.19], [50000, 0.21], [200000, 0.23], [INF, 0.26]] },
    ],
  },
  // A subida da CSG (LFSS 2026) já se aplica aos ganhos de 2025 (revenus du patrimoine).
  FR: { isencaoVendas: 305, historico: [{ ate: "2025-01-01", short: 0.30, long: 0.30 }] },
  DE: {
    prazo: { tipo: "meses", n: 12 }, taxaMarginal: { longo: "fixo" }, perdasTransitam: true,
    historico: [{ ate: "2024-01-01", allowance: alwHist(600, "threshold", "Freigrenze €600/ano (até 2023)", "Freigrenze €600/year (until 2023)", "Freigrenze 600 €/año (hasta 2023)", "Freigrenze 600 €/an (jusqu'en 2023)") }],
  },
  GB: {
    anoFiscalInicio: "04-06", taxaMarginal: { longo: "igual" }, perdasTransitam: true,
    historico: [
      { ate: "2024-10-30", short: 0.20, long: 0.20 },
      { ate: "2024-04-06", allowance: alwHist(6000, "deduct", "Isenção anual £6.000 (2023/24)", "Annual exemption £6,000 (2023/24)", "Exención anual £6.000 (2023/24)", "Abattement annuel 6 000 £ (2023/24)") },
      { ate: "2023-04-06", allowance: alwHist(12300, "deduct", "Isenção anual £12.300 (2022/23)", "Annual exemption £12,300 (2022/23)", "Exención anual £12.300 (2022/23)", "Abattement annuel 12 300 £ (2022/23)") },
    ],
  },
  IT: {
    taxaAtivos: { simbolos: ["EURC", "EURCV", "EURI", "EURQ", "EURR", "EURE", "EURAU"], taxa: 0.26, desde: "2026-01-01" },
    historico: [
      { ate: "2026-01-01", short: 0.26, long: 0.26 },
      { ate: "2025-01-01", allowance: alwHist(2000, "threshold", "Limiar €2.000/ano (até 2024)", "€2,000/year threshold (until 2024)", "Umbral 2.000 €/año (hasta 2024)", "Seuil 2 000 €/an (jusqu'en 2024)") },
    ],
  },
  BR: { brMensal: { isencaoVendasMes: 35000, escaloes: [[5_000_000, 0.15], [10_000_000, 0.175], [30_000_000, 0.20], [INF, 0.225]], taxaExterior: 0.15 } },
  BE: { historico: [{ ate: "2026-01-01", semImposto: true }] },
  IE: { perdasTransitam: true },
  AT: { permutaNeutra: true, altbestand: { antes: "2021-03-01" } },
  PL: { permutaNeutra: true },
  LU: { prazo: { tipo: "meses", n: 6 }, taxaMarginal: { longo: "fixo" } },
  US: { prazo: { tipo: "meses", n: 12 }, ordemPerdasUS: true, taxaMarginal: { longo: "separado" }, perdasTransitam: true },
  CA: { taxaMarginal: { longo: "igual" }, perdasTransitam: true },
  AU: { prazo: { tipo: "meses", n: 12 }, anoFiscalInicio: "07-01", taxaMarginal: { longo: "metade" }, perdasTransitam: true },
  MX: { taxaMarginal: { longo: "igual" } },
};

// Ordem: os 4 do plano gratuito primeiro, depois Pro, depois Premium — a mesma
// da app, para quem passa de um lado para o outro reconhecer a lista.
export const COUNTRIES: readonly Country[] = [
  { code: "PT", currency: "EUR", slug: { pt: "portugal", en: "portugal" }, flag: "🇵🇹", plan: "free",    law: "CIRS art. 10(22)–(24), 43(8)(g) & (9), 72; Lei 24-D/2022 art. 218",                      regime: { short: 0.28,  long: 0.0,   longDays: 365, longLabel: LONG_LABEL.PT }, costMethod: "fifo_wallet" },
  { code: "ES", currency: "EUR", slug: { pt: "espanha", en: "spain" }, flag: "🇪🇸", plan: "free",    law: "LIRPF arts. 33–37, 66, 76 (Ley 7/2024); DGT V0999-18",                          regime: { short: 0.19,  long: 0.19,  longDays: 0,   longLabel: LONG_LABEL.ES }, costMethod: "fifo" },
  { code: "FR", currency: "EUR", slug: { pt: "franca", en: "france" }, flag: "🇫🇷", plan: "free",    law: "CGI art. 150 VH bis; LFSS 2026 (art. 12)",                              regime: { short: 0.314, long: 0.314,  longDays: 0,   longLabel: LONG_LABEL.FR }, costMethod: "wavg_global" },
  { code: "DE", currency: "EUR", slug: { pt: "alemanha", en: "germany" }, flag: "🇩🇪", plan: "free",    law: "EStG § 23 Abs. 1 Nr. 2; BMF-Schreiben Kryptowerte (10.05.2022, 06.03.2025)",                                        regime: { short: 0.47475, long: 0.0,   longDays: 365, longLabel: LONG_LABEL.DE, allowance: { amount: 1000, kind: "threshold", label: ALLOWANCE_LABEL.DE } }, costMethod: "fifo_wallet" },
  { code: "GB", currency: "GBP", slug: { pt: "reino-unido", en: "united-kingdom" }, flag: "🇬🇧", plan: "pro",     law: "TCGA 1992; HMRC Cryptoassets Manual",            regime: { short: 0.24,  long: 0.24,  longDays: 0,   longLabel: LONG_LABEL.GB, allowance: { amount: 3000, kind: "deduct", label: ALLOWANCE_LABEL.GB } }, costMethod: "pool" },
  { code: "NL", currency: "EUR", slug: { pt: "paises-baixos", en: "netherlands" }, flag: "🇳🇱", plan: "pro",     law: "Wet IB 2001, hoofdstuk 5 (Box 3); Wet tegenbewijs box 3",                               regime: { short: 0.0,   long: 0.0,   longDays: 0,   longLabel: LONG_LABEL.NL }, costMethod: "none" },
  { code: "IT", currency: "EUR", slug: { pt: "italia", en: "italy" }, flag: "🇮🇹", plan: "pro",     law: "Legge 197/2022; Legge 207/2024 art. 1 c. 24–26; Legge 199/2025 c. 28; TUIR art. 67 c. 1-bis",                  regime: { short: 0.33,  long: 0.33,  longDays: 0,   longLabel: LONG_LABEL.IT }, costMethod: "lifo" },
  { code: "BR", currency: "BRL", slug: { pt: "brasil", en: "brazil" }, flag: "🇧🇷", plan: "pro",     law: "Lei 8.981/1995 art. 21; Lei 9.250/1995 art. 22; IN RFB 2.291/2025; Lei 14.754/2023",               regime: { short: 0.15,  long: 0.15,  longDays: 0,   longLabel: LONG_LABEL.BR }, costMethod: "wavg" },
  { code: "BE", currency: "EUR", slug: { pt: "belgica", en: "belgium" }, flag: "🇧🇪", plan: "pro",     law: "Loi du 6 avril 2026 (MB 21/04/2026); CIR92 art. 90, 9° et art. 92",          regime: { short: 0.10,  long: 0.10,  longDays: 0,   longLabel: LONG_LABEL.BE, allowance: { amount: 10000, kind: "deduct", label: ALLOWANCE_LABEL.BE } }, costMethod: "fifo" },
  { code: "IE", currency: "EUR", slug: { pt: "irlanda", en: "ireland" }, flag: "🇮🇪", plan: "pro",     law: "TCA 1997; Revenue TDM Part 02-01-03",                           regime: { short: 0.33,  long: 0.33,  longDays: 0,   longLabel: LONG_LABEL.IE, allowance: { amount: 1270, kind: "deduct", label: ALLOWANCE_LABEL.IE } }, costMethod: "fifo_4w" },
  { code: "AT", currency: "EUR", slug: { pt: "austria", en: "austria" }, flag: "🇦🇹", plan: "pro",     law: "EStG § 27b (ÖkoStRefG 2022)",                        regime: { short: 0.275, long: 0.275, longDays: 0,   longLabel: LONG_LABEL.AT }, costMethod: "avg_moving" },
  { code: "PL", currency: "PLN", slug: { pt: "polonia", en: "poland" }, flag: "🇵🇱", plan: "pro",     law: "Ustawa o PIT art. 30b ust. 1a; art. 17 ust. 1f; art. 22 ust. 14–16",                              regime: { short: 0.19,  long: 0.19,  longDays: 0,   longLabel: LONG_LABEL.PL }, costMethod: "annual" },
  { code: "LU", currency: "EUR", slug: { pt: "luxemburgo", en: "luxembourg" }, flag: "🇱🇺", plan: "pro",     law: "LIR art. 99bis; Circulaire L.I.R. n° 14/5–99/3–99bis/3 (26.07.2018)",                                   regime: { short: 0.4578, long: 0.0,   longDays: 183, longLabel: LONG_LABEL.LU, allowance: { amount: 500, kind: "threshold", label: ALLOWANCE_LABEL.LU } }, costMethod: "wavg" },
  { code: "US", currency: "USD", slug: { pt: "estados-unidos", en: "united-states" }, flag: "🇺🇸", plan: "premium", law: "IRS Notice 2014-21; Rev. Rul. 2023-14; Treas. Reg. §1.1012-1(j) (2025)",           regime: { short: 0.408, long: 0.238,  longDays: 365, longLabel: LONG_LABEL.US }, costMethod: "spec_id" },
  { code: "CA", currency: "CAD", slug: { pt: "canada", en: "canada" }, flag: "🇨🇦", plan: "premium", law: "ITA s. 38(a); s. 47",                          regime: { short: 0.27,  long: 0.27,  longDays: 0,   longLabel: LONG_LABEL.CA }, costMethod: "acb" },
  { code: "AU", currency: "AUD", slug: { pt: "australia", en: "australia" }, flag: "🇦🇺", plan: "premium", law: "ITAA 1997 Div 115 (s. 115-25); Treasury Laws Amendment (Tax Reform No. 1) Act 2026 (1/7/2027)",             regime: { short: 0.47, long: 0.235, longDays: 365, longLabel: LONG_LABEL.AU }, costMethod: "spec_id" },
  { code: "CH", currency: "CHF", slug: { pt: "suica", en: "switzerland" }, flag: "🇨🇭", plan: "premium", law: "DBG art. 16 Abs. 3; StHG art. 7 Abs. 4 lit. b; ESTV KS 36",                               regime: { short: 0.0,   long: 0.0,   longDays: 0,   longLabel: LONG_LABEL.CH }, costMethod: "none" },
  { code: "AE", currency: "AED", slug: { pt: "emirados-arabes-unidos", en: "united-arab-emirates" }, flag: "🇦🇪", plan: "premium", law: "Federal Decree-Law No. 47 of 2022; Cabinet Decision No. 49 of 2023",                regime: { short: 0.0,   long: 0.0,   longDays: 0,   longLabel: LONG_LABEL.AE }, costMethod: "none" },
  { code: "SG", currency: "SGD", slug: { pt: "singapura", en: "singapore" }, flag: "🇸🇬", plan: "premium", law: "Income Tax Act 1947; IRAS e-Tax Guide \"Income Tax Treatment of Digital Tokens\" (2026)",    regime: { short: 0.0,   long: 0.0,   longDays: 0,   longLabel: LONG_LABEL.SG }, costMethod: "none" },
  { code: "MX", currency: "MXN", slug: { pt: "mexico", en: "mexico" }, flag: "🇲🇽", plan: "premium", law: "LISR arts. 93 XIX b), 119–128, 152; Ley Fintech art. 30",                                 regime: { short: 0.35,  long: 0.35,  longDays: 0,   longLabel: LONG_LABEL.MX, allowance: { amount: 128384, kind: "deduct", disputada: true, label: ALLOWANCE_LABEL.MX } }, costMethod: "fifo" },
  { code: "AR", currency: "ARS", slug: { pt: "argentina", en: "argentina" }, flag: "🇦🇷", plan: "premium", law: "Ley 27.430; LIG (t.o. 2019) art. 2 inc. 4, art. 98 a)/b)",                     regime: { short: 0.15,  long: 0.15,  longDays: 0,   longLabel: LONG_LABEL.AR }, costMethod: "fifo" },
] as const;
for (const c of COUNTRIES as unknown as Country[]) if (REGRAS[c.code]) c.regras = REGRAS[c.code];

/** Mapa código → regime, no formato que a calculadora de /fiscalidade espera. */
export const TAX_REGIMES: Record<string, TaxRegime> = Object.fromEntries(
  COUNTRIES.map((c) => [c.code, c.regime]),
);

/**
 * Moeda em que o relatorio deste pais pode MESMO sair.
 *
 * Ha paises cuja moeda o feed do BCE nao publica (Emirados em AED, Argentina em
 * ARS). Ate aqui, o relatorio desses paises descartava todos os lotes por falta
 * de cambio e apresentava imposto zero, com ar de resposta. Passa a sair em
 * euros, com aviso: um numero certo noutra moeda vale mais do que um zero
 * errado na moeda certa.
 */
export function moedaDoRelatorio(pais: Pick<Country, "currency">): { currency: string; fallback: boolean } {
  return fxSuportada(pais.currency)
    ? { currency: pais.currency, fallback: false }
    : { currency: "EUR", fallback: true };
}

export type GuideLang = "pt" | "en";

/** Raiz do guia em cada idioma. */
export const GUIDE_BASE: Record<GuideLang, string> = {
  pt: "/guias/impostos-cripto",
  en: "/guides/crypto-tax",
};

export const countryBySlug = (slug: string, lang: GuideLang = "pt"): Country | undefined =>
  COUNTRIES.find((c) => c.slug[lang] === slug);

/** URL do guia: da lista, do país, no idioma pedido. */
export const guideUrl = (lang: GuideLang, country?: Country): string =>
  country ? `${GUIDE_BASE[lang]}/${country.slug[lang]}` : GUIDE_BASE[lang];

/** Prefixo das chaves de tradução de cada país (fc_pt_*, fc_uk_*, …). */
export const TEXT_PREFIX: Record<string, string> = {
  PT: "pt", ES: "es", FR: "fr", DE: "de", GB: "uk", NL: "nl", IT: "it", BR: "br",
  BE: "be", IE: "ie", AT: "at", PL: "pl", LU: "lu", US: "us", CA: "ca", AU: "au",
  CH: "ch", AE: "ae", SG: "sg", MX: "mx", AR: "ar",
};

export type CountryText = {
  name: string;
  taxShort: string;
  taxLong: string;
  threshold: string;
  summary: string;
  keyPoints: string[];
  /** Resposta própria à pergunta da isenção anual (FR, NL, BR, MX, DE, LU). */
  allowanceAnswer?: string;
};

/** Data da última verificação do conteúdo — mostrada nos guias. */
/**
 * "em Portugal", "no Brasil", "nos Países Baixos": a preposição com artigo que
 * cada país leva em português; em inglês só os que levam "the". Usado nos
 * títulos e perguntas dos guias (antes saía "em Luxemburgo", "em Brasil").
 */
const EM_PT: Record<string, string> = { PT: "em Portugal", ES: "em Espanha", FR: "em França", DE: "na Alemanha", GB: "no Reino Unido", NL: "nos Países Baixos", IT: "em Itália", BR: "no Brasil", BE: "na Bélgica", IE: "na Irlanda", AT: "na Áustria", PL: "na Polónia", LU: "no Luxemburgo", US: "nos Estados Unidos", CA: "no Canadá", AU: "na Austrália", CH: "na Suíça", AE: "nos Emirados Árabes Unidos", SG: "em Singapura", MX: "no México", AR: "na Argentina" };
const THE_EN = new Set(["GB", "NL", "US", "AE"]);
export function emPais(code: string, lang: GuideLang, name: string): string {
  if (lang === "pt") return EM_PT[code] ?? `em ${name}`;
  return THE_EN.has(code) ? `in the ${name.replace(/^The /, "")}` : `in ${name}`;
}

export const TAX_DATA_VERIFIED: Record<GuideLang, string> = {
  pt: "setembro de 2026",
  en: "September 2026",
};

// Ultima mudanca real dos regimes (git log deste ficheiro). Alimenta o
// dateModified do Article dos guias (indice e paises) E o lastmod do sitemap,
// num sitio so — antes o sitemap dizia "hoje" a cada deploy e contradizia o
// Article. Atualizar quando as taxas ou prazos mudarem — nunca "hoje" automatico.
export const TAX_GUIDE_DATE_MODIFIED = "2026-09-30";
// Paises cujo guia mudou depois dessa data (texto novo, nao taxas). So esses
// levam a data mais recente; os outros nao fingem ter mudado.
const GUIDE_DATE_OVERRIDES: Record<string, string> = {};
export const guideDateModified = (code: string): string => GUIDE_DATE_OVERRIDES[code] ?? TAX_GUIDE_DATE_MODIFIED;
