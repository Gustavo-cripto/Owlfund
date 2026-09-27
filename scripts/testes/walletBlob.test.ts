// Leitor unico do blob de carteiras (API REST, MCP e "Uso & limites") — com um
// blob v3 REAL, tal como cloudSync.buildBlob() o escreve, para o formato nunca
// voltar a divergir (auditoria set 2026, lote A).
import { contarCarteiras, contasDoBlob, contasMascaradas, juntarContas, whitelistSnapshot } from "@/lib/api/walletBlob";
let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "✅" : "❌"} ${name}: ${JSON.stringify(got)}${ok ? "" : ` (esperado ${JSON.stringify(want)})`}`);
};
const mask = (a: string) => `wallet_${a.length}`;

const ETH = "0x1111111111111111111111111111111111111111";
const BTC = "bc1qexemplo000000000000000000000000000000";
const SOL = "So11111111111111111111111111111111111111112";

// v3: { v, registry, data: { conta: { baseKey: rawString } } } — as chaves por
// conta sao STRINGS JSON (e o que o localStorage guarda), nao objetos.
const v3 = {
  v: 3,
  registry: { accounts: [{ id: "a_1", name: "Conta 1" }, { id: "a_2", name: "Conta 2" }], activeId: "a_1" },
  data: {
    a_1: {
      "portfolio-wallets": JSON.stringify({
        eth: [{ address: ETH, balance: "1.5", network: "Ethereum", label: "Principal", source: "manual", segredo: "nao sai" }],
        btc: [{ address: BTC, balance: "0.2" }],
        cexUsd: 100, defiUsd: 50, manualEur: 10, tokensUsd: 5, traditionalEur: 2500,
      }),
      "owlfund.crypto.holdings.v1": JSON.stringify({ ADA: { buyValue: 100 } }),
      "trade-history-v1": "[]",
    },
    a_2: {
      "portfolio-wallets": JSON.stringify({ sol: [{ address: SOL, balance: "3" }], cexUsd: 7 }),
    },
    a_3: { "portfolio-wallets": "{isto nao e json" },   // conta com JSON estragado: ignorada
    a_4: { "owlfund.crypto.holdings.v1": "{}" },       // conta sem carteiras: ignorada
  },
};

const contas = contasDoBlob(v3);
eq("v3: duas contas com carteiras", contas.map((c) => c.accountId), ["a_1", "a_2"]);
eq("v3: nomes do registo", contas.map((c) => c.name), ["Conta 1", "Conta 2"]);
eq("v3: conta 1 tem 1 eth + 1 btc", [contas[0].snapshot.eth, contas[0].snapshot.btc].map((a) => (a as unknown[]).length), [1, 1]);
eq("contarCarteiras soma todas as contas (1+1+1)", contarCarteiras(v3), 3);

const masc = contasMascaradas(v3, mask);
const texto = JSON.stringify(masc);
eq("enderecos nunca saem em claro", texto.includes(ETH) || texto.includes(BTC) || texto.includes(SOL), false);
eq("enderecos saem pelo pseudonimo", (masc[0].wallets.eth as Array<{ address: string }>)[0].address, `wallet_${ETH.length}`);
eq("campos desconhecidos nao escapam", "segredo" in (masc[0].wallets.eth as Array<Record<string, unknown>>)[0], false);
eq("campos conhecidos passam", (masc[0].wallets.eth as Array<Record<string, unknown>>)[0].label, "Principal");
eq("totais numericos passam", [masc[0].wallets.cexUsd, masc[0].wallets.traditionalEur], [100, 2500]);

const todas = juntarContas(masc);
eq("uniao: listas juntas", [todas.eth, todas.btc, todas.sol].map((a) => (a as unknown[]).length), [1, 1, 1]);
eq("uniao: totais somados (100 + 7)", todas.cexUsd, 107);
eq("uniao: total so de uma conta fica igual", todas.traditionalEur, 2500);

// v2: { v: 2, registry, wallets: { conta: WalletSnapshot } }.
const v2 = { v: 2, registry: { accounts: [{ id: "x", name: "X" }], activeId: "x" }, wallets: { x: { eth: [{ address: ETH, balance: "2" }] } } };
eq("v2: le a conta", contasDoBlob(v2).map((c) => [c.accountId, c.name]), [["x", "X"]]);
eq("v2: conta carteiras", contarCarteiras(v2), 1);

// Plano (antes das contas): o proprio blob e o snapshot.
const plano = { eth: [{ address: ETH, balance: "1" }], ada: [{ address: "addr1", balance: "9" }], cexUsd: 3 };
eq("plano: uma conta 'legacy'", contasDoBlob(plano).map((c) => c.accountId), ["legacy"]);
eq("plano: conta carteiras", contarCarteiras(plano), 2);

// Lixo: nunca rebenta, devolve vazio.
eq("null → sem contas", contasDoBlob(null), []);
eq("string → sem contas", contasDoBlob("abc"), []);
eq("objeto sem nada → sem contas", contasDoBlob({ v: 3 }), []);
eq("array → sem contas", contasDoBlob([1, 2]), []);
eq("contarCarteiras de lixo = 0", contarCarteiras(undefined), 0);
eq("whitelist de nao-objeto = null", whitelistSnapshot("x", mask), null);
eq("juntarContas sem contas = {}", juntarContas([]), {});

if (fails) { console.log(`\n${fails} falha(s)`); process.exit(1); }
console.log("\nTODOS OK");
