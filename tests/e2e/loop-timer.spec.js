const { test, expect, video } = require('../fixtures');

const A = 'aaaaaaaaaaa';

test.describe('loop', () => {
  test('turning loop on/off sets video.loop on open tabs', async ({ openVideo, store }) => {
    const page = await openVideo(A);
    expect(await video(page, (v) => v.loop)).toBe(false);
    await store.set({ loop: true });
    await expect.poll(() => video(page, (v) => v.loop)).toBe(true);
    await store.set({ loop: false });
    await expect.poll(() => video(page, (v) => v.loop)).toBe(false);
  });

  test('a looping video keeps playing past its end and YouTube autoplay never kicks in', async ({ openVideo, store }) => {
    await store.set({ loop: true });
    const page = await openVideo(A);
    await expect.poll(() => video(page, (v) => v.loop)).toBe(true);
    await video(page, (v) => { v.currentTime = v.duration - 0.2; return v.play(); });
    await page.waitForTimeout(2500); // past the end and past the fake autoplay countdown
    expect(await video(page, (v) => !v.paused && !v.ended)).toBe(true);
    expect(new URL(page.url()).searchParams.get('v')).toBe(A);
  });

  test('loop setting applies to videos opened later', async ({ openVideo, store }) => {
    await store.set({ loop: true });
    const page = await openVideo(A);
    await expect.poll(() => video(page, (v) => v.loop)).toBe(true);
  });

  test('auto-confirms "Continue watching?" while loop is on', async ({ openVideo, store }) => {
    await store.set({ loop: true });
    const page = await openVideo(A);
    await page.evaluate(() => window.__fake.stillWatching());
    await expect.poll(() => page.evaluate(() => window.__fake.confirmClicks)).toBe(1);
    await expect.poll(() => video(page, (v) => !v.paused)).toBe(true);
  });

  test('leaves "Continue watching?" alone when loop and playlist are off', async ({ openVideo }) => {
    const page = await openVideo(A);
    await page.evaluate(() => window.__fake.stillWatching());
    await page.waitForTimeout(1200);
    expect(await page.evaluate(() => window.__fake.confirmClicks)).toBe(0);
    await expect(page.locator('yt-confirm-dialog-renderer')).toBeVisible();
  });
});

test.describe('sleep timer', () => {
  test('pauses the video when time is up and clears the timer and playlist', async ({ openVideo, store, sw }) => {
    await store.set({ loop: true }); // keep the 2 s fake video playing
    const page = await openVideo(A);
    await store.set({ timerEnd: Date.now() + 1500, plActive: true });
    await page.waitForTimeout(500);
    expect(await video(page, (v) => v.paused)).toBe(false);
    await expect.poll(() => video(page, (v) => v.paused)).toBe(true);
    expect(await store.get(['timerEnd', 'plActive'])).toEqual({ timerEnd: null, plActive: false });
    await expect.poll(() => sw.evaluate(() => chrome.action.getBadgeText({}))).toBe('∞'); // loop still on
  });

  test('pauses every open YouTube tab', async ({ openVideo, store }) => {
    await store.set({ loop: true });
    const p1 = await openVideo(A);
    const p2 = await openVideo('bbbbbbbbbbb');
    await store.set({ timerEnd: Date.now() + 500 });
    await expect.poll(() => video(p1, (v) => v.paused)).toBe(true);
    await expect.poll(() => video(p2, (v) => v.paused)).toBe(true);
  });

  test('cancelling the timer does not pause anything', async ({ openVideo, store }) => {
    await store.set({ loop: true, timerEnd: Date.now() + 60000 });
    const page = await openVideo(A);
    await store.set({ timerEnd: null });
    await page.waitForTimeout(800);
    expect(await video(page, (v) => v.paused)).toBe(false);
  });

  test('an already-expired timer (e.g. set before Chrome restarted) fires on page load', async ({ openVideo, store }) => {
    await store.set({ timerEnd: Date.now() - 1000 });
    await openVideo(A);
    await expect.poll(() => store.val('timerEnd')).toBe(null);
  });
});
