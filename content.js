// Runs on every YouTube page. Applies loop, sleep timer, playlist auto-advance and ad skipping.
(() => {
  const S = { loop: false, adBlock: true, timerEnd: null, playlist: [], plIndex: 0, plActive: false, plRepeat: false };

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
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    for (const k in changes) S[k] = changes[k].newValue;
    tick();
  });

  // ---------- Ads ----------
  let adMuted = false;
  let savedRate = 1;
  let inAd = false;

  function handleAds(v) {
    document.documentElement.classList.toggle('ytlp-noads', !!S.adBlock);
    if (!S.adBlock || !v) return;

    if (isAd()) {
      if (!inAd) { inAd = true; savedRate = v.playbackRate === 16 ? 1 : v.playbackRate; }
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
      try { v.playbackRate = savedRate || 1; } catch {}
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

  function playlistPos() {
    const id = currentId();
    if (!id || !S.playlist?.length) return -1;
    if (S.playlist[S.plIndex]?.id === id) return S.plIndex;
    return S.playlist.findIndex((x) => x.id === id);
  }

  function goNext() {
    const pos = playlistPos();
    if (pos < 0) return false; // user wandered off the playlist; don't hijack
    let n = pos + 1;
    if (n >= S.playlist.length) {
      if (!S.plRepeat) { chrome.storage.local.set({ plActive: false }); return false; }
      n = 0;
    }
    chrome.storage.local.set({ plIndex: n }, () => navigateTo(S.playlist[n].id));
    return true;
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
    if (!(S.loop || S.plActive)) return;
    const btn = document.querySelector('yt-confirm-dialog-renderer #confirm-button button')
      || document.querySelector('yt-confirm-dialog-renderer #confirm-button');
    if (btn && btn.offsetParent !== null) {
      btn.click();
      if (v && v.paused) v.play().catch(() => {});
    }
  }

  // Make sure a playlist song actually starts playing after navigation (autoplay can be blocked).
  function kickPlaylist(v) {
    if (!S.plActive || !v || isAd()) return;
    const id = currentId();
    if (!id || id === kickedId || playlistPos() < 0) return;
    if (v.readyState >= 2) {
      kickedId = id;
      if (v.paused) v.play().catch(() => {});
    }
  }

  // 'ended' doesn't bubble, so listen in the capture phase (catches replaced <video> elements too).
  document.addEventListener('ended', (e) => {
    const v = e.target;
    if (!(v instanceof HTMLVideoElement) || isAd()) return;
    if (S.loop) { v.currentTime = 0; v.play().catch(() => {}); return; }
    if (S.plActive) {
      e.stopImmediatePropagation();
      goNext();
    }
  }, true);

  function tick() {
    const v = getVideo();
    handleAds(v);
    handleLoop(v);
    handleTimer(v);
    kickPlaylist(v);
    handleStillWatching(v);
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
