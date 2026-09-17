/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  // hover: só em dispositivos com rato — no toque o hover dispara ao tocar e
  // fica "preso" até se tocar noutro sítio.
  future: { hoverOnlyWhenSupported: true },
  darkMode: "class",
  theme: {
    extend: {
      // Cinzentos "apagados" um pouco mais claros que os do Tailwind: os
      // originais (slate-500 #64748b, slate-600 #475569) ficam abaixo do
      // contraste minimo WCAG AA (4,5:1) sobre os nossos fundos escuros —
      // a auditoria axe (e2e/acessibilidade.spec.ts) apanhava-os em todas as
      // paginas. Com estes, texto pequeno passa sobre slate-950/900 e cartoes.
      colors: {
        slate: { 500: "#808c9e", 600: "#7a879b" },
      },
    },
  },
  plugins: [],
};
