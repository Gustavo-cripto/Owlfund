import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // desktop/ (Electron) e mobile/ (React Native) são projetos separados, com
    // as suas próprias regras — o require() é idiomático lá. Não os lintar aqui.
    ignores: [".next/**", "out/**", "build/**", "next-env.d.ts", "desktop/**", "mobile/**"],
  },
];

export default eslintConfig;
