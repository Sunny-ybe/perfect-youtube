# Backtrack

A Chrome extension for YouTube that loops videos, plays your own ordered playlist of links, sets a sleep timer, and skips ads.

## Features

**Loop**: repeat the current video forever. Toggle it from the popup or with **Alt+L**. The toolbar icon shows ∞ while loop is on.

**Sleep timer**: 15m / 30m / 45m / 1h / 1.5h presets or any custom number of minutes. Shows a live countdown and pauses the video (and stops the playlist) when time is up.

**Playlist**
- Paste YouTube links (watch, youtu.be, Shorts, embed, live, music.youtube, or bare IDs), or add the video you're watching.
- Titles and thumbnails load automatically. Drag to reorder, ✕ to remove, click a song to play from there.
- Play/Stop, Previous, Next, and **Repeat list**.
- Plays in your order, switching songs without a page reload, and keeps going while the YouTube tab is in the background.
- Automatically answers YouTube's "Continue watching?" pop-up while loop or the playlist is on.

**Ad blocker** (on by default, can be turned off)
- Blocks requests to Google ad servers and YouTube's ad/ad-tracking addresses.
- Mutes, speeds up and skips video ads that still play, then restores your volume and speed.
- Hides ad slots on the home page, search results, sidebar and banners.

## Install

1. Download or clone this repo.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select this folder.

## Notes

- The playlist runs inside the YouTube tab, so that tab must stay open (it doesn't have to be the active one).
- YouTube changes its ad system often, so some ads may get through.
