import { ImageResponse } from "next/og";

export const alt =
  "ChainFolioAI — O teu portefólio cripto e tradicional num só lugar";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Cartão social gerado dinamicamente (1200×630).
// Next injeta automaticamente og:image e, na ausência de twitter-image, twitter:image.
export default function Image() {
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
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 18,
              background: "#f97316",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 38,
              fontWeight: 800,
              color: "#020617",
            }}
          >
            C
          </div>
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
              fontSize: 66,
              fontWeight: 800,
              lineHeight: 1.08,
              letterSpacing: -1.5,
              maxWidth: 960,
            }}
          >
            <span style={{ color: "#f1f5f9" }}>O teu portefólio&nbsp;</span>
            <span style={{ color: "#fb923c" }}>cripto e tradicional&nbsp;</span>
            <span style={{ color: "#f1f5f9" }}>num só lugar</span>
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 30,
              color: "#94a3b8",
              maxWidth: 900,
            }}
          >
            PNL em tempo real, métricas avançadas, fiscalidade e um assistente de
            IA. 100% só-leitura.
          </div>
        </div>

        {/* Chips */}
        <div style={{ display: "flex", gap: 16 }}>
          {["ROI · Sharpe · Drawdown", "BTC · ETH · SOL · ADA", "Grátis para começar"].map(
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
    { ...size }
  );
}
