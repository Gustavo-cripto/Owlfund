// Páginas da ferramenta "ver saldo sem conta": o que o texto promete tem de ser
// o que /api/preview faz, e os metadados têm de caber nos resultados de pesquisa.
import { readFileSync } from "node:fs";
import { DEMO_LIMITES, REDES_SALDO, SALDO_COPY, SALDO_SLUG, SALDO_SLUGS, saldoUrl } from "@/lib/tools/saldo";
import { LANGS } from "@/lib/i18n/routes";

let fails = 0;
const ok = (n: string, c: boolean, extra = "") => { if (!c) fails++; console.log(`${c ? "✅" : "❌"} ${n}${extra ? `: ${extra}` : ""}`); };

// 1) Limites iguais aos da rota
const rota = readFileSync("src/app/api/preview/route.ts", "utf8");
ok("consultas por janela = rota", new RegExp(`rateLimitPublic\\(req, "preview", ${DEMO_LIMITES.consultas}, ${DEMO_LIMITES.minutos} \\* 60_000\\)`).test(rota));
ok("ativos mostrados = TOP da rota", new RegExp(`const TOP = ${DEMO_LIMITES.ativos};`).test(rota));
const evm = /const EVM: EvmChainKey\[\] = \[([^\]]+)\]/.exec(rota)?.[1].split(",").length;
ok("redes EVM = rota", evm === DEMO_LIMITES.redesEvm, String(evm));
ok("a rota não lê Cardano (o texto diz que não)", !/addr1|blockfrost/i.test(rota));

// 2) Endereços: um por página e língua, sem repetições dentro da mesma língua
for (const l of LANGS) {
  const s = REDES_SALDO.map((r) => SALDO_SLUG[r][l]);
  ok(`${l}: slugs distintos`, new Set(s).size === s.length);
  ok(`${l}: URL com prefixo certo`, saldoUrl(l, "btc") === `${l === "pt" ? "" : `/${l}`}/${SALDO_SLUG.btc[l]}`);
}
ok("slugs só com letras minúsculas e hífenes", SALDO_SLUGS.every((s) => /^[a-z]+(-[a-z]+)*$/.test(s)));

// 3) Cada página existe em disco
for (const l of LANGS) for (const r of REDES_SALDO) {
  const f = `src/app/(${l})/${l === "pt" ? "" : `${l}/`}${SALDO_SLUG[r][l]}/page.tsx`;
  let existe = false;
  try { existe = readFileSync(f, "utf8").includes(`saldoMetadata("${l}", "${r}")`); } catch { existe = false; }
  ok(`existe ${f}`, existe);
}

// 4) Metadados que cabem, e texto completo nas 4 línguas
for (const l of LANGS) {
  const c = SALDO_COPY[l];
  for (const r of REDES_SALDO) {
    const m = c.redes[r];
    ok(`${l}/${r}: título ≤ 60`, m.metaTitle.length <= 60, `${m.metaTitle.length}`);
    ok(`${l}/${r}: descrição 110–160`, m.metaDescription.length >= 110 && m.metaDescription.length <= 160, `${m.metaDescription.length}`);
    ok(`${l}/${r}: h1 e lead`, m.h1.length > 10 && m.lead.length > 40);
  }
  ok(`${l}: mesmas secções que o pt`, c.mostra.length === SALDO_COPY.pt.mostra.length && c.priv.length === SALDO_COPY.pt.priv.length && c.naoFaz.length === SALDO_COPY.pt.naoFaz.length && c.faqs.length === SALDO_COPY.pt.faqs.length);
  ok(`${l}: sem aconselhamento (comprar/vender)`, !/\b(compra já|buy now|deberías comprar|vous devriez acheter)\b/i.test(JSON.stringify(c)));
}

if (fails) { console.log(`\n${fails} falha(s)`); process.exit(1); }
console.log("TODOS OK");
