import { notaAfiliados } from "@/components/wallets/notaAfiliados";
let fails = 0;
const eq = (name: string, got: string, want: string) => { const ok = got === want; if (!ok) fails++; console.log(`${ok ? "✅" : "❌"} ${name}: ${got}${ok ? "" : ` (esperado ${want})`}`); };
// t() de brincar: devolve a chave, com os placeholders da nota mista.
const t = (k: string) => (k === "hw_aff_mixed_note" ? "afiliado {aff}; direto {direct}" : k);
eq("nenhuma afiliada → nota direta", notaAfiliados(t, [{ nome: "Ledger", afiliado: false }, { nome: "Trezor", afiliado: false }]), "hw_direct_note");
eq("ambas afiliadas → nota de afiliado", notaAfiliados(t, [{ nome: "Ledger", afiliado: true }, { nome: "Trezor", afiliado: true }]), "hw_aff_note");
eq("so Ledger → nota mista com os nomes certos", notaAfiliados(t, [{ nome: "Ledger", afiliado: true }, { nome: "Trezor", afiliado: false }]), "afiliado Ledger; direto Trezor");
eq("so Trezor → nota mista invertida", notaAfiliados(t, [{ nome: "Ledger", afiliado: false }, { nome: "Trezor", afiliado: true }]), "afiliado Trezor; direto Ledger");
console.log(fails === 0 ? "\nTODOS OK" : `\n${fails} FALHA(S)`); process.exit(fails ? 1 : 0);
