Screenshots da app para a landing ("Vê por dentro") e para a página
/como-funciona ("Ferramenta a ferramenta").

Coloca aqui estes ficheiros em WebP a 1600px de largura (converte com:
  node -e 'require("sharp")("x.png").resize({width:1600}).webp({quality:82}).toFile("x.webp")'
e atualiza width/height em src/app/page.tsx e src/app/como-funciona/page.tsx). As secções
aparecem automaticamente à medida que os ficheiros existem — os que
faltarem são simplesmente ignorados, sem partir as páginas.

A ordem abaixo é a ordem em que aparecem no percurso da /como-funciona.

  dashboard.webp     -> /dashboard     (PNL, blocos BTC, ticker cripto+tradicional)
  portfolio.webp     -> /portfolio     (total, distribuição, evolução, métricas)
  wallets.webp       -> /wallets       (multi-cadeia, só-leitura, endereços ocultos)
  market.webp        -> /mercado       (Fear & Greed + Top 200 + TradingView)
  smart-money.webp   -> /smart-money   (watchlist de baleias, transações, alertas)
  fiscalidade.webp   -> /fiscalidade   (FIFO, resumo por ativo, PT/ES/FR/DE)
  fire.webp          -> /fire          (regra dos 4%, projeção, variantes FIRE)
  chat.webp          -> assistente IA  (o chat "Chain" aberto, no canto inferior direito)

IMPORTANTE (privacidade): captura TUDO com "esconder saldos" LIGADO
(Conta -> Privacidade -> Esconder saldos), para não expor saldos reais
numa página pública. Os endereços já ficam ocultos por omissão.

Atenção também ao que fica nas bordas da captura (barra de favoritos,
notificações, outros separadores) e a nomes pessoais dados às carteiras
em /wallets — essas etiquetas aparecem na imagem.
