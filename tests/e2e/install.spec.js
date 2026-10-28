const { test, expect } = require('../fixtures');
const BT = require('../../lib.js');

test('first install writes every default and enables the ad ruleset', async ({ sw, store }) => {
  expect(await store.get()).toEqual(BT.DEFAULTS);
  expect(await sw.evaluate(() => chrome.declarativeNetRequest.getEnabledRulesets())).toEqual(['ads']);
  expect(await sw.evaluate(() => chrome.action.getBadgeText({}))).toBe('');
});

test('manifest: every referenced file exists and the content script loads lib.js first', async () => {
  const fs = require('fs');
  const path = require('path');
  const root = path.resolve(__dirname, '../..');
  const m = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  const files = [
    m.background.service_worker, m.action.default_popup,
    ...Object.values(m.icons), ...Object.values(m.action.default_icon),
    ...m.content_scripts.flatMap((c) => [...(c.js || []), ...(c.css || [])]),
    ...m.declarative_net_request.rule_resources.map((r) => r.path),
  ];
  for (const f of files) expect(fs.existsSync(path.join(root, f)), f).toBe(true);
  const isolated = m.content_scripts.find((c) => c.js.includes('content.js'));
  expect(isolated.js.indexOf('lib.js')).toBeLessThan(isolated.js.indexOf('content.js'));
  expect(fs.readFileSync(path.join(root, 'popup.html'), 'utf8')).toMatch(/lib\.js[\s\S]*popup\.js/);
});
