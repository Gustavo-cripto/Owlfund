import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://chainfolioai.com";

// Áreas privadas (exigem sessão — o middleware redireciona para /login) e rotas
// internas. Não devem ser rastreadas: não trazem tráfego útil e só geram
// redirects e páginas de erro nos resultados de pesquisa.
const PRIVATE_PATHS = [
  "/api/",
  "/account",
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
        allow: "/",
        disallow: PRIVATE_PATHS,
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
