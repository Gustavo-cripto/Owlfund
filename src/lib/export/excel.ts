// Carregamento da biblioteca de Excel, partilhado pelos dois exportadores
// (portefólio e fiscalidade).
//
// Porquê um ficheiro só para isto: o `exceljs` é empacotado a partir do build
// de browser (o campo `browser` do package.json aponta para dist/exceljs.min.js),
// que é CommonJS. Conforme o empacotador, `await import("exceljs")` devolve o
// objeto direto ou embrulhado em `.default` — e havia código a assumir só uma
// das formas. Quando falha, falha em silêncio: `new undefined()` rebenta dentro
// de um onClick assíncrono e o utilizador não vê rigorosamente nada.
//
// Aqui procuramos o `Workbook` nas formas possíveis e, se não estiver em
// nenhuma, damos um erro que diz o que se passou.

type ExcelJSModule = typeof import("exceljs");

export async function loadExcelJS(): Promise<ExcelJSModule> {
  const mod = (await import("exceljs")) as unknown as Record<string, unknown>;
  const candidatos = [
    mod,
    mod.default as Record<string, unknown> | undefined,
    (mod.default as Record<string, unknown> | undefined)?.default as Record<string, unknown> | undefined,
  ];
  for (const c of candidatos) {
    if (c && typeof c.Workbook === "function") return c as unknown as ExcelJSModule;
  }
  throw new Error(
    `exceljs carregou mas sem Workbook (chaves: ${Object.keys(mod).slice(0, 8).join(", ") || "nenhuma"})`,
  );
}

/**
 * Descarrega o ficheiro. No telemóvel usa a folha de partilha nativa; no
 * computador, o download clássico.
 *
 * O `revoke` é adiado de propósito: revogar o URL imediatamente a seguir ao
 * clique cancela o download em alguns browsers.
 */
export async function downloadBlob(blob: Blob, filename: string): Promise<void> {
  const nav = navigator as Navigator & {
    canShare?: (d: { files: File[] }) => boolean;
    share?: (d: { files?: File[]; title?: string }) => Promise<void>;
  };
  const file = typeof File !== "undefined" ? new File([blob], filename, { type: blob.type }) : null;
  if (file && nav.canShare?.({ files: [file] }) && nav.share) {
    try {
      await nav.share({ files: [file], title: filename });
      return;
    } catch {
      // Partilha cancelada ou indisponível — cai no download normal.
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
