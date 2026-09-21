// Rede de segurança para a navegação do menu.
//
// O PROBLEMA QUE ISTO RESOLVE, observado a 21 de setembro de 2026: um separador
// aberto há horas, que atravessou vários deploys, deixa de navegar. Clica-se num
// item do menu e não acontece nada — sem erro à vista, sem pedido ao servidor.
// A causa é conhecida: o separador corre um build que já não existe no servidor,
// por isso os pedidos internos do router falham em silêncio. O resto da página
// continua viva (os preços continuam a atualizar), o que faz parecer avaria do
// menu. Nos registos vê-se pelo que FALTA: nem um pedido às páginas, nem os
// pré-carregamentos que deviam acompanhar cada item.
//
// A SOLUÇÃO: não tentar adivinhar a causa. Se, passado um tempo generoso, o
// endereço não mudou para onde a pessoa pediu, faz-se a navegação à moda antiga
// — que recarrega a página e, de caminho, traz o build novo. Uma navegação
// normal muda o endereço muito antes disto.
const ESPERA_MS = 2000;

let pendente: ReturnType<typeof setTimeout> | null = null;

/** Chamar no clique de um link de navegação, com o mesmo href do link. */
export function garantirNavegacao(href: string): void {
  if (typeof window === "undefined") return;
  if (pendente) clearTimeout(pendente);

  const alvo = new URL(href, window.location.origin);
  const destino = `${alvo.pathname}${alvo.search}`;
  const partida = `${window.location.pathname}${window.location.search}`;
  // Clicar no item onde já se está não é navegação: não há nada por que esperar.
  if (destino === partida) return;

  pendente = setTimeout(() => {
    pendente = null;
    const agora = `${window.location.pathname}${window.location.search}`;
    if (agora === destino || agora !== partida) return;   // navegou, ou foi para outro lado
    window.location.assign(alvo.href);
  }, ESPERA_MS);
}
