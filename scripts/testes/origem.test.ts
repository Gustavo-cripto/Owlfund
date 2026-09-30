import { limparOrigem, origemDoUrl, redeDe } from "@/lib/origem";
let fails = 0;
const eq = (name: string, got: string, want: string) => {
  const ok = got === want;
  if (!ok) fails++;
  console.log(`${ok ? "✅" : "❌"} ${name}: ${JSON.stringify(got)}${ok ? "" : ` (esperado ${JSON.stringify(want)})`}`);
};
const u = (q: string) => origemDoUrl(new URLSearchParams(q));
eq("só rede", u("src=bluesky"), "bluesky");
eq("rede + campanha", u("src=bluesky&campanha=isencao"), "bluesky.isencao");
eq("utm", u("utm_source=threads&utm_campaign=guia-pt"), "threads.guia-pt");
eq("campanha sem rede não grava", u("campanha=isencao"), "");
eq("ponto na rede não parte o campo", u("src=a.b&campanha=c.d"), "ab.cd");
eq("lixo removido", u("src=<script>&campanha=x y"), "script.xy");
eq("40 caracteres no total", u(`src=${"r".repeat(30)}&campanha=${"c".repeat(30)}`).length.toString(), "40");
eq("limpar valor gravado", limparOrigem("bluesky.isencao;x"), "bluesky.isencaox");
eq("limpar não string", limparOrigem(42), "");
eq("rede de bluesky.isencao", redeDe("bluesky.isencao"), "bluesky");
if (fails) { console.error(`${fails} falha(s)`); process.exit(1); }
