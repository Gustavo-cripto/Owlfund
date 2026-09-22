// Molas, escritas à mão — sem biblioteca.
//
// PORQUÊ À MÃO: precisamos de UMA mola, para folhas que se arrastam com o dedo.
// As bibliotecas (motion, framer-motion) trazem dezenas de KB para o pacote, e
// acabámos de cortar meio megabyte de payload das rotas de mercado — não faz
// sentido devolvê-lo por causa de uma folha. São ~70 linhas e cobrem o que a
// skill da Apple ("Designing Fluid Interfaces") pede:
//   • animar a partir do valor ACTUAL, nunca do alvo (senão salta à vista);
//   • herdar a velocidade do dedo ao largar, para não haver costura entre
//     arrastar e animar;
//   • poder ser agarrada e invertida a meio, sem esperar que acabe.
//
// Os parâmetros são os da Apple, não os da física: em vez de massa/rigidez/
// amortecimento, `damping` (0–1: quanto passa do alvo) e `response` (segundos:
// quão depressa lá chega). damping 1 = sem ressalto, que é o que serve quase
// tudo; ressalto só quando o gesto trouxe impulso.

export type EstadoMola = { x: number; v: number };

/** Um passo da integração. Fora da animação para poder ser testado sem browser. */
export function passoDaMola(
  estado: EstadoMola,
  alvo: number,
  dt: number,
  damping: number,
  response: number,
): EstadoMola {
  const wn = (2 * Math.PI) / response;          // frequência natural
  const k = wn * wn;                            // rigidez
  const c = 2 * damping * wn;                   // amortecimento
  // Semi-implícita (Euler): estável com passos pequenos e barata por quadro.
  const a = -k * (estado.x - alvo) - c * estado.v;
  const v = estado.v + a * dt;
  return { x: estado.x + v * dt, v };
}

/**
 * Onde um lançamento vai parar, se o deixarmos desacelerar. É a função exacta
 * do código de exemplo da Apple — NÃO a fórmula do manual de física (v²/2a),
 * que dá outro sítio. Serve para escolher o destino a partir da velocidade, em
 * vez de o escolher a partir do ponto onde o dedo largou.
 */
export function projetar(velocidade: number, desaceleracao = 0.998): number {
  return (velocidade / 1000) * desaceleracao / (1 - desaceleracao);
}

/**
 * Resistência elástica fora dos limites: quanto mais se puxa, menos anda. Um
 * batente seco lê-se como "bloqueou"; a resistência progressiva lê-se como
 * "responde, mas não há mais nada deste lado".
 */
export function elastico(excesso: number, dimensao: number, constante = 0.55): number {
  return (excesso * dimensao * constante) / (dimensao + constante * Math.abs(excesso));
}

export type Mola = { parar: () => void; valor: () => number; velocidade: () => number };

const PARADO_VALOR = 0.4;      // px
const PARADO_VELOCIDADE = 8;   // px/s
const PASSO_MAX = 1 / 30;      // um separador em segundo plano não dá um salto

export function animarComMola(opts: {
  de: number;
  para: number;
  /** px/s — a velocidade do dedo ao largar. É isto que tira a costura. */
  velocidade?: number;
  damping?: number;
  response?: number;
  aoMudar: (valor: number) => void;
  aoTerminar?: () => void;
}): Mola {
  const { de, para, velocidade = 0, damping = 1, response = 0.35, aoMudar, aoTerminar } = opts;
  let estado: EstadoMola = { x: de, v: velocidade };
  let anterior = performance.now();
  let raf = 0;
  let vivo = true;

  const quadro = (agora: number) => {
    if (!vivo) return;
    const dt = Math.min((agora - anterior) / 1000, PASSO_MAX);
    anterior = agora;
    estado = passoDaMola(estado, para, dt, damping, response);
    if (Math.abs(estado.x - para) < PARADO_VALOR && Math.abs(estado.v) < PARADO_VELOCIDADE) {
      estado = { x: para, v: 0 };
      aoMudar(para);
      vivo = false;
      aoTerminar?.();
      return;
    }
    aoMudar(estado.x);
    raf = requestAnimationFrame(quadro);
  };
  raf = requestAnimationFrame(quadro);

  return {
    parar: () => { vivo = false; cancelAnimationFrame(raf); },
    valor: () => estado.x,
    velocidade: () => estado.v,
  };
}

/** Velocidade em px/s a partir das últimas amostras do gesto (as de ~100 ms). */
export function velocidadeDoGesto(amostras: ReadonlyArray<{ t: number; y: number }>, janelaMs = 100): number {
  if (amostras.length < 2) return 0;
  const fim = amostras[amostras.length - 1];
  let inicio = amostras[0];
  for (let i = amostras.length - 1; i >= 0; i--) {
    if (fim.t - amostras[i].t > janelaMs) break;
    inicio = amostras[i];
  }
  const dt = fim.t - inicio.t;
  return dt > 0 ? ((fim.y - inicio.y) / dt) * 1000 : 0;
}

export const movimentoReduzido = (): boolean =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
