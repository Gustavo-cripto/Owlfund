// É uma página a ser ABERTA (documento), ou um pedido de fundo do Next?
//
// Os <Link> do Next pré-carregam páginas (prefetch) e as navegações dentro do
// site pedem só o "RSC payload" com fetch(). O middleware tentava excluí-los
// pelos cabeçalhos `next-router-prefetch`/`purpose`, mas o Next retira os seus
// cabeçalhos internos antes de chamar o middleware — cada prefetch contava como
// visita (4 por página no Next 15, 8 no Next 16, medido a 28 set 2026).
//
// Estes dois cabeçalhos são do BROWSER e o Next não os toca:
// - `Sec-Fetch-Dest`: "document" numa página aberta; "empty" num fetch().
// - `Accept`: uma página aberta pede text/html; o fetch do RSC pede */*.
// Robôs sem Sec-Fetch-* contam pelo Accept (curl, por omissão, não pede HTML).
export function eAberturaDePagina(h: { get(nome: string): string | null }): boolean {
  const destino = h.get("sec-fetch-dest");
  if (destino) return destino === "document";
  return (h.get("accept") ?? "").includes("text/html");
}
