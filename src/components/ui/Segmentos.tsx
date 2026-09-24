"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * Controlo segmentado — o "menu" de escolher entre 2 a N vistas.
 *
 * Substitui as pílulas soltas (laranja cheia + contorno) que cada página
 * desenhava à sua maneira. Aqui é uma calha escura com um cursor laranja que
 * desliza até à opção escolhida; as opções não escolhidas ficam em texto,
 * sem contorno, para o olho ir direito à que está ativa.
 *
 * `wrap`: para listas longas (categorias, exchanges) a calha quebra linha e
 * o cursor deixa de deslizar — cada opção ativa pinta-se a si própria.
 */
export type OpcaoSegmento<T extends string> = {
  id: T;
  /** Texto ou nó; pode ser uma função para variar com o estado ativo (ex.: selos). */
  label: ReactNode | ((ativo: boolean) => ReactNode);
  title?: string;
  disabled?: boolean;
};

type Props<T extends string> = {
  opcoes: ReadonlyArray<OpcaoSegmento<T>>;
  valor: T;
  aoMudar: (id: T) => void;
  tamanho?: "xs" | "sm" | "md";
  /** Nome acessível do grupo. */
  label?: string;
  wrap?: boolean;
  /** Ocupa a largura toda e reparte-a pelas opções (bom em telemóvel). */
  cheio?: boolean;
  className?: string;
};

const TAMANHO = {
  xs: "px-2.5 py-1 text-[11px]",
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
} as const;

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export default function Segmentos<T extends string>({
  opcoes, valor, aoMudar, tamanho = "md", label, wrap = false, cheio = false, className = "",
}: Props<T>) {
  const calha = useRef<HTMLDivElement>(null);
  const [cursor, setCursor] = useState<{ left: number; width: number } | null>(null);

  // Mede o botão ativo e move o cursor até lá. Re-mede quando a calha muda de
  // tamanho (janela, fonte a carregar, texto a mudar de língua).
  useIsoLayoutEffect(() => {
    if (wrap) return;
    const el = calha.current;
    if (!el) return;
    const medir = () => {
      const ativo = el.querySelector<HTMLElement>('[data-ativo="1"]');
      if (!ativo) { setCursor(null); return; }
      setCursor({ left: ativo.offsetLeft, width: ativo.offsetWidth });
    };
    medir();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(medir) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [valor, wrap, opcoes.length, tamanho]);

  const deslizante = !wrap && cursor !== null;

  return (
    <div
      ref={calha}
      role="tablist"
      aria-label={label}
      className={`relative ${cheio ? "flex w-full" : "inline-flex max-w-full"} ${wrap ? "flex-wrap" : ""} gap-1 rounded-2xl border border-slate-800 bg-slate-950/70 p-1 shadow-inner shadow-black/30 backdrop-blur ${className}`}
    >
      {deslizante && (
        <span
          aria-hidden
          className="pointer-events-none absolute top-1 bottom-1 rounded-xl bg-gradient-to-b from-orange-400 to-orange-500 ring-1 ring-inset ring-white/20 shadow-md shadow-orange-500/30 transition-[left,width] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] motion-reduce:transition-none"
          style={{ left: cursor.left, width: cursor.width }}
        />
      )}
      {opcoes.map((o) => {
        const ativo = o.id === valor;
        const pintaSozinho = ativo && !deslizante;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={ativo}
            data-ativo={ativo ? "1" : undefined}
            title={o.title}
            disabled={o.disabled}
            onClick={() => { if (!ativo) aoMudar(o.id); }}
            className={`relative z-10 inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl font-semibold transition-colors duration-200 disabled:opacity-40 ${cheio ? "flex-1" : ""} ${TAMANHO[tamanho]} ${
              ativo ? "text-slate-950" : "text-slate-300 hover:bg-white/[0.06] hover:text-white"
            } ${pintaSozinho ? "bg-gradient-to-b from-orange-400 to-orange-500 ring-1 ring-inset ring-white/20 shadow-md shadow-orange-500/30" : ""}`}
          >
            {typeof o.label === "function" ? o.label(ativo) : o.label}
          </button>
        );
      })}
    </div>
  );
}
