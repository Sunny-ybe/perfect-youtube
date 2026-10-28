importScripts('lib.js');

async function syncAdRules() {
  const { adBlock } = await chrome.storage.local.get({ adBlock: true });
  await chrome.declarativeNetRequest.updateEnabledRulesets(
    adBlock ? { enableRulesetIds: ['ads'] } : { disableRulesetIds: ['ads'] }
  );
}

async function syncBadge() {
  const s = await chrome.storage.local.get({ loop: false, timerEnd: null });
  await chrome.action.setBadgeText({ text: BT.badgeText(s) });
  await chrome.action.setBadgeBackgroundColor({ color: '#e62117' });
}

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(null);
  await chrome.storage.local.set({ ...BT.DEFAULTS, ...current });
  syncAdRules();
  syncBadge();
});

chrome.runtime.onStartup.addListener(() => { syncAdRules(); syncBadge(); });

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if ('adBlock' in changes) syncAdRules();
  if ('loop' in changes || 'timerEnd' in changes) syncBadge();
});

chrome.commands.onCommand.addListener(async (cmd) => {
  if (cmd !== 'toggle-loop') return;
  const { loop } = await chrome.storage.local.get({ loop: false });
  chrome.storage.local.set({ loop: !loop });
});

// Start the playlist at song i and remember which tab plays it, so only that tab advances the
// playlist even if other tabs show the same video. Reuses the tab already playing the list,
// else the active YouTube tab, else opens a new one.
const isYouTube = (tab) => /^https:\/\/(www|m)\.youtube\.com\//.test(tab?.url || '');

async function playerTab(plTabId) {
  if (plTabId != null) {
    const tab = await chrome.tabs.get(plTabId).catch(() => null);
    if (isYouTube(tab)) return tab;
  }
  const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return isYouTube(active) ? active : null;
}

async function playAt(i) {
  const { playlist, plTabId } = await chrome.storage.local.get({ playlist: [], plTabId: null });
  if (!playlist.length) return;
  const plIndex = BT.wrapIndex(i, playlist.length);
  const url = 'https://www.youtube.com/watch?v=' + playlist[plIndex].id;
  const tab = await playerTab(plTabId);
  // Loop-one would block the playlist from advancing, so turn it off when a list starts.
  // plTabId is cleared until the tab is known, so no tab acts as the player in between.
  await chrome.storage.local.set({ plActive: true, plIndex, loop: false, plTabId: null });
  const opened = tab ? await chrome.tabs.update(tab.id, { url }) : await chrome.tabs.create({ url });
  await chrome.storage.local.set({ plTabId: opened.id });
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.type === 'playAt') { playAt(msg.i).then(() => reply(true)); return true; }
  if (msg?.type === 'tabId') reply(sender.tab?.id ?? null);
});
