// Pure helpers shared by the popup, content script and background worker.
// No DOM or chrome.* access here, so everything in this file is unit-tested in tests/unit.
const BT = (() => {
  const DEFAULTS = { loop: false, adBlock: true, timerEnd: null, playlist: [], plIndex: 0, plActive: false, plRepeat: false, plTabId: null };

  const ID_RE = /^[\w-]{11}$/;

  // Accepts watch?v=, youtu.be/, shorts/, embed/, live/, music.youtube.com and bare 11-char IDs.
  function parseId(raw) {
    const s = String(raw ?? '').trim();
    if (!s) return null;
    if (ID_RE.test(s)) return s;
    try {
      const u = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s);
      if (!/(^|\.)youtube\.com$|(^|\.)youtu\.be$|(^|\.)youtube-nocookie\.com$/.test(u.hostname)) return null;
      let id = null;
      if (u.hostname.endsWith('youtu.be')) id = u.pathname.slice(1, 12);
      else if (u.searchParams.get('v')) id = u.searchParams.get('v').slice(0, 11);
      else id = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/)?.[1];
      return id && ID_RE.test(id) ? id : null;
    } catch { return null; }
  }

  // Splits pasted text into video IDs plus a count of entries that weren't YouTube videos.
  function parseLinks(text) {
    const parts = String(text ?? '').split(/[\s,]+/).filter((p) => p.trim());
    const ids = [];
    let bad = 0;
    for (const p of parts) {
      const id = parseId(p);
      if (id) ids.push(id); else bad++;
    }
    return { ids, bad };
  }

  // 65000 -> "1:05", 3725000 -> "1:02:05"
  function fmt(ms) {
    const t = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    return (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + `:${String(s).padStart(2, '0')}`;
  }

  // Playlist edits keep plIndex pointing at the same song.
  function removeAt(state, i) {
    const playlist = state.playlist.filter((_, j) => j !== i);
    let plIndex = state.plIndex;
    if (i < plIndex) plIndex--;
    if (plIndex >= playlist.length) plIndex = Math.max(0, playlist.length - 1);
    return { playlist, plIndex, plActive: !!state.plActive && playlist.length > 0 };
  }

  function move(state, from, to) {
    const n = state.playlist.length;
    if (from === to || !Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= n || to >= n) return null;
    const playlist = [...state.playlist];
    const [item] = playlist.splice(from, 1);
    playlist.splice(to, 0, item);
    let plIndex = state.plIndex;
    if (plIndex === from) plIndex = to;
    else if (from < plIndex && to >= plIndex) plIndex--;
    else if (from > plIndex && to <= plIndex) plIndex++;
    return { playlist, plIndex };
  }

  // Index to play after position `pos`, or -1 when the list is finished.
  function nextIndex(pos, length, repeat) {
    if (pos < 0 || length <= 0) return -1;
    if (pos + 1 < length) return pos + 1;
    return repeat ? 0 : -1;
  }

  // Wraps any index (e.g. -1 from "previous" on the first song) into range.
  const wrapIndex = (i, length) => (length ? ((i % length) + length) % length : 0);

  // Where the tab currently is in the playlist; prefers plIndex so duplicate songs resolve correctly.
  function playlistPos(state, id) {
    if (!id || !state.playlist?.length) return -1;
    if (state.playlist[state.plIndex]?.id === id) return state.plIndex;
    return state.playlist.findIndex((x) => x.id === id);
  }

  function badgeText({ loop, timerEnd }) {
    return loop ? '∞' : timerEnd ? '⏱' : '';
  }

  return { DEFAULTS, parseId, parseLinks, fmt, removeAt, move, nextIndex, wrapIndex, playlistPos, badgeText };
})();

if (typeof module !== 'undefined') module.exports = BT;
