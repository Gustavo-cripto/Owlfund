import type { MetadataRoute } from "next";

// "Adicionar ao ecra inicial" no telemovel com nome, icone e cor certos. Tal
// como o opengraph-image, com um layout raiz por idioma tem de ser ligado a
// mao na metadata (rootMetadata.manifest) — o ficheiro sozinho nao chega.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ChainFolioAI",
    short_name: "ChainFolioAI",
    description: "O teu portefólio cripto e tradicional num só lugar.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#020617",
    theme_color: "#020617",
    icons: [
      { src: "/chainfolioai-icon.png", sizes: "256x256", type: "image/png" },
      { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
