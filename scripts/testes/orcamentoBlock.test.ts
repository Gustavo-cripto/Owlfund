import { cortarHistorico, estimarTokens, partirSeccoes, selecionarSeccoes, temasDaPergunta } from "@/lib/ai/orcamentoBlock";
let fails = 0;
const ok = (name: string, cond: boolean, extra = "") => { if (!cond) fails++; console.log(`${cond ? "✅" : "❌"} ${name}${extra ? ` — ${extra}` : ""}`); };

// Temas da pergunta (PT/EN/ES/FR, sem acentos).
ok("DeFi", temasDaPergunta("Lista as minhas posições DeFi abertas").has("defi"));
ok("NFT", temasDaPergunta("Que NFTs tenho?").has("nft"));
ok("variação → histórico", temasDaPergunta("Quanto subiu o meu portefólio a 60 dias?").has("historico"));
ok("impostos → fiscal", temasDaPergunta("Qual a minha exposição fiscal em Portugal?").has("fiscal"));
ok("whales (EN) → baleias", temasDaPergunta("Any whale moves today?").has("baleias"));
ok("ajuda com o site → plataforma", temasDaPergunta("O que posso fazer no ChainFolioAI e onde encontro cada funcionalidade?").has("plataforma"));
ok("'como está o portefólio' NÃO é plataforma", !temasDaPergunta("Como está o meu portefólio hoje?").has("plataforma"));
ok("FR retraite → fire", temasDaPergunta("Quand puis-je prendre ma retraite ?").has("fire"));

// Secções.
const texto = [
  "=== PORTEFÓLIO (conta \"GT 1\") — totais por categoria ===", "Valor total: € 886,78", "",
  "=== CARTEIRAS ON-CHAIN (nomes/etiquetas, nunca endereços) ===", "Ethereum (1 carteira):", "  - Ledger: 0,13 ETH", "",
  "=== POSIÇÕES DEFI (abertas e fechadas, com pares) ===", "  - Uniswap · aberta · par ETH/USDC · $120", "",
  "=== NFTs ===", "  - Ledger: 3 NFTs", "",
  "=== PLANO FIRE (parâmetros guardados pelo utilizador) ===", "  - Despesas mensais: 2.000 EUR", "",
  "=== HISTÓRICO DO PORTEFÓLIO (fotografias guardadas) ===", "  - 60 dias: +€ 66,78", "",
  "=== BALEIAS CONHECIDAS (pré-carregadas) ===", "Ethereum: Binance Cold Wallet, Vitalik", "",
].join("\n");
const secs = partirSeccoes(texto);
ok("7 secções", secs.length === 7, String(secs.length));
ok("título limpo", secs[0].titulo.startsWith("PORTEFÓLIO"));

const generico = selecionarSeccoes(secs, "Analisa o meu portefólio — risco e alocação.", 10_000);
ok("genérico: totais entram", generico.includes("Valor total"));
ok("genérico: carteiras e DeFi (núcleo) entram", generico.includes("Ledger: 0,13 ETH") && generico.includes("Uniswap"));
ok("genérico: NFTs, FIRE e baleias ficam de fora", !generico.includes("3 NFTs") && !generico.includes("Despesas mensais") && !generico.includes("Vitalik"));

const largo = selecionarSeccoes(secs, "Analisa o meu portefólio — risco e alocação.", 20_000, { maxTema: 9000, maxNucleo: 4000, maxResto: 2500, incluirResto: true });
ok("orçamento largo: NFTs, FIRE e baleias entram no fim", largo.includes("3 NFTs") && largo.includes("Despesas mensais") && largo.indexOf("Vitalik") > largo.indexOf("Uniswap"));

const nft = selecionarSeccoes(secs, "Que NFTs tenho?", 10_000);
ok("pergunta NFT: secção NFT entra", nft.includes("3 NFTs"));
ok("pergunta NFT: totais primeiro", nft.indexOf("Valor total") < nft.indexOf("3 NFTs"));

// Orçamento apertado: o tema entra, o resto é cortado.
const apertado = selecionarSeccoes(secs, "Que NFTs tenho?", 260);
ok("orçamento apertado respeita o limite", apertado.length <= 300, String(apertado.length));
ok("orçamento apertado mantém totais", apertado.includes("Valor total"));

// Corte de secção longa.
const longa = [{ titulo: "CARTEIRAS ON-CHAIN", corpo: Array.from({ length: 200 }, (_, i) => `  - Carteira ${i}: 1 ETH`).join("\n") }];
const cortada = selecionarSeccoes(longa, "saldos das carteiras", 10_000, { maxTema: 500, maxNucleo: 300, maxResto: 100 });
ok("secção do tema cortada a maxTema", cortada.length <= 560 && cortada.endsWith("[…]"), String(cortada.length));

// Histórico da conversa.
const msgs = Array.from({ length: 10 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `m${i} ` + "x".repeat(900) }));
const h = cortarHistorico(msgs, 3000, 800);
ok("última mensagem entra sempre", h[h.length - 1].content.startsWith("m9"));
ok("mensagens antigas cortadas a 800 + […]", h[0].content.length <= 806);
ok("respeita o orçamento", h.reduce((n, m) => n + m.content.length, 0) <= 3000 + 905);
ok("ordem cronológica mantida", h.every((m, i) => i === 0 || Number(m.content.slice(1, 2)) > Number(h[i - 1].content.slice(1, 2))));

ok("estimativa de tokens conservadora", estimarTokens("x".repeat(2600)) === 1000);

if (fails) { console.log(`\n${fails} teste(s) falhados`); process.exit(1); }
