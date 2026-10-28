// A tiny stand-in for youtube.com, served through Playwright routing so e2e tests are fast,
// deterministic and offline. It mimics only what Backtrack touches:
//   - #movie_player / video.html5-main-video and the watch-page title
//   - in-page navigation via the `yt-navigate` event on <ytd-app> (+ `yt-navigate-finish`)
//   - YouTube autoplay: when a video ends, an "Up next" countdown with a cancel button, then navigation
//     (or, with autonavInstant, an immediate jump right at the end, before 'ended' fires)
//   - video ads (.ad-showing + skip button), and the "Continue watching?" dialog
// Media are silent WAV files, so <video> has a real, finite duration and fires real events.
// Test hooks live on window.__fake (only reachable from page.evaluate, not from the content script).

const SONG_SECONDS = 2;
const AD_SECONDS = 6;
const RECOMMENDED = 'RECOMMENDx1'; // what fake autoplay jumps to; never in a test playlist

function wav(seconds) {
  const rate = 8000, n = Math.round(rate * seconds);
  const b = Buffer.alloc(44 + n, 128); // 8-bit unsigned PCM silence
  b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34);
  b.write('data', 36); b.writeUInt32LE(n, 40);
  return b;
}

const pageScript = (songSeconds, adSeconds, recommended) => `
(() => {
  sessionStorage.loads = Number(sessionStorage.loads || 0) + 1;
  const F = window.__fake = {
    loads: Number(sessionStorage.loads), // full page loads in this tab; in-page navigation doesn't add one
    navs: [], cancelClicks: 0, skipClicks: 0, confirmClicks: 0,
    autonav: true,            // YouTube's autoplay toggle
    autonavCountdown: true,   // false = autoplay jumps without showing the cancel button
    autonavInstant: false,    // true = jump the moment the video reaches its end, before 'ended' fires (seen on real YouTube)
    countdownMs: 1500,
  };
  const app = document.querySelector('ytd-app');
  const v = document.querySelector('video');
  const cancel = document.querySelector('.ytp-autonav-endscreen-upnext-cancel-button');
  const player = document.getElementById('movie_player');
  const idOf = () => new URL(location.href).searchParams.get('v');
  let countdown = null;

  function load(id) {
    clearTimeout(countdown); countdown = null; cancel.style.display = 'none';
    v.src = '/fake-media/' + id + '.wav?s=' + (id.startsWith('long') ? 30 : ${songSeconds}); // 'long…' ids last 30 s
    document.title = 'Song ' + id + ' - YouTube';
    document.querySelector('h1 yt-formatted-string').textContent = 'Song ' + id;
    v.play().catch(() => {});
  }
  function navigate(id) {
    history.pushState({}, '', '/watch?v=' + id);
    F.navs.push(id);
    load(id);
    document.dispatchEvent(new Event('yt-navigate-finish'));
  }
  app.addEventListener('yt-navigate', (e) => navigate(e.detail.endpoint.watchEndpoint.videoId));

  // YouTube notices the end of a video by polling player state, not via the 'ended' event.
  setInterval(() => {
    if (F.autonav && F.autonavInstant && !countdown && !v.paused && v.duration - v.currentTime < 0.1
        && !player.classList.contains('ad-showing')) {
      countdown = true;
      return navigate('${recommended}');
    }
    if (!v.ended || countdown || !F.autonav || player.classList.contains('ad-showing')) return;
    if (F.autonavCountdown) cancel.style.display = 'block';
    countdown = setTimeout(() => navigate('${recommended}'), F.countdownMs);
  }, 100);
  // Force YouTube's autoplay right now, as if it fired despite the extension.
  F.autoplayNow = ({ withCountdown = false } = {}) => {
    if (!withCountdown) return navigate('${recommended}');
    cancel.style.display = 'block';
    countdown = setTimeout(() => navigate('${recommended}'), F.countdownMs);
  };
  cancel.addEventListener('click', () => { F.cancelClicks++; clearTimeout(countdown); cancel.style.display = 'none'; });

  F.startAd = ({ skippable = true } = {}) => {
    const saved = v.src;
    player.classList.add('ad-showing');
    v.src = '/fake-media/ad.wav?s=${adSeconds}';
    v.play().catch(() => {});
    const skip = document.createElement('button');
    skip.className = 'ytp-skip-ad-button';
    skip.textContent = 'Skip';
    const end = () => {
      if (!player.classList.contains('ad-showing')) return;
      player.classList.remove('ad-showing'); skip.remove();
      v.src = saved; v.play().catch(() => {});
    };
    skip.addEventListener('click', () => { F.skipClicks++; end(); });
    v.addEventListener('ended', end, { once: true });
    if (skippable) player.append(skip);
  };

  F.stillWatching = () => {
    v.pause();
    const d = document.createElement('yt-confirm-dialog-renderer');
    d.innerHTML = '<div id="confirm-button"><button>Yes</button></div>';
    d.querySelector('button').addEventListener('click', () => { F.confirmClicks++; d.remove(); v.play(); });
    document.body.append(d);
  };

  load(idOf());
})();`;

// Answers HTTP Range requests so the media is seekable, like YouTube's streams.
function media(body, range) {
  const headers = { 'content-type': 'audio/wav', 'accept-ranges': 'bytes' };
  const m = /bytes=(\d*)-(\d*)/.exec(range || '');
  if (!m) return { status: 200, headers, body };
  const start = m[1] ? Number(m[1]) : 0;
  const end = m[2] ? Math.min(Number(m[2]), body.length - 1) : body.length - 1;
  headers['content-range'] = `bytes ${start}-${end}/${body.length}`;
  return { status: 206, headers, body: body.subarray(start, end + 1) };
}

function watchPage(id) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Song ${id} - YouTube</title></head><body>
<ytd-app>
  <div id="movie_player" class="html5-video-player">
    <video class="html5-main-video" style="width:320px;height:180px"></video>
    <button class="ytp-autonav-endscreen-upnext-cancel-button" style="display:none">Cancel</button>
  </div>
  <h1 class="style-scope ytd-watch-metadata"><yt-formatted-string>Song ${id}</yt-formatted-string></h1>
  <div id="ads">
    <ytd-ad-slot-renderer>AD SLOT</ytd-ad-slot-renderer>
    <div id="masthead-ad">MASTHEAD AD</div>
  </div>
</ytd-app>
<script>${pageScript(SONG_SECONDS, AD_SECONDS, RECOMMENDED)}</script>
</body></html>`;
}

async function installFakeYouTube(context) {
  await context.route('https://www.youtube.com/**', (route) => {
    const u = new URL(route.request().url());
    if (u.pathname === '/watch') {
      return route.fulfill({ contentType: 'text/html', body: watchPage(u.searchParams.get('v')) });
    }
    if (u.pathname.startsWith('/fake-media/')) {
      return route.fulfill(media(wav(Number(u.searchParams.get('s')) || SONG_SECONDS), route.request().headers().range));
    }
    if (u.pathname === '/oembed') {
      const id = new URL(u.searchParams.get('url')).searchParams.get('v');
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ title: 'Title of ' + id }) });
    }
    return route.fulfill({ status: 404, body: '' });
  });
  await context.route('https://i.ytimg.com/**', (route) => route.fulfill({ status: 404, body: '' }));
  // Ad hosts answer 200 here, so a request only fails if the extension's ruleset blocks it.
  await context.route('https://googleads.g.doubleclick.net/**', (route) =>
    route.fulfill({ status: 200, body: 'ad', headers: { 'access-control-allow-origin': '*' } }));
}

module.exports = { installFakeYouTube, RECOMMENDED, SONG_SECONDS };
