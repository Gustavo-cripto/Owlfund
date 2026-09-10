Screenshots da app para a landing ("Ve por dentro") e para a pagina
/como-funciona ("Ferramenta a ferramenta").

FICHEIROS ATUAIS (WebP, 1600px de largura) — atualizados a 2026-09-10
(portfolio, wallets e smart-money sao de 7-10 set; as outras 6 de 6 set):

  dashboard.webp     -> /dashboard     (o que cada plano desbloqueia)
  portfolio.webp     -> /portfolio     (PNL por periodo, alocacao, evolucao)
  wallets.webp       -> /wallets       (ETH+SOL ligados, WalletConnect QR)
  market.webp        -> /mercado       (grafico TradingView + BTC)
  smart-money.webp   -> /smart-money   (Satoshi + Vitalik com saldos reais)
  fiscalidade.webp   -> /fiscalidade   (legislacao dos 21 paises)
  fire.webp          -> /fire          (resultado + cenarios what-if)
  historico.webp     -> /historico     (registo manual + importar CSV)
  chat.webp          -> /gestor        (Block, o Gestor Dedicado IA)
  developers.webp    -> /account?section=api (criar chaves API & MCP, webhook)

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
