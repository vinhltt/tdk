const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  loadSpeckitConfig,
  detectActiveWorkspace,
  getSubWorkspaceRulesPath
} = require('./speckit-config-reader.cjs');

const DEDUP_MARKER = '<!-- speckit-dev-context-injected -->';

function normalizePath(p) {
  return String(p || '').replace(/\\/g, '/');
}

function resolveWorkspaceRoot(config, cwd = process.cwd()) {
  return config?.__workspaceRoot || cwd;
}

function loadHookConfigFile(filename, config, cwd = process.cwd()) {
  try {
    const workspaceRoot = resolveWorkspaceRoot(config, cwd);
    const filePath = path.join(workspaceRoot, '.specify', 'configurations', 'hooks', filename);
    if (!fs.existsSync(filePath)) return '';
    return fs.readFileSync(filePath, 'utf-8').trim();
  } catch (_) {
    return '';
  }
}

function wasRecentlyInjected(transcriptPath) {
  try {
    if (!transcriptPath || !fs.existsSync(transcriptPath)) return false;
    const transcript = fs.readFileSync(transcriptPath, 'utf-8');
    return transcript.includes(DEDUP_MARKER);
  } catch (_) {
    return false;
  }
}

function buildSessionSection(config, staticEnv = {}, cwd = process.cwd()) {
  const memUsed = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
  const memTotal = Math.round(os.totalmem() / 1024 / 1024);
  const memPercent = Math.round((memUsed / memTotal) * 100);
  const cpuUsage = Math.round((process.cpuUsage().user / 1000000) * 100);
  const cpuSystem = Math.round((process.cpuUsage().system / 1000000) * 100);
  const lines = [
    '## Session',
    `- DateTime: ${new Date().toLocaleString()}`,
    `- CWD: ${staticEnv.cwd || cwd}`,
    `- OS: ${staticEnv.osPlatform || process.platform}`,
    `- User: ${staticEnv.user || process.env.USERNAME || process.env.USER || ''}`,
    `- Locale: ${staticEnv.locale || process.env.LANG || ''}`,
    `- Memory usage: ${memUsed}MB/${memTotal}MB (${memPercent}%)`,
    `- CPU usage: ${cpuUsage}% user / ${cpuSystem}% system`
  ];

  const subagentGuidelines = loadHookConfigFile('subagent-guidelines.md', config, cwd);
  if (subagentGuidelines) lines.push(subagentGuidelines);
  lines.push('');
  return lines;
}

function buildWorkspaceSection(config, activeWorkspace) {
  const workspaceNames = (config.subWorkspaces || []).map((ws) => ws.name).join(', ') || 'none';
  return [
    '## Workspace',
    `- Project: ${config.name} (${config.architecture.type})`,
    `- Active workspace: ${activeWorkspace ? activeWorkspace.name : 'root'}`,
    `- Sub-workspaces: ${workspaceNames}`,
    ''
  ];
}

function buildRulesSection(config, activeWorkspace, cwd = process.cwd()) {
  const rulesPath = activeWorkspace ? getSubWorkspaceRulesPath(config, activeWorkspace, cwd) : null;
  const rulesPathDisplay = rulesPath ? normalizePath(path.relative(cwd, rulesPath)) : '(root workspace)';
  const devRulesPath = '.claude/rules/development-rules.md';

  const lines = [
    '## Rules',
    '- Constitution: .specify/memory/constitution.md',
    `- Workspace rules: ${rulesPathDisplay}`,
    `- Dev rules: ${devRulesPath}`
  ];

  const principles = loadHookConfigFile('development-principles.md', config, cwd);
  if (principles) lines.push(principles);
  lines.push('');
  return lines;
}

function buildPathsSection(config) {
  return [
    '## Paths',
    `- Specs: ${normalizePath(path.posix.join(config.specs.root, config.specs.defaultFolder))}/`,
    `- Configurations: ${normalizePath(config.docs.path)}/`,
    `- Memory: ${normalizePath(path.posix.join(config.specs.root, 'memory'))}/`,
    `- Scripts: ${normalizePath(path.posix.join(config.specs.root, 'scripts'))}/`,
    ''
  ];
}

function buildGitSection(config) {
  return [
    '## Git',
    `- Main branch: ${config.git.mainBranch}`,
    `- Ticket prefixes: ${config.git.prefixList || '(none)'}`,
    ''
  ];
}

function buildModularizationSection(config, cwd = process.cwd()) {
  const content = loadHookConfigFile('modularization-guidelines.md', config, cwd);
  if (!content) return [];
  return ['## Modularization', content, ''];
}

/** Get current git branch name, or null if detached/unavailable */
function getGitBranch() {
  try {
    return require('child_process')
      .execSync('git branch --show-current', { encoding: 'utf-8', timeout: 3000 })
      .trim() || null;
  } catch (_) {
    return null;
  }
}

/** Extract ticket ID from branch name using ticket format regex and prefix list */
function extractTicketFromBranch(branch, ticketFormat, prefixList) {
  if (!branch || !ticketFormat) return null;
  try {
    const regex = new RegExp(ticketFormat);
    const parts = branch.split('/');
    for (const part of parts) {
      const match = part.match(regex);
      if (match) return match[0];
      if (prefixList) {
        const prefixes = prefixList.split(',').map(p => p.trim());
        for (const prefix of prefixes) {
          const prefixRegex = new RegExp(`${prefix}-\\d+`, 'i');
          const prefixMatch = part.match(prefixRegex);
          if (prefixMatch) return prefixMatch[0];
        }
      }
    }
  } catch (_) {}
  return null;
}

/** Build spec context section with active ticket and spec folder path */
function buildSpecContextSection(config, cwd = process.cwd()) {
  const specsPath = normalizePath(
    path.posix.join(config.specs.root, config.specs.defaultFolder)
  );
  const gitBranch = getGitBranch();
  const ticketId = extractTicketFromBranch(gitBranch, config.specs.ticketFormat, config.git.prefixList);

  const lines = [
    '## Spec Context',
    `- Spec folder: ${specsPath}/${ticketId || '{ticket-id}'}/`,
    `- Branch: ${gitBranch || '(detached)'}`,
  ];

  if (ticketId) {
    lines.push(`- Active ticket: ${ticketId}`);
  }

  lines.push('');
  return lines;
}

function buildNamingSection(config) {
  return [
    '## Naming',
    `- Spec folder: ${normalizePath(path.posix.join(config.specs.root, config.specs.defaultFolder))}/{ticket-id}/`,
    '- Ticket format: {prefix}-{number} (e.g. CD-001, tdk-1)',
    `- Ticket regex: ${config.specs.ticketFormat || '(not configured)'}`
  ];
}

function buildSpeckitContext({ cwd = process.cwd(), staticEnv } = {}) {
  const config = loadSpeckitConfig(cwd);
  const activeWorkspace = detectActiveWorkspace(cwd, config.subWorkspaces);

  const lines = [
    DEDUP_MARKER,
    ...buildSessionSection(config, staticEnv, cwd),
    ...buildWorkspaceSection(config, activeWorkspace),
    ...buildRulesSection(config, activeWorkspace, cwd),
    ...buildPathsSection(config),
    ...buildGitSection(config),
    ...buildModularizationSection(config, cwd),
    ...buildSpecContextSection(config, cwd),
    ...buildNamingSection(config)
  ];

  return {
    content: lines.join('\n'),
    lines,
    config,
    activeWorkspace
  };
}

module.exports = {
  DEDUP_MARKER,
  loadHookConfigFile,
  wasRecentlyInjected,
  buildSessionSection,
  buildWorkspaceSection,
  buildRulesSection,
  buildPathsSection,
  buildGitSection,
  buildModularizationSection,
  buildNamingSection,
  getGitBranch,
  extractTicketFromBranch,
  buildSpecContextSection,
  buildSpeckitContext
};
