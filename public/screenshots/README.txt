Screenshots da app para a landing ("Ve por dentro") e para a pagina
/como-funciona ("Ferramenta a ferramenta").

FICHEIROS ATUAIS (WebP, 1600px de largura) — atualizados a 2026-09-10
(portfolio, wallets e smart-money sao de 7-10 set; as outras 6 de 6 set):

  dashboard.webp     -> /dashboard     (o que cada plano desbloqueia)
  portfolio.webp     -> /portfolio     (grafico com velas, 1 dia; atualizado 2026-09-16)
  wallets.webp       -> /wallets       (ETH+SOL ligados, WalletConnect QR)
  corretoras.webp    -> /wallets       (seccao Exchanges centralizadas com o formulario
                                       aberto: 13 exchanges, bandeira MiCA, chave so-leitura;
                                       sem corretora ligada — capturado 2026-10-06)
  market.webp        -> /mercado       (grafico TradingView + BTC)
  smart-money.webp   -> /smart-money   (Satoshi + Vitalik com saldos reais)
  fiscalidade.webp   -> /fiscalidade   (legislacao dos 21 paises)
  fire.webp          -> /fire          (resultado + cenarios what-if)
  historico.webp     -> /historico     (registo manual + importar CSV)
  chat.webp          -> /gestor        (Block, o Gestor Dedicado IA; refeita 2026-10-06 sem
                                       alcunha na saudacao, saldos ocultos, 1600x922)
  block-resposta.webp-> /gestor        (pergunta + resposta do Block: pontuacao e metricas em
                                       tabela, valores tapados; para as redes, nao entra em /como-funciona)
  developers.webp    -> /account?section=api (criar chaves API & MCP, webhook)
  chain.webp         -> widget Chain    (ecra de entrada do Chain aberto sobre /mercado: "Ola!",
                                       sugestoes; para as redes)
  chain-resposta.webp-> widget Chain    (pergunta de principiante sobre stablecoins + resposta;
                                       para as redes)
  assistente-portefolio.webp -> /portfolio (painel "Inteligencia Artificial - Analisa o teu
                                       portefolio", o Assistente IA do Free/Pro, pergunta +
                                       resposta com valores tapados; para as redes)

COMO SUBSTITUIR UMA IMAGEM
1. Tira a captura com "esconder saldos" LIGADO (Conta -> Privacidade).
   Atencao ao que fica nas bordas (outras janelas, barra de favoritos) e a
   nomes pessoais dados as carteiras — aparecem na imagem.
2. Converte para WebP a 1600px:
     node -e 'require("sharp")("x.png").resize({width:1600}).webp({quality:82}).toFile("x.webp")'
3. Atualiza a largura/altura (w/h) em:
     src/app/como-funciona/page.tsx  (TOOLS)
     src/app/page.tsx                (SCREENSHOTS — dashboard, portfolio, market, wallets)
   Sem isto o layout salta enquanto a imagem carrega.

Os PNG originais destas capturas estao em:
  "ChainFolioAI - Privado/screenshots-originais/" (fora do repositorio, que e publico)

PROPORCAO (regra do agente social, out 2026): capturas para as redes entre 1,2 e 1,8
de proporcao (largura/altura), nunca acima de 2,0 — acima disso fica uma tira ilegivel
no telemovel. Para isso: estreitar o <main> por CSS (max-width ~1060px) antes de
capturar e enquadrar mais conteudo na vertical; a janela do Chrome nao aceita
redimensionar.
