const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { trace: 'retain-on-failure' },
  projects: [
    // Offline: fake youtube.com served by tests/e2e/fake-youtube.js. Runs in CI on every push.
    { name: 'e2e', testDir: 'tests/e2e' },
    // Real youtube.com smoke test. Needs network; YouTube changes often, so run it by hand before releases.
    { name: 'live', testDir: 'tests/live', use: { fakeYouTube: false }, timeout: 180_000, retries: 1, workers: 1 },
  ],
});
