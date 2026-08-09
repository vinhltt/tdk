const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  loadSpeckitConfig,
  findSpecifyConfig,
  detectActiveWorkspace,
  getSpecsPath,
  getConfigurationsPath,
  getMemoryPath,
  getSubWorkspaceRulesPath
} = require('../lib/speckit-config-reader.cjs');

function makeTempJsonRoot(configOverrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'speckit-test-'));
  const specifyDir = path.join(root, '.specify');
  fs.mkdirSync(specifyDir, { recursive: true });
  const config = {
    name: 'test-project',
    architecture: { type: 'modular-monolith' },
    docs: { path: '.specify/configurations' },
    subWorkspaces: [{ name: 'frontend', path: 'frontend' }, { name: 'backend', path: 'backend' }],
    git: { mainBranch: 'main', prefixList: 'TEST' },
    specs: { root: '.specify', defaultFolder: 'specs', ticketFormat: '^([a-zA-Z]+)-([0-9]+)$' },
    logLevel: 'Information',
    ...configOverrides
  };
  fs.writeFileSync(path.join(specifyDir, '.specify.json'), JSON.stringify(config, null, 2));
  return root;
}

// Test 1: json-only workspace → loadSpeckitConfig returns parsed config
test('loadSpeckitConfig parses .specify.json correctly', () => {
  const root = makeTempJsonRoot();
  const config = loadSpeckitConfig(root);
  assert.equal(config.name, 'test-project');
  assert.equal(config.git.mainBranch, 'main');
  assert.equal(config.git.prefixList, 'TEST');
  assert.equal(config.architecture.type, 'modular-monolith');
  assert.equal(config.__workspaceRoot, root);
});

// Test 2: yaml-only workspace → error with Case A message (returns defaults)
test('loadSpeckitConfig with yaml-only returns defaults and writes stderr', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'speckit-yaml-'));
  const specifyDir = path.join(root, '.specify');
  fs.mkdirSync(specifyDir, { recursive: true });
  fs.writeFileSync(path.join(specifyDir, '.specify.yaml'), 'name: test');
  const config = loadSpeckitConfig(root);
  // Returns defaults (error caught internally)
  assert.equal(config.git.mainBranch, 'develop');
  assert.ok(config.__workspaceRoot);
});

// Test 3: neither exists → returns defaults
test('loadSpeckitConfig returns defaults when neither json nor yaml exists', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'speckit-empty-'));
  const config = loadSpeckitConfig(root);
  assert.equal(config.name, path.basename(root));
  assert.equal(config.docs.path, '.specify/configurations');
  assert.equal(config.subWorkspaces.length, 0);
  assert.ok(config.__workspaceRoot);
});

// Test 4: camelCase key access
test('loadSpeckitConfig returns camelCase keys from json', () => {
  const root = makeTempJsonRoot({ prefixList: 'SAMPLE', mainBranch: 'master' });
  const config = loadSpeckitConfig(root);
  // Top-level overrides via deepMerge
  assert.equal(config.git.mainBranch, 'main'); // nested key from fixture
});

// Test 5: findSpecifyConfig returns root when json exists
test('findSpecifyConfig returns root dir when .specify.json exists', () => {
  const root = makeTempJsonRoot();
  const result = findSpecifyConfig(root);
  assert.equal(result, root);
});

// Test 6: findSpecifyConfig throws when yaml-only
test('findSpecifyConfig throws with migrate instruction for yaml-only workspace', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'speckit-yaml-'));
  const specifyDir = path.join(root, '.specify');
  fs.mkdirSync(specifyDir, { recursive: true });
  fs.writeFileSync(path.join(specifyDir, '.specify.yaml'), 'name: test');
  assert.throws(() => findSpecifyConfig(root), { message: /migrate-yaml-to-json\.sh/ });
});

// Test 7: findSpecifyConfig throws when neither exists
test('findSpecifyConfig throws when no config found', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'speckit-none-'));
  assert.throws(() => findSpecifyConfig(root), { message: /\.specify\.json not found/ });
});

// Test 8: detectActiveWorkspace still works
test('detectActiveWorkspace returns matching workspace', () => {
  const ws = detectActiveWorkspace('/project/backend/app', [{ name: 'backend', path: 'backend' }]);
  assert.equal(ws.name, 'backend');
});

test('detectActiveWorkspace returns null at root', () => {
  const ws = detectActiveWorkspace('/project', [{ name: 'frontend', path: 'frontend' }]);
  assert.equal(ws, null);
});

// Test 9: path helpers still resolve correctly
test('path helpers resolve expected speckit paths', () => {
  const cwd = '/project';
  const config = {
    specs: { root: '.specify', defaultFolder: 'specs' },
    docs: { path: '.specify/configurations' }
  };
  assert.equal(getSpecsPath(config, cwd).replace(/\\/g, '/'), '/project/.specify/specs');
  assert.equal(getConfigurationsPath(config, cwd).replace(/\\/g, '/'), '/project/.specify/configurations');
  assert.equal(getMemoryPath(config, cwd).replace(/\\/g, '/'), '/project/.specify/memory');
});

// Nested path with name !== path: the directory is keyed by name, so a nested
// sub-workspace still gets a flat docs directory.
test('getSubWorkspaceRulesPath keys the rules directory by name, not path', () => {
  const cwd = '/project';
  const config = { docs: { path: '.specify/configurations' } };
  const ws = { name: 'web', path: 'apps/web' };
  const rulesPath = getSubWorkspaceRulesPath(config, ws, cwd).replace(/\\/g, '/');
  assert.equal(rulesPath, '/project/.specify/configurations/sub-workspaces/web/rules');
});

// Test 10: deepMerge preserves nested defaults
test('loadSpeckitConfig merges partial json with defaults', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'speckit-partial-'));
  const specifyDir = path.join(root, '.specify');
  fs.mkdirSync(specifyDir, { recursive: true });
  // Partial config — only name, missing git/specs/etc
  fs.writeFileSync(path.join(specifyDir, '.specify.json'), JSON.stringify({ name: 'partial-project' }));
  const config = loadSpeckitConfig(root);
  assert.equal(config.name, 'partial-project');
  // Defaults filled in
  assert.equal(config.git.mainBranch, 'develop');
  assert.equal(config.specs.defaultFolder, 'specs');
  assert.equal(config.docs.path, '.specify/configurations');
});
