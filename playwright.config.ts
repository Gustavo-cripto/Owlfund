import { defineConfig, devices } from "@playwright/test";

// Testes de ponta a ponta contra o site A CORRER (por defeito producao).
//
//   npm run e2e                         → tudo (precisa de E2E_EMAIL/E2E_PASSWORD)
//   npm run e2e -- e2e/publico.spec.ts  → so paginas publicas (sem conta)
//   E2E_BASE_URL=http://localhost:3001 npm run e2e
//
// A sessao e feita uma vez (e2e/auth.setup.ts) e guardada em e2e/.auth/, que
// esta no .gitignore. A conta de teste e uma conta normal, criada a mao; as
// credenciais vivem so nos segredos do GitHub e no ambiente local.

const BASE_URL = process.env.E2E_BASE_URL ?? "https://chainfolioai.com";
const HAS_ACCOUNT = Boolean(process.env.E2E_EMAIL && process.env.E2E_PASSWORD);

export default defineConfig({
  testDir: "e2e",
  // Os testes privados partilham a mesma conta e alguns escrevem (Historico);
  // correm em serie e por ordem de nome (10-, 20-, …) para nao se pisarem.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: BASE_URL,
    locale: "pt-PT",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    { name: "publico", testMatch: /(publico|acessibilidade)\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    // Telemovel em Chromium (Pixel 7): um so browser instalado no CI chega.
    { name: "publico-movel", testMatch: /publico\.spec\.ts/, use: { ...devices["Pixel 7"] } },
    // Sessao: so existe se houver credenciais.
    ...(HAS_ACCOUNT
      ? [
          { name: "sessao", testMatch: /auth\.setup\.ts/, use: { ...devices["Desktop Chrome"] } },
          {
            name: "privado",
            testMatch: /\d\d-.*\.spec\.ts/,
            dependencies: ["sessao"],
            use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/user.json" },
          },
        ]
      : []),
  ],
});
