import crypto from "crypto";
process.env.CEX_KEYS_SECRET = crypto.randomBytes(32).toString("base64");
import { cifrar, cofreDisponivel, decifrar } from "@/lib/cex/cofre";
let fails = 0;
const ok = (n: string, c: boolean) => { if (!c) fails++; console.log(`${c ? "✅" : "❌"} ${n}`); };
ok("cofre disponivel com chave de 32 bytes", cofreDisponivel());
const chaves = { apiKey: "k-123", apiSecret: "s-456", apiPassphrase: "p" };
const blob = cifrar(chaves);
ok("cifrado nao contem a chave em claro", !blob.includes("k-123") && !blob.includes("s-456"));
ok("ida e volta", JSON.stringify(decifrar(blob)) === JSON.stringify(chaves));
ok("dois cifrados da mesma coisa sao diferentes (iv aleatorio)", cifrar(chaves) !== blob);
let rebentou = false; try { decifrar(blob.slice(0, -4) + "AAAA"); } catch { rebentou = true; }
ok("adulterado nao decifra", rebentou);
process.env.CEX_KEYS_SECRET = "curta";
ok("chave errada -> cofre indisponivel", !cofreDisponivel());
console.log(fails === 0 ? "\nTODOS OK" : `\n${fails} FALHA(S)`); process.exit(fails ? 1 : 0);
