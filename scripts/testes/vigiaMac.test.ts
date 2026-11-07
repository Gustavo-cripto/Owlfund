// O batimento do Mac dos bots e a decisão de avisar.
import { avaliarBots, decidirAviso, segredoCerto, textoDoAviso, validarBatimento, type UltimoAviso } from "@/lib/bots/vigiaMac";
import { lerSaldoEvmNoServidor } from "@/lib/wallets/saldoEvmServidor";

let fails = 0;
const ok = (n: string, c: boolean, extra = "") => { if (!c) fails++; console.log(`${c ? "✅" : "❌"} ${n}${extra ? `: ${extra}` : ""}`); };

async function main() {
  ok("segredo certo", segredoCerto("abc", "abc"));
  ok("segredo errado", !segredoCerto("abd", "abc"));
  ok("tamanho diferente não rebenta", !segredoCerto("muito-mais-comprido", "abc"));
  ok("sem cabeçalho", !segredoCerto(null, "abc"));
  ok("segredo vazio nunca aceita", !segredoCerto("", ""));

  ok("sem quando é recusado", validarBatimento({ vivos: 8 }) === null);
  ok("texto em vez de JSON é recusado", validarBatimento(null) === null && validarBatimento("x") === null);
  const b = validarBatimento({ quando: 1, mac_boot: "x", vivos: 8, bots_idade_s: { "social-bot": 12, mau: "muito", ["n".repeat(100)]: 1 }, extra: "lixo", ultimo_aviso: { estado: "ok" } });
  ok("guarda só o que conhece", !!b && !("extra" in b) && !("ultimo_aviso" in b) && b.mac_boot === null && b.vivos === 8);
  ok("filtra idades inválidas e nomes enormes", !!b && Object.keys(b.bots_idade_s).join() === "social-bot");
  const muitos = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`b${i}`, 1]));
  ok("limita o número de bots", Object.keys(validarBatimento({ quando: 1, bots_idade_s: muitos })!.bots_idade_s).length === 50);

  const agora = Date.parse("2026-11-07T12:00:00Z");
  const haMin = (m: number) => new Date(agora - m * 60_000).toISOString();
  ok("fresco e bots a andar: ok", avaliarBots({ bots_idade_s: { a: 10 } }, haMin(2), agora).estado === "ok");
  const semSinal = avaliarBots({}, haMin(90), agora);
  ok("sem batimento há 90 min: sem sinal", semSinal.estado === "sem_sinal" && semSinal.minutos === 90);
  const parado = avaliarBots({ bots_idade_s: { a: 10, c: 901, b: 2000 } }, haMin(2), agora);
  ok("fresco com bots parados: nomes por ordem", parado.estado === "bot_parado" && parado.nomes.join() === "b,c");
  ok("data partida conta como sem sinal", avaliarBots({}, "nunca", agora).estado === "sem_sinal");

  const ultimo = (estado: UltimoAviso["estado"], m: number): UltimoAviso => ({ estado, em: haMin(m) });
  const sem = { estado: "sem_sinal", minutos: 90 } as const;
  ok("primeiro problema avisa", decidirAviso(sem, null, agora)?.tipo === "problema");
  ok("o mesmo problema há 30 min não repete", decidirAviso(sem, ultimo("sem_sinal", 30), agora) === null);
  ok("o mesmo problema há 6 h repete", decidirAviso(sem, ultimo("sem_sinal", 360), agora)?.tipo === "problema");
  ok("problema diferente avisa logo", decidirAviso(sem, ultimo("bot_parado", 5), agora)?.tipo === "problema");
  ok("recuperou depois de avisar: um 'voltou'", decidirAviso({ estado: "ok" }, ultimo("sem_sinal", 5), agora)?.tipo === "voltou");
  ok("já tinha dito que voltou: calado", decidirAviso({ estado: "ok" }, ultimo("ok", 5), agora) === null);
  ok("sempre bem: calado", decidirAviso({ estado: "ok" }, null, agora) === null);

  const esc = (t: string) => t.replace(/</g, "&lt;");
  const t1 = textoDoAviso({ estado: "sem_sinal", minutos: 2885 }, "2026-11-07T10:05:00Z", esc);
  ok("o aviso diz a duração em horas e a hora de Lisboa", t1.includes("48 h 5 min") && t1.includes("10:05"), t1);
  ok("os nomes dos bots vão escapados", textoDoAviso({ estado: "bot_parado", nomes: ["<b>"] }, haMin(1), esc).includes("&lt;b>"));

  // ── Saldo EVM pelo servidor (Portefólio) ───────────────────────────────────
  const urls: string[] = [];
  let aCorrer = 0, maximo = 0;
  const falso = (async (u: string) => {
    urls.push(u);
    aCorrer++; maximo = Math.max(maximo, aCorrer);
    await new Promise((r) => setTimeout(r, 5));
    aCorrer--;
    if (u.includes("erro")) return Response.json({ error: "x" }, { status: 429 });
    return Response.json({ balance: "1.123456789012345678" });
  }) as unknown as typeof fetch;
  const [a, e, c] = await Promise.allSettled([
    lerSaldoEvmNoServidor("0xa", "Base", falso),
    lerSaldoEvmNoServidor("0xerro", "Base", falso),
    lerSaldoEvmNoServidor("0xc", "Arbitrum One", falso),
  ]);
  ok("o saldo vem em bruto, sem arredondar", a.status === "fulfilled" && a.value === "1.123456789012345678");
  ok("um 429 lança (fica o valor anterior)", e.status === "rejected");
  ok("um erro não trava a fila", c.status === "fulfilled");
  ok("os pedidos vão em série", maximo === 1, String(maximo));
  ok("a rede vai codificada", urls[2].includes("network=Arbitrum%20One"));

  if (fails) { console.error(`\n${fails} teste(s) do vigia do Mac falharam`); process.exit(1); }
}
main().catch((e) => { console.error(e); process.exit(1); });
