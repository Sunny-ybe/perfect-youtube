# Testing Backtrack

Every change must keep the whole suite green, and every new behavior or bug fix must come with a test
that would fail without it. This file says **which tests to write for which kind of change**, so it
works for people and for AI coding agents alike.

## Quick start

```bash
npm install
npx playwright install chromium   # once
npm test                          # unit + offline browser tests. Run before every commit.
npm run test:live                 # real youtube.com smoke test. Run before every release / push to main.
HEADED=1 npx playwright test --project=e2e tests/e2e/playlist.spec.js   # watch a run
```

CI (`.github/workflows/test.yml`) runs `npm test` on every push and pull request.

## The three layers

| Layer | Where | What it covers | Speed |
|---|---|---|---|
| **Unit** | `tests/unit/*.test.js` (`node:test`) | Pure logic in `lib.js`: link parsing, playlist index math, formatting, defaults | ms |
| **E2E (offline)** | `tests/e2e/*.spec.js` (Playwright) | The real extension loaded in Chromium against a **fake youtube.com** (`tests/e2e/fake-youtube.js`): popup UI, storage, background worker, content script, ad rules | ~1 min |
| **Live** | `tests/live/youtube.spec.js` | Same core flows on the **real** youtube.com, which catches YouTube changing its page | ~30 s, needs network |

Shared fixtures live in `tests/fixtures.js`. Every test gets a fresh browser profile with the extension
installed, plus `sw` (service worker), `store.get/set/val` (chrome.storage.local), `popup` (popup.html in
a tab), `openVideo(id)` and helpers `video(page, fn)`, `waitForVideo`, `idOf`. Uncaught page errors fail
the test automatically.

## Where code goes (so it can be tested)

- **Pure logic goes in `lib.js`** (no DOM, no `chrome.*`). It is loaded by the popup, content script
  and background worker, and `require`d by unit tests. If you're writing an `if` about indexes, URLs,
  times or state shapes, it probably belongs here.
- `popup.js`: UI wiring only. `background.js`: chrome APIs (tabs, rules, badge, commands).
  `content.js`: talks to YouTube's page. `page.js`: YouTube's own JS world (in-page navigation).
- All persistent state lives in `chrome.storage.local`, and every key has a default in `BT.DEFAULTS`.

## What tests to write for each kind of change

### Changing or adding a pure helper in `lib.js`
- Unit tests in `tests/unit/lib.test.js`: the normal case, **edges** (empty list, first/last index,
  single item, duplicates, negative/NaN/out-of-range input) and **rejects** (bad input returns
  `null`/`-1`/no-op rather than throwing).
- For link parsing: add every new URL shape to the "accepts" list **and** a look-alike to the
  "rejects" list (e.g. `youtube.com.evil.com`).

### Adding a stored setting (new storage key)
- Add it to `BT.DEFAULTS` (the `DEFAULTS` unit test lists every key, so update it).
- E2E: the `first install writes every default` test must still pass. Add a test that the popup control
  writes the key **and** that the popup re-renders when the key changes elsewhere
  (see `popup follows storage changes`).
- If it changes badge text, extend `badgeText` and its unit test.

### Popup UI change (button, switch, list, input)
- E2E in `tests/e2e/popup.spec.js`: click it like a user, then assert **storage** (`store.val`) and
  **what the user sees** (`toHaveText`, `toBeVisible`, `toHaveCount`).
- Cover invalid input (it should be ignored or flagged, never stored as garbage) and any confirm dialog
  (both accept and dismiss).

### Content-script behavior on YouTube (loop, timer, ads, playlist advance, dialogs)
- E2E using `openVideo(id)` and `window.__fake` hooks. If the behavior depends on something YouTube
  does, **teach the fake to do it first** (see below), then test against it.
- Always test the **off state** too: with the feature disabled, YouTube's page is left alone.
- Test multi-tab behavior when relevant (`pauses every open YouTube tab`, `other tabs … are not
  started or advanced`).
- Media timing: fake songs are 2 s long; ids starting with `long` are 30 s. Use `long…` ids when a test
  must not race a song's natural end. Use `finishSong(page)` to jump to the end.
- Content scripts run in an **isolated world**: you can't observe their writes by patching page
  objects. Assert on DOM/media state, storage, or sample state over time (see `recordPlayer` in
  `ads.spec.js`).

### Playlist logic
- Index math → unit test (`nextIndex`, `removeAt`, `move`, `playlistPos`, `wrapIndex`).
- Flow → E2E in `playlist.spec.js`. Check `idOf(page)`, `store.val('plIndex'/'plActive')`, and that
  navigation was **in-page**: `window.__fake.navs` grows and `window.__fake.loads` stays the same.
- Any change near "song ends" must keep these passing: in-page advance, background tab, duplicate song,
  repeat on/off, single-song repeat, stop, instant-autoplay race, autoplay hold, user click releases
  hold, other tabs ignored, wandering off isn't hijacked.

### Background worker (tabs, badge, rules, commands, messages)
- E2E via the `sw` fixture: `sw.evaluate(() => chrome.…)` to inspect badge/rulesets/tabs, or send the
  same message the popup sends.
- Tabs the extension creates load **once without Playwright routing**, so reload them before
  asserting (see `startPlaylist` in `playlist.spec.js`).

### Ad blocking rules (`rules.json`) or ad-slot CSS (`content.css`)
- `ads.spec.js`: add the new URL to `adUrls` (must be `blocked` when on and `loaded` when off) and a
  non-ad YouTube URL that must keep loading. For CSS, add the element to the fake watch page and
  assert hidden/visible for on/off.

### Manifest changes (permissions, files, content scripts)
- `install.spec.js` checks that every referenced file exists and that `lib.js` loads before scripts
  that use it. Keep it passing, and run `npm run test:live`.

### Bug fixes
1. Write the failing test first, against the fake (or a unit test if it's logic).
2. Fix the bug. 3. Watch the test pass. 4. Run the whole suite.
If the bug only shows on real YouTube, reproduce it in the fake (add a `window.__fake` knob, like
`autonavInstant`) **and** add a check to the live test.

## Keeping the fake YouTube honest

`tests/e2e/fake-youtube.js` mimics only what the extension touches: `#movie_player`,
`video.html5-main-video`, `ytd-app` + `yt-navigate`, `yt-navigate-finish`, the watch title, the autoplay
"Up next" cancel button, ads (`.ad-showing`, `.ytp-skip-ad-button`), the "Continue watching?" dialog,
oEmbed titles and ad hosts. Media are seekable silent WAVs served with HTTP Range support.

When the content script starts relying on a new YouTube selector, event or behavior:
1. Confirm it on real YouTube (a quick Playwright probe, or DevTools).
2. Add it to the fake, with the smallest faithful imitation.
3. Add or extend a step in `tests/live/youtube.spec.js` that asserts it still exists on real YouTube.

Test hooks on `window.__fake`: `navs`, `loads`, `cancelClicks`, `skipClicks`, `confirmClicks`,
`autonav`, `autonavCountdown`, `autonavInstant`, `countdownMs`, `startAd({ skippable })`,
`stillWatching()`, `autoplayNow({ withCountdown })`.

## Rules for tests

- Wait with `expect.poll` / web-first assertions, not fixed sleeps. Only use `waitForTimeout` to prove
  something did **not** happen, and keep it just past the relevant timer.
- No test depends on another or on the network (except `tests/live`).
- A test that fails intermittently is a bug. Find the race (usually a 2 s song ending on its own, or a
  tab that hasn't finished loading) rather than adding retries.
- Run a new or changed test with `--repeat-each=5` before committing it.
