// Numeros escritos por pessoas: "0,0100", "1.234,56", "1,234.56", " 65 000 ".
//
// Porque nao <input type="number">: no iPhone em portugues o teclado escreve
// virgula, o Safari considera "0,01" invalido e o campo fica vazio — nao se
// conseguia registar 0,0100 BTC. Um campo de texto com inputMode="decimal"
// aceita os dois separadores e nos interpretamos aqui.
export function parseDecimal(raw: string): number {
  let v = raw.replace(/[€$£\s ']/g, "").trim();
  if (!v) return NaN;
  if (v.includes(",") && v.includes(".")) {
    // O ultimo separador e o decimal; o outro e de milhares.
    v = v.lastIndexOf(",") > v.lastIndexOf(".") ? v.replace(/\./g, "").replace(",", ".") : v.replace(/,/g, "");
  } else if (v.includes(",")) {
    // So virgulas: uma e decimal ("0,01"); varias sao milhares ("1,234,567").
    v = (v.match(/,/g) ?? []).length > 1 ? v.replace(/,/g, "") : v.replace(",", ".");
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

/** So digitos, um separador decimal (virgula ou ponto) e nada mais — para filtrar o que se escreve. */
export function cleanDecimalInput(raw: string): string {
  return raw.replace(/[^0-9.,]/g, "").replace(/^([^.,]*[.,])(.*)$/, (_m, a: string, b: string) => a + b.replace(/[.,]/g, ""));
}
