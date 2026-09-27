// Nota de rodape da faixa Ledger/Trezor, decidida por marca:
//   ambas afiliadas → hw_aff_note; nenhuma → hw_direct_note;
//   so uma → hw_aff_mixed_note com o nome de cada lado ({aff} / {direct}).
// Puro (sem React) para se testar em scripts/testes/notaAfiliados.test.ts.
export type NotaAfiliadosKey = "hw_aff_note" | "hw_direct_note" | "hw_aff_mixed_note";

export function notaAfiliados(
  t: (k: NotaAfiliadosKey) => string,
  marcas: ReadonlyArray<{ nome: string; afiliado: boolean }>,
): string {
  const aff = marcas.filter((m) => m.afiliado);
  if (aff.length === 0) return t("hw_direct_note");
  if (aff.length === marcas.length) return t("hw_aff_note");
  const direct = marcas.filter((m) => !m.afiliado);
  return t("hw_aff_mixed_note")
    .replace("{aff}", aff.map((m) => m.nome).join("/"))
    .replace("{direct}", direct.map((m) => m.nome).join("/"));
}
