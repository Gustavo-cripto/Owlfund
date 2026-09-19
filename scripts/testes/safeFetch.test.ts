import { isPrivateHost, isPrivateIpv4, isValidHttpsUrl } from "@/lib/utils/safeFetch";

// O servidor faz pedidos a enderecos escritos por terceiros: o token_uri de um
// NFT e escolhido por quem cunhou o token. Estes testes travam o caso literal,
// que e o que se explora sem esforco nenhum.

let fails = 0;
const ok = (nome: string, cond: boolean) => { if (!cond) fails++; console.log(`${cond ? "✅" : "❌"} ${nome}`); };

// Enderecos para dentro: todos recusados.
for (const u of [
  "https://127.0.0.1/meta.json",
  "https://localhost/meta.json",
  "https://algo.localhost/meta.json",
  "https://169.254.169.254/latest/meta-data/",   // metadados da nuvem
  "https://10.0.0.5/x",
  "https://172.16.3.4/x",
  "https://192.168.1.1/x",
  "https://100.64.0.1/x",                        // CGNAT
  "https://0.0.0.0/x",
  "https://[::1]/x",
  "https://[fd00::1]/x",
  "https://[fe80::1]/x",
  "https://[::ffff:169.254.169.254]/x",
  "https://[::ffff:a9fe:a9fe]/x",       // a mesma coisa, ja normalizada
  "https://[::ffff:7f00:1]/x",          // 127.0.0.1 embrulhado
]) ok(`recusa ${u}`, !isValidHttpsUrl(u));

// Protocolos que nao sao https: recusados.
for (const u of [
  "http://exemplo.com/meta.json",
  "file:///etc/passwd",
  "ftp://exemplo.com/x",
  "data:application/json,{}",
  "gopher://exemplo.com/",
  "nao-e-um-url",
  "",
]) ok(`recusa ${u || "(vazio)"}`, !isValidHttpsUrl(u));

// Enderecos publicos legitimos: aceites.
for (const u of [
  "https://ipfs.io/ipfs/QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco",
  "https://metadata.exemplo.com/1.json",
  "https://8.8.8.8/x",
]) ok(`aceita ${u}`, isValidHttpsUrl(u));

// IPv4 malformado bloqueia por precaucao, nao passa por engano.
ok("IPv4 malformado bloqueia", isPrivateIpv4("999.1.1"));
ok("IPv4 com letras bloqueia", isPrivateIpv4("a.b.c.d"));
ok("host publico nao e privado", !isPrivateHost("exemplo.com"));

console.log(fails === 0 ? "\nTODOS OK" : `\n${fails} FALHA(S)`);
process.exit(fails ? 1 : 0);
