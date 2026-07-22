// Estilos de botão partilhados. Só o "look" (cor, forma, sombra, hover) —
// cada botão acrescenta o seu tamanho/largura (px, py, text-size, w-full).
//
//   <a className={`${btnPrimary} px-8 py-3.5 text-base`}>…</a>
//
// A pílula (rounded-full) é intencional: mantém a coerência com os inputs e
// chips do site, que também são redondos.

const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all duration-200 active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none";

// Ação principal — laranja com gradiente subtil e brilho interior no topo.
export const btnPrimary =
  `${btnBase} bg-gradient-to-b from-orange-400 to-orange-500 text-slate-950 ring-1 ring-inset ring-white/15 shadow-lg shadow-orange-500/20 hover:from-orange-300 hover:to-orange-400 hover:shadow-orange-400/30`;

// Ação secundária — contorno que insinua o laranja do site ao passar o rato.
export const btnSecondary =
  `${btnBase} border border-slate-700 bg-slate-900/40 text-slate-200 backdrop-blur hover:border-orange-400/50 hover:bg-slate-800/60 hover:text-white`;
