"use client";

// Esqueleto com a forma da pagina enquanto a sessao/dados carregam.
//
// Substitui o "A carregar…" a piscar no meio de um ecra vazio: quem chega ve
// logo a silhueta do que vem (cabecalho, cartoes, grelha) e a pagina real
// dissolve-se por cima (.animate-reveal nos filhos), em vez de cair de repente.
// So blocos cinzentos — nada de texto, para nao mentir sobre o conteudo.

// "wallets": cartoes altos empilhados (um por rede); "table": barra de filtros +
// linhas (mercado); "account": secções com linhas (conta/fiscalidade).
type Variant = "dashboard" | "page" | "wallets" | "table" | "account";

/** Linhas cinzentas para o interior de um cartao que ainda esta a carregar. */
export function SkeletonLines({ n = 3, className = "" }: { n?: number; className?: string }) {
  const widths = ["w-3/4", "w-1/2", "w-2/3", "w-5/6", "w-2/5"];
  return (
    <div className={`animate-pulse flex flex-col gap-2.5 ${className}`} aria-busy="true">
      {Array.from({ length: n }).map((_, i) => <div key={i} className={`h-3 ${widths[i % widths.length]} rounded-md bg-slate-800/70`} />)}
    </div>
  );
}

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
      ) : variant === "wallets" ? (
        <>
          {card("h-14")}
          {Array.from({ length: 4 }).map((_, i) => <div key={i}>{card("h-64")}</div>)}
        </>
      ) : variant === "table" ? (
        <>
          <div className="flex flex-wrap gap-3">{bar("w-40", "h-9")}{bar("w-28", "h-9")}{bar("w-28", "h-9")}{bar("w-36", "h-9")}</div>
          <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-4 flex flex-col gap-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="h-7 w-7 rounded-full bg-slate-800/70" />
                {bar("w-32")}{bar("w-20")}{bar("w-16")}{bar("w-24")}
              </div>
            ))}
          </div>
        </>
      ) : variant === "account" ? (
        <>
          <div className="flex flex-wrap gap-2">{bar("w-24", "h-8")}{bar("w-24", "h-8")}{bar("w-24", "h-8")}{bar("w-24", "h-8")}</div>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-5 flex flex-col gap-3">
              {bar("w-40", "h-4")}{bar("w-full")}{bar("w-5/6")}{bar("w-2/3")}
            </div>
          ))}
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
