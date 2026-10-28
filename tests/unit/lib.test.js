const test = require('node:test');
const assert = require('node:assert/strict');
const BT = require('../../lib.js');

const ID = 'dQw4w9WgXcQ';
const songs = (...ids) => ids.map((id) => ({ id, title: id }));

test('parseId: accepts every supported link shape', () => {
  const ok = [
    ID,
    `https://www.youtube.com/watch?v=${ID}`,
    `https://www.youtube.com/watch?v=${ID}&t=42s&list=PL123`,
    `https://www.youtube.com/watch?feature=share&v=${ID}`,
    `http://youtube.com/watch?v=${ID}`,
    `youtube.com/watch?v=${ID}`,
    `www.youtube.com/watch?v=${ID}`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://music.youtube.com/watch?v=${ID}&si=abc`,
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?si=xyz&t=10`,
    `youtu.be/${ID}`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/shorts/${ID}?feature=share`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube-nocookie.com/embed/${ID}`,
    `https://www.youtube.com/live/${ID}`,
    `https://www.youtube.com/v/${ID}`,
    `  ${ID}  `,
    `HTTPS://WWW.YOUTUBE.COM/watch?v=${ID}`,
  ];
  for (const link of ok) assert.equal(BT.parseId(link), ID, link);
});

test('parseId: IDs with - and _ survive', () => {
  assert.equal(BT.parseId('https://youtu.be/a-b_c-d_e-f'), 'a-b_c-d_e-f');
  assert.equal(BT.parseId('_-_-_-_-_-_'), '_-_-_-_-_-_');
});

test('parseId: rejects non-video and non-YouTube input', () => {
  const bad = [
    '', '   ', null, undefined, 'hello', 'abc', 'dQw4w9WgXcQQ', // 12 chars
    'https://example.com/watch?v=' + ID,
    'https://notyoutube.com/watch?v=' + ID,
    'https://youtube.com.evil.com/watch?v=' + ID,
    'https://www.youtube.com/',
    'https://www.youtube.com/watch?v=short',
    'https://www.youtube.com/watch?v=bad$chars!!',
    'https://www.youtube.com/playlist?list=PL123',
    'https://www.youtube.com/@channel',
    'https://youtu.be/',
    'https://youtu.be/short',
    'javascript:alert(1)',
    'ftp://youtube.com/watch?v=' + ID,
  ];
  for (const link of bad) assert.equal(BT.parseId(link), null, String(link));
});

test('parseLinks: splits on newlines, spaces and commas and counts bad entries', () => {
  const r = BT.parseLinks(`https://youtu.be/${ID}\nhttps://example.com, jNQXAC9IVRw ,,  nope\n\n`);
  assert.deepEqual(r, { ids: [ID, 'jNQXAC9IVRw'], bad: 2 });
  assert.deepEqual(BT.parseLinks(''), { ids: [], bad: 0 });
  assert.deepEqual(BT.parseLinks(`${ID} ${ID}`).ids, [ID, ID], 'duplicates are kept on purpose');
});

test('fmt: formats countdowns', () => {
  assert.equal(BT.fmt(0), '0:00');
  assert.equal(BT.fmt(-5000), '0:00');
  assert.equal(BT.fmt(999), '0:01');
  assert.equal(BT.fmt(59_000), '0:59');
  assert.equal(BT.fmt(65_000), '1:05');
  assert.equal(BT.fmt(15 * 60_000), '15:00');
  assert.equal(BT.fmt(3_600_000), '1:00:00');
  assert.equal(BT.fmt(3_725_000), '1:02:05');
  assert.equal(BT.fmt(24 * 3_600_000), '24:00:00');
});

test('removeAt: keeps the current song current', () => {
  const st = { playlist: songs('a', 'b', 'c', 'd'), plIndex: 2, plActive: true };
  assert.deepEqual(BT.removeAt(st, 0), { playlist: songs('b', 'c', 'd'), plIndex: 1, plActive: true }, 'before current');
  assert.deepEqual(BT.removeAt(st, 3), { playlist: songs('a', 'b', 'c'), plIndex: 2, plActive: true }, 'after current');
  assert.deepEqual(BT.removeAt(st, 2), { playlist: songs('a', 'b', 'd'), plIndex: 2, plActive: true }, 'current -> next song takes its place');
});

test('removeAt: clamps the index and stops when the list empties', () => {
  assert.equal(BT.removeAt({ playlist: songs('a', 'b'), plIndex: 1, plActive: true }, 1).plIndex, 0);
  assert.deepEqual(BT.removeAt({ playlist: songs('a'), plIndex: 0, plActive: true }, 0), { playlist: [], plIndex: 0, plActive: false });
  assert.equal(BT.removeAt({ playlist: songs('a', 'b'), plIndex: 0, plActive: false }, 1).plActive, false);
});

test('move: reorders and follows the current song', () => {
  const st = { playlist: songs('a', 'b', 'c', 'd'), plIndex: 1 }; // current = b
  assert.deepEqual(BT.move(st, 3, 0), { playlist: songs('d', 'a', 'b', 'c'), plIndex: 2 });
  assert.deepEqual(BT.move(st, 0, 3), { playlist: songs('b', 'c', 'd', 'a'), plIndex: 0 });
  assert.deepEqual(BT.move(st, 1, 3), { playlist: songs('a', 'c', 'd', 'b'), plIndex: 3 }, 'moving the current song');
  assert.deepEqual(BT.move(st, 2, 3), { playlist: songs('a', 'b', 'd', 'c'), plIndex: 1 }, 'unrelated move');
});

test('move: tracks the right copy when the same song is in the list twice', () => {
  const st = { playlist: songs('x', 'a', 'x'), plIndex: 2 }; // playing the second x
  assert.deepEqual(BT.move(st, 1, 0), { playlist: songs('a', 'x', 'x'), plIndex: 2 });
});

test('move: ignores no-ops and bad indexes', () => {
  const st = { playlist: songs('a', 'b'), plIndex: 0 };
  for (const [f, t] of [[0, 0], [NaN, 1], [0, 5], [-1, 0], [1.5, 0]]) assert.equal(BT.move(st, f, t), null, `${f}->${t}`);
});

test('nextIndex: advances, wraps with repeat, finishes without it', () => {
  assert.equal(BT.nextIndex(0, 3, false), 1);
  assert.equal(BT.nextIndex(2, 3, false), -1);
  assert.equal(BT.nextIndex(2, 3, true), 0);
  assert.equal(BT.nextIndex(0, 1, true), 0, 'single song repeats');
  assert.equal(BT.nextIndex(0, 1, false), -1);
  assert.equal(BT.nextIndex(-1, 3, true), -1, 'not in playlist -> never hijack');
  assert.equal(BT.nextIndex(0, 0, true), -1);
});

test('wrapIndex: prev/next wrap around', () => {
  assert.equal(BT.wrapIndex(-1, 3), 2);
  assert.equal(BT.wrapIndex(3, 3), 0);
  assert.equal(BT.wrapIndex(1, 3), 1);
  assert.equal(BT.wrapIndex(-4, 3), 2);
  assert.equal(BT.wrapIndex(5, 0), 0);
});

test('playlistPos: prefers plIndex, falls back to first match', () => {
  const st = { playlist: songs('x', 'a', 'x'), plIndex: 2 };
  assert.equal(BT.playlistPos(st, 'x'), 2);
  assert.equal(BT.playlistPos({ ...st, plIndex: 1 }, 'x'), 0);
  assert.equal(BT.playlistPos(st, 'zzz'), -1);
  assert.equal(BT.playlistPos(st, null), -1);
  assert.equal(BT.playlistPos({ playlist: [], plIndex: 0 }, 'x'), -1);
});

test('badgeText: loop beats timer', () => {
  assert.equal(BT.badgeText({ loop: true, timerEnd: 123 }), '∞');
  assert.equal(BT.badgeText({ loop: false, timerEnd: 123 }), '⏱');
  assert.equal(BT.badgeText({ loop: false, timerEnd: null }), '');
});

test('DEFAULTS: every stored setting has a default', () => {
  assert.deepEqual(Object.keys(BT.DEFAULTS).sort(),
    ['adBlock', 'loop', 'plActive', 'plIndex', 'plRepeat', 'plTabId', 'playlist', 'timerEnd'].sort());
  assert.equal(BT.DEFAULTS.adBlock, true, 'ad blocking is on by default');
});
