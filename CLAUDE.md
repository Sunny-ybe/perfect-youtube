# Backtrack: notes for coding agents

Chrome MV3 extension for YouTube: loop, sleep timer, ordered playlist, ad blocking. No build step;
the repo root is the unpacked extension.

- Read **TESTING.md** before changing code. Every change needs the tests it lists, and `npm test`
  must pass before committing. Run `npm run test:live` before pushing to main.
- Pure logic goes in `lib.js` (unit-tested); keep `popup.js`, `content.js`, `background.js` thin.
- Every storage key needs a default in `BT.DEFAULTS`.
- Only the tab that started the playlist (`plTabId`) may advance or auto-play it.
- Content scripts run in an isolated world; `page.js` runs in YouTube's world for in-page navigation.
