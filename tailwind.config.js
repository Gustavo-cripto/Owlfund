/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  // hover: só em dispositivos com rato — no toque o hover dispara ao tocar e
  // fica "preso" até se tocar noutro sítio.
  future: { hoverOnlyWhenSupported: true },
  darkMode: "class",
  theme: {
    extend: {},
  },
  plugins: [],
};
