// Importador do histórico exportado pela APP Crypto.com (a do telemóvel).
//
// PORQUÊ: a app não tem API — nenhuma, para ninguém. A Exchange tem, mas é
// outra carteira, e a maioria das pessoas tem o dinheiro na app. O único
// caminho é o ficheiro que a própria app exporta (Contas → Histórico →
// Exportar): uma linha por movimento, com moeda, quantidade, data e o valor
// na moeda nativa da conta. Daí sai o SALDO por moeda e, de caminho, cada
// compra/venda/troca vira uma transação para o relatório fiscal — com data e
// preço, que é o que o fisco pergunta.
//
// Colunas do ficheiro (setembro de 2026):
//   Timestamp (UTC), Transaction Description, Currency, Amount, To Currency,
//   To Amount, Native Currency, Native Amount, Native Amount (in USD),
//   Transaction Kind, Transaction Hash
//
// Regras por "Transaction Kind" — a parte que exige cuidado:
//   • Amount > 0 na Currency: entra (compra, depósito, cashback, juros).
//   • Amount < 0 na Currency: sai (levantamento, pagamento) — e se houver
//     To Currency, é uma TROCA: sai uma, entra a outra.
//   • Earn, lockup e Supercharger são movimentos INTERNOS: o dinheiro continua
//     na app, só mudou de gaveta. Ignoram-se por completo — contá-los como
//     saída fazia o saldo cair a zero em quem tem tudo no Earn.
//   • Transferências app ↔ Exchange contam para o saldo da app (saíram mesmo
//     daqui) mas não são compras nem vendas.
import { tradeId, type Trade } from "@/lib/portfolios/trades";

export const CRYPTOCOM_APP_VENUE = "cryptocom-app";

const FIAT = new Set(["EUR", "USD", "GBP", "CHF", "CAD", "AUD", "BRL", "SGD", "HKD", "JPY", "NZD", "SEK", "NOK", "DKK", "PLN", "CZK", "HUF", "TRY", "MXN", "ZAR"]);

/** Gavetas internas: o dinheiro não saiu da app. */
const INTERNO = /earn|lockup|supercharger|stake|staking|lock/i;
/** Movimentos entre a app e a Exchange: mexem no saldo da app, não são negócio. */
const TRANSFERENCIA = /exchange_to_crypto_transfer|crypto_to_exchange_transfer|crypto_withdrawal|crypto_deposit|transfer/i;

export type ImportacaoCryptocom = {
  /** Saldo final por moeda (só cripto; fiat fica de fora). */
  saldos: Record<string, number>;
  trades: Trade[];
  linhas: number;
  ignoradas: number;
  /** Tipos de movimento encontrados, com contagem — para a pessoa ver o que se percebeu. */
  tipos: Record<string, number>;
  periodo: { de: string; ate: string } | null;
  /** Moeda nativa da conta (EUR, USD…). Preços vêm nesta moeda. */
  moedaNativa: string | null;
  erro?: "vazio" | "colunas";
};

const dividir = (linha: string): string[] => {
  const out: string[] = []; let cur = ""; let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') { if (aspas && linha[i + 1] === '"') { cur += '"'; i++; } else aspas = !aspas; }
    else if (c === "," && !aspas) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
};

const num = (s: string | undefined): number => {
  if (!s) return 0;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const data = (ts: string): string => {
  const m = ts.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
};

export function importarCryptocomApp(texto: string): ImportacaoCryptocom {
  const vazio: ImportacaoCryptocom = { saldos: {}, trades: [], linhas: 0, ignoradas: 0, tipos: {}, periodo: null, moedaNativa: null };
  const linhas = texto.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (linhas.length < 2) return { ...vazio, erro: "vazio" };

  const cab = dividir(linhas[0]).map((h) => h.toLowerCase().replace(/[^a-z]/g, ""));
  const col = (...nomes: string[]) => cab.findIndex((h) => nomes.includes(h));
  const cTs = col("timestamputc", "timestamp");
  const cCur = col("currency");
  const cAmt = col("amount");
  const cToCur = col("tocurrency");
  const cToAmt = col("toamount");
  const cNatCur = col("nativecurrency");
  const cNat = col("nativeamount");
  const cKind = col("transactionkind");
  const cDesc = col("transactiondescription");
  if (cTs < 0 || cCur < 0 || cAmt < 0 || cKind < 0) return { ...vazio, erro: "colunas" };

  const saldos: Record<string, number> = {};
  const trades: Trade[] = [];
  const tipos: Record<string, number> = {};
  let ignoradas = 0;
  let moedaNativa: string | null = null;
  const datas: string[] = [];
  const agora = Date.now();

  const entra = (moeda: string, q: number) => { if (moeda && !FIAT.has(moeda)) saldos[moeda] = (saldos[moeda] ?? 0) + q; };

  for (const linha of linhas.slice(1)) {
    const c = dividir(linha);
    const dia = data(c[cTs] ?? "");
    const moeda = (c[cCur] ?? "").toUpperCase();
    const qtd = num(c[cAmt]);
    const paraMoeda = (c[cToCur] ?? "").toUpperCase();
    const paraQtd = num(c[cToAmt]);
    const natCur = (c[cNatCur] ?? "").toUpperCase();
    const nat = Math.abs(num(c[cNat]));
    const kind = (c[cKind] ?? "").toLowerCase();
    const desc = cDesc >= 0 ? (c[cDesc] ?? "") : "";
    if (!dia || !moeda) { ignoradas++; continue; }
    tipos[kind || "?"] = (tipos[kind || "?"] ?? 0) + 1;
    if (natCur && !moedaNativa) moedaNativa = natCur;
    datas.push(dia);

    // Gaveta interna: nada muda. Excepto os JUROS/recompensas do Earn — esses
    // são moedas novas, e ficam (o "earn" no nome enganava).
    if (INTERNO.test(kind) && !/interest|reward|cashback|bonus/i.test(kind)) continue;

    const base = { assetName: "", date: dia, exchange: "Crypto.com App", notes: desc, updatedAt: agora, currency: natCur || undefined } as const;
    const preco = (q: number) => (q > 0 && nat > 0 ? nat / q : 0);

    if (paraMoeda && paraQtd > 0) {
      // Troca: sai `moeda`, entra `paraMoeda`. Uma das duas pode ser fiat.
      const saiQ = Math.abs(qtd);
      entra(moeda, -saiQ);
      entra(paraMoeda, paraQtd);
      if (!FIAT.has(moeda)) {
        const p = preco(saiQ);
        trades.push({ id: tradeId(), type: "venda", asset: moeda, quantity: saiQ, priceEur: p, priceInput: p, totalEur: saiQ * p, ...base });
      }
      if (!FIAT.has(paraMoeda)) {
        const p = preco(paraQtd);
        trades.push({ id: tradeId(), type: "compra", asset: paraMoeda, quantity: paraQtd, priceEur: p, priceInput: p, totalEur: paraQtd * p, ...base });
      }
      continue;
    }

    if (FIAT.has(moeda)) continue;                          // movimento só em fiat: não é cripto
    entra(moeda, qtd);
    if (TRANSFERENCIA.test(kind)) continue;                 // mudou de sítio, não de dono
    const q = Math.abs(qtd);
    if (!(q > 0)) continue;
    const p = preco(q);
    trades.push({ id: tradeId(), type: qtd > 0 ? "compra" : "venda", asset: moeda, quantity: q, priceEur: p, priceInput: p, totalEur: q * p, ...base });
  }

  // Poeira negativa por arredondamento não é saldo.
  for (const k of Object.keys(saldos)) if (Math.abs(saldos[k]) < 1e-9) delete saldos[k];

  datas.sort();
  return {
    saldos, trades, linhas: linhas.length - 1, ignoradas, tipos,
    periodo: datas.length ? { de: datas[0], ate: datas[datas.length - 1] } : null,
    moedaNativa,
  };
}
