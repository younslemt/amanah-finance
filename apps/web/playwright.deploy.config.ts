import { defineConfig, devices } from '@playwright/test';

/**
 * Démonstration privée « telle que déployée » : serveur de production en mode démo, protection
 * d'accès exigée, moteur WebKit (Safari) aux tailles d'iPhone. Le serveur est démarré par la CI
 * (port 3100, variables DEMO_ACCESS_*), jamais par ce fichier.
 */
export default defineConfig({
  testDir: './e2e-deploy',
  use: { baseURL: 'http://localhost:3100', trace: 'on-first-retry', screenshot: 'only-on-failure' },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['junit', { outputFile: 'reports/playwright-deploy.xml' }]] : 'list',
  projects: [
    // iPhone SE (2e et 3e génération) : 375 × 667, même moteur WebKit
    { name: 'iphone-se-375', use: { ...devices['iPhone 13'], viewport: { width: 375, height: 667 } } },
    { name: 'iphone-13-390', use: { ...devices['iPhone 13'] } },
  ],
});
