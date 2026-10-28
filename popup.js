const $ = (id) => document.getElementById(id);
const store = chrome.storage.local;
let S = { loop: false, adBlock: true, timerEnd: null, playlist: [], plIndex: 0, plActive: false, plRepeat: false };

// Accepts watch?v=, youtu.be/, shorts/, embed/, live/, music.youtube.com and bare 11-char IDs.
function parseId(raw) {
  const s = raw.trim();
  if (!s) return null;
  if (/^[\w-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s.startsWith('http') ? s : 'https://' + s);
    if (!/(^|\.)youtube\.com$|(^|\.)youtu\.be$|(^|\.)youtube-nocookie\.com$/.test(u.hostname)) return null;
    if (u.hostname.endsWith('youtu.be')) return u.pathname.slice(1, 12) || null;
    const v = u.searchParams.get('v');
    if (v) return v.slice(0, 11);
    const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/);
    return m ? m[1] : null;
  } catch { return null; }
}

async function fetchTitle(id) {
  try {
    const r = await fetch(`https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=${id}`);
    if (!r.ok) return null;
    return (await r.json()).title;
  } catch { return null; }
}

const watchUrl = (id) => `https://www.youtube.com/watch?v=${id}`;

async function openInTab(url) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && /^https:\/\/(www|m)\.youtube\.com\//.test(tab.url || '')) {
    await chrome.tabs.update(tab.id, { url });
  } else {
    await chrome.tabs.create({ url });
  }
}

async function playAt(i) {
  if (!S.playlist.length) return;
  i = (i + S.playlist.length) % S.playlist.length;
  // Loop-one would block the playlist from advancing, so turn it off when a list starts.
  await store.set({ plActive: true, plIndex: i, loop: false });
  await openInTab(watchUrl(S.playlist[i].id));
}

// ---------- Rendering ----------
function render() {
  $('loop').checked = !!S.loop;
  $('adBlock').checked = !!S.adBlock;
  $('plRepeat').checked = !!S.plRepeat;
  $('plCount').textContent = S.playlist.length ? `· ${S.playlist.length} song${S.playlist.length > 1 ? 's' : ''}` : '';
  $('empty').classList.toggle('hidden', S.playlist.length > 0);
  $('play').textContent = S.plActive ? '■ Stop' : '▶ Play';
  $('play').classList.toggle('primary', !S.plActive);
  renderTimer();

  const ol = $('playlist');
  ol.replaceChildren();
  S.playlist.forEach((item, i) => {
    const li = document.createElement('li');
    li.draggable = true;
    li.dataset.i = i;
    if (S.plActive && i === S.plIndex) li.classList.add('current');

    const grip = Object.assign(document.createElement('span'), { className: 'grip', textContent: '⋮⋮' });
    const num = Object.assign(document.createElement('span'), { className: 'num', textContent: S.plActive && i === S.plIndex ? '▶' : i + 1 });
    const img = Object.assign(document.createElement('img'), { src: `https://i.ytimg.com/vi/${item.id}/mqdefault.jpg`, alt: '' });
    const title = Object.assign(document.createElement('span'), { className: 'title', textContent: item.title || item.id, title: item.title || item.id });
    const rm = Object.assign(document.createElement('button'), { className: 'rm', textContent: '✕', title: 'Remove' });

    rm.addEventListener('click', (e) => { e.stopPropagation(); removeAt(i); });
    li.addEventListener('click', () => playAt(i));

    li.addEventListener('dragstart', (e) => { li.classList.add('dragging'); e.dataTransfer.setData('text/plain', String(i)); });
    li.addEventListener('dragend', () => li.classList.remove('dragging'));
    li.addEventListener('dragover', (e) => { e.preventDefault(); li.classList.add('over'); });
    li.addEventListener('dragleave', () => li.classList.remove('over'));
    li.addEventListener('drop', (e) => {
      e.preventDefault();
      li.classList.remove('over');
      move(Number(e.dataTransfer.getData('text/plain')), i);
    });

    li.append(grip, num, img, title, rm);
    ol.append(li);
  });
}

function fmt(ms) {
  const t = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + `:${String(s).padStart(2, '0')}`;
}

function renderTimer() {
  const on = S.timerEnd && S.timerEnd > Date.now();
  $('timerLeft').classList.toggle('hidden', !on);
  $('cancelTimer').classList.toggle('hidden', !on);
  if (on) $('timerLeft').textContent = `stops in ${fmt(S.timerEnd - Date.now())}`;
}
setInterval(renderTimer, 1000);

// ---------- Playlist edits (index-aware so the current song stays current) ----------
async function removeAt(i) {
  const playlist = S.playlist.filter((_, j) => j !== i);
  let plIndex = S.plIndex;
  if (i < plIndex) plIndex--;
  if (plIndex >= playlist.length) plIndex = Math.max(0, playlist.length - 1);
  await store.set({ playlist, plIndex, plActive: S.plActive && playlist.length > 0 });
}

async function move(from, to) {
  if (from === to || isNaN(from)) return;
  const playlist = [...S.playlist];
  const [item] = playlist.splice(from, 1);
  playlist.splice(to, 0, item);
  const curId = S.playlist[S.plIndex]?.id;
  const plIndex = Math.max(0, playlist.findIndex((x) => x.id === curId));
  await store.set({ playlist, plIndex });
}

async function addIds(entries) {
  if (!entries.length) return;
  const items = await Promise.all(entries.map(async ({ id, title }) => ({ id, title: title || (await fetchTitle(id)) || id })));
  await store.set({ playlist: [...S.playlist, ...items] });
}

// ---------- Wiring ----------
$('loop').addEventListener('change', (e) => store.set({ loop: e.target.checked }));
$('adBlock').addEventListener('change', (e) => store.set({ adBlock: e.target.checked }));
$('plRepeat').addEventListener('change', (e) => store.set({ plRepeat: e.target.checked }));

$('timerChips').addEventListener('click', (e) => {
  const min = Number(e.target.dataset?.min);
  if (min) store.set({ timerEnd: Date.now() + min * 60000 });
});
$('setCustom').addEventListener('click', () => {
  const min = Number($('customMin').value);
  if (min > 0) { store.set({ timerEnd: Date.now() + min * 60000 }); $('customMin').value = ''; }
});
$('customMin').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('setCustom').click(); });
$('cancelTimer').addEventListener('click', () => store.set({ timerEnd: null }));

$('addLinks').addEventListener('click', async () => {
  const parts = $('links').value.split(/[\s,]+/);
  const ids = parts.map(parseId).filter(Boolean).map((id) => ({ id }));
  const bad = parts.filter((p) => p.trim() && !parseId(p)).length;
  $('addLinks').textContent = 'Adding…';
  await addIds(ids);
  $('addLinks').textContent = 'Add links';
  $('links').value = bad ? `// ${bad} link(s) weren't YouTube videos` : '';
  if (bad) setTimeout(() => { if ($('links').value.startsWith('//')) $('links').value = ''; }, 2500);
});

$('addCurrent').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const id = tab?.url && parseId(tab.url);
  if (!id) { $('addCurrent').textContent = 'Not a video'; setTimeout(() => ($('addCurrent').textContent = '+ Current video'), 1500); return; }
  let title = tab.title?.replace(/^\(\d+\)\s*/, '').replace(/ - YouTube$/, '');
  try { title = (await chrome.tabs.sendMessage(tab.id, { type: 'current' }))?.title || title; } catch {}
  await addIds([{ id, title }]);
});

$('play').addEventListener('click', () => (S.plActive ? store.set({ plActive: false }) : playAt(S.plIndex || 0)));
$('next').addEventListener('click', () => playAt((S.plIndex || 0) + 1));
$('prev').addEventListener('click', () => playAt((S.plIndex || 0) - 1));
$('clear').addEventListener('click', () => {
  if (confirm('Remove all songs from the playlist?')) store.set({ playlist: [], plIndex: 0, plActive: false });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  for (const k in changes) S[k] = changes[k].newValue;
  render();
});
store.get(S, (v) => { S = { ...S, ...v }; render(); });
