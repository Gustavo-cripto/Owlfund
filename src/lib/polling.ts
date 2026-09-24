// Repetir um pedido "de vez em quando", so com o separador visivel.
//
// Cada pagina tinha o seu setInterval de 60 s a bater em /api/fx, /api/markets
// e afins, mesmo com a tab em fundo — 227 mil pedidos em 30 dias no plano
// Hobby (limite 1 M). Aqui: (1) o intervalo e mais folgado (cambios nao mexem
// ao minuto); (2) com a tab escondida nao se pede nada; (3) ao voltar a tab
// pede-se logo, para nunca se ver um valor velho ao regressar.
export function repetirVisivel(fn: () => void, intervaloMs: number): () => void {
  if (typeof window === "undefined") return () => {};
  let ultimo = Date.now();
  const correr = () => { ultimo = Date.now(); fn(); };
  const id = window.setInterval(() => { if (!document.hidden) correr(); }, intervaloMs);
  const aoVoltar = () => {
    // So se ja passou pelo menos metade do intervalo — evita pedir duas vezes
    // a quem so troca de tab por um segundo.
    if (!document.hidden && Date.now() - ultimo >= intervaloMs / 2) correr();
  };
  document.addEventListener("visibilitychange", aoVoltar);
  return () => { window.clearInterval(id); document.removeEventListener("visibilitychange", aoVoltar); };
}

export const DOIS_MIN = 2 * 60_000;
export const TRES_MIN = 3 * 60_000;
export const CINCO_MIN = 5 * 60_000;
