import { defineConfig, devices } from '@playwright/test';

/**
 * Tests de bout en bout en MODE RÉEL : application compilée en `live`,
 * Supabase local (Auth, base, boîte mail de test). Utilisateurs et montants fictifs.
 * Le serveur et Supabase sont démarrés par le job CI « e2e-live ».
 */
export default defineConfig({
  testDir: './e2e-live',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  retries: 0,
  use: { baseURL: 'http://localhost:3000', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-live' }], ['junit', { outputFile: 'reports/playwright-live.xml' }]] : 'list',
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
});
