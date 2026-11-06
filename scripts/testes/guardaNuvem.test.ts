// Um aparelho que não leu a nuvem não a pode substituir (auditoria 6 nov 2026).
import { blobSemRelacao, enviarDepoisDeLer, leituraValida, VALIDADE_LEITURA_MS } from "@/lib/portfolios/guardaNuvem";
let fails = 0;
const ok = (n: string, c: boolean) => { if (!c) fails++; console.log(`${c ? "✅" : "❌"} ${n}`); };
const blob = (ids: string[], dados: Record<string, Record<string, string>> = {}) => ({ v: 3, registry: { accounts: ids.map((id) => ({ id, name: id })), activeId: ids[0] }, data: dados });
const CARTEIRA = JSON.stringify({ eth: [{ address: "0xabc" }] });

(async () => {
  const seq: string[] = [];
  const passos = (lerOk: boolean, valida = false) => ({ leituraValida: valida, ler: async () => { seq.push("ler"); return lerOk; }, enviar: async () => { seq.push("enviar"); } });
  ok("lê antes de enviar", (await enviarDepoisDeLer(passos(true))) === "enviado" && seq.join() === "ler,enviar");
  seq.length = 0;
  ok("leitura falhada: não envia nada", (await enviarDepoisDeLer(passos(false))) === "adiado" && seq.join() === "ler");
  seq.length = 0;
  ok("leitura recente: não volta a ler", (await enviarDepoisDeLer(passos(true, true))) === "enviado" && seq.join() === "enviar");

  ok("sem leitura não é válida", !leituraValida(null, "u", 1000));
  ok("leitura de outra pessoa não vale", !leituraValida({ userId: "a", em: 1000 }, "b", 1001));
  ok("leitura recente vale", leituraValida({ userId: "a", em: 1000 }, "a", 1001));
  ok("leitura antiga não vale", !leituraValida({ userId: "a", em: 1000 }, "a", 1000 + VALIDADE_LEITURA_MS));

  const guardado = blob(["real"], { real: { "portfolio-wallets": CARTEIRA } });
  ok("aparelho novo com outra conta: recusa", blobSemRelacao(guardado, blob(["nova"], { nova: { "trade-history-v1": "[{}]" } })));
  ok("formato antigo por cima de v3 com dados: recusa", blobSemRelacao(guardado, { eth: [] }));
  ok("mesma conta, mesmo vazia: aceita (apagar de propósito)", !blobSemRelacao(guardado, blob(["real"])));
  ok("conta nova ao lado da antiga: aceita", !blobSemRelacao(guardado, blob(["real", "nova"])));
  ok("nuvem vazia: aceita", !blobSemRelacao(blob(["velha"], { velha: { "portfolio-wallets": '{"eth":[]}' } }), blob(["nova"])));
  ok("só carimbos não são dados: aceita", !blobSemRelacao(blob(["velha"], { velha: { "owlfund.sync.ts.v1": '{"a":1}' } }), blob(["nova"])));
  ok("nada guardado: aceita", !blobSemRelacao(null, blob(["nova"])));

  console.log(fails === 0 ? "\nTODOS OK" : `\n${fails} FALHA(S)`);
  process.exit(fails ? 1 : 0);
})();
