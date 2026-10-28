const DEFAULTS = { loop: false, adBlock: true, timerEnd: null, playlist: [], plIndex: 0, plActive: false, plRepeat: false };

async function syncAdRules() {
  const { adBlock } = await chrome.storage.local.get({ adBlock: true });
  await chrome.declarativeNetRequest.updateEnabledRulesets(
    adBlock ? { enableRulesetIds: ['ads'] } : { disableRulesetIds: ['ads'] }
  );
}

async function syncBadge() {
  const { loop, timerEnd } = await chrome.storage.local.get({ loop: false, timerEnd: null });
  const text = loop ? '∞' : timerEnd ? '⏱' : '';
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color: '#e62117' });
}

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(null);
  await chrome.storage.local.set({ ...DEFAULTS, ...current });
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
