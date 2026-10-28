const { test, expect } = require('../fixtures');

const A = 'aaaaaaaaaaa', B = 'bbbbbbbbbbb', C = 'ccccccccccc';
const ids = (pl) => pl.map((x) => x.id);

test.describe('playlist editing', () => {
  test('adds links in every format, in order, with titles, and flags bad ones', async ({ popup, store }) => {
    await popup.fill('#links', `https://www.youtube.com/watch?v=${A}&t=3\nhttps://youtu.be/${B}, https://example.com/x\nnot-a-link`);
    await popup.click('#addLinks');
    await expect.poll(async () => ids(await store.val('playlist'))).toEqual([A, B]);
    expect((await store.val('playlist')).map((x) => x.title)).toEqual([`Title of ${A}`, `Title of ${B}`]);
    await expect(popup.locator('#links')).toHaveValue("// 2 link(s) weren't YouTube videos");
    await expect(popup.locator('#links')).toHaveValue('', { timeout: 5000 }); // warning clears itself
    await expect(popup.locator('#playlist li')).toHaveCount(2);
    await expect(popup.locator('#plCount')).toHaveText('· 2 songs');
    await expect(popup.locator('#playlist li .title').first()).toHaveText(`Title of ${A}`);
    await expect(popup.locator('#addLinks')).toHaveText('Add links');
  });

  test('shows the empty state and singular count', async ({ popup, store }) => {
    await expect(popup.locator('#empty')).toBeVisible();
    await store.set({ playlist: [{ id: A, title: 'one' }] });
    await expect(popup.locator('#empty')).toBeHidden();
    await expect(popup.locator('#plCount')).toHaveText('· 1 song');
  });

  test('falls back to the video id when the title lookup fails', async ({ context, popup, store }) => {
    await context.route('https://www.youtube.com/oembed**', (r) => r.fulfill({ status: 404, body: '' }));
    await popup.fill('#links', A);
    await popup.click('#addLinks');
    await expect.poll(() => store.val('playlist')).toEqual([{ id: A, title: A }]);
  });

  test('✕ removes a song and keeps the current one current', async ({ popup, store }) => {
    await store.set({ playlist: [{ id: A }, { id: B }, { id: C }], plIndex: 2 });
    await popup.locator('#playlist li').nth(0).locator('.rm').click();
    await expect.poll(async () => ids(await store.val('playlist'))).toEqual([B, C]);
    expect(await store.val('plIndex')).toBe(1);
  });

  test('drag and drop reorders', async ({ popup, store }) => {
    await store.set({ playlist: [{ id: A }, { id: B }, { id: C }], plIndex: 0 });
    await popup.locator('#playlist li').nth(2).dragTo(popup.locator('#playlist li').nth(0));
    await expect.poll(async () => ids(await store.val('playlist'))).toEqual([C, A, B]);
    expect(await store.val('plIndex')).toBe(1); // A is still the current song
  });

  test('Clear list asks first, then empties and stops', async ({ popup, store }) => {
    await store.set({ playlist: [{ id: A }, { id: B }], plIndex: 1, plActive: true });
    popup.once('dialog', (d) => d.dismiss());
    await popup.click('#clear');
    await popup.waitForTimeout(300);
    expect(await store.val('playlist')).toHaveLength(2);
    popup.once('dialog', (d) => d.accept());
    await popup.click('#clear');
    await expect.poll(() => store.get(['playlist', 'plIndex', 'plActive'])).toEqual({ playlist: [], plIndex: 0, plActive: false });
  });

  test('+ Current video says "Not a video" when the tab is not a YouTube video', async ({ popup }) => {
    await popup.click('#addCurrent'); // the active tab is the popup page itself
    await expect(popup.locator('#addCurrent')).toHaveText('Not a video');
    await expect(popup.locator('#addCurrent')).toHaveText('+ Current video', { timeout: 3000 });
  });
});

test.describe('switches', () => {
  test('loop, ad-block and repeat switches write storage', async ({ popup, store }) => {
    await popup.locator('#loop + span').click();
    await expect.poll(() => store.val('loop')).toBe(true);
    await popup.locator('#adBlock + span').click();
    await expect.poll(() => store.val('adBlock')).toBe(false);
    await popup.check('#plRepeat');
    await expect.poll(() => store.val('plRepeat')).toBe(true);
  });

  test('popup follows storage changes made elsewhere (e.g. Alt+L)', async ({ popup, store }) => {
    await store.set({ loop: true, adBlock: false, plRepeat: true, plActive: true, playlist: [{ id: A }] });
    await expect(popup.locator('#loop')).toBeChecked();
    await expect(popup.locator('#adBlock')).not.toBeChecked();
    await expect(popup.locator('#plRepeat')).toBeChecked();
    await expect(popup.locator('#play')).toHaveText('■ Stop');
    await expect(popup.locator('#playlist li.current .num')).toHaveText('▶');
  });

  test('loop toggled from the keyboard command updates the badge', async ({ sw, store }) => {
    await store.set({ loop: true });
    await expect.poll(() => sw.evaluate(() => chrome.action.getBadgeText({}))).toBe('∞');
    await store.set({ loop: false });
    await expect.poll(() => sw.evaluate(() => chrome.action.getBadgeText({}))).toBe('');
  });
});

test.describe('sleep timer controls', () => {
  test('preset chips set the end time and show a countdown', async ({ popup, store, sw }) => {
    const before = Date.now();
    await popup.click('#timerChips button[data-min="30"]');
    await expect.poll(() => store.val('timerEnd')).toBeGreaterThan(before + 30 * 60000 - 2000);
    expect(await store.val('timerEnd')).toBeLessThan(Date.now() + 30 * 60000 + 2000);
    await expect(popup.locator('#timerLeft')).toHaveText(/^stops in (29:5\d|30:00)$/);
    await expect(popup.locator('#cancelTimer')).toBeVisible();
    await expect.poll(() => sw.evaluate(() => chrome.action.getBadgeText({}))).toBe('⏱');
  });

  test('every preset chip works', async ({ popup, store }) => {
    for (const min of [15, 30, 45, 60, 90]) {
      await popup.click(`#timerChips button[data-min="${min}"]`);
      await expect.poll(async () => Math.round(((await store.val('timerEnd')) - Date.now()) / 60000)).toBe(min);
    }
  });

  test('custom minutes via button and Enter; invalid input is ignored', async ({ popup, store }) => {
    await popup.fill('#customMin', '2');
    await popup.click('#setCustom');
    await expect(popup.locator('#timerLeft')).toHaveText(/^stops in (1:5\d|2:00)$/);
    await expect(popup.locator('#customMin')).toHaveValue('');
    await popup.fill('#customMin', '125');
    await popup.press('#customMin', 'Enter');
    await expect(popup.locator('#timerLeft')).toHaveText(/^stops in 2:0[45]:\d\d$/);
    const end = await store.val('timerEnd');
    for (const bad of ['0', '-5']) {
      await popup.fill('#customMin', bad);
      await popup.click('#setCustom');
    }
    expect(await store.val('timerEnd')).toBe(end);
  });

  test('Cancel clears the timer and hides the countdown', async ({ popup, store, sw }) => {
    await popup.click('#timerChips button[data-min="15"]');
    await popup.click('#cancelTimer');
    await expect.poll(() => store.val('timerEnd')).toBe(null);
    await expect(popup.locator('#timerLeft')).toBeHidden();
    await expect(popup.locator('#cancelTimer')).toBeHidden();
    await expect.poll(() => sw.evaluate(() => chrome.action.getBadgeText({}))).toBe('');
  });
});
