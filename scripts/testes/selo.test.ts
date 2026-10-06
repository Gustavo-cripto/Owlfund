// Selo do beacon do funil (cookie cfa-ev assinado com TRACK_SECRET).
import { assinarSelo, verificarSelo, lerSelo, seloPrecisaRenovar, SELO_VALIDADE_S } from "@/lib/analytics/selo";

let fails = 0;
const ok = (n: string, c: boolean) => { if (!c) fails++; console.log(`${c ? "✅" : "❌"} ${n}`); };

// O executor transpila para CommonJS: sem await no topo, tudo numa função.
void (async () => {
  const SEG = "segredo-de-teste";
  const agora = Date.UTC(2026, 9, 6, 12, 0, 0);

  const selo = await assinarSelo(SEG, agora);
  ok("formato ts.hmac32", /^\d{10}\.[0-9a-f]{32}$/.test(selo));
  ok("válido com o mesmo segredo", await verificarSelo(SEG, selo, agora));
  ok("válido 23 h depois", await verificarSelo(SEG, selo, agora + 23 * 3600_000));
  ok("expira após 1 dia", !(await verificarSelo(SEG, selo, agora + (SELO_VALIDADE_S + 1) * 1000)));
  ok("recusa do futuro (> 60 s)", !(await verificarSelo(SEG, selo, agora - 120_000)));
  ok("outro segredo falha", !(await verificarSelo("outro", selo, agora)));
  ok("assinatura alterada falha", !(await verificarSelo(SEG, selo.slice(0, -1) + (selo.endsWith("0") ? "1" : "0"), agora)));
  ok("timestamp alterado falha", !(await verificarSelo(SEG, String(Number(selo.split(".")[0]) + 1) + "." + selo.split(".")[1], agora)));
  ok("vazio/nulo falha", !(await verificarSelo(SEG, "", agora)) && !(await verificarSelo(SEG, null, agora)));
  ok("sem segredo falha", !(await verificarSelo("", selo, agora)));
  ok("lixo falha", !(await verificarSelo(SEG, "abc", agora)));

  ok("lerSelo no meio de outros cookies", lerSelo(`a=b; cfa-ev=${selo}; c=d`) === selo);
  ok("lerSelo ausente", lerSelo("a=b") === null);
  ok("lerSelo não confunde prefixo", lerSelo("xcfa-ev=1") === null);

  ok("renovar quando falta", seloPrecisaRenovar(null));
  ok("não renovar fresco", !seloPrecisaRenovar(selo, agora + 3600_000));
  ok("renovar após meio dia", seloPrecisaRenovar(selo, agora + (SELO_VALIDADE_S / 2 + 1) * 1000));

  if (fails) { console.log(`\n❌ ${fails} falha(s) em selo`); process.exit(1); }
})();
