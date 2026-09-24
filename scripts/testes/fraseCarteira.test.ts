import { FRASES, ascii, fraseCarteira } from "@/lib/auth/fraseCarteira";
let fails = 0;
const ok = (n: string, c: boolean, extra = "") => { if (!c) fails++; console.log(`${c ? "✅" : "❌"} ${n}${extra ? `: ${extra}` : ""}`); };

// A Phantom recusa qualquer byte fora do ASCII imprimivel (SIWS ABNF).
for (const [lang, f] of Object.entries(FRASES)) ok(`frase ${lang} e ASCII puro`, /^[\x20-\x7E]+$/.test(f), f);
ok("ascii tira acentos", ascii("Só leitura: não move fundos — ok") === "So leitura: nao move fundos  ok");
ok("ascii deixa a pontuacao normal", ascii("a.b:c,d;e") === "a.b:c,d;e");
ok("fraseCarteira cai em pt para lingua desconhecida", fraseCarteira("xx" as never) === FRASES.pt);
ok("cada frase menciona ChainFolioAI", Object.values(FRASES).every((f) => f.includes("ChainFolioAI")));
ok("cada frase diz que nao move fundos", Object.values(FRASES).every((f) => /fundos|funds|fondos|fonds/.test(f)));
if (fails) { console.log(`\n${fails} falha(s)`); process.exit(1); }
