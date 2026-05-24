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
  rules: { path: '.specify/rules' },
  hooks: { disabled: [] }
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
    rules: { ...SPECKIT_DEFAULTS.rules },
    hooks: { ...SPECKIT_DEFAULTS.hooks }
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

/**
 * Finds the project root containing .specify/.specify.json.
 * @param {string} [startDir] - Directory to search from. Defaults to cwd.
 * @returns {string} Project root directory path.
 * @throws {Error} If .specify.json not found (or only .yaml found).
 */
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

/**
 * Loads and merges .specify.json with defaults. Returns config with __workspaceRoot.
 * @param {string} [startDir] - Directory to search from. Defaults to cwd.
 * @returns {object} Merged config object with __workspaceRoot property.
 */
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

/**
 * Detects which sub-workspace the current directory belongs to.
 * @param {string} cwd - Current working directory.
 * @param {Array<{path: string}>} [subWorkspaces] - Sub-workspace definitions from config.
 * @returns {object|null} Matching workspace object or null.
 */
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

/**
 * Returns the workspace root directory from config.
 * @param {object} config - Speckit config object.
 * @param {string} [cwd] - Fallback directory. Defaults to cwd.
 * @returns {string} Workspace root path.
 */
function getWorkspaceRoot(config, cwd = process.cwd()) {
  return config.__workspaceRoot || cwd;
}

/**
 * Returns the absolute path to the specs directory.
 * @param {object} config - Speckit config object.
 * @param {string} [cwd] - Fallback directory. Defaults to cwd.
 * @returns {string} Specs directory path.
 */
function getSpecsPath(config, cwd = process.cwd()) {
  const root = getWorkspaceRoot(config, cwd);
  return path.join(root, config.specs.root, config.specs.defaultFolder);
}

/**
 * Returns the absolute path to the configurations/docs directory.
 * @param {object} config - Speckit config object.
 * @param {string} [cwd] - Fallback directory. Defaults to cwd.
 * @returns {string} Configurations directory path.
 */
function getConfigurationsPath(config, cwd = process.cwd()) {
  const root = getWorkspaceRoot(config, cwd);
  return path.join(root, config.docs.path);
}

/**
 * Returns the absolute path to the memory directory.
 * @param {object} config - Speckit config object.
 * @param {string} [cwd] - Fallback directory. Defaults to cwd.
 * @returns {string} Memory directory path.
 */
function getMemoryPath(config, cwd = process.cwd()) {
  const root = getWorkspaceRoot(config, cwd);
  return path.join(root, config.specs.root, 'memory');
}

/**
 * Returns the absolute path to a sub-workspace's rules directory.
 * @param {object} config - Speckit config object.
 * @param {{ path: string }} workspace - Sub-workspace definition.
 * @param {string} [cwd] - Fallback directory. Defaults to cwd.
 * @returns {string|null} Rules directory path or null if workspace has no path.
 */
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
