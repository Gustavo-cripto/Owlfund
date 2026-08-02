import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://chainfolioai.com";

// Só páginas PÚBLICAS. As áreas privadas exigem sessão e estão bloqueadas no
// robots.ts — listá-las aqui só encheria os resultados de pesquisa com
// redirects para /login.
// MANUTENÇÃO: ao criar uma página pública nova, acrescenta-a aqui (e ao
// ALLOWED de src/app/api/track/route.ts, se quiseres contá-la nas estatísticas).
const PAGES: Array<{ path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }> = [
  { path: "/", priority: 1.0, changeFrequency: "weekly" },
  { path: "/pricing", priority: 0.9, changeFrequency: "weekly" },
  { path: "/como-funciona", priority: 0.8, changeFrequency: "monthly" },
  { path: "/developers", priority: 0.6, changeFrequency: "monthly" },
  { path: "/login", priority: 0.4, changeFrequency: "yearly" },
  { path: "/termos", priority: 0.3, changeFrequency: "yearly" },
  { path: "/privacidade", priority: 0.3, changeFrequency: "yearly" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return PAGES.map(({ path, priority, changeFrequency }) => ({
    url: `${SITE_URL}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }));
}
