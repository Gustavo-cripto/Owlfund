import { notFound } from "next/navigation";

// Sem isto, um caminho desconhecido dentro deste idioma (/en/xyz) caia no 404
// global, sem providers — em portugues. Com o catch-all, o Next resolve-o
// dentro deste layout raiz e mostra a pagina 404 traduzida.
export default function CatchAll() {
  notFound();
}
