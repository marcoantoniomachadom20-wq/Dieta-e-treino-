import { defineConfig, devices } from '@playwright/test';

/**
 * Teste ponta a ponta no navegador, em viewport de celular, contra o servidor de produção
 * (API + frontend compilado). Rode: npm run build && npm run e2e
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  workers: 1,
  use: {
    baseURL: process.env.E2E_URL ?? 'http://localhost:3001',
    ...devices['Pixel 7'],
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
    screenshot: 'only-on-failure',
    colorScheme: process.env.E2E_DARK ? 'dark' : 'light',
  },
});
