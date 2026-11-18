# Chrome Web Store listing: copy to paste

Upload `dist/backtrack-1.1.0.zip`. Everything below goes into the developer dashboard by hand.

## Account tab (once, before the first submit)

- Publisher name: shown as "Offered by" on the listing.
- Contact email: add it, then click the verification link Chrome emails you. You can't publish until it's verified.
- Physical address: not needed, since Backtrack has no purchases or subscriptions.

## Store listing tab

**Name:** Backtrack (from the manifest). Don't put "YouTube" in the name. Trademark rules allow it only in the description, as "for YouTube".

**Summary** (from the manifest description, 132 characters max):
Uninterrupted YouTube listening: loop videos, play your own playlist, set a sleep timer, and skip ads.

**Category:** Entertainment (or Tools)

**Language:** English

**Description:**

Backtrack keeps YouTube playing what you chose, for as long as you choose, without interruptions. It's built for music and long listening sessions.

KEEP IT PLAYING: LOOP
• Repeat the current video forever with one click, or press Alt+L.
• The toolbar icon shows ∞ while loop is on.

KEEP IT PLAYING: YOUR OWN PLAYLIST
• Paste YouTube links in any format: watch, youtu.be, Shorts, music.youtube and more.
• Drag to reorder. Play, Previous, Next and Repeat list.
• Plays in your order without reloading the page, even while the tab is in the background.
• Stops when the list ends instead of letting autoplay pick a random video.

NO INTERRUPTIONS
• Skips video ads, and blocks known ad-server requests, so playback isn't broken up. You can turn this off.
• Hides ad slots on the home page, search results and sidebar.
• Answers the "Continue watching?" pop-up for you while loop or the playlist is on.

STOP WHEN YOU WANT: SLEEP TIMER
• Presets of 15m, 30m, 45m, 1h and 1.5h, or any number of minutes you choose.
• A live countdown. The video pauses when time is up.

HOW TO INSTALL
1. Click "Add to Chrome", then "Add extension".
2. Click the puzzle-piece icon in Chrome's toolbar and pin Backtrack so it's always one click away.
3. Reload any YouTube tabs that were already open.

HOW TO USE
• Loop: open a YouTube video, click the Backtrack icon and switch on "Loop current video", or press Alt+L on any YouTube tab.
• Playlist: paste one or more YouTube links into the box and click "Add links", or click "+ Current video" while watching. Press ▶ Play. Use ⏮ / ⏭ to skip, drag songs to reorder, and tick "Repeat list" to start over at the end. Keep the YouTube tab open; it can be in the background.
• Sleep timer: pick a preset or type minutes and click "Set". Click "Cancel" to stop it.
• Ad skipping: on by default. Switch off "Block & skip ads" in the popup to turn it off.
• To change the Alt+L shortcut, go to chrome://extensions/shortcuts.

PRIVATE BY DESIGN
• No account, no tracking, no analytics. Your playlist and settings stay on your computer.

Backtrack is an independent project and is not affiliated with or endorsed by YouTube or Google.

**Graphics:**
- Store icon, 128×128: `icons/128.png`
- At least one screenshot, 1280×800 or 640×400: take it of the popup open over a YouTube video. Avoid showing YouTube logos large or centered.
- Small promo tile, 440×280: optional

## Privacy practices tab

**Single purpose:**
Uninterrupted listening on YouTube. Backtrack keeps YouTube playing what the user chose, for as long as they chose, without interruptions: it loops a video, plays the user's own ordered playlist, stops playback on a sleep timer, and skips the ads and "Continue watching?" prompts that break playback. Every feature acts only on the YouTube video player, on youtube.com pages.

**Permission justifications:**

- `storage`: Saves the user's settings (loop, ad skipping, repeat), the sleep-timer end time and the playlist on the user's device, so they persist across tabs and browser restarts.
- `declarativeNetRequest`: Blocks requests to known ad servers (doubleclick.net, googlesyndication.com and others) and YouTube ad and ad-tracking endpoints, using a static rule list bundled with the extension. The user can turn it off with the "Block & skip ads" switch.
- Host permissions (`https://www.youtube.com/*`, `https://m.youtube.com/*`): The content script has to run on YouTube pages to control the video player (loop, pause at sleep-timer end, advance the playlist, skip ads), and the extension needs the YouTube tab's URL to add the current video to the playlist. No other sites are accessed.
- Remote code: **No, I am not using remote code.** All JavaScript is bundled in the package.

**Data usage:** Chrome's User Data FAQ counts data kept only on the device, and reading page content, as handling user data. So tick **Website content**: the playlist stores YouTube video IDs and titles, and the extension reads the YouTube player state. Leave every other category unticked. Then certify all three statements: no selling or transferring data to third parties, no use unrelated to the single purpose, no use for creditworthiness or lending.

**Privacy policy URL:** https://gist.github.com/Sunny-ybe/92d50cc8dee17c3f901b99c3594782b4
This is a public gist of `PRIVACY.md`. If you change PRIVACY.md, update the gist too.

## Distribution tab

Visibility: Public (or Unlisted to test first). Regions: all.

## Test instructions (optional)

No login needed. Open any YouTube video, click the Backtrack icon, and toggle Loop, start a sleep timer, or paste two or three video links into the playlist and press Play.
