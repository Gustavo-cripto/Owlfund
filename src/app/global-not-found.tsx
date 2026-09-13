// 404 para enderecos que nao caem em NENHUM layout raiz.
//
// E a convencao `global-not-found` do Next (experimental.globalNotFound), feita
// para apps com varios layouts raiz: o Next salta o render normal e devolve
// isto diretamente, por isso TEM de trazer o seu proprio <html> e <body> e nao
// pode usar os providers (sem i18n, sem tema). Um `not-found.tsx` na raiz
// dava um <html> aninhado dentro do invólucro de erro do Next.
// Os 404 dentro de /en, /es, /fr ou da raiz portuguesa usam a pagina
// traduzida de cada grupo (o catch-all [...rest] de cada idioma trata disso).
import type { Metadata } from "next";
import "@/app/globals.css";

export const metadata: Metadata = { title: "404 · ChainFolioAI" };

export default function GlobalNotFound() {
  return (
    <html lang="pt-PT">
      <body className="antialiased">
        <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-6 text-center text-slate-100">
          <img src="/chainfolioai-icon.png" alt="" className="mb-6 h-16 w-16 rounded-2xl object-cover" />
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-300/80">404</p>
          <h1 className="mt-3 text-3xl font-bold text-white md:text-4xl">Página não encontrada</h1>
          <p className="mt-2 text-slate-400">Page not found · Página no encontrada · Page introuvable</p>
          <a href="/" className="mt-8 rounded-xl bg-orange-500 px-8 py-3 text-sm font-bold text-slate-950 hover:bg-orange-400">chainfolioai.com</a>
        </div>
      </body>
    </html>
  );
}
