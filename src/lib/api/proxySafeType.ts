// Como servir bytes de terceiros a partir do nosso domínio sem os deixar
// executar-se lá dentro.
//
// Os proxies de conteúdo (inscrições Ordinals, imagens IPFS) reenviavam a
// resposta com o Content-Type que o gateway devolvesse. Um SVG é um documento
// activo: bastava alguém inscrever ou pinar um SVG com <script> e navegar para
// o nosso endereço para esse script correr na origem chainfolioai.com.
// Inscrever ou pinar um ficheiro é trivial, e o identificador vai no URL, por
// isso quem ataca escolhe o conteúdo todo.
//
// Bloquear SVG não serve: há muito NFT que É um SVG, e deixaria de aparecer.
// A resposta certa é neutralizá-lo.
//
//   • Dentro de <img>, o browser já não executa scripts de um SVG. É assim que
//     a app o usa, e continua a funcionar.
//   • O perigo era navegar directamente para o endereço. Aí vale o cabeçalho
//     `sandbox` sem `allow-scripts`, que impede o documento de correr seja o
//     que for, e `default-src 'none'`, que lhe corta o acesso a tudo.
//   • Tipos que não são imagem nenhuma (HTML, XML, PDF) saem como ficheiro
//     para descarregar: não há caso de uso e não vale o risco.
//
// Os CSP são intersectados pelo browser, por isso este nunca alarga o global.

const IMAGENS = new Set([
  "image/png", "image/jpeg", "image/gif", "image/webp", "image/avif",
  "image/bmp", "image/x-icon", "image/svg+xml",
]);

/** Tipos não-imagem que a app usa mesmo (metadados de NFT). */
const DADOS = new Set(["application/json", "text/plain", "application/octet-stream"]);

/** Corta parâmetros (`; charset=…`) e normaliza. */
export const tipoBase = (ct: string): string => ct.split(";")[0].trim().toLowerCase();

export const ehImagem = (ct: string): boolean => IMAGENS.has(tipoBase(ct));

/**
 * Cabeçalhos com que um conteúdo de terceiros pode sair do nosso domínio.
 * `cache` é o Cache-Control a aplicar.
 */
export function cabecalhosDeConteudoExterno(ct: string, cache: string): Record<string, string> {
  const base = tipoBase(ct);
  const conhecido = IMAGENS.has(base) || DADOS.has(base) || base.startsWith("video/");
  return {
    "Content-Type": conhecido ? base : "application/octet-stream",
    ...(conhecido ? {} : { "Content-Disposition": 'attachment; filename="conteudo.bin"' }),
    // O muro que interessa: mesmo um SVG activo não corre nada aqui dentro.
    "Content-Security-Policy": "default-src 'none'; sandbox; base-uri 'none'; form-action 'none'",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": cache,
  };
}
