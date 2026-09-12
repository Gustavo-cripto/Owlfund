import { LANGS, PAGE_SLUG, pageUrl, type PublicPage } from "@/lib/i18n/routes";
import { COUNTRIES, guideUrl } from "@/lib/tax/countries";
import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://chainfolioai.com";

// Só páginas PÚBLICAS. As áreas privadas exigem sessão e estão bloqueadas no
// robots.ts — listá-las aqui só encheria os resultados de pesquisa com
// redirects para /login.
// MANUTENÇÃO: ao criar uma página pública nova, acrescenta-a aqui (e ao
// ALLOWED de src/app/api/track/route.ts, se quiseres contá-la nas estatísticas).
// As paginas com versao em cada idioma (/, /beta, /pricing, /como-funciona)
// nao estao aqui: sao geradas mais abaixo a partir de PAGE_SLUG, para o sitemap
// nao ficar por atualizar quando se acrescentar um idioma ou mudar um slug.
const PAGES: Array<{ path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }> = [
  { path: "/developers", priority: 0.6, changeFrequency: "monthly" },
  { path: "/guias/impostos-cripto", priority: 0.8, changeFrequency: "monthly" },
  { path: "/guides/crypto-tax", priority: 0.8, changeFrequency: "monthly" },
  { path: "/login", priority: 0.4, changeFrequency: "yearly" },
  { path: "/termos", priority: 0.3, changeFrequency: "yearly" },
  { path: "/privacidade", priority: 0.3, changeFrequency: "yearly" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  const fixed = PAGES.map(({ path, priority, changeFrequency }) => ({
    url: `${SITE_URL}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }));
  // Uma entrada por país do guia fiscal (21). Geradas da mesma lista que as
  // páginas, para o sitemap não ficar desatualizado quando se acrescentar um país.
  const guias = COUNTRIES.flatMap((c) =>
    (["pt", "en"] as const).map((lang) => ({
      url: `${SITE_URL}${guideUrl(lang, c)}`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  );
  // Uma entrada por pagina publica x idioma (4 x 4 = 16).
  const prioridade: Record<PublicPage, number> = { home: 1.0, beta: 0.9, pricing: 0.9, howItWorks: 0.8 };
  const traduzidas = (Object.keys(PAGE_SLUG) as PublicPage[]).flatMap((page) =>
    LANGS.map((lang) => ({
      url: `${SITE_URL}${pageUrl(page, lang)}`,
      lastModified,
      changeFrequency: (page === "howItWorks" ? "monthly" : "weekly") as MetadataRoute.Sitemap[number]["changeFrequency"],
      priority: prioridade[page],
    })),
  );
  return [...traduzidas, ...fixed, ...guias];
}
