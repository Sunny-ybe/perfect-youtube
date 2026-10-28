// Smoke test against the real youtube.com. YouTube's page structure changes without notice, and the
// offline fake in tests/e2e only mimics it, so run this before every release: `npm run test:live`.
// Needs network. A fresh profile may get pre-roll ads, so waits are generous.
const { test, expect, video, waitForVideo, idOf } = require('../fixtures');

const A = 'jNQXAC9IVRw'; // "Me at the zoo", 19 s
const B = 'dQw4w9WgXcQ';

const finishSong = (page) => video(page, (v) => { v.currentTime = v.duration - 0.5; return v.play().catch(() => {}); });

test('real YouTube: titles, loop, timer, playlist, autoplay hold and ad blocking', async ({ context, popup, store, sw }) => {
  await test.step('adds links with real titles', async () => {
    await popup.fill('#links', `https://www.youtube.com/watch?v=${A}\nhttps://youtu.be/${B}`);
    await popup.click('#addLinks');
    await expect.poll(async () => (await store.val('playlist')).map((x) => x.title), { timeout: 15000 })
      .toEqual(['Me at the zoo', expect.stringContaining('Never Gonna Give You Up')]);
  });

  const page = await context.newPage();
  await test.step('page structure the content script relies on still exists', async () => {
    await page.goto(`https://www.youtube.com/watch?v=${A}`);
    await waitForVideo(page, 60000);
    expect(await page.locator('#movie_player video.html5-main-video').count()).toBe(1);
    expect(await page.locator('ytd-app').count()).toBe(1);
    await expect(page.locator('html')).toHaveClass(/ytlp-noads/);
    const tabId = await sw.evaluate((u) => chrome.tabs.query({}).then((t) => t.find((x) => x.url === u)?.id), page.url());
    const cur = await sw.evaluate((id) => chrome.tabs.sendMessage(id, { type: 'current' }), tabId);
    expect(cur).toEqual({ id: A, title: 'Me at the zoo' });
  });

  await test.step('loop', async () => {
    await store.set({ loop: true });
    await expect.poll(() => video(page, (v) => v.loop)).toBe(true);
    await finishSong(page);
    await page.waitForTimeout(3000);
    expect(idOf(page)).toBe(A);
    expect(await video(page, (v) => !v.paused && v.currentTime < 10)).toBe(true);
    await store.set({ loop: false });
  });

  await test.step('sleep timer pauses', async () => {
    await video(page, (v) => v.play());
    await store.set({ timerEnd: Date.now() + 1000 });
    await expect.poll(() => video(page, (v) => v.paused)).toBe(true);
    expect(await store.val('timerEnd')).toBe(null);
  });

  await test.step('ad requests are blocked', async () => {
    const r = await page.evaluate(() => fetch('https://googleads.g.doubleclick.net/pagead/id', { mode: 'no-cors' }).then(() => 'loaded', () => 'blocked'));
    expect(r).toBe('blocked');
  });
  await page.close();

  let player;
  await test.step('▶ Play opens the first song', async () => {
    await popup.bringToFront();
    [player] = await Promise.all([context.waitForEvent('page'), popup.click('#play')]);
    await expect.poll(() => idOf(player)).toBe(A);
    await waitForVideo(player, 60000);
    await expect.poll(() => video(player, (v) => !v.paused)).toBe(true);
  });

  await test.step('advances in-page to the next song, even in a background tab', async () => {
    await player.evaluate(() => { window.__sameDocument = true; });
    await finishSong(player);
    await expect.poll(() => idOf(player), { timeout: 20000 }).toBe(B);
    expect(await player.evaluate(() => window.__sameDocument)).toBe(true);
  });

  await test.step('stops after the last song and holds off YouTube autoplay', async () => {
    // After an in-page switch the old video can still look ready; wait for song B's own length (3:33).
    await expect.poll(() => video(player, (v) => v.duration > 100 && v.readyState >= 2 && !document.querySelector('#movie_player.ad-showing')),
      { timeout: 60000 }).toBe(true);
    // A seek issued while YouTube is still buffering can be dropped, so re-seek until the song ends.
    await expect.poll(async () => {
      if (await video(player, (v) => !v.ended && v.currentTime < v.duration - 1)) await finishSong(player);
      return store.val('plActive');
    }, { timeout: 30000, intervals: [2000] }).toBe(false);
    await player.waitForTimeout(8000); // longer than YouTube's autoplay countdown
    expect(idOf(player)).toBe(B);
    expect(await video(player, (v) => v.paused)).toBe(true);
  });
});
