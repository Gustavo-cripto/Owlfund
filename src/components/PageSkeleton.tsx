"use client";

// Esqueleto com a forma da pagina enquanto a sessao/dados carregam.
//
// Substitui o "A carregar…" a piscar no meio de um ecra vazio: quem chega ve
// logo a silhueta do que vem (cabecalho, cartoes, grelha) e a pagina real
// dissolve-se por cima (.animate-reveal nos filhos), em vez de cair de repente.
// So blocos cinzentos — nada de texto, para nao mentir sobre o conteudo.

type Variant = "dashboard" | "page";

const bar = (w: string, h = "h-3") => <div className={`${h} ${w} rounded-md bg-slate-800/70`} />;
const card = (h: string, extra = "") => <div className={`${h} rounded-2xl border border-slate-800/80 bg-slate-900/50 ${extra}`} />;

export default function PageSkeleton({ variant = "page" }: { variant?: Variant }) {
  return (
    <div className="animate-pulse mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 pb-24 pt-8" aria-busy="true" aria-live="polite">
      {/* Cabecalho: avatar + titulo + subtitulo */}
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 shrink-0 rounded-full bg-slate-800/70" />
          <div className="flex flex-col gap-2.5">
            {bar("w-48", "h-5")}
            {bar("w-72")}
          </div>
        </div>
        {variant === "dashboard" && card("h-[120px]", "md:w-[340px]")}
      </div>

      {variant === "dashboard" ? (
        <>
          {card("h-16")}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <div key={i}>{card("h-36")}</div>)}
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-6 md:grid-cols-[1.2fr_0.8fr]">
            {card("h-56")}
            {card("h-56")}
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {card("h-72")}
            {card("h-72")}
          </div>
        </>
      )}
    </div>
  );
}
