// Cartao social por lingua (lote G): cada lingua tem og:image propria, sempre
// 1200×630, com o alt na lingua certa — no layout raiz, nas paginas publicas,
// nos guias/comparacoes e nas paginas legais.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { OG_LANGS_ROTA, OG_SIZE, OG_TEXT, ogImagePath } from "@/lib/seo/ogText";
import { ogImages, socialMeta } from "@/lib/seo/site";
import { rootMetadata } from "@/lib/seo/rootMetadata";
import { pageMetadata } from "@/lib/i18n/pageMeta";
import { compareIndexMetadata } from "@/lib/compare/compareMeta";
import { indexMetadata } from "@/lib/tax/guideMeta";

let fails = 0;
const ok = (name: string, cond: boolean, extra = "") => { if (!cond) fails++; console.log(`${cond ? "✅" : "❌"} ${name}${extra ? `: ${extra}` : ""}`); };

const LANGS = ["pt", "en", "es", "fr"] as const;
type Img = { url: string; width: number; height: number; alt: string };
const primeira = (m: unknown, onde: "openGraph" | "twitter"): Img | undefined =>
  ((m as Record<string, { images?: Img[] } | undefined>)[onde]?.images ?? [])[0];

// ── tamanho ──
ok("OG_SIZE e 1200×630", OG_SIZE.width === 1200 && OG_SIZE.height === 630);
const root = process.cwd();
const src = (f: string) => readFileSync(join(root, f), "utf8");
ok("opengraph-image.tsx declara 1200×630", /size = \{ width: 1200, height: 630 \}/.test(src("src/app/opengraph-image.tsx")));
ok("ogCard desenha com OG_SIZE", /\{ \.\.\.OG_SIZE \}/.test(src("src/lib/seo/ogCard.tsx")));
ok("rota en/es/fr existe", existsSync(join(root, "src/app/og/[lang]/image.png/route.tsx")));

// ── uma imagem por lingua ──
const urls = new Set<string>();
const alts = new Set<string>();
for (const lang of LANGS) {
  const [img] = ogImages(lang);
  urls.add(img.url); alts.add(img.alt);
  ok(`${lang}: ${img.url}`, img.url.endsWith(ogImagePath(lang)) && img.width === OG_SIZE.width && img.height === OG_SIZE.height);
  ok(`${lang}: alt na lingua`, img.alt === OG_TEXT[lang].alt && img.alt.startsWith("ChainFolioAI"));
  const t = OG_TEXT[lang];
  ok(`${lang}: titulo em 3 pedacos e 3 chips`, t.title.every(Boolean) && t.chips.every(Boolean) && t.sub.length > 0);

  // Onde a imagem e usada: raiz, pagina publica, comparacoes, paginas legais.
  ok(`${lang}: rootMetadata og + twitter`, primeira(rootMetadata(lang), "openGraph")?.url === img.url && primeira(rootMetadata(lang), "twitter")?.url === img.url);
  ok(`${lang}: pageMetadata(pricing)`, primeira(pageMetadata("pricing", lang), "openGraph")?.url === img.url && primeira(pageMetadata("pricing", lang), "twitter")?.url === img.url);
  ok(`${lang}: comparacoes`, primeira(compareIndexMetadata(lang), "openGraph")?.url === img.url);
  const s = socialMeta({ title: "x", description: "y", url: "https://x.test", type: "website", locale: "pt_PT", lang });
  ok(`${lang}: socialMeta`, s.openGraph.images[0].url === img.url && s.twitter.images[0].url === img.url);
}
ok("4 URLs diferentes", urls.size === 4, [...urls].join(" "));
ok("4 alts diferentes", alts.size === 4);
ok("pt fica em /opengraph-image", ogImagePath("pt") === "/opengraph-image");
ok("rota cobre en/es/fr", OG_LANGS_ROTA.join(",") === "en,es,fr");
ok("en/es/fr acabam em .png (fora do middleware)", OG_LANGS_ROTA.every((l) => ogImagePath(l).endsWith(".png")));
ok("guia en com imagem inglesa", primeira(indexMetadata("en"), "openGraph")?.url === ogImages("en")[0].url);
ok("guia pt com imagem portuguesa", primeira(indexMetadata("pt"), "openGraph")?.url === ogImages("pt")[0].url);

if (fails) { console.log(`\n${fails} falha(s)`); process.exit(1); }
console.log("TODOS OK");
