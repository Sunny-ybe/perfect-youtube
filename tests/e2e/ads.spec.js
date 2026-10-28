const { test, expect, video, waitForVideo } = require('../fixtures');

const A = 'aaaaaaaaaaa';

// Samples the player every few ms while an ad shows. (Content scripts run in an isolated world,
// so hooking the element's setters from the page can't see their writes.)
const recordPlayer = (page) => page.evaluate(() => {
  window.__seen = { rates: [], muted: [] };
  const v = document.querySelector('#movie_player video');
  setInterval(() => {
    if (!document.querySelector('#movie_player.ad-showing')) return;
    window.__seen.rates.push(v.playbackRate);
    window.__seen.muted.push(v.muted);
  }, 4);
});
const uniq = (a) => [...new Set(a)];

test('skippable ads are skipped with the Skip button', async ({ openVideo }) => {
  const page = await openVideo(A);
  await page.evaluate(() => window.__fake.startAd());
  await expect.poll(() => page.evaluate(() => window.__fake.skipClicks)).toBe(1);
  await expect.poll(() => page.evaluate(() => !!document.querySelector('#movie_player.ad-showing'))).toBe(false);
});

test('unskippable ads are muted and sped up to the end, then speed and sound are restored', async ({ openVideo, store }) => {
  await store.set({ loop: true }); // keep the 2 s fake song playing
  const page = await openVideo(A);
  await video(page, (v) => { v.playbackRate = 1.5; });
  await page.waitForTimeout(500); // the user picks a speed some time before an ad, not in the same instant
  await recordPlayer(page);
  await page.evaluate(() => window.__fake.startAd({ skippable: false }));
  await expect.poll(() => page.evaluate(() => !!document.querySelector('#movie_player.ad-showing'))).toBe(false);
  const seen = await page.evaluate(() => window.__seen);
  expect(seen.rates).toContain(16);
  expect(seen.muted).toContain(true);
  await waitForVideo(page);
  await expect.poll(() => video(page, (v) => [v.playbackRate, v.muted])).toEqual([1.5, false]);
  await expect.poll(() => video(page, (v) => v.loop)).toBe(true); // loop comes back after the ad
});

test('an ad is gone well before it would have finished on its own', async ({ openVideo }) => {
  const page = await openVideo(A);
  const t0 = Date.now();
  await page.evaluate(() => window.__fake.startAd({ skippable: false })); // 6 s ad
  await expect.poll(() => page.evaluate(() => !!document.querySelector('#movie_player.ad-showing')), { timeout: 3000 }).toBe(false);
  expect(Date.now() - t0).toBeLessThan(3000);
});

test('a video the user muted stays muted after an ad', async ({ openVideo }) => {
  const page = await openVideo(A);
  await video(page, (v) => { v.muted = true; });
  await page.evaluate(() => window.__fake.startAd({ skippable: false }));
  await expect.poll(() => page.evaluate(() => !!document.querySelector('#movie_player.ad-showing'))).toBe(false);
  await waitForVideo(page);
  expect(await video(page, (v) => v.muted)).toBe(true);
});

test('with ad blocking off, ads are left alone', async ({ openVideo, store }) => {
  await store.set({ adBlock: false });
  const page = await openVideo(A);
  await recordPlayer(page);
  await page.evaluate(() => window.__fake.startAd());
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => !!document.querySelector('#movie_player.ad-showing'))).toBe(true);
  expect(await page.evaluate(() => window.__fake.skipClicks)).toBe(0);
  const seen = await page.evaluate(() => window.__seen);
  expect(seen.rates.length).toBeGreaterThan(10);
  expect([uniq(seen.rates), uniq(seen.muted)]).toEqual([[1], [false]]);
});

test('ad slots on the page are hidden only while ad blocking is on', async ({ openVideo, store }) => {
  const page = await openVideo(A);
  await expect(page.locator('ytd-ad-slot-renderer')).toBeHidden();
  await expect(page.locator('#masthead-ad')).toBeHidden();
  await store.set({ adBlock: false });
  await expect(page.locator('ytd-ad-slot-renderer')).toBeVisible();
  await expect(page.locator('#masthead-ad')).toBeVisible();
  await store.set({ adBlock: true });
  await expect(page.locator('ytd-ad-slot-renderer')).toBeHidden();
});

const tryFetch = (page, url) => page.evaluate((u) => fetch(u).then(() => 'loaded', () => 'blocked'), url);

test('ad-server and YouTube ad-tracking requests are blocked; unblocked when switched off', async ({ openVideo, store, sw }) => {
  const page = await openVideo(A);
  const adUrls = [
    'https://googleads.g.doubleclick.net/pagead/id',
    'https://www.youtube.com/pagead/viewthroughconversion/1',
    'https://www.youtube.com/api/stats/ads?ver=2',
    'https://www.youtube.com/ptracking?pltype=adhost',
  ];
  for (const u of adUrls) expect(await tryFetch(page, u), u).toBe('blocked');
  expect(await tryFetch(page, 'https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=' + A)).toBe('loaded');

  await store.set({ adBlock: false });
  await expect.poll(() => sw.evaluate(() => chrome.declarativeNetRequest.getEnabledRulesets())).toEqual([]);
  for (const u of adUrls) expect(await tryFetch(page, u), u).toBe('loaded');

  await store.set({ adBlock: true });
  await expect.poll(() => sw.evaluate(() => chrome.declarativeNetRequest.getEnabledRulesets())).toEqual(['ads']);
});
