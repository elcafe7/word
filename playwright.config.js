import { defineConfig, devices } from '@playwright/test';
import { APP_URL, BASE, ORIGIN, REMOTE, WELCOME_SEEN } from './e2e/target.js';

// Target: see e2e/target.js. Local by default (WORD_BASE, default /word/); WORD_E2E_URL points at a deployment.
export default defineConfig({
  testDir: 'e2e',
  testIgnore: ['**/offline/**'], // file:// single-file tests: playwright.offline.config.js
  timeout: 60000,
  workers: Number(process.env.WORD_E2E_WORKERS) || (REMOTE ? 2 : 4),
  reporter: [['list']],
  webServer: REMOTE ? undefined : {
    command: '(test -f public/data/index.json || npm run data) && npm run build && npm run preview',
    url: APP_URL,
    reuseExistingServer: false,
    timeout: 180000,
    env: { WORD_BASE: BASE },
  },
  use: {
    baseURL: ORIGIN,
    trace: 'off',
    video: 'off',
    screenshot: 'off',
    // Every test starts as a returning visitor so the first-visit explainer (SPEC §10.13) doesn't cover the page.
    // e2e/welcome.spec.js clears this to test the first visit.
    storageState: { cookies: [], origins: [WELCOME_SEEN] },
  },
  projects: [
    {
      name: 'phone',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      // iPhone Safari engine; the layout specs only.
      name: 'iphone-webkit',
      use: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } },
      testMatch: /(picker|minimal|speed-touch)\.spec\.js$/,
    },
  ],
});
