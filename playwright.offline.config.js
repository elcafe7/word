import { defineConfig, devices } from '@playwright/test';

// Offline single-file HTML tests (offline SPEC §2.9): file:// URLs, no web server, no network.
// WORD_OFFLINE_DIR = the folder with word-geneva1599.html, word-kjv.html, word-kjv1611.html (scripts/build-offline.sh).
if (!process.env.WORD_OFFLINE_DIR) throw new Error('set WORD_OFFLINE_DIR to a scripts/build-offline.sh output folder');

export default defineConfig({
  testDir: 'e2e/offline',
  timeout: 60000,
  workers: Number(process.env.WORD_E2E_WORKERS) || 4,
  reporter: [['list']],
  use: { trace: 'off', video: 'off', screenshot: 'off' },
  projects: [
    { name: 'offline-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'offline-firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1280, height: 800 } } },
    { name: 'offline-webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 800 } } },
    {
      name: 'offline-phone',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
    },
  ],
});
