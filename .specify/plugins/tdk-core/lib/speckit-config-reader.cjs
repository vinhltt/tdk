const fs = require('fs');
const path = require('path');

const SPECKIT_DEFAULTS = {
  name: '',
  architecture: { type: 'unknown' },
  docs: { path: '.specify/configurations' },
  subWorkspaces: [],
  git: { mainBranch: 'develop', prefixList: '' },
  specs: { root: '.specify', defaultFolder: 'specs', ticketFormat: '' },
  logLevel: 'Information',
  rules: { path: '.specify/rules' }
};

function deepCloneDefaults(cwd = process.cwd()) {
  return {
    name: path.basename(cwd),
    architecture: { ...SPECKIT_DEFAULTS.architecture },
    docs: { ...SPECKIT_DEFAULTS.docs },
    subWorkspaces: [],
    git: { ...SPECKIT_DEFAULTS.git },
    specs: { ...SPECKIT_DEFAULTS.specs },
    logLevel: SPECKIT_DEFAULTS.logLevel,
    rules: { ...SPECKIT_DEFAULTS.rules }
  };
}

function isPlainObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }
function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (isPlainObj(result[key]) && isPlainObj(source[key])) {
      result[key] = deepMerge(result[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

function findSpecifyConfig(startDir) {
  const dir = startDir || process.cwd();
  const jsonPath = path.join(dir, '.specify', '.specify.json');
  if (fs.existsSync(jsonPath)) return dir;
  // Check yaml for helpful error
  const yamlPath = path.join(dir, '.specify', '.specify.yaml');
  if (fs.existsSync(yamlPath)) {
    throw new Error('speckit: found .specify.yaml but .specify.json is required. Run:\n  bash .specify/scripts/bash/migrate-yaml-to-json.sh');
  }
  throw new Error('speckit: .specify/.specify.json not found.');
}

function loadSpeckitConfig(startDir = process.cwd()) {
  try {
    const root = findSpecifyConfig(startDir);
    const jsonPath = path.join(root, '.specify', '.specify.json');
    const content = fs.readFileSync(jsonPath, 'utf8');
    const parsed = JSON.parse(content);
    return { ...deepMerge(deepCloneDefaults(root), parsed), __workspaceRoot: root };
  } catch (err) {
    process.stderr.write(err.message + '\n');
    return { ...deepCloneDefaults(startDir), __workspaceRoot: path.resolve(startDir) };
  }
}

function normalizeSlashes(value) {
  return String(value || '').replace(/\\/g, '/');
}

function detectActiveWorkspace(cwd, subWorkspaces = []) {
  const normalizedCwd = normalizeSlashes(cwd || process.cwd());
  for (const ws of subWorkspaces) {
    const wsPath = normalizeSlashes(ws.path);
    if (!wsPath) continue;
    if (normalizedCwd.endsWith(`/${wsPath}`) || normalizedCwd.includes(`/${wsPath}/`)) {
      return ws;
    }
  }
  return null;
}

function getWorkspaceRoot(config, cwd = process.cwd()) {
  return config.__workspaceRoot || cwd;
}

function getSpecsPath(config, cwd = process.cwd()) {
  const root = getWorkspaceRoot(config, cwd);
  return path.join(root, config.specs.root, config.specs.defaultFolder);
}

function getConfigurationsPath(config, cwd = process.cwd()) {
  const root = getWorkspaceRoot(config, cwd);
  return path.join(root, config.docs.path);
}

function getMemoryPath(config, cwd = process.cwd()) {
  const root = getWorkspaceRoot(config, cwd);
  return path.join(root, config.specs.root, 'memory');
}

function getSubWorkspaceRulesPath(config, workspace, cwd = process.cwd()) {
  if (!workspace?.path) return null;
  const root = getWorkspaceRoot(config, cwd);
  return path.join(root, config.docs.path, 'sub-workspaces', workspace.path, 'rules');
}

module.exports = {
  SPECKIT_DEFAULTS,
  findSpecifyConfig,
  findSpecifyRoot: findSpecifyConfig,  // deprecated alias
  loadSpeckitConfig,
  detectActiveWorkspace,
  getSpecsPath,
  getConfigurationsPath,
  getMemoryPath,
  getSubWorkspaceRulesPath
};
