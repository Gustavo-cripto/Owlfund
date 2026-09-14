"use client";

import dynamic from "next/dynamic";

// Provider do layout raiz /. O dicionario de pt vem por next/dynamic e nao por
// import estatico, DE PROPOSITO: os modulos cliente que todos os layouts
// partilham (FloatingChat, ThemeContext, analytics, globals.css) ficam, no
// build, dentro do grupo de chunks de UM dos layouts — o primeiro que o
// webpack processa — e todas as paginas dos outros layouts passam a carregar
// esse grupo inteiro. Com o dicionario estatico, isso punha a lingua desse
// layout (127 KB) em todas as paginas do site. Num chunk assincrono nunca
// entra no grupo de nenhum layout. O servidor continua a renderizar o HTML
// completo, o Next pre-carrega o chunk, e a hidratacao espera por ele sem
// tirar o texto do ecra — nao ha flash.
const Inner = dynamic(() => import("./PtInner"));

export default function LanguageProviderPt({ children }: { children: React.ReactNode }) {
  return <Inner>{children}</Inner>;
}
