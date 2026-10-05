// "Tem dados" de uma conta (cron de emails + funil): endereco on-chain OU
// registo manual nao vazio, em qualquer formato do blob de wallet_config.
import { temDados } from "@/lib/analytics/funil";
let fails = 0;
const eq = (name: string, got: boolean, want: boolean) => { const ok = got === want; if (!ok) fails++; console.log(`${ok ? "✅" : "❌"} ${name}: ${got}${ok ? "" : ` (esperado ${want})`}`); };

const ETH = "0x742d35Cc6634C0532925a3b844Bc454e4438f44e";
const v3 = (data: Record<string, Record<string, string>>) => ({ v: 3, registry: { accounts: [{ id: "a1", name: "Conta 1" }], activeId: "a1" }, data });

// Vazios
eq("null", temDados(null), false);
eq("blob v3 sem contas", temDados(v3({})), false);
eq("v3 com carteiras vazias", temDados(v3({ a1: { "portfolio-wallets": JSON.stringify({ eth: [], sol: [] }) } })), false);
eq("v3 com holdings cripto vazios ({})", temDados(v3({ a1: { "owlfund.crypto.holdings.v1": "{}" } })), false);
eq("v3 com holdings tradicionais vazios", temDados(v3({ a1: { "owlfund.traditional.holdings.v1": "{}" } })), false);
eq("v3 com corretoras manuais vazias ([])", temDados(v3({ a1: { "owlfund.venue.holdings.v1": "[]" } })), false);
eq("v3 so com carimbos de sync", temDados(v3({ a1: { "owlfund.sync.ts.v1": JSON.stringify({ "portfolio-wallets": 1 }) } })), false);
eq("JSON invalido dentro da chave manual", temDados(v3({ a1: { "owlfund.crypto.holdings.v1": "{nao e json" } })), false);

// Com dados
eq("v3 com endereco ETH", temDados(v3({ a1: { "portfolio-wallets": JSON.stringify({ eth: [{ address: ETH, network: "Ethereum" }] }) } })), true);
eq("v3 com holdings cripto a mao", temDados(v3({ a1: { "owlfund.crypto.holdings.v1": JSON.stringify({ BTC: { quantity: 0.5, buyValue: 20000 } }) } })), true);
eq("v3 com ETFs a mao", temDados(v3({ a1: { "owlfund.traditional.holdings.v1": JSON.stringify({ VWCE: { quantity: 10 } }) } })), true);
eq("v3 com corretora manual", temDados(v3({ a1: { "owlfund.venue.holdings.v1": JSON.stringify([{ id: "v_1", venue: "revolut", assets: [{ asset: "BTC", qty: 1 }], source: "manual", updatedAt: 1 }]) } })), true);
eq("v3: dados na 2.a conta", temDados(v3({ a1: {}, a2: { "owlfund.crypto.holdings.v1": JSON.stringify({ ETH: { quantity: 1 } }) } })), true);
eq("formato antigo (snapshot plano) com endereco", temDados({ eth: [{ address: ETH }] }), true);
eq("chave manual ja como objeto (nao string)", temDados({ data: { a1: { "owlfund.crypto.holdings.v1": { SOL: { quantity: 2 } } } } }), true);
eq("blob como string JSON", temDados(JSON.stringify(v3({ a1: { "owlfund.venue.holdings.v1": "[{\"id\":\"v_2\"}]" } }))), true);

// Modo de exemplo: carteiras com source "demo" NÃO contam como "conta com carteira".
eq("v3 só com carteiras de exemplo", temDados(v3({ a1: { "portfolio-wallets": JSON.stringify({ eth: [{ address: ETH, network: "Ethereum", source: "demo" }], btc: [{ address: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", source: "demo" }] }) } })), false);
eq("v3 com exemplo + uma carteira real", temDados(v3({ a1: { "portfolio-wallets": JSON.stringify({ eth: [{ address: ETH, source: "demo" }, { address: ETH, network: "Base", source: "manual" }] }) } })), true)

console.log(fails === 0 ? "\nTODOS OK" : `\n${fails} FALHA(S)`); process.exit(fails ? 1 : 0);
