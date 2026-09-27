import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Lang } from "@/lib/i18n/translations";
import { OG_SIZE, OG_TEXT } from "@/lib/seo/ogText";

// Cartao social (1200×630) numa lingua. Um so desenho para as 4: o pt sai em
// src/app/opengraph-image.tsx, en/es/fr em src/app/og/[lang]/image.png/route.tsx.
// Os textos estao em src/lib/seo/ogText.ts.
export async function ogCardResponse(lang: Lang): Promise<ImageResponse> {
  const txt = OG_TEXT[lang];
  // Logótipo real embebido: lido do disco no prerender (rota corre em Node)
  // e passado como data URI — fetch de caminhos relativos rebenta no build.
  const logoBuf = await readFile(join(process.cwd(), "public", "chainfolioai-icon.png"));
  const logo = `data:image/png;base64,${logoBuf.toString("base64")}`;
  // Titulos mais compridos (fr) descem um pouco para caberem nas mesmas linhas.
  const tituloLongo = txt.title.join("").length > 52;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background:
            "radial-gradient(120% 120% at 20% 0%, #1b2536 0%, #020617 55%)",
          color: "#f1f5f9",
          padding: "72px",
          fontFamily: "sans-serif",
        }}
      >
        {/* Marca */}
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
          <img src={logo} width={64} height={64} style={{ borderRadius: 18 }} />
          <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: -0.5 }}>
            ChainFolioAI
          </div>
        </div>

        {/* Título */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              fontSize: tituloLongo ? 60 : 66,
              fontWeight: 800,
              lineHeight: 1.08,
              letterSpacing: -1.5,
              maxWidth: 960,
            }}
          >
            {/* Espaco final de cada pedaco como &nbsp;: o Satori come os normais. */}
            <span style={{ color: "#f1f5f9" }}>{txt.title[0].replace(/ $/, " ")}</span>
            <span style={{ color: "#fb923c" }}>{txt.title[1].replace(/ $/, " ")}</span>
            <span style={{ color: "#f1f5f9" }}>{txt.title[2]}</span>
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 30,
              color: "#94a3b8",
              maxWidth: 900,
            }}
          >
            {txt.sub}
          </div>
        </div>

        {/* Chips */}
        <div style={{ display: "flex", gap: 16 }}>
          {txt.chips.map(
            (chip) => (
              <div
                key={chip}
                style={{
                  fontSize: 24,
                  fontWeight: 600,
                  color: "#fdba74",
                  background: "rgba(249,115,22,0.12)",
                  border: "1px solid rgba(249,115,22,0.35)",
                  borderRadius: 999,
                  padding: "12px 26px",
                  display: "flex",
                }}
              >
                {chip}
              </div>
            )
          )}
        </div>
      </div>
    ),
    { ...OG_SIZE }
  );
}
