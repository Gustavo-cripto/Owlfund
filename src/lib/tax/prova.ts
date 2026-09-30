import type { GuideLang } from "./countries";

// Secção "como demonstrar a data de aquisição" dos guias fiscais.
//
// Porque existe (30 set 2026): a pergunta que mais se repete, sem resposta, nos
// comentários de vídeos portugueses sobre IRS e cripto é "como provo às
// Finanças que tenho isto há mais de um ano?". Os guias explicavam a regra dos
// 365 dias e nada sobre como a demonstrar. Só entra nos países onde a pergunta
// faz sentido (prazo de detenção com efeito no imposto).
//
// Regra de honestidade: aqui só entra o que a lei diz e o que é boa prática de
// registo. NÃO se afirma que a Autoridade Tributária aceita este ou aquele
// documento — não há lista oficial publicada para cripto. Cada texto fecha com
// a nota de que a aceitação é decidida caso a caso e que casos sem histórico
// devem ser vistos com um contabilista.

export type BlocoProva = { titulo: string; texto: string };
export type FaqProva = { q: string; a: string };
export type ProvaDetencao = {
  titulo: string;
  intro: string;
  blocos: BlocoProva[];
  /** Entram no bloco de perguntas da página e no FAQPage (mesma fonte). */
  faqs: FaqProva[];
  nota: string;
};

export const PROVA_DETENCAO: Partial<Record<string, Record<GuideLang, ProvaDetencao>>> = {
  PT: {
    pt: {
      titulo: "Como demonstrar que tens a cripto há mais de 365 dias",
      intro:
        "A regra é simples: o ganho de uma venda só está excluído de tributação se a cripto vendida tiver sido detida durante 365 dias ou mais. A dificuldade está em demonstrar a data em que compraste cada unidade. A lei não traz uma lista de documentos aceites, mas diz duas coisas que ajudam a preparar o dossier.",
      blocos: [
        {
          titulo: "O que a lei diz",
          texto:
            "Quem invoca um facto a seu favor tem de o provar (Lei Geral Tributária, art. 74.º). Se declaras um ganho como excluído por teres a cripto há mais de 365 dias, és tu que tens de mostrar a data de aquisição. O Código do IRS obriga também a guardar os documentos que sustentam a declaração durante quatro anos, que é o prazo em que as Finanças a podem rever. Os ganhos excluídos declaram-se na mesma, no anexo G1 do IRS; os tributados vão ao anexo G.",
        },
        {
          titulo: "O que convém guardar, por cada compra",
          texto:
            "Três coisas: a data, a quantidade e o que pagaste. Na prática isso são o extrato ou o histórico de ordens da corretora (exporta-o em CSV ou PDF enquanto a conta existe), o comprovativo da transferência bancária ou do cartão com que carregaste a conta, e, se moveste a cripto para uma carteira tua, o identificador da transação na blockchain, que fica público com data e hora. Um extrato bancário a mostrar o dinheiro a sair para a corretora, sem o registo da compra, prova o dinheiro mas não a cripto.",
        },
        {
          titulo: "DCA: compras todas as semanas e está tudo misturado",
          texto:
            "O Código do IRS manda usar o método FIFO: quando vendes, considera-se que vendes primeiro as unidades compradas há mais tempo. Por isso não precisas de escolher lotes; precisas da lista completa das compras com datas. Se vendes 0,1 BTC e as tuas compras mais antigas somam 0,1 BTC com mais de 365 dias, esse ganho está excluído. Se a venda for maior do que o que já passou os 365 dias, a parte que sobra vem dos lotes seguintes e é tributada a 28%. A mesma venda pode ter uma parte excluída e outra tributada.",
        },
        {
          titulo: "A corretora fechou ou não dá o histórico",
          texto:
            "Reúne o que restar: emails de confirmação de ordens, extratos bancários das transferências para a corretora com as datas, e o registo na blockchain do levantamento para a tua carteira. Se a corretora ainda responde a pedidos de dados pessoais, pede o histórico completo por escrito; na União Europeia tens esse direito ao abrigo do RGPD. Se nada disto existir, a data de aquisição fica sem prova, e o caminho seguro é falar com um contabilista antes de declarar.",
        },
        {
          titulo: "A cripto veio de uma carteira minha, sem corretora",
          texto:
            "A blockchain regista a data em que a cripto entrou no teu endereço e prova essa data. O que não prova é quanto pagaste, nem se a compra foi anterior à entrada. Junta o registo on-chain ao comprovativo da origem (a corretora de onde saiu, ou a operação em que a recebeste). Uma transferência entre carteiras tuas não é uma venda: o que conta para os 365 dias é a data em que adquiriste a cripto, não a data em que a moveste.",
        },
        {
          titulo: "O que o ChainFolioAI faz",
          texto:
            "Cada compra fica registada com data, quantidade e preço, seja por importação do CSV da corretora ou à mão. O cálculo aplica FIFO e, para cada venda, mostra de que lotes saiu, quantos dias cada lote esteve detido e se ficou abaixo ou acima dos 365 dias. Exportas o resultado em PDF ou Excel para levar ao contabilista. O registo é teu; a corretora pode fechar que ele fica.",
        },
      ],
      faqs: [
        {
          q: "Como é que provo às Finanças que tenho esta cripto há mais de um ano?",
          a: "Com o registo de cada compra: data, quantidade e valor pago. Na prática, o histórico da corretora, o comprovativo da transferência bancária e, se moveste a cripto para uma carteira tua, o identificador da transação na blockchain. A lei põe o ónus da prova do teu lado (LGT, art. 74.º) e não publica uma lista de documentos aceites; a aceitação é decidida caso a caso.",
        },
        {
          q: "Fiz DCA todas as semanas durante um ano e está tudo misturado. Como sei o que já passou os 365 dias?",
          a: "Pelo método FIFO, que o Código do IRS impõe: vende-se primeiro o que se comprou há mais tempo. Ordena as compras por data e soma a partir da mais antiga até chegar à quantidade vendida. O que tiver 365 dias ou mais está excluído; o resto é tributado a 28%. A mesma venda pode ter as duas partes.",
        },
        {
          q: "A corretora fechou e não consigo obter o histórico. E agora?",
          a: "Reúne o que restar: emails de confirmação, extratos bancários das transferências e o registo na blockchain do levantamento para a tua carteira. Se a corretora ainda existir, pede o histórico por escrito ao abrigo do RGPD. Sem nenhum registo, a data fica sem prova; fala com um contabilista antes de declarar.",
        },
        {
          q: "A cripto está numa carteira minha, sem corretora. Como comprovo a data?",
          a: "A blockchain prova a data em que a cripto entrou no teu endereço. Não prova o preço nem se a compra foi anterior, por isso junta o comprovativo da origem. Mover cripto entre carteiras tuas não é uma venda e não reinicia a contagem dos 365 dias.",
        },
      ],
      nota:
        "A lei não publica uma lista de documentos aceites para cripto; o que está acima é o que a lei exige e o que é boa prática de registo. A aceitação é decidida pelas Finanças caso a caso. Se não tens histórico de uma parte das compras, vê o caso com um contabilista antes de declarar.",
    },
    en: {
      titulo: "How to show you have held the crypto for more than 365 days",
      intro:
        "The rule is simple: the gain on a sale is excluded from tax only if the crypto sold was held for 365 days or more. The hard part is showing the date you bought each unit. The law does not list accepted documents, but it says two things that help you build the file.",
      blocos: [
        {
          titulo: "What the law says",
          texto:
            "Whoever relies on a fact has to prove it (General Tax Law, article 74). If you declare a gain as excluded because you held the crypto for more than 365 days, you are the one who has to show the acquisition date. The Personal Income Tax Code also requires you to keep the documents behind your return for four years, the period in which the tax authority can review it. Excluded gains are still declared, in annex G1 of the IRS return; taxed gains go in annex G.",
        },
        {
          titulo: "What to keep, for every purchase",
          texto:
            "Three things: the date, the amount and what you paid. In practice that means the exchange statement or order history (export it as CSV or PDF while the account exists), the bank transfer or card receipt used to fund the account, and, if you moved the crypto to your own wallet, the transaction id on the blockchain, which is public with date and time. A bank statement showing money going to the exchange, without the purchase record, proves the money but not the crypto.",
        },
        {
          titulo: "DCA: weekly buys and everything is mixed up",
          texto:
            "The Income Tax Code requires FIFO: when you sell, the units bought longest ago are treated as sold first. So you do not choose lots; you need the full list of purchases with dates. If you sell 0.1 BTC and your oldest purchases add up to 0.1 BTC held for more than 365 days, that gain is excluded. If the sale is larger than what has passed 365 days, the remainder comes from the next lots and is taxed at 28%. One sale can have an excluded part and a taxed part.",
        },
        {
          titulo: "The exchange closed or will not give you the history",
          texto:
            "Gather what is left: order confirmation emails, bank statements of the transfers to the exchange with their dates, and the blockchain record of the withdrawal to your wallet. If the exchange still answers personal data requests, ask for the full history in writing; in the European Union you have that right under the GDPR. If none of this exists, the acquisition date is unproven, and the safe route is to talk to an accountant before filing.",
        },
        {
          titulo: "The crypto came from my own wallet, no exchange",
          texto:
            "The blockchain records the date the crypto entered your address and proves that date. It does not prove what you paid, nor whether the purchase happened earlier. Pair the on-chain record with proof of origin (the exchange it came from, or the operation in which you received it). A transfer between your own wallets is not a sale: what counts for the 365 days is the date you acquired the crypto, not the date you moved it.",
        },
        {
          titulo: "What ChainFolioAI does",
          texto:
            "Every purchase is recorded with date, amount and price, either from the exchange CSV or entered by hand. The calculation applies FIFO and, for each sale, shows which lots it came from, how many days each lot was held and whether it fell under or over 365 days. You export the result as PDF or Excel for your accountant. The record is yours; the exchange can close and it stays.",
        },
      ],
      faqs: [
        {
          q: "How do I prove to the Portuguese tax authority that I have held this crypto for more than a year?",
          a: "With the record of each purchase: date, amount and price paid. In practice, the exchange history, the bank transfer receipt and, if you moved the crypto to your own wallet, the transaction id on the blockchain. The law puts the burden of proof on you (General Tax Law, article 74) and publishes no list of accepted documents; acceptance is decided case by case.",
        },
        {
          q: "I bought every week for a year and it is all mixed up. How do I know what has passed 365 days?",
          a: "Through FIFO, which the Income Tax Code requires: what was bought first is sold first. Sort purchases by date and add up from the oldest until you reach the amount sold. Whatever has 365 days or more is excluded; the rest is taxed at 28%. One sale can have both parts.",
        },
        {
          q: "The exchange closed and I cannot get the history. What now?",
          a: "Gather what is left: confirmation emails, bank statements of the transfers and the blockchain record of the withdrawal to your wallet. If the exchange still exists, request the history in writing under the GDPR. With no record at all, the date is unproven; talk to an accountant before filing.",
        },
        {
          q: "The crypto is in my own wallet, no exchange. How do I prove the date?",
          a: "The blockchain proves the date the crypto entered your address. It does not prove the price or whether the purchase was earlier, so pair it with proof of origin. Moving crypto between your own wallets is not a sale and does not restart the 365-day count.",
        },
      ],
      nota:
        "The law publishes no list of accepted documents for crypto; the above is what the law requires and what good record-keeping looks like. Acceptance is decided by the tax authority case by case. If part of your purchase history is missing, review the case with an accountant before filing.",
    },
  },
};

export function provaDetencao(code: string, lang: GuideLang): ProvaDetencao | null {
  return PROVA_DETENCAO[code]?.[lang] ?? null;
}
