# Chrome Web Store listing: copy to paste

Upload `dist/backtrack-1.1.0.zip`. Everything below goes into the developer dashboard by hand.

## Store listing tab

**Name:** Backtrack (from the manifest). Don't put "YouTube" in the name. Trademark rules allow it only in the description, as "for YouTube".

**Summary** (from the manifest description, 132 characters max):
Loop YouTube videos, set a sleep timer, play your own ordered playlist of links, and skip ads.

**Category:** Entertainment (or Tools)

**Language:** English

**Description:**

Backtrack makes YouTube better for music and long listening sessions.

LOOP
• Repeat the current video forever with one click, or press Alt+L.
• The toolbar icon shows ∞ while loop is on.

SLEEP TIMER
• Presets of 15m, 30m, 45m, 1h and 1.5h, or any number of minutes you choose.
• A live countdown. The video pauses when time is up.

YOUR OWN PLAYLIST
• Paste YouTube links in any format: watch, youtu.be, Shorts, music.youtube and more.
• Drag to reorder. Play, Previous, Next and Repeat list.
• Plays in your order without reloading the page, even while the tab is in the background.
• Stops when the list ends instead of letting autoplay pick a random video.
• Answers the "Continue watching?" pop-up for you.

AD SKIPPING (can be turned off)
• Blocks known ad-server requests and skips video ads that still play.
• Hides ad slots on the home page, search results and sidebar.

PRIVATE BY DESIGN
• No account, no tracking, no analytics. Your playlist stays on your computer.

Backtrack is an independent project and is not affiliated with or endorsed by YouTube or Google.

**Graphics:**
- Store icon, 128×128: `icons/128.png`
- At least one screenshot, 1280×800 or 640×400: take it of the popup open over a YouTube video. Avoid showing YouTube logos large or centered.
- Small promo tile, 440×280: optional

## Privacy practices tab

**Single purpose:**
Backtrack improves video playback on YouTube: it loops videos, plays a user-defined ordered playlist, pauses playback on a sleep timer, and skips ads, all on youtube.com pages.

**Permission justifications:**

- `storage`: Saves the user's settings (loop, ad skipping, repeat), the sleep-timer end time and the playlist on the user's device, so they persist across tabs and browser restarts.
- `declarativeNetRequest`: Blocks requests to known ad servers (doubleclick.net, googlesyndication.com and others) and YouTube ad and ad-tracking endpoints, using a static rule list bundled with the extension. The user can turn it off with the "Block & skip ads" switch.
- Host permissions (`https://www.youtube.com/*`, `https://m.youtube.com/*`): The content script has to run on YouTube pages to control the video player (loop, pause at sleep-timer end, advance the playlist, skip ads), and the extension needs the YouTube tab's URL to add the current video to the playlist. No other sites are accessed.
- Remote code: **No, I am not using remote code.** All JavaScript is bundled in the package.

**Data usage:** tick **none** of the data categories. Backtrack collects no user data; the playlist and settings stay in local extension storage. Then certify all three statements: no selling of data, no use unrelated to the single purpose, no use for creditworthiness or lending.

**Privacy policy URL:** a public URL to `PRIVACY.md`, for example
https://github.com/Sunny-ybe/perfect-youtube/blob/main/PRIVACY.md
(this needs the repo to be public and the branch merged), or host the same text on any page you control.

## Distribution tab

Visibility: Public (or Unlisted to test first). Regions: all.

## Test instructions (optional)

No login needed. Open any YouTube video, click the Backtrack icon, and toggle Loop, start a sleep timer, or paste two or three video links into the playlist and press Play.
