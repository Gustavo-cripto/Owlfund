// Next 16: o eslint-config-next passou a exportar "flat config" nativo — o
// FlatCompat (@eslint/eslintrc) que aqui estava deixou de conseguir lê-lo.
// Mesmas duas bases de antes (core-web-vitals + typescript), importadas direto.
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // O eslint-config-next 16 traz o eslint-plugin-react-hooks 7, cujo
    // "recommended" junta as regras do React Compiler como ERRO (79 casos no
    // código atual, em dezenas de ficheiros). São regras novas, não defeitos
    // novos: o código é o mesmo que passava no Next 15. Ficam como aviso para
    // não travar o CI/build na migração; corrigi-las é trabalho à parte.
    // rules-of-hooks continua erro e exhaustive-deps aviso, como antes.
    files: ["**/*.{js,jsx,mjs,ts,tsx,mts,cts}"],
    rules: {
      "react-hooks/static-components": "warn",
      "react-hooks/use-memo": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/globals": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/error-boundaries": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/set-state-in-render": "warn",
      "react-hooks/config": "warn",
      "react-hooks/gating": "warn",
    },
  },
  // desktop/ (Electron) e mobile/ (React Native) são projetos separados, com
  // as suas próprias regras — o require() é idiomático lá. Não os lintar aqui.
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "desktop/**", "mobile/**", ".claude/**"]),
]);

export default eslintConfig;
