import type { GuideLang } from "./countries";

// Secção "como demonstrar a data de aquisição" dos guias fiscais.
//
// Porque existe (30 set 2026): a pergunta que mais se repete, sem resposta, nos
// comentários de vídeos portugueses sobre IRS e cripto é "como provo às
// Finanças que tenho isto há mais de um ano?". Os guias explicavam a regra dos
// 365 dias e nada sobre como a demonstrar. Só entra nos países onde a pergunta
// faz sentido (prazo de detenção com efeito no imposto): PT 365 dias, DE 1 ano,
// LU 6 meses.
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
      titulo: "Como demonstrar que tens a cripto há 365 dias ou mais",
      intro:
        "A regra é simples: o ganho de uma venda só está excluído de tributação se a cripto vendida tiver sido detida durante 365 dias ou mais. A dificuldade está em demonstrar a data em que compraste cada unidade. A lei não traz uma lista de documentos aceites, mas diz duas coisas que ajudam a preparar o dossier.",
      blocos: [
        {
          titulo: "O que a lei diz",
          texto:
            "Quem invoca um facto a seu favor tem de o provar (Lei Geral Tributária, art. 74.º). Se declaras um ganho como excluído por teres a cripto há 365 dias ou mais, és tu que tens de mostrar a data de aquisição. O Código do IRS obriga também a guardar os documentos que sustentam a declaração durante quatro anos, que é o prazo em que as Finanças a podem rever. Os ganhos excluídos declaram-se na mesma, no anexo G1 do IRS; os tributados vão ao anexo G.",
        },
        {
          titulo: "O que convém guardar, por cada compra",
          texto:
            "Três coisas: a data, a quantidade e o que pagaste. Na prática isso são o extrato ou o histórico de ordens da corretora (exporta-o em CSV ou PDF enquanto a conta existe), o comprovativo da transferência bancária ou do cartão com que carregaste a conta, e, se moveste a cripto para uma carteira tua, o identificador da transação na blockchain, que fica público com data e hora. Um extrato bancário a mostrar o dinheiro a sair para a corretora, sem o registo da compra, prova o dinheiro mas não a cripto.",
        },
        {
          titulo: "DCA: compras todas as semanas e está tudo misturado",
          texto:
            "O Código do IRS manda usar o método FIFO (art. 43.º n.º 8 g)): quando vendes, considera-se que vendes primeiro as unidades compradas há mais tempo. A ordem conta-se dentro de cada corretora ou carteira, não no conjunto (art. 43.º n.º 9). Por isso não precisas de escolher lotes; precisas da lista completa das compras com datas, corretora a corretora. Se vendes 0,1 BTC e as tuas compras mais antigas somam 0,1 BTC com 365 dias ou mais, esse ganho está excluído. Se a venda for maior do que o que já passou os 365 dias, a parte que sobra vem dos lotes seguintes e é tributada a 28%. A mesma venda pode ter uma parte excluída e outra tributada.",
        },
        {
          titulo: "A corretora fechou ou não dá o histórico",
          texto:
            "Reúne o que restar: emails de confirmação de ordens, extratos bancários das transferências para a corretora com as datas, e o registo na blockchain do levantamento para a tua carteira. Se a corretora ainda responde a pedidos de dados pessoais, pede o histórico completo por escrito; na União Europeia tens esse direito ao abrigo do RGPD. O Código do IRS prevê que, se os documentos se extraviaram por motivo que não te é imputável, possas usar outros elementos de prova (art. 128.º n.º 4). Se nada disto existir, a data de aquisição fica sem prova, e o caminho seguro é falar com um contabilista antes de declarar.",
        },
        {
          titulo: "A cripto veio de uma carteira minha, sem corretora",
          texto:
            "A blockchain regista a data em que a cripto entrou no teu endereço e prova essa data. O que não prova é quanto pagaste, nem se a compra foi anterior à entrada. Junta o registo on-chain ao comprovativo da origem (a corretora de onde saiu, ou a operação em que a recebeste). Uma transferência entre carteiras tuas não é uma venda: o que conta para os 365 dias é a data em que adquiriste a cripto, não a data em que a moveste.",
        },
        {
          titulo: "O que o ChainFolioAI faz",
          texto:
            "Cada compra fica registada com data, quantidade e preço, seja por importação do CSV da corretora ou à mão. O cálculo aplica FIFO (ao conjunto das carteiras; ver a nota abaixo) e, para cada venda, mostra de que compras saiu, com as datas de compra e de venda, e se ficou abaixo ou acima dos 365 dias. Exportas o resultado em PDF ou Excel para levar ao contabilista. O registo é teu; a corretora pode fechar que ele fica.",
        },
      ],
      faqs: [
        {
          q: "Como é que provo às Finanças que tenho esta cripto há mais de um ano?",
          a: "Com o registo de cada compra: data, quantidade e valor pago. Na prática, o histórico da corretora, o comprovativo da transferência bancária e, se moveste a cripto para uma carteira tua, o identificador da transação na blockchain. A lei põe o ónus da prova do teu lado (LGT, art. 74.º) e não publica uma lista de documentos aceites; a aceitação é decidida caso a caso.",
        },
        {
          q: "Fiz DCA todas as semanas durante um ano e está tudo misturado. Como sei o que já passou os 365 dias?",
          a: "Pelo método FIFO, que o Código do IRS impõe (art. 43.º n.º 8 g)), contado dentro de cada corretora ou carteira (n.º 9): vende-se primeiro o que se comprou há mais tempo. Ordena as compras de cada corretora por data e soma a partir da mais antiga até chegar à quantidade vendida. O que tiver 365 dias ou mais está excluído; o resto é tributado a 28%. A mesma venda pode ter as duas partes.",
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
      titulo: "How to show you have held the crypto for 365 days or more",
      intro:
        "The rule is simple: the gain on a sale is excluded from tax only if the crypto sold was held for 365 days or more. The hard part is showing the date you bought each unit. The law does not list accepted documents, but it says two things that help you build the file.",
      blocos: [
        {
          titulo: "What the law says",
          texto:
            "Whoever relies on a fact has to prove it (General Tax Law, article 74). If you declare a gain as excluded because you held the crypto for 365 days or more, you are the one who has to show the acquisition date. The Personal Income Tax Code also requires you to keep the documents behind your return for four years, the period in which the tax authority can review it. Excluded gains are still declared, in annex G1 of the IRS return; taxed gains go in annex G.",
        },
        {
          titulo: "What to keep, for every purchase",
          texto:
            "Three things: the date, the amount and what you paid. In practice that means the exchange statement or order history (export it as CSV or PDF while the account exists), the bank transfer or card receipt used to fund the account, and, if you moved the crypto to your own wallet, the transaction id on the blockchain, which is public with date and time. A bank statement showing money going to the exchange, without the purchase record, proves the money but not the crypto.",
        },
        {
          titulo: "DCA: weekly buys and everything is mixed up",
          texto:
            "The Income Tax Code requires FIFO (art. 43(8)(g)): when you sell, the units bought longest ago are treated as sold first. The order is counted within each exchange or wallet, not across all of them (art. 43(9)). So you do not choose lots; you need the full list of purchases with dates, exchange by exchange. If you sell 0.1 BTC and your oldest purchases add up to 0.1 BTC held for 365 days or more, that gain is excluded. If the sale is larger than what has passed 365 days, the remainder comes from the next lots and is taxed at 28%. One sale can have an excluded part and a taxed part.",
        },
        {
          titulo: "The exchange closed or will not give you the history",
          texto:
            "Gather what is left: order confirmation emails, bank statements of the transfers to the exchange with their dates, and the blockchain record of the withdrawal to your wallet. If the exchange still answers personal data requests, ask for the full history in writing; in the European Union you have that right under the GDPR. The Income Tax Code provides that, if the documents were lost for reasons not attributable to you, other evidence may be used (art. 128(4)). If none of this exists, the acquisition date is unproven, and the safe route is to talk to an accountant before filing.",
        },
        {
          titulo: "The crypto came from my own wallet, no exchange",
          texto:
            "The blockchain records the date the crypto entered your address and proves that date. It does not prove what you paid, nor whether the purchase happened earlier. Pair the on-chain record with proof of origin (the exchange it came from, or the operation in which you received it). A transfer between your own wallets is not a sale: what counts for the 365 days is the date you acquired the crypto, not the date you moved it.",
        },
        {
          titulo: "What ChainFolioAI does",
          texto:
            "Every purchase is recorded with date, amount and price, either from the exchange CSV or entered by hand. The calculation applies FIFO (across all wallets; see the note below) and, for each sale, shows which purchases it came from, with buy and sell dates, and whether it fell under or over 365 days. You export the result as PDF or Excel for your accountant. The record is yours; the exchange can close and it stays.",
        },
      ],
      faqs: [
        {
          q: "How do I prove to the Portuguese tax authority that I have held this crypto for more than a year?",
          a: "With the record of each purchase: date, amount and price paid. In practice, the exchange history, the bank transfer receipt and, if you moved the crypto to your own wallet, the transaction id on the blockchain. The law puts the burden of proof on you (General Tax Law, article 74) and publishes no list of accepted documents; acceptance is decided case by case.",
        },
        {
          q: "I bought every week for a year and it is all mixed up. How do I know what has passed 365 days?",
          a: "Through FIFO, which the Income Tax Code requires (art. 43(8)(g)), counted within each exchange or wallet (43(9)): what was bought first is sold first. Sort each exchange's purchases by date and add up from the oldest until you reach the amount sold. Whatever has 365 days or more is excluded; the rest is taxed at 28%. One sale can have both parts.",
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
  DE: {
    pt: {
      titulo: "Como demonstrar que tens a cripto há mais de um ano",
      intro:
        "Na Alemanha, o ganho de uma venda privada de cripto só fica isento se a cripto tiver sido detida durante mais de um ano (§ 23 EStG). Abaixo disso, o ganho é tributado à tua taxa marginal, com a Freigrenze de €1.000 por ano para o conjunto das vendas privadas. Tal como em Portugal, a dificuldade não está na regra, está em demonstrar a data de cada compra.",
      blocos: [
        {
          titulo: "O que a lei diz",
          texto:
            "O contribuinte tem o dever de colaborar e de esclarecer os factos que declara (§ 90 AO), e é a ele que cabe demonstrar o que lhe é favorável, como a isenção por prazo. A circular do Ministério das Finanças sobre cripto (BMF-Schreiben de 10 de maio de 2022, atualizada a 6 de março de 2025) descreve os deveres de registo e o que a administração fiscal espera ver: para cada operação, a data, a quantidade, o valor em euros e a carteira ou plataforma envolvida. A circular admite relatórios e extratos das plataformas e registos da blockchain como documentação, se forem plausíveis e completos (n.º 90), e diz expressamente que a falta de registos, por exemplo por insolvência da plataforma, corre por conta do contribuinte (n.º 89).",
        },
        {
          titulo: "O que convém guardar, por cada compra",
          texto:
            "Data, quantidade e valor em euros. Na prática: o histórico de ordens da plataforma (exporta-o em CSV enquanto a conta existe), o comprovativo bancário do carregamento e, se moveste a cripto para uma carteira tua, o identificador da transação na blockchain, público e com data. Um extrato bancário sozinho prova que o dinheiro saiu, não que a cripto foi comprada nesse dia.",
        },
        {
          titulo: "Sparplan ou DCA: compras regulares e está tudo misturado",
          texto:
            "Para o prazo aplica-se FIFO, carteira a carteira: dentro de cada carteira ou conta, considera-se vendido primeiro o que foi comprado há mais tempo (n.º 61 da circular). Para o custo, a circular prevê por defeito o custo médio, com o FIFO admitido por simplificação; a escolha fica fixa por carteira até a esvaziares (n.º 62). Ordena as compras dessa carteira por data e soma a partir da mais antiga até chegar à quantidade vendida. O que tiver mais de um ano está isento; o resto é tributado, e a mesma venda pode ter as duas partes. Como a contagem é por carteira, mover cripto entre carteiras tuas não a torna 'mais antiga' nem 'mais recente'.",
        },
        {
          titulo: "A plataforma fechou ou não dá o histórico",
          texto:
            "Reúne o que restar: emails de confirmação, extratos bancários das transferências com data e o registo na blockchain do levantamento para a tua carteira. Se a plataforma ainda existir na União Europeia, pede o histórico completo por escrito ao abrigo do RGPD. Sem nenhum registo, o prazo fica por demonstrar; fala com um Steuerberater antes de declarar.",
        },
        {
          titulo: "A cripto veio de uma carteira minha, sem plataforma",
          texto:
            "A blockchain prova a data em que a cripto entrou no endereço, não o preço nem se a compra foi anterior. Junta o registo on-chain ao comprovativo da origem. Nota: se a cripto foi usada em staking ou lending, o prazo de um ano mantém-se; a regra dos dez anos foi afastada pela circular de 2022.",
        },
        {
          titulo: "O que o ChainFolioAI faz",
          texto:
            "Regista cada compra com data, quantidade e preço, a partir do CSV da plataforma ou à mão, aplica FIFO ao conjunto das carteiras (ver a nota abaixo) e mostra, por cada venda, de que compras saiu, com as datas, e se passou o ano. Exportas em PDF ou Excel para a Anlage SO ou para o Steuerberater.",
        },
      ],
      faqs: [
        {
          q: "Como provo ao Finanzamt que tenho a cripto há mais de um ano?",
          a: "Com o registo de cada compra: data, quantidade e valor em euros. Na prática, o histórico da plataforma, o comprovativo bancário e o identificador da transação na blockchain se a moveste para uma carteira tua. A circular do BMF sobre cripto (2022, atualizada em 2025) descreve os deveres de registo e admite extratos das plataformas e registos da blockchain como documentação; a apreciação final é do Finanzamt.",
        },
        {
          q: "Tenho um Sparplan de cripto e está tudo misturado. Como sei o que já passou o ano?",
          a: "Por FIFO, dentro de cada carteira: o que foi comprado primeiro conta como vendido primeiro. Ordena as compras por data e soma a partir da mais antiga até à quantidade vendida. O que tiver mais de um ano está isento; o resto é tributado à tua taxa marginal, e a mesma venda pode ter as duas partes.",
        },
        {
          q: "A plataforma fechou e não consigo obter o histórico. E agora?",
          a: "Reúne emails de confirmação, extratos bancários das transferências e o registo na blockchain do levantamento para a tua carteira. Se a plataforma ainda existir na UE, pede o histórico por escrito ao abrigo do RGPD. Sem registos, fala com um Steuerberater antes de declarar.",
        },
      ],
      nota:
        "A circular do BMF descreve deveres de registo e exemplos de documentação, mas a apreciação é feita caso a caso pelo Finanzamt. O que está acima é a lei e a boa prática de registo; se te falta histórico de uma parte das compras, vê o caso com um Steuerberater antes de declarar.",
    },
    en: {
      titulo: "How to show you have held the crypto for more than one year",
      intro:
        "In Germany, the gain on a private sale of crypto is exempt only if the crypto was held for more than one year (§ 23 EStG). Below that, the gain is taxed at your marginal rate, with the €1,000 Freigrenze per year for all private sales together. As in Portugal, the rule is the easy part; showing the date of each purchase is the hard one.",
      blocos: [
        {
          titulo: "What the law says",
          texto:
            "The taxpayer has a duty to cooperate and to clarify the facts declared (§ 90 AO), and it is the taxpayer who has to show what works in their favour, such as the holding-period exemption. The Federal Ministry of Finance's circular on crypto (BMF letter of 10 May 2022, updated on 6 March 2025) describes record-keeping duties and what the tax office expects to see: for each transaction, the date, the amount, the euro value and the wallet or platform involved. The circular accepts platform reports and statements and blockchain records as documentation, provided they are plausible and complete (para. 90), and states expressly that missing records, for example after a platform's insolvency, are at the taxpayer's expense (para. 89).",
        },
        {
          titulo: "What to keep, for every purchase",
          texto:
            "Date, amount and euro value. In practice: the platform's order history (export it as CSV while the account exists), the bank receipt for the deposit and, if you moved the crypto to your own wallet, the transaction id on the blockchain, public and dated. A bank statement alone proves the money left, not that the crypto was bought that day.",
        },
        {
          titulo: "Savings plan or DCA: regular buys and everything is mixed up",
          texto:
            "For the holding period FIFO applies, wallet by wallet: within each wallet or account, what was bought longest ago is treated as sold first (para. 61 of the circular). For the cost, the circular provides for the average cost by default, with FIFO allowed as a simplification; the choice is fixed per wallet until it is emptied (para. 62). Sort that wallet's purchases by date and add up from the oldest until you reach the amount sold. Whatever has more than one year is exempt; the rest is taxed, and one sale can have both parts. Because the count is per wallet, moving crypto between your own wallets does not make it 'older' or 'newer'.",
        },
        {
          titulo: "The platform closed or will not give you the history",
          texto:
            "Gather what is left: confirmation emails, dated bank statements of the transfers and the blockchain record of the withdrawal to your wallet. If the platform still exists in the European Union, request the full history in writing under the GDPR. With no record at all, the holding period is unproven; talk to a Steuerberater before filing.",
        },
        {
          titulo: "The crypto came from my own wallet, no platform",
          texto:
            "The blockchain proves the date the crypto entered the address, not the price or whether the purchase was earlier. Pair the on-chain record with proof of origin. Note: if the crypto was used for staking or lending, the one-year period still applies; the ten-year rule was ruled out by the 2022 circular.",
        },
        {
          titulo: "What ChainFolioAI does",
          texto:
            "It records every purchase with date, amount and price, from the platform CSV or by hand, applies FIFO across all wallets (see the note below) and shows, for each sale, which purchases it came from, with dates, and whether it passed the year. You export to PDF or Excel for Anlage SO or for your Steuerberater.",
        },
      ],
      faqs: [
        {
          q: "How do I prove to the Finanzamt that I have held the crypto for more than a year?",
          a: "With the record of each purchase: date, amount and euro value. In practice, the platform history, the bank receipt and the blockchain transaction id if you moved it to your own wallet. The BMF circular on crypto (2022, updated 2025) describes record-keeping duties and accepts platform statements and blockchain records as documentation; the final assessment is the Finanzamt's.",
        },
        {
          q: "I have a crypto savings plan and it is all mixed up. How do I know what has passed the year?",
          a: "Through FIFO, within each wallet: what was bought first counts as sold first. Sort purchases by date and add up from the oldest until you reach the amount sold. Whatever has more than one year is exempt; the rest is taxed at your marginal rate, and one sale can have both parts.",
        },
        {
          q: "The platform closed and I cannot get the history. What now?",
          a: "Gather confirmation emails, bank statements of the transfers and the blockchain record of the withdrawal to your wallet. If the platform still exists in the EU, request the history in writing under the GDPR. With no records, talk to a Steuerberater before filing.",
        },
      ],
      nota:
        "The BMF circular describes record-keeping duties and examples of documentation, but the assessment is made case by case by the Finanzamt. The above is the law and good record-keeping practice; if part of your purchase history is missing, review the case with a Steuerberater before filing.",
    },
  },
  LU: {
    pt: {
      titulo: "Como demonstrar que tens a cripto há mais de seis meses",
      intro:
        "No Luxemburgo, o ganho de um particular só é tributado se a cripto for vendida até seis meses depois da compra: é o ganho 'especulativo' do art. 99bis LIR, tributado às taxas progressivas, com isenção se o total do ano ficar abaixo de €500. Passados os seis meses, o ganho fica fora do imposto. Seis meses passam depressa, e quem compra ao longo do ano tem sempre lotes dos dois lados da linha.",
      blocos: [
        {
          titulo: "O que a lei diz",
          texto:
            "O contribuinte tem o dever de colaborar com a administração e de demonstrar os factos que declara (§ 171 da Abgabenordnung, que continua a reger o procedimento fiscal no Luxemburgo). A circular da Administration des contributions directes sobre moedas virtuais (circulaire L.I.R. n.º 14/5 - 99/3 - 99bis/3, de 26 de julho de 2018) confirma que a venda de cripto por um particular é um ganho especulativo se ocorrer até seis meses depois da aquisição, e que o contribuinte deve conseguir documentar as datas e os valores de aquisição e de venda.",
        },
        {
          titulo: "O que convém guardar, por cada compra",
          texto:
            "Data, quantidade e valor em euros. Na prática: o histórico da plataforma (exporta-o enquanto a conta existe), o comprovativo bancário do carregamento e, se moveste a cripto para uma carteira tua, o identificador da transação na blockchain. A troca de cripto por cripto conta como alienação: guarda também a data e o valor dessas trocas.",
        },
        {
          titulo: "Compras regulares e está tudo misturado",
          texto:
            "Com compras espaçadas, cada lote tem a sua própria data e a linha dos seis meses corta a posição ao meio. Ordena as compras por data: o que tiver mais de seis meses no dia da venda fica fora do imposto; o que tiver seis meses ou menos é especulativo. A mesma venda pode ter as duas partes. Atenção ao custo de aquisição: a circular de 2018 manda usar o preço médio ponderado quando as unidades não são identificáveis, e exclui FIFO e LIFO. O ChainFolioAI aplica o preço médio ao custo e usa a ordem das compras só para saber que quantidade já passou os seis meses; confirma o valor a declarar com o contabilista.",
        },
        {
          titulo: "A plataforma fechou ou não dá o histórico",
          texto:
            "Reúne o que restar: emails de confirmação, extratos bancários das transferências com data e o registo na blockchain do levantamento para a tua carteira. Se a plataforma ainda existir na União Europeia, pede o histórico por escrito ao abrigo do RGPD. Sem registos, a data de aquisição fica por demonstrar; fala com um contabilista antes de declarar.",
        },
        {
          titulo: "A cripto veio de uma carteira minha, sem plataforma",
          texto:
            "A blockchain prova a data em que a cripto entrou no endereço, não o preço nem se a compra foi anterior. Junta o registo on-chain ao comprovativo da origem. Uma transferência entre carteiras tuas não é uma alienação e não reinicia a contagem dos seis meses.",
        },
        {
          titulo: "O que o ChainFolioAI faz",
          texto:
            "Regista cada compra e cada troca com data, quantidade e valor e mostra, por cada venda, as datas de compra e de venda de cada lote e se ficou dentro ou fora dos seis meses. O ganho calcula-se pelo preço médio ponderado, como a circular exige, com a ordem das compras a decidir o que já passou os seis meses; exportas em PDF ou Excel para o contabilista fechar o valor a declarar no modelo 100.",
        },
      ],
      faqs: [
        {
          q: "Como provo à administração fiscal que tenho a cripto há mais de seis meses?",
          a: "Com o registo de cada compra: data, quantidade e valor em euros. Na prática, o histórico da plataforma, o comprovativo bancário e o identificador da transação na blockchain se a moveste para uma carteira tua. O dever de demonstrar é do contribuinte (§ 171 AO) e a circular de 2018 sobre moedas virtuais pede que as datas e os valores de aquisição e venda estejam documentados; a apreciação é feita caso a caso.",
        },
        {
          q: "Compro todos os meses e está tudo misturado. Como sei o que já passou os seis meses?",
          a: "A circular não diz como atribuir as unidades vendidas ao prazo: diz que é especulativo o ganho das unidades em relação às quais não consigas demonstrar que estiveram mais de seis meses na tua posse. Por isso a prova é por unidade: ordena as compras por data e guarda os registos; o que conseguires demonstrar com mais de seis meses no dia da venda fica fora do imposto, o resto é ganho especulativo, tributado às taxas progressivas se o total do ano passar €500. O custo de aquisição na declaração é pelo preço médio ponderado (a circular exclui FIFO); confirma o valor com o contabilista.",
        },
        {
          q: "A plataforma fechou e não consigo obter o histórico. E agora?",
          a: "Reúne emails de confirmação, extratos bancários das transferências e o registo na blockchain do levantamento para a tua carteira. Se a plataforma ainda existir na UE, pede o histórico por escrito ao abrigo do RGPD. Sem registos, fala com um contabilista antes de declarar.",
        },
      ],
      nota:
        "A circular de 2018 pede documentação das datas e valores, mas não publica uma lista fechada de documentos aceites; a apreciação é da Administration des contributions directes, caso a caso. Se te falta histórico de uma parte das compras, vê o caso com um contabilista antes de declarar.",
    },
    en: {
      titulo: "How to show you have held the crypto for more than six months",
      intro:
        "In Luxembourg, a private individual's gain is taxed only if the crypto is sold within six months of purchase: that is the 'speculative' gain of article 99bis LIR, taxed at progressive rates, exempt if the year's total stays below €500. After six months the gain falls outside the tax. Six months pass quickly, and anyone buying through the year always has lots on both sides of the line.",
      blocos: [
        {
          titulo: "What the law says",
          texto:
            "The taxpayer has a duty to cooperate with the administration and to substantiate the facts declared (§ 171 of the Abgabenordnung, which still governs tax procedure in Luxembourg). The Administration des contributions directes' circular on virtual currencies (circulaire L.I.R. n° 14/5 - 99/3 - 99bis/3 of 26 July 2018) confirms that a private sale of crypto is a speculative gain if it happens within six months of acquisition, and that the taxpayer must be able to document acquisition and sale dates and values.",
        },
        {
          titulo: "What to keep, for every purchase",
          texto:
            "Date, amount and euro value. In practice: the platform history (export it while the account exists), the bank receipt for the deposit and, if you moved the crypto to your own wallet, the transaction id on the blockchain. A crypto-to-crypto swap counts as a disposal: keep the date and value of those swaps too.",
        },
        {
          titulo: "Regular buys and everything is mixed up",
          texto:
            "With spaced-out purchases, each lot has its own date and the six-month line cuts the position in two. Sort purchases by date: whatever is more than six months old on the day of sale falls outside the tax; whatever is six months or less is speculative. One sale can have both parts. Mind the acquisition cost: the 2018 circular requires the weighted average price when units cannot be identified, and excludes FIFO and LIFO. ChainFolioAI applies the average price to the cost and uses the order of purchases only to tell how much has passed six months; confirm the figure to declare with your accountant.",
        },
        {
          titulo: "The platform closed or will not give you the history",
          texto:
            "Gather what is left: confirmation emails, dated bank statements of the transfers and the blockchain record of the withdrawal to your wallet. If the platform still exists in the European Union, request the full history in writing under the GDPR. With no records, the acquisition date is unproven; talk to an accountant before filing.",
        },
        {
          titulo: "The crypto came from my own wallet, no platform",
          texto:
            "The blockchain proves the date the crypto entered the address, not the price or whether the purchase was earlier. Pair the on-chain record with proof of origin. A transfer between your own wallets is not a disposal and does not restart the six-month count.",
        },
        {
          titulo: "What ChainFolioAI does",
          texto:
            "It records every purchase and swap with date, amount and value and shows, for each sale, each lot's purchase and sale dates and whether it fell inside or outside six months. The gain is computed at the weighted average price, as the circular requires, with the order of purchases deciding what has passed six months; you export to PDF or Excel so your accountant can settle the figure to declare on form 100.",
        },
      ],
      faqs: [
        {
          q: "How do I prove to the tax administration that I have held the crypto for more than six months?",
          a: "With the record of each purchase: date, amount and euro value. In practice, the platform history, the bank receipt and the blockchain transaction id if you moved it to your own wallet. The duty to substantiate lies with the taxpayer (§ 171 AO) and the 2018 circular on virtual currencies asks for acquisition and sale dates and values to be documented; the assessment is made case by case.",
        },
        {
          q: "I buy every month and it is all mixed up. How do I know what has passed six months?",
          a: "The circular does not say how to assign the units sold to the holding period: it says the gain is speculative for the units you cannot show were held for more than six months. So the proof is per unit: sort purchases by date and keep the records; whatever you can show was held more than six months on the day of sale falls outside the tax, the rest is a speculative gain, taxed at progressive rates if the year's total exceeds €500. The acquisition cost in the return is the weighted average price (the circular excludes FIFO); confirm the figure with your accountant.",
        },
        {
          q: "The platform closed and I cannot get the history. What now?",
          a: "Gather confirmation emails, bank statements of the transfers and the blockchain record of the withdrawal to your wallet. If the platform still exists in the EU, request the history in writing under the GDPR. With no records, talk to an accountant before filing.",
        },
      ],
      nota:
        "The 2018 circular asks for dates and values to be documented but publishes no closed list of accepted documents; the assessment is the Administration des contributions directes', case by case. If part of your purchase history is missing, review the case with an accountant before filing.",
    },
  },
};

export function provaDetencao(code: string, lang: GuideLang): ProvaDetencao | null {
  return PROVA_DETENCAO[code]?.[lang] ?? null;
}
