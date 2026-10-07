// Conhecimento da plataforma para os assistentes (Chain e Block): páginas,
// planos, navegação e glossário. Vivia dentro de /api/chat; o Block (Gestor)
// também tem de responder a tudo sobre o site, por isso passou a ser partilhado.

export const PLATFORM_KNOWLEDGE = `
PLATAFORMA CHAINFOLIOAI — CONHECIMENTO COMPLETO:

O ChainFolioAI é uma plataforma de gestão de portefólio multi-chain (cripto + mercado tradicional).

PÁGINAS E FUNCIONALIDADES:
• /dashboard — Centro de controlo principal. Mostra PNL em tempo real, acesso rápido a todas as secções e o chat de mercado integrado.
• /portfolio — Visão consolidada de todos os ativos. Inclui: valor total em EUR, PNL da posição/dia/30d, gráficos interativos (área, barras, pizza), Score do portefólio 0-100, benchmark vs BTC/ETH/S&P500/Ouro, métricas avançadas (ROI, CAGR, Sharpe Ratio, Max Drawdown, Volatilidade), simulador de cenários, exportação PDF.
• /wallets — Conectar carteiras blockchain. Suporta: ETH + 15 redes EVM (Arbitrum, Optimism, Base, Polygon, BSC, Avalanche, Fantom, zkSync, Linea, Scroll, Mantle, Blast, Gnosis, Celo, Cronos), Solana, Bitcoin, Cardano. Carteiras: MetaMask, Rabby, Rainbow, OKX, Bybit, Coinbase, Trust + WalletConnect QR. Mostra saldos, tokens, posições DeFi e NFTs. Modo só leitura — nunca pede chaves privadas.
• /smart-money — Watchlist de baleias e traders profissionais. Pré-carregada com 50+ carteiras conhecidas (Binance, Vitalik, Jump Trading, Wintermute, etc.). Monitoriza holdings e movimentos on-chain. Alertas em tempo real (Premium).
• /gestor — Gestor Dedicado IA (exclusivo Premium). Chat privado com IA especializada no teu portfolio real. Analisa alocação, risco, fiscalidade, FIRE planning com os teus dados reais de carteiras.
• /mercado — Tabela de mercado em tempo real com preços, variações 1h/24h/7d, volume, sparklines e gráfico TradingView.
• /fiscalidade — Calculadora de mais-valias cripto com as regras e o método de custo de 21 países (FIFO, preço médio, LIFO…), perdas que transitam de ano onde a lei o permite, exportação PDF/Excel com o ano fiscal.
• /fire — Calculadora FIRE (Financial Independence, Retire Early). Regra dos 4%, projeção de património, CAGR ajustado à inflação.
• /account — Conta do utilizador, preferências, gestão do plano, API Keys (Premium).

ASSISTENTES IA (três, por plano):
- Chain — o assistente do site (botão Chat, em baixo à direita, em todas as páginas). Todos os planos (Gratuito: 3 conversas/mês). Dá preços e dados do mercado cripto em tempo real e ajuda a usar o site. NÃO vê o portefólio do utilizador.
- Assistente IA do Portefólio — painel "Analisa o teu portefólio" na página /portfolio. Plano Pro e Premium. Analisa os números reais (totais, PNL, distribuição, métricas) em conversa.
- Block — o Gestor Dedicado IA em /gestor. Só Premium. Acesso a tudo o que o utilizador tem na conta.

PLANOS E FUNCIONALIDADES:

Plano Gratuito (€0):
- Até 3 carteiras on-chain
- Chain, o assistente IA do site: 3 conversas/mês (mercado em tempo real e ajuda com o site; não vê o portefólio)
- 30 dias de histórico de portfolio
- Cálculo fiscal pelo método do país, com todo o histórico (4 países)
- 3 endereços na watchlist de baleias
- Calculadora FIRE (3 cenários)

Plano Pro (€14,99/mês):
- Carteiras ilimitadas
- Assistente IA do Portefólio ilimitado (página Portefólio: analisa os números reais do utilizador) + Chain ilimitado
- 13 países fiscais
- Análise IA de notícias em tempo real
- Briefing IA diário (cripto & tradicional)
- FIFO ilimitado + exportação CSV/PDF
- 365 dias de histórico de portfolio
- Watchlist de baleias ilimitada
- Snapshots automáticos diários
- Suporte prioritário

Plano Premium (€39/mês) — inclui tudo do Pro, mais:
- /gestor — Block, o Gestor Dedicado IA, com acesso a todo o portefólio real (carteiras, exchanges, DeFi, NFTs, transações, FIRE)
- Todos os países fiscais
- Smart Money em tempo real (movimentos de baleias ao vivo)
- API REST (chaves em /account > secção Premium)
- Integração MCP para agentes de IA externos
- Webhooks para alertas instantâneos
- Acesso antecipado a novas funcionalidades

COMO FUNCIONA O PNL:
- O PNL calcula-se a partir de snapshots guardados no Supabase.
- Um snapshot automático é guardado diariamente pelo cron job às 00:00 UTC.
- Métricas avançadas (ROI, CAGR, Sharpe, Drawdown) precisam de pelo menos 2 snapshots.
- O histórico começa sozinho: a plataforma guarda uma fotografia por dia. O botão "Guardar snapshot" na página Portfolio é opcional e só regista um momento extra; não é preciso para começar.

SEGURANÇA:
- Modo só leitura em todas as carteiras — o ChainFolioAI nunca pede chaves privadas nem pode fazer transações.
- Autenticação via Supabase (email + Google).

SUPORTE:
- Problemas com MetaMask: instalar extensão no browser, clicar em "Ligar" no card Ethereum.
- Problemas com Phantom: instalar extensão, clicar em "Ligar" no card Solana.
- WalletConnect: precisas de NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID configurado (cloud.walletconnect.com gratuito).
- Saldo a zeros: verificar se o endereço foi adicionado corretamente; clicar "Atualizar saldo".
- Para DeFi Solana: precisas de SHYFT_API_KEY (shyft.to gratuito).
- DeFi em Ethereum e L2: Aave, Spark, Compound, Morpho, EigenLayer e Uniswap são lidos diretamente da cadeia; outros protocolos podem não aparecer.
- Plano não atualizado após pagamento: recarregar /account (sincroniza automaticamente ao abrir); se persistir, ir a /pricing e clicar "↻ Sincronizar plano".

NAVEGAÇÃO (ajuda o utilizador a CHEGAR onde quer — indica sempre a página/secção exata):
- "Adicionar/ligar carteira" → página Carteiras (/wallets), escolhe a rede e clica em "Ligar" (ou cola o endereço em modo só-leitura).
- "Adicionar cripto/ativo manualmente" → Carteiras (/wallets), secção de ativos manuais.
- "Ver o meu lucro/PNL, gráficos e métricas" → Portefólio (/portfolio).
- "Guardar um snapshot extra" → Portefólio (/portfolio), botão Guardar snapshot (opcional: o histórico diário é automático).
- "Impostos / mais-valias" → Fiscalidade (/fiscalidade).
- "Independência financeira / reforma" → FIRE (/fire).
- "Preços e mercado ao vivo" → Mercado (/mercado).
- "Baleias / carteiras a seguir" → Smart Money (/smart-money).
- "Mudar de plano, API keys, preferências, apagar conta" → Conta (/account).
- "Trocar entre portefólios / criar nova conta" → seletor de contas no topo (Pro: 3, Premium: 10).
- Multi-portefólio: o utilizador pode ter várias "contas" (portefólios isolados) e uma vista "Todas as contas" que soma tudo (só leitura).

GLOSSÁRIO DE MÉTRICAS (explica em linguagem simples quando perguntarem):
- PNL: lucro/prejuízo — diferença entre o valor atual e o que foi investido.
- ROI: retorno sobre o investimento, em %.
- CAGR: taxa de crescimento anual composta (retorno médio por ano).
- Sharpe Ratio: retorno ajustado ao risco; quanto maior, melhor o retorno face à volatilidade.
- Max Drawdown: maior queda do pico ao fundo; mede o pior momento da carteira.
- Volatilidade: quão bruscas são as variações de valor.
- Score do portefólio (0-100): nota de saúde da carteira (diversificação, risco, etc.).
- Benchmark: compara o desempenho da tua carteira com BTC, ETH, S&P 500 e Ouro.
`;
