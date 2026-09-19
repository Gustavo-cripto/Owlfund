import { cabecalhosDeConteudoExterno, ehImagem, tipoBase } from "@/lib/api/proxySafeType";

// Conteudo de terceiros servido do nosso dominio. O risco e um SVG com
// <script> inscrito de proposito: navegar para o nosso endereco executava-o na
// origem chainfolioai.com.

let fails = 0;
const ok = (nome: string, cond: boolean, detalhe = "") => {
  if (!cond) fails++;
  console.log(`${cond ? "✅" : "❌"} ${nome}${detalhe ? `: ${detalhe}` : ""}`);
};
const CACHE = "public, max-age=60";

ok("tipo com parametros e normalizado", tipoBase("Image/PNG; charset=utf-8") === "image/png");

// Imagens passam como imagem — incluindo SVG, que ha muito NFT que e SVG.
for (const t of ["image/png", "image/jpeg", "image/webp", "image/svg+xml"]) {
  const h = cabecalhosDeConteudoExterno(t, CACHE);
  ok(`${t} sai como imagem`, h["Content-Type"] === t);
  ok(`${t} nao e descarregado a forca`, h["Content-Disposition"] === undefined);
  ok(`${t} e reconhecido como imagem`, ehImagem(t));
}

// TODAS as respostas levam o muro, nao so as suspeitas.
for (const t of ["image/png", "image/svg+xml", "text/html", "application/pdf", ""]) {
  const h = cabecalhosDeConteudoExterno(t, CACHE);
  const csp = h["Content-Security-Policy"] ?? "";
  ok(`${t || "(vazio)"}: sandbox sem allow-scripts`, csp.includes("sandbox") && !csp.includes("allow-scripts"));
  ok(`${t || "(vazio)"}: default-src none`, csp.includes("default-src 'none'"));
  ok(`${t || "(vazio)"}: nosniff`, h["X-Content-Type-Options"] === "nosniff");
}

// O que nao tem caso de uso nenhum sai como ficheiro, nunca renderizado.
for (const t of ["text/html", "application/xhtml+xml", "text/xml", "application/pdf", "text/javascript"]) {
  const h = cabecalhosDeConteudoExterno(t, CACHE);
  ok(`${t} nao e renderizado`, h["Content-Type"] === "application/octet-stream");
  ok(`${t} sai como ficheiro`, (h["Content-Disposition"] ?? "").startsWith("attachment"));
  ok(`${t} nao conta como imagem`, !ehImagem(t));
}

// Metadados de NFT continuam a funcionar.
for (const t of ["application/json", "text/plain", "application/octet-stream", "video/mp4"]) {
  ok(`${t} continua a passar`, cabecalhosDeConteudoExterno(t, CACHE)["Content-Type"] === t);
}

ok("o cache pedido e respeitado", cabecalhosDeConteudoExterno("image/png", CACHE)["Cache-Control"] === CACHE);

console.log(fails === 0 ? "\nTODOS OK" : `\n${fails} FALHA(S)`);
process.exit(fails ? 1 : 0);
