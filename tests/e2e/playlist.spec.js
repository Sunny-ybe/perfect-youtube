const { test, expect, video, waitForVideo, idOf } = require('../fixtures');
const { RECOMMENDED } = require('./fake-youtube');

const A = 'aaaaaaaaaaa', B = 'bbbbbbbbbbb', C = 'ccccccccccc', X = 'xxxxxxxxxxx';
const list = (...ids) => ids.map((id) => ({ id, title: 'Song ' + id }));

// Presses ▶ Play in the popup and returns the tab the playlist opened in.
async function startPlaylist({ context, popup, store }, ids, extra = {}) {
  await store.set({ playlist: list(...ids), plIndex: 0, ...extra });
  await popup.bringToFront(); // otherwise an open YouTube tab is the active one and gets reused
  const [page] = await Promise.all([context.waitForEvent('page'), popup.click('#play')]);
  // Playwright can't route the first load of a tab the extension creates (it attaches too late),
  // so reload once to get the fake YouTube. It's the same tab, so plTabId still matches.
  await page.reload();
  await waitForVideo(page);
  await expect.poll(() => store.val('plTabId')).not.toBe(null);
  return page;
}

const finishSong = (page) => video(page, (v) => { v.currentTime = v.duration - 0.2; return v.play(); });
const tabIdOf = (sw, url) => sw.evaluate((u) => chrome.tabs.query({}).then((t) => t.find((x) => x.url === u)?.id), url);

test('▶ Play opens the first song, plays it, records the player tab and turns loop off', async ({ context, popup, store, sw, openVideo }) => {
  const f = { context, popup, store, sw, openVideo };
  await store.set({ loop: true });
  const page = await startPlaylist(f, [A, B]);
  expect(idOf(page)).toBe(A);
  await expect.poll(() => video(page, (v) => !v.paused)).toBe(true);
  expect(await store.get(['plActive', 'plIndex', 'loop'])).toEqual({ plActive: true, plIndex: 0, loop: false });
  expect(await store.val('plTabId')).toBe(await tabIdOf(sw, page.url()));
  await expect(popup.locator('#play')).toHaveText('■ Stop');
  await expect(popup.locator('#playlist li').nth(0)).toHaveClass(/current/);
});

test('advances to the next song in-page (no reload) when a song ends', async ({ context, popup, store, sw, openVideo }) => {
  const f = { context, popup, store, sw, openVideo };
  const page = await startPlaylist(f, [A, B, C]);
  await page.evaluate(() => { window.__sameDocument = true; });
  await finishSong(page);
  await expect.poll(() => idOf(page)).toBe(B);
  expect(await page.evaluate(() => window.__sameDocument)).toBe(true);
  expect(await page.evaluate(() => window.__fake.navs)).toEqual([B]);
  expect(await store.val('plIndex')).toBe(1);
  await waitForVideo(page);
  await expect.poll(() => video(page, (v) => !v.paused)).toBe(true);
  await expect(popup.locator('#playlist li').nth(1)).toHaveClass(/current/);
  await finishSong(page);
  await expect.poll(() => idOf(page)).toBe(C);
});

test('keeps advancing while the player tab is in the background', async ({ context, popup, store, sw, openVideo }) => {
  const f = { context, popup, store, sw, openVideo };
  const page = await startPlaylist(f, [A, B]);
  await popup.bringToFront();
  await finishSong(page);
  await expect.poll(() => idOf(page)).toBe(B);
});

test('a playlist can hold the same song twice and plays both copies', async ({ context, popup, store, sw, openVideo }) => {
  const f = { context, popup, store, sw, openVideo };
  const page = await startPlaylist(f, [A, A, B]);
  await finishSong(page);
  await expect.poll(() => store.val('plIndex')).toBe(1);
  expect(idOf(page)).toBe(A);
  await expect.poll(() => video(page, (v) => !v.paused && v.currentTime < 1.5)).toBe(true); // replayed in place
  await page.waitForTimeout(400);
  await finishSong(page);
  await expect.poll(() => idOf(page)).toBe(B);
});

test('stops after the last song, paused, without YouTube autoplay taking over', async ({ context, popup, store, sw, openVideo }) => {
  const f = { context, popup, store, sw, openVideo };
  const page = await startPlaylist(f, [A, B]);
  await finishSong(page);
  await expect.poll(() => idOf(page)).toBe(B);
  await waitForVideo(page);
  await finishSong(page);
  await expect.poll(() => store.val('plActive')).toBe(false);
  await page.waitForTimeout(2500); // longer than the fake autoplay countdown
  expect(idOf(page)).toBe(B);
  expect(await video(page, (v) => v.paused)).toBe(true);
  expect(await page.evaluate(() => window.__fake.navs)).toEqual([B]);
  await expect(popup.locator('#play')).toHaveText('▶ Play');
});

test('after the list ends, YouTube\'s "Up next" countdown is cancelled', async ({ context, popup, store, sw, openVideo }) => {
  const f = { context, popup, store, sw, openVideo };
  const page = await startPlaylist(f, [A]);
  await finishSong(page);
  await expect.poll(() => store.val('plActive')).toBe(false);
  await page.evaluate(() => window.__fake.autoplayNow({ withCountdown: true }));
  await expect.poll(() => page.evaluate(() => window.__fake.cancelClicks)).toBe(1);
  await page.waitForTimeout(2000);
  expect(idOf(page)).toBe(A);
});

test('after the list ends, a video YouTube autoplays anyway is paused', async ({ context, popup, store, sw, openVideo }) => {
  const f = { context, popup, store, sw, openVideo };
  const page = await startPlaylist(f, [A]);
  await finishSong(page);
  await expect.poll(() => store.val('plActive')).toBe(false);
  await page.evaluate(() => window.__fake.autoplayNow());
  await expect.poll(() => idOf(page)).toBe(RECOMMENDED);
  await waitForVideo(page);
  await expect.poll(() => video(page, (v) => v.paused)).toBe(true);
});

test('after the list ends, a click by the user releases the autoplay hold', async ({ context, popup, store, sw, openVideo }) => {
  const f = { context, popup, store, sw, openVideo };
  const page = await startPlaylist(f, [A]);
  await finishSong(page);
  await expect.poll(() => store.val('plActive')).toBe(false);
  await page.mouse.click(600, 600); // a real (trusted) click, like picking a video
  await page.evaluate(() => window.__fake.autoplayNow());
  await expect.poll(() => idOf(page)).toBe(RECOMMENDED);
  await waitForVideo(page);
  await page.waitForTimeout(800);
  expect(await video(page, (v) => v.paused)).toBe(false);
});

test('Repeat list wraps from the last song back to the first', async ({ context, popup, store, sw, openVideo }) => {
  const f = { context, popup, store, sw, openVideo };
  const page = await startPlaylist(f, [A, B], { plRepeat: true });
  await finishSong(page);
  await expect.poll(() => idOf(page)).toBe(B);
  await waitForVideo(page);
  await finishSong(page);
  await expect.poll(() => idOf(page)).toBe(A);
  expect(await store.get(['plIndex', 'plActive'])).toEqual({ plIndex: 0, plActive: true });
});

test('Repeat list with one song restarts it in place', async ({ context, popup, store, sw, openVideo }) => {
  const f = { context, popup, store, sw, openVideo };
  const page = await startPlaylist(f, [A], { plRepeat: true });
  await finishSong(page);
  await page.waitForTimeout(1000);
  expect(idOf(page)).toBe(A);
  expect(await page.evaluate(() => window.__fake.navs)).toEqual([]);
  expect(await video(page, (v) => !v.paused && v.currentTime < 1.5)).toBe(true);
  expect(await store.get(['plActive', 'plIndex'])).toEqual({ plActive: true, plIndex: 0 });
});

test('advances even when YouTube autoplay jumps right at the end of a song', async ({ context, popup, store, sw, openVideo }) => {
  const f = { context, popup, store, sw, openVideo };
  const page = await startPlaylist(f, [A, B]);
  await page.evaluate(() => { window.__fake.autonavInstant = true; });
  await finishSong(page);
  await expect.poll(() => idOf(page)).toBe(B);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__fake.navs)).toEqual([B]);
});

test('the last song pauses just before its end so instant autoplay never starts', async ({ context, popup, store, sw, openVideo }) => {
  const f = { context, popup, store, sw, openVideo };
  const page = await startPlaylist(f, [A]);
  await page.evaluate(() => { window.__fake.autonavInstant = true; });
  await finishSong(page);
  await expect.poll(() => store.val('plActive')).toBe(false);
  await page.waitForTimeout(2500);
  expect(idOf(page)).toBe(A);
  expect(await page.evaluate(() => window.__fake.navs)).toEqual([]);
  expect(await video(page, (v) => v.paused)).toBe(true);
});

test('■ Stop ends the playlist; the song then ends normally', async ({ context, popup, store, sw, openVideo }) => {
  const f = { context, popup, store, sw, openVideo };
  const page = await startPlaylist(f, [A, B]);
  await popup.click('#play');
  await expect.poll(() => store.val('plActive')).toBe(false);
  await expect(popup.locator('#play')).toHaveText('▶ Play');
  await finishSong(page);
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => window.__fake.navs)).not.toContain(B);
  expect(await store.val('plIndex')).toBe(0);
});

test('⏭ / ⏮ and clicking a song play in the existing player tab', async ({ context, popup, store, sw, openVideo }) => {
  const f = { context, popup, store, sw, openVideo };
  const page = await startPlaylist(f, [A, B, C]);
  const tabs = context.pages().length;
  await popup.click('#next');
  await expect.poll(() => idOf(page)).toBe(B);
  expect(await store.val('plIndex')).toBe(1);
  await popup.click('#prev');
  await expect.poll(() => idOf(page)).toBe(A);
  await popup.click('#prev'); // wraps to the last song
  await expect.poll(() => idOf(page)).toBe(C);
  await popup.locator('#playlist li').nth(1).click();
  await expect.poll(() => idOf(page)).toBe(B);
  expect(context.pages().length).toBe(tabs); // no extra tabs opened
});

test('▶ Play from a YouTube tab reuses that tab', async ({ context, extId, store, sw, openVideo }) => {
  await store.set({ playlist: list(A, B) });
  const page = await openVideo(X);
  const tabId = await tabIdOf(sw, page.url());
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  // The real toolbar popup floats over the YouTube tab, so that tab is the active one.
  await page.bringToFront();
  await popup.evaluate(() => chrome.runtime.sendMessage({ type: 'playAt', i: 0 }));
  await expect.poll(() => idOf(page)).toBe(A);
  expect(await store.val('plTabId')).toBe(tabId);
});

test('other tabs showing a playlist song are not started or advanced', async ({ context, popup, store, sw, openVideo }) => {
  const f = { context, popup, store, sw, openVideo };
  const L1 = 'longaaaaaaa', L2 = 'longbbbbbbb'; // 30 s songs, so nothing ends on its own mid-test
  const other = await openVideo(L1);
  await video(other, (v) => v.pause());
  const player = await startPlaylist(f, [L1, L2]);
  await other.waitForTimeout(1000);
  expect(await video(other, (v) => v.paused)).toBe(true); // not kicked into playing

  // The other tab reaching the end must not move the playlist.
  await finishSong(other);
  await other.waitForTimeout(800);
  expect(await store.val('plIndex')).toBe(0);
  expect(idOf(player)).toBe(L1);
  expect(await other.evaluate(() => window.__fake.navs)).not.toContain(L2);

  await finishSong(player);
  await expect.poll(() => idOf(player)).toBe(L2);
});

test('navigating the player tab to a non-playlist video does not hijack it', async ({ context, popup, store, sw, openVideo }) => {
  const f = { context, popup, store, sw, openVideo };
  const page = await startPlaylist(f, [A, B]);
  await page.goto(`https://www.youtube.com/watch?v=${X}`);
  await waitForVideo(page);
  await finishSong(page);
  await page.waitForTimeout(800);
  expect(await store.val('plIndex')).toBe(0);
  expect(await page.evaluate(() => window.__fake.navs)).not.toContain(B);
});

test('auto-confirms "Continue watching?" in the player tab', async ({ context, popup, store, sw, openVideo }) => {
  const f = { context, popup, store, sw, openVideo };
  const page = await startPlaylist(f, [A, B]);
  await page.evaluate(() => window.__fake.stillWatching());
  await expect.poll(() => page.evaluate(() => window.__fake.confirmClicks)).toBe(1);
});

test('content script reports the current video to the popup', async ({ sw, openVideo }) => {
  const page = await openVideo(A);
  const tabId = await tabIdOf(sw, page.url());
  expect(await sw.evaluate((id) => chrome.tabs.sendMessage(id, { type: 'current' }), tabId)).toEqual({ id: A, title: 'Song ' + A });
});
