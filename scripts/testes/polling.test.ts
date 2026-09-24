import { repetirVisivel, DOIS_MIN, TRES_MIN, CINCO_MIN } from "@/lib/polling";
let fails = 0;
const ok = (n: string, c: boolean, extra = "") => { if (!c) fails++; console.log(`${c ? "✅" : "❌"} ${n}${extra ? `: ${extra}` : ""}`); };

// Browser a fingir: relogio, intervalos e visibilidade controlados a mao.
let agora = 1_000_000;
const intervalos: Array<{ fn: () => void; ms: number; id: number }> = [];
const ouvintes: Record<string, Array<() => void>> = {};
let escondido = false;
const g = globalThis as unknown as Record<string, unknown>;
g.window = { setInterval: (fn: () => void, ms: number) => { const id = intervalos.length + 1; intervalos.push({ fn, ms, id }); return id; }, clearInterval: (id: number) => { const i = intervalos.findIndex((x) => x.id === id); if (i >= 0) intervalos.splice(i, 1); } };
g.document = { get hidden() { return escondido; }, addEventListener: (ev: string, fn: () => void) => { (ouvintes[ev] ??= []).push(fn); }, removeEventListener: (ev: string, fn: () => void) => { ouvintes[ev] = (ouvintes[ev] ?? []).filter((f) => f !== fn); } };
const realNow = Date.now; Date.now = () => agora;
const tick = () => intervalos.forEach((i) => i.fn());
const visibilidade = () => (ouvintes.visibilitychange ?? []).forEach((f) => f());

let chamadas = 0;
const parar = repetirVisivel(() => { chamadas++; }, DOIS_MIN);
ok("nao chama logo (o primeiro pedido e do proprio componente)", chamadas === 0);
ok("regista um intervalo com o tempo pedido", intervalos.length === 1 && intervalos[0].ms === DOIS_MIN);
tick(); ok("chama no tick com a tab visivel", chamadas === 1);
escondido = true; tick(); tick(); ok("nao chama com a tab escondida", chamadas === 1);
agora += DOIS_MIN / 4; escondido = false; visibilidade();
ok("ao voltar cedo demais (menos de metade do intervalo) nao repete", chamadas === 1);
agora += DOIS_MIN; visibilidade();
ok("ao voltar depois de meio intervalo pede logo", chamadas === 2);
parar();
ok("parar limpa o intervalo", intervalos.length === 0);
ok("parar tira o ouvinte de visibilidade", (ouvintes.visibilitychange ?? []).length === 0);
ok("constantes em minutos", DOIS_MIN === 120_000 && TRES_MIN === 180_000 && CINCO_MIN === 300_000);
Date.now = realNow;
if (fails) { console.log(`\n${fails} falha(s)`); process.exit(1); }
