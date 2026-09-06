"use client";

// Último recurso: substitui o layout raiz quando ele próprio falha.
// Sem providers disponíveis → texto bilingue fixo e estilos inline.

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="pt-PT">
      <body style={{ margin: 0, background: "#020617", color: "#e2e8f0", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 24px", textAlign: "center" }}>
          <p style={{ fontSize: 12, letterSpacing: "0.3em", textTransform: "uppercase", color: "#fda4af" }}>ChainFolioAI</p>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: "#fff", margin: "12px 0 0" }}>Algo correu mal · Something went wrong</h1>
          <p style={{ maxWidth: 480, color: "#94a3b8", marginTop: 12 }}>
            Ocorreu um erro inesperado. Tenta recarregar a página — se persistir, escreve para suporte@chainfolioai.com.
            <br />An unexpected error occurred. Try reloading — if it persists, email suporte@chainfolioai.com.
          </p>
          {error?.digest && <p style={{ fontFamily: "monospace", fontSize: 11, color: "#475569", marginTop: 8 }}>ref: {error.digest}</p>}
          <button type="button" onClick={reset} style={{ marginTop: 32, background: "#f97316", color: "#020617", border: 0, borderRadius: 12, padding: "12px 32px", fontWeight: 700, cursor: "pointer" }}>
            Tentar de novo · Try again
          </button>
        </div>
      </body>
    </html>
  );
}
