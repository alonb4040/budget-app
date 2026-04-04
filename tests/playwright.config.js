// tests/playwright.config.js
// Playwright configuration for budget-app E2E tests

const { defineConfig, devices } = require('@playwright/test');

const baseURL = process.env.TEST_URL || 'http://localhost:3000';
const headless = process.env.HEADLESS === 'true';

module.exports = defineConfig({
  testDir: './specs',
  timeout: 30000,
  retries: 0,
  workers: 1,

  use: {
    baseURL,
    headless,
    viewport: { width: 1280, height: 800 },
    screenshot: 'only-on-failure',
    screenshotPath: './screenshots',
    video: 'off',
    locale: 'he-IL',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        headless,
      },
    },
  ],

  outputDir: './screenshots',

  reporter: [
    ['list'],
    ['html', { outputFolder: './playwright-report', open: 'never' }],
  ],
});
