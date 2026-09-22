"use client";

// Folha inferior no telemóvel, diálogo centrado no computador.
//
// PORQUÊ: num telemóvel, uma caixa que aparece no meio do ecrã é uma convenção
// de computador. A forma que se espera é uma folha que sobe de baixo e que se
// empurra para fechar — e que responde ao dedo durante todo o gesto, não só no
// fim. É o capítulo 2 a 6 da skill apple-design: seguir o dedo 1:1, herdar a
// velocidade ao largar, projectar o impulso para escolher o destino, e resistir
// (sem bater) quando se puxa para cima.
//
// No computador continua a ser o diálogo centrado de sempre: arrastar com o
// rato não é gesto de ninguém, e um diálogo centrado ali é o que se espera.
//
// Quem pediu menos movimento não arrasta nada e não vê mola: aparece e sai.

import { useCallback, useEffect, useRef } from "react";

import { animarComMola, elastico, movimentoReduzido, projetar, velocidadeDoGesto, type Mola } from "@/lib/motion/spring";

/** Acima disto é computador: diálogo centrado, sem gesto. (Tailwind `sm`.) */
const ECRA_GRANDE = "(min-width: 640px)";
/** Fecha se o impulso projectado passar isto da altura da folha. */
const FRACAO_PARA_FECHAR = 0.5;

export default function Sheet({
  aberto,
  aoFechar,
  aoSair,
  children,
  rotuladoPor,
  className = "",
}: {
  aberto: boolean;
  /** A pessoa pediu para fechar (fundo, Escape, ou empurrou a folha). */
  aoFechar: () => void;
  /** A saída terminou — só aqui é seguro desmontar o conteúdo. */
  aoSair?: () => void;
  children: React.ReactNode;
  rotuladoPor?: string;
  className?: string;
}) {
  const painel = useRef<HTMLDivElement>(null);
  const fundo = useRef<HTMLDivElement>(null);
  const mola = useRef<Mola | null>(null);
  const amostras = useRef<Array<{ t: number; y: number }>>([]);
  const arrasto = useRef<{ inicio: number; base: number } | null>(null);
  const posicao = useRef(0);
  const jaSaiu = useRef(false);

  const ecraGrande = () => typeof window !== "undefined" && window.matchMedia(ECRA_GRANDE).matches;
  const podeArrastar = () => !ecraGrande() && !movimentoReduzido();
  const altura = () => painel.current?.offsetHeight ?? 1;

  /** Uma só função desenha tudo o que depende da posição — inclusive o escurecimento. */
  const desenhar = useCallback((y: number) => {
    posicao.current = y;
    if (painel.current) painel.current.style.transform = `translate3d(0, ${y}px, 0)`;
    // Feedback contínuo DURANTE o gesto: o fundo clareia à medida que se empurra.
    if (fundo.current) fundo.current.style.opacity = String(Math.max(0, Math.min(1, 1 - y / altura())));
  }, []);

  // ── Entrada e saída ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!painel.current) return;
    mola.current?.parar();
    if (aberto) {
      jaSaiu.current = false;
      if (!podeArrastar()) { desenhar(0); return; }
      desenhar(altura());
      mola.current = animarComMola({ de: altura(), para: 0, damping: 1, response: 0.35, aoMudar: desenhar });
      return;
    }
    if (jaSaiu.current) return;
    if (!podeArrastar()) { jaSaiu.current = true; aoSair?.(); return; }
    mola.current = animarComMola({
      de: posicao.current, para: altura(), velocidade: 0, damping: 1, response: 0.3,
      aoMudar: desenhar,
      aoTerminar: () => { jaSaiu.current = true; aoSair?.(); },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === "Escape") aoFechar(); };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aberto, aoFechar]);

  useEffect(() => () => mola.current?.parar(), []);

  // ── Gesto ────────────────────────────────────────────────────────────────
  const aoPousar = (e: React.PointerEvent) => {
    if (!podeArrastar()) return;
    // Agarrar a meio de uma animação: continua-se de onde ELA está, não do alvo.
    mola.current?.parar();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    arrasto.current = { inicio: e.clientY, base: posicao.current };
    amostras.current = [{ t: performance.now(), y: e.clientY }];
  };

  const aoMover = (e: React.PointerEvent) => {
    const a = arrasto.current;
    if (!a) return;
    const bruto = a.base + (e.clientY - a.inicio);
    // Para cima não há nada: resiste em vez de bater num batente seco.
    desenhar(bruto >= 0 ? bruto : -elastico(-bruto, altura()));
    amostras.current.push({ t: performance.now(), y: e.clientY });
    if (amostras.current.length > 12) amostras.current.shift();
  };

  const aoLargar = () => {
    if (!arrasto.current) return;
    arrasto.current = null;
    const v = velocidadeDoGesto(amostras.current);
    // O destino sai de ONDE O GESTO IA PARAR, não de onde o dedo largou.
    const previsto = posicao.current + projetar(v);
    const fecha = previsto > altura() * FRACAO_PARA_FECHAR;
    mola.current = animarComMola({
      de: posicao.current,
      para: fecha ? altura() : 0,
      velocidade: v,                       // sem costura entre arrastar e animar
      damping: fecha ? 1 : 0.8,            // ressalto só ao voltar, que teve impulso
      response: 0.3,
      aoMudar: desenhar,
      aoTerminar: fecha ? aoFechar : undefined,
    });
  };

  if (!aberto && jaSaiu.current) return null;

  return (
    <div
      ref={fundo}
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={rotuladoPor}
      onClick={aoFechar}
    >
      <div
        ref={painel}
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-md rounded-t-2xl border border-slate-700 bg-slate-900 shadow-2xl will-change-transform sm:animate-scale-in sm:rounded-2xl ${className}`}
      >
        {/* Pega: é o que diz "isto puxa-se". Só aparece onde o gesto existe. */}
        <div
          onPointerDown={aoPousar}
          onPointerMove={aoMover}
          onPointerUp={aoLargar}
          onPointerCancel={aoLargar}
          className="flex touch-none justify-center pb-1 pt-3 sm:hidden"
          aria-hidden
        >
          <span className="h-1 w-10 rounded-full bg-slate-600" />
        </div>
        {children}
      </div>
    </div>
  );
}
