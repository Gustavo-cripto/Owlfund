// Moedas com câmbio histórico publicado.
//
// Todo o câmbio do site (browser e servidor) vem do feed de referência do BCE,
// através do Frankfurter. O BCE publica estas trinta e mais nenhuma. Uma moeda
// fora da lista não é "o fornecedor está em baixo": é "nunca vai haver taxa",
// e as duas coisas têm de se ler de maneira diferente.
//
// Havia países na lista de regimes fiscais cuja moeda não está aqui (Emirados
// em AED, Argentina em ARS). O relatório desses países saía com todos os lotes
// descartados e imposto zero, com ar de resposta. O teste em
// scripts/testes/fxSupported.test.ts falha o build se voltar a acontecer.

export const FX_SUPPORTED: ReadonlySet<string> = new Set([
  "AUD", "BRL", "CAD", "CHF", "CNY", "CZK", "DKK", "EUR", "GBP", "HKD",
  "HUF", "IDR", "ILS", "INR", "ISK", "JPY", "KRW", "MXN", "MYR", "NOK",
  "NZD", "PHP", "PLN", "RON", "SEK", "SGD", "THB", "TRY", "USD", "ZAR",
]);

export const fxSuportada = (moeda: string): boolean => FX_SUPPORTED.has(moeda.toUpperCase());
