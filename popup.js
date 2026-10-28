const $ = (id) => document.getElementById(id);
const store = chrome.storage.local;
let S = { ...BT.DEFAULTS };

async function fetchTitle(id) {
  try {
    const r = await fetch(`https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=${id}`);
    if (!r.ok) return null;
    return (await r.json()).title;
  } catch { return null; }
}

// The background worker opens the tab, since the popup closes as soon as a new tab takes focus.
const playAt = (i) => S.playlist.length && chrome.runtime.sendMessage({ type: 'playAt', i });

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

function renderTimer() {
  const on = S.timerEnd && S.timerEnd > Date.now();
  $('timerLeft').classList.toggle('hidden', !on);
  $('cancelTimer').classList.toggle('hidden', !on);
  if (on) $('timerLeft').textContent = `stops in ${BT.fmt(S.timerEnd - Date.now())}`;
}
setInterval(renderTimer, 1000);

// ---------- Playlist edits (index-aware so the current song stays current) ----------
async function removeAt(i) {
  await store.set(BT.removeAt(S, i));
}

async function move(from, to) {
  const next = BT.move(S, from, to);
  if (next) await store.set(next);
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
  const { ids, bad } = BT.parseLinks($('links').value);
  $('addLinks').textContent = 'Adding…';
  await addIds(ids.map((id) => ({ id })));
  $('addLinks').textContent = 'Add links';
  $('links').value = bad ? `// ${bad} link(s) weren't YouTube videos` : '';
  if (bad) setTimeout(() => { if ($('links').value.startsWith('//')) $('links').value = ''; }, 2500);
});

$('addCurrent').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const id = tab?.url && BT.parseId(tab.url);
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
