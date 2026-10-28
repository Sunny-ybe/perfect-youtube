// Runs on every YouTube page. Applies loop, sleep timer, playlist auto-advance and ad skipping.
(() => {
  const S = { ...BT.DEFAULTS };

  const SKIP_SELECTORS = [
    '.ytp-skip-ad-button', '.ytp-ad-skip-button', '.ytp-ad-skip-button-modern',
    '.ytp-ad-skip-button-slot button', 'button[id^="skip-button"]', '.ytp-ad-overlay-close-button'
  ].join(',');

  const getVideo = () => document.querySelector('#movie_player video.html5-main-video') || document.querySelector('video');
  const isAd = () => !!document.querySelector('#movie_player.ad-showing, #movie_player.ad-interrupting, .html5-video-player.ad-showing');
  const currentId = () => {
    try {
      const u = new URL(location.href);
      if (u.pathname === '/watch') return u.searchParams.get('v');
      const m = u.pathname.match(/^\/shorts\/([\w-]{11})/);
      return m ? m[1] : null;
    } catch { return null; }
  };

  chrome.storage.local.get(S, (v) => { Object.assign(S, v); tick(); });

  // Only the tab the playlist was started in drives it, so other tabs on the same song stay quiet.
  let myTabId;
  chrome.runtime.sendMessage({ type: 'tabId' }, (id) => { myTabId = id; });
  const isPlayer = () => S.plActive && S.plTabId != null && S.plTabId === myTabId;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    // Another tab hit the sleep timer first and cleared it; pause here too. (A user cancel clears
    // a timer that still had time left, so it doesn't pause anything.)
    const t = changes.timerEnd;
    if (t && t.oldValue && t.newValue == null && t.oldValue <= Date.now() + 1000) getVideo()?.pause();
    for (const k in changes) S[k] = changes[k].newValue;
    tick();
  });

  // ---------- Ads ----------
  let adMuted = false;
  let userRate = 1; // speed the user picked, remembered while no ad is playing
  let inAd = false;

  function handleAds(v) {
    document.documentElement.classList.toggle('ytlp-noads', !!S.adBlock);
    if (!S.adBlock || !v) return;

    if (isAd()) {
      inAd = true;
      if (!v.muted) { v.muted = true; adMuted = true; }
      v.loop = false;
      try { v.playbackRate = 16; } catch {}
      if (isFinite(v.duration) && v.duration > 0 && v.currentTime < v.duration - 0.2) {
        v.currentTime = v.duration - 0.1;
      }
      document.querySelectorAll(SKIP_SELECTORS).forEach((b) => b.click());
    } else if (inAd) {
      inAd = false;
      if (adMuted) { v.muted = false; adMuted = false; }
      try { v.playbackRate = userRate; } catch {}
    } else {
      userRate = v.playbackRate;
    }
  }

  // ---------- Loop ----------
  function handleLoop(v) {
    if (!v || isAd()) return;
    if (v.loop !== !!S.loop) v.loop = !!S.loop;
  }

  // ---------- Sleep timer ----------
  function handleTimer(v) {
    if (!S.timerEnd || Date.now() < S.timerEnd) return;
    if (v && !v.paused) v.pause();
    S.timerEnd = null;
    chrome.storage.local.set({ timerEnd: null, plActive: false });
  }

  // ---------- Playlist ----------
  let kickedId = null;
  const playlistPos = () => BT.playlistPos(S, currentId());

  function goNext() {
    const pos = playlistPos();
    if (pos < 0) return false; // user wandered off the playlist; don't hijack
    const n = BT.nextIndex(pos, S.playlist.length, S.plRepeat);
    const v = getVideo();
    if (n < 0) {
      // Pausing just before the end means YouTube never sees the video finish, so it doesn't autoplay.
      if (v && !v.ended) v.pause();
      chrome.storage.local.set({ plActive: false });
      holdAutoplay = { id: currentId(), until: Date.now() + 20000 };
      return false;
    }
    if (S.playlist[n].id === currentId()) {
      // Same video next (repeat with one song, or a song listed twice in a row): YouTube may ignore a
      // navigation to the page it's already on, so restart in place.
      chrome.storage.local.set({ plIndex: n });
      if (v) { v.currentTime = 0; v.play().catch(() => {}); }
      return true;
    }
    chrome.storage.local.set({ plIndex: n }, () => navigateTo(S.playlist[n].id));
    return true;
  }

  // When the list finishes, YouTube's own autoplay would start a random recommended video.
  // Cancel its countdown, and pause anything it starts anyway, until the user does something.
  let holdAutoplay = null;
  const userActed = (e) => { if (e.isTrusted) holdAutoplay = null; };
  document.addEventListener('pointerdown', userActed, true);
  document.addEventListener('keydown', userActed, true);

  function handleAutoplayHold(v) {
    if (!holdAutoplay) return;
    if (Date.now() > holdAutoplay.until) { holdAutoplay = null; return; }
    document.querySelectorAll('.ytp-autonav-endscreen-upnext-cancel-button').forEach((b) => b.offsetParent !== null && b.click());
    if (v && !v.paused && currentId() !== holdAutoplay.id && !isAd()) v.pause();
  }

  // Switch videos without a page reload (keeps playback alive in background tabs);
  // fall back to a full load if YouTube's in-page navigation didn't take.
  function navigateTo(id) {
    window.postMessage({ source: 'ytlp', type: 'navigate', id }, location.origin);
    setTimeout(() => {
      if (currentId() !== id) location.href = 'https://www.youtube.com/watch?v=' + id;
    }, 2500);
  }

  // Auto-confirm YouTube's "Video paused. Continue watching?" prompt while loop/playlist is on.
  function handleStillWatching(v) {
    if (!(S.loop || isPlayer())) return;
    const btn = document.querySelector('yt-confirm-dialog-renderer #confirm-button button')
      || document.querySelector('yt-confirm-dialog-renderer #confirm-button');
    if (btn && btn.offsetParent !== null) {
      btn.click();
      if (v && v.paused) v.play().catch(() => {});
    }
  }

  // Make sure a playlist song actually starts playing after navigation (autoplay can be blocked).
  function kickPlaylist(v) {
    if (!isPlayer() || !v || isAd()) return;
    const id = currentId();
    if (!id || id === kickedId || playlistPos() < 0) return;
    if (v.readyState >= 2) {
      kickedId = id;
      if (v.paused) v.play().catch(() => {});
    }
  }

  // YouTube's autoplay can jump to a recommended video the moment a song ends, sometimes before
  // 'ended' fires, so the playlist moves on just before the end. 'ended' stays as a fallback.
  // These media events don't bubble, so listen in the capture phase (catches replaced <video>s too).
  let advancedFrom = null; // id of the song we already moved on from (reset once it plays again)
  function songEnding() {
    const id = currentId();
    if (advancedFrom === id) return;
    advancedFrom = id;
    goNext();
  }

  document.addEventListener('timeupdate', (e) => {
    const v = e.target;
    if (!(v instanceof HTMLVideoElement) || !isFinite(v.duration) || isAd()) return;
    const left = (v.duration - v.currentTime) / (v.playbackRate || 1);
    if (left > 1.5) { if (advancedFrom === currentId()) advancedFrom = null; return; }
    if (left <= 0.5 && isPlayer() && !v.loop && !S.loop) songEnding();
  }, true);

  document.addEventListener('ended', (e) => {
    const v = e.target;
    if (!(v instanceof HTMLVideoElement) || isAd()) return;
    if (S.loop) { v.currentTime = 0; v.play().catch(() => {}); return; }
    if (isPlayer()) {
      e.stopImmediatePropagation();
      songEnding();
    }
  }, true);

  function tick() {
    const v = getVideo();
    handleAds(v);
    handleLoop(v);
    handleTimer(v);
    kickPlaylist(v);
    handleStillWatching(v);
    handleAutoplayHold(v);
  }

  setInterval(tick, 300);
  document.addEventListener('yt-navigate-finish', tick);

  // Let the popup ask for the current video.
  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg?.type === 'current') {
      const title = document.querySelector('h1.ytd-watch-metadata yt-formatted-string, h1.title')?.textContent?.trim()
        || document.title.replace(/ - YouTube$/, '');
      reply({ id: currentId(), title });
    } else if (msg?.type === 'next') {
      reply({ ok: goNext() });
    }
  });
})();
