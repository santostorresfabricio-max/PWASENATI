import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  outputDir: './evidencias/browser-results',
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: 'evidencias/playwright-report', open: 'never' }]],
  use: { baseURL: 'http://localhost:8080', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'movil', use: { ...devices['Pixel 7'] } }
  ],
  webServer: { command: 'npm run preview', url: 'http://localhost:8080', reuseExistingServer: false }
});
