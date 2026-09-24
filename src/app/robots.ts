import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://chainfolioai.com";

// Áreas privadas (exigem sessão — o middleware redireciona para /login) e rotas
// internas. Não devem ser rastreadas: não trazem tráfego útil e só geram
// redirects e páginas de erro nos resultados de pesquisa.
const PRIVATE_PATHS = [
  "/api/",
  "/account",
  "/admin",
  "/dashboard",
  "/fire",
  "/fiscalidade",
  "/gestor",
  "/historico",
  "/mercado",
  "/portfolio",
  "/smart-money",
  "/wallets",
  "/crypto/", // confirmação de pagamento — fluxo, não conteúdo
  "/reset-password",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        // As tres rotas publicas da API sao "livres de consultar e citar" (llms.txt
        // e diretorios MCP): tem de ficar de fora do Disallow /api/, senao os
        // rastreadores de IA que respeitam o robots nunca as leem. A regra mais
        // especifica ganha; "$" fecha o indice para nao abrir /api/v1/<privado>.
        allow: ["/", "/api/v1$", "/api/v1/tax-countries", "/api/v1/global"],
        disallow: PRIVATE_PATHS,
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
