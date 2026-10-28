// Shared Playwright fixtures: a fresh Chromium profile with Backtrack loaded for every test.
const path = require('path');
const { test: base, expect, chromium } = require('@playwright/test');
const { installFakeYouTube } = require('./e2e/fake-youtube');

const EXT = path.resolve(__dirname, '..');

const test = base.extend({
  fakeYouTube: [true, { option: true }],

  context: async ({ fakeYouTube }, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium', // full Chromium (not headless-shell), which can load extensions
      headless: !process.env.HEADED,
      viewport: { width: 1280, height: 800 },
      args: [
        `--disable-extensions-except=${EXT}`,
        `--load-extension=${EXT}`,
        '--autoplay-policy=no-user-gesture-required',
        '--mute-audio',
      ],
    });
    if (fakeYouTube) await installFakeYouTube(context);
    await use(context);
    await context.close();
  },

  sw: async ({ context }, use) => {
    if (!context.serviceWorkers().length) await context.waitForEvent('serviceworker');
    // Wait for onInstalled to write the defaults. Re-read the worker each time in case it restarted.
    const latest = () => context.serviceWorkers().at(-1);
    await expect.poll(() => latest().evaluate(() => chrome.storage.local.get('adBlock').then((s) => s.adBlock)).catch(() => null),
      { timeout: 20000 }).toBe(true);
    await use(latest());
  },

  extId: async ({ sw }, use) => use(new URL(sw.url()).host),

  // chrome.storage.local, read/written from the service worker.
  store: async ({ sw }, use) => use({
    get: (keys = null) => sw.evaluate((k) => chrome.storage.local.get(k), keys),
    set: (v) => sw.evaluate((x) => chrome.storage.local.set(x), v),
    val: (k) => sw.evaluate((key) => chrome.storage.local.get(key).then((s) => s[key]), k),
  }),

  popup: async ({ context, extId }, use) => {
    const page = await context.newPage();
    await page.setViewportSize({ width: 380, height: 760 });
    await page.goto(`chrome-extension://${extId}/popup.html`);
    await use(page);
  },

  // Opens a watch page and waits until the video can play. Returns the page.
  openVideo: async ({ context }, use) => use(async (id, page) => {
    page = page || (await context.newPage());
    await page.goto(`https://www.youtube.com/watch?v=${id}`);
    await waitForVideo(page);
    return page;
  }),

  // Collects uncaught errors from every page and fails the test if any came from the extension.
  extErrors: [async ({ context }, use) => {
    const errors = [];
    const watch = (p) => p.on('pageerror', (e) => errors.push(`${p.url()}: ${e.message}`));
    context.pages().forEach(watch);
    context.on('page', watch);
    await use(errors);
    expect(errors, 'uncaught page errors').toEqual([]);
  }, { auto: true }],
});

const video = (page, fn, arg) => page.evaluate(([f, a]) => {
  const v = document.querySelector('#movie_player video');
  return new Function('v', 'a', `return (${f})(v, a)`)(v, a);
}, [fn.toString(), arg]);

async function waitForVideo(page, timeout = 15000) {
  await expect.poll(() => page.evaluate(() => {
    const v = document.querySelector('#movie_player video');
    return !!v && v.readyState >= 2 && !document.querySelector('#movie_player.ad-showing');
  }), { timeout }).toBe(true);
}

const idOf = (page) => new URL(page.url()).searchParams.get('v');

module.exports = { test, expect, video, waitForVideo, idOf };
