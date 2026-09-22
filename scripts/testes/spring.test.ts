import { elastico, passoDaMola, projetar, velocidadeDoGesto, type EstadoMola } from "@/lib/motion/spring";
let fails = 0;
const ok = (n: string, c: boolean, extra = "") => { if (!c) fails++; console.log(`${c ? "✅" : "❌"} ${n}${extra ? `: ${extra}` : ""}`); };

const correr = (damping: number, response: number, de = 0, alvo = 100, v0 = 0, segundos = 2) => {
  let e: EstadoMola = { x: de, v: v0 };
  const caminho: number[] = [de];
  for (let i = 0; i < segundos * 120; i++) { e = passoDaMola(e, alvo, 1 / 120, damping, response); caminho.push(e.x); }
  return { fim: e, caminho, maximo: Math.max(...caminho) };
};

const critico = correr(1, 0.35);
ok("damping 1 chega ao alvo", Math.abs(critico.fim.x - 100) < 0.5, critico.fim.x.toFixed(2));
ok("damping 1 nao passa do alvo (sem ressalto)", critico.maximo <= 100.5, critico.maximo.toFixed(2));
const solto = correr(0.7, 0.35);
ok("damping 0.7 passa do alvo (ressalto)", solto.maximo > 101, solto.maximo.toFixed(2));
ok("damping 0.7 assenta na mesma", Math.abs(solto.fim.x - 100) < 0.5, solto.fim.x.toFixed(2));
const comImpulso = correr(1, 0.35, 0, 100, 600);
ok("velocidade inicial acelera a chegada", comImpulso.caminho[24] > critico.caminho[24]);
const rapida = correr(1, 0.2), lenta = correr(1, 0.6);
ok("response menor chega mais cedo", rapida.caminho[30] > lenta.caminho[30]);

// Projecao: a funcao da Apple, nao a do manual de fisica.
ok("projetar(0) = 0", projetar(0) === 0);
ok("projetar(1000) ≈ 499", Math.abs(projetar(1000) - 499) < 1, projetar(1000).toFixed(1));
ok("projetar respeita o sinal", projetar(-500) < 0);
ok("desaceleracao menor projeta menos", projetar(1000, 0.99) < projetar(1000, 0.998));

// Elastico: anda sempre menos do que se puxa, e nunca inverte o sinal.
ok("elastico(0) = 0", elastico(0, 800) === 0);
ok("elastico anda menos do que o dedo", elastico(100, 800) < 100 && elastico(100, 800) > 0, elastico(100, 800).toFixed(1));
ok("elastico satura (puxar o dobro nao da o dobro)", elastico(400, 800) < 2 * elastico(200, 800));
ok("elastico mantem o sinal", elastico(-100, 800) === -elastico(100, 800));

// Velocidade do gesto: px/s a partir das amostras.
ok("sem amostras = 0", velocidadeDoGesto([]) === 0);
ok("100px em 100ms = 1000px/s", Math.abs(velocidadeDoGesto([{ t: 0, y: 0 }, { t: 100, y: 100 }]) - 1000) < 1);
ok("so conta a janela recente", Math.abs(velocidadeDoGesto([{ t: 0, y: 0 }, { t: 900, y: 0 }, { t: 1000, y: 50 }]) - 500) < 1);
console.log(fails === 0 ? "\nTODOS OK" : `\n${fails} FALHA(S)`); process.exit(fails ? 1 : 0);
