// Store review flags every extra permission, so keep the manifest to what the code actually uses.
const test = require('node:test');
const assert = require('node:assert');
const manifest = require('../../manifest.json');

test('manifest asks only for the permissions the code uses', () => {
  assert.deepStrictEqual([...manifest.permissions].sort(), ['declarativeNetRequest', 'storage']);
  assert.deepStrictEqual(manifest.host_permissions, ['https://www.youtube.com/*', 'https://m.youtube.com/*']);
});
