const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const GIT_TIMEOUT_MS = 3000;
const PROMPT_LEXEME_PATTERN = /[\p{L}\p{M}\p{N}_-]+/gu;
const UNSAFE_TICKET_PATTERN = /[\\/\u0000\r\n]/;

/**
 * @typedef {Object} SessionTicketResolution
 * @property {Array<{ ticketId: string, source: 'prompt-mention'|'cwd-branch' }>} associations
 * @property {Array<{ ticketId: string, reason: 'no-task-folder'|'task-folder-error' }>} skipped
 * @property {string|null} reason Whole-resolution skip reason, or null when candidates were evaluated.
 */

function result(associations, skipped, reason) {
  return { associations, skipped, reason };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function canonicalizeDirectory(candidate) {
  if (typeof candidate !== 'string' || candidate.length === 0) return null;
  if (!path.isAbsolute(candidate)) return null;

  try {
    const canonical = fs.realpathSync.native(candidate);
    return fs.statSync(canonical).isDirectory() ? canonical : null;
  } catch (_) {
    return null;
  }
}

function isInside(root, target) {
  if (target === root) return true;
  const relative = path.relative(root, target);
  if (!relative || relative === '..') return false;
  return !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/**
 * Build full-token ticket matchers. Configured syntax and literal prefixes are
 * alternatives, so a prefixes-only or format-only configuration is valid.
 * @returns {RegExp[]|null} null when no usable rule exists.
 */
function buildTicketMatchers(config) {
  const matchers = [];
  const ticketFormat = config?.specs?.ticketFormat;

  if (typeof ticketFormat === 'string' && ticketFormat.length > 0) {
    try {
      const matcher = new RegExp(`^(?:${ticketFormat})$`, 'i');
      if (matcher.test('')) return null;
      matchers.push(matcher);
    } catch (_) {
      return null;
    }
  } else if (ticketFormat !== undefined && ticketFormat !== null && typeof ticketFormat !== 'string') {
    return null;
  }

  const prefixList = config?.git?.prefixList;
  if (typeof prefixList === 'string' && prefixList.length > 0) {
    const prefixes = new Set(prefixList.split(',').map(prefix => prefix.trim()).filter(Boolean));
    for (const prefix of prefixes) {
      matchers.push(new RegExp(`^${escapeRegExp(prefix)}-\\d+$`, 'i'));
    }
  }

  return matchers.length > 0 ? matchers : null;
}

function isTicketToken(token, matchers) {
  if (!token || UNSAFE_TICKET_PATTERN.test(token)) return false;
  if (token === '.' || token === '..') return false;
  return matchers.some(matcher => matcher.test(token));
}

function sortedCanonicalIds(ticketIds) {
  return [...new Set(ticketIds.map(ticketId => ticketId.toLowerCase()))].sort();
}

/** Every maximal prompt lexeme that fully matches a configured ticket rule. */
function extractPromptTickets(prompt, matchers) {
  const matches = prompt.match(PROMPT_LEXEME_PATTERN);
  if (!matches) return [];
  return sortedCanonicalIds(matches.filter(token => isTicketToken(token, matchers)));
}

/**
 * Branch tickets from one branch name. A path segment that fully matches wins
 * as a whole; otherwise contiguous hyphen-separated subspans are considered so
 * descriptive suffixes still resolve.
 */
function extractBranchTickets(branch, matchers) {
  const ticketIds = [];

  for (const segment of branch.split('/')) {
    if (!segment) continue;
    if (isTicketToken(segment, matchers)) {
      ticketIds.push(segment);
      continue;
    }

    const parts = segment.split('-');
    for (let start = 0; start < parts.length; start += 1) {
      for (let end = start + 1; end <= parts.length; end += 1) {
        const token = parts.slice(start, end).join('-');
        if (isTicketToken(token, matchers)) ticketIds.push(token);
      }
    }
  }

  return sortedCanonicalIds(ticketIds);
}

function getSpecsDir(config, workspaceRoot) {
  const specsRoot = config?.specs?.root;
  const defaultFolder = config?.specs?.defaultFolder;
  if (typeof specsRoot !== 'string' || specsRoot.length === 0) return null;
  if (typeof defaultFolder !== 'string' || defaultFolder.length === 0) return null;

  try {
    return path.resolve(workspaceRoot, specsRoot, defaultFolder);
  } catch (_) {
    return null;
  }
}

/** @returns {null|'no-task-folder'|'task-folder-error'} */
function inspectTaskFolder(specsDir, ticketId) {
  try {
    return fs.statSync(path.join(specsDir, ticketId)).isDirectory() ? null : 'no-task-folder';
  } catch (error) {
    return error?.code === 'ENOENT' || error?.code === 'ENOTDIR'
      ? 'no-task-folder'
      : 'task-folder-error';
  }
}

/** Split canonical candidates into recordable associations and per-candidate skips. */
function partitionCandidates(ticketIds, specsDir, source) {
  const associations = [];
  const skipped = [];

  for (const ticketId of ticketIds) {
    const reason = inspectTaskFolder(specsDir, ticketId);
    if (reason) skipped.push({ ticketId, reason });
    else associations.push({ ticketId, source });
  }

  return result(associations, skipped, null);
}

function git(cwd, args) {
  return execFileSync('git', ['-C', cwd, ...args], {
    encoding: 'utf-8',
    timeout: GIT_TIMEOUT_MS,
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

function isUnsafeWorkspacePath(workspacePath) {
  if (typeof workspacePath !== 'string' || workspacePath.length === 0) return true;
  if (path.isAbsolute(workspacePath) || path.win32.isAbsolute(workspacePath)) return true;
  return workspacePath.split(/[\\/]+/).includes('..');
}

/**
 * Only the workspace root itself or one configured sub-workspace repository may
 * supply a branch ticket. Configured paths are compared as canonical data; no
 * other repository is probed.
 */
function isApprovedRepository(topLevel, workspaceRoot, config) {
  if (topLevel === workspaceRoot) return true;

  const subWorkspaces = Array.isArray(config?.subWorkspaces) ? config.subWorkspaces : [];
  for (const workspace of subWorkspaces) {
    const workspacePath = workspace?.path;
    if (isUnsafeWorkspacePath(workspacePath)) continue;

    const canonical = canonicalizeDirectory(path.resolve(workspaceRoot, workspacePath));
    if (!canonical || !isInside(workspaceRoot, canonical)) continue;
    if (canonical === topLevel) return true;
  }

  return false;
}

function resolveBranchAssociation({ payload, config, specsDir, workspaceRoot, matchers }) {
  const cwd = canonicalizeDirectory(payload?.cwd);
  if (!cwd) return result([], [], 'invalid-cwd');
  if (!isInside(workspaceRoot, cwd)) return result([], [], 'cwd-outside-workspace');

  let topLevel;
  try {
    topLevel = canonicalizeDirectory(git(cwd, ['rev-parse', '--show-toplevel']));
  } catch (_) {
    return result([], [], 'git-error');
  }
  if (!topLevel) return result([], [], 'git-error');
  if (!isApprovedRepository(topLevel, workspaceRoot, config)) {
    return result([], [], 'unapproved-repository');
  }

  let branch;
  try {
    branch = git(topLevel, ['branch', '--show-current']);
  } catch (_) {
    return result([], [], 'git-error');
  }
  if (!branch) return result([], [], 'detached-head');

  const ticketIds = extractBranchTickets(branch, matchers);
  if (ticketIds.length > 1) return result([], [], 'ambiguous-branch-ticket');
  if (ticketIds.length === 0) return result([], [], 'no-ticket');

  return partitionCandidates(ticketIds, specsDir, 'cwd-branch');
}

/**
 * Resolve every ticket the current prompt associates with this session.
 * Associations are additive; branch inference is a fallback scoped to the
 * repository containing `payload.cwd`.
 *
 * @param {{ payload?: object, config?: object, workspaceRoot?: string }} input
 * @returns {SessionTicketResolution}
 */
function resolveSessionTickets(input = {}) {
  const safeInput = input && typeof input === 'object' ? input : {};
  const { payload, config, workspaceRoot } = safeInput;

  const sessionId = typeof payload?.sessionId === 'string' ? payload.sessionId.trim() : '';
  if (!sessionId) return result([], [], 'no-session-id');

  const canonicalRoot = canonicalizeDirectory(workspaceRoot);
  if (!canonicalRoot) return result([], [], 'invalid-workspace-root');

  const specsDir = getSpecsDir(config, canonicalRoot);
  const matchers = buildTicketMatchers(config);
  if (!specsDir || !matchers) return result([], [], 'invalid-config');

  const prompt = payload?.prompt;
  if (prompt !== null && prompt !== undefined && typeof prompt !== 'string') {
    return result([], [], 'invalid-prompt');
  }

  const promptTickets = typeof prompt === 'string' ? extractPromptTickets(prompt, matchers) : [];
  if (promptTickets.length > 0) {
    return partitionCandidates(promptTickets, specsDir, 'prompt-mention');
  }

  return resolveBranchAssociation({ payload, config, specsDir, workspaceRoot: canonicalRoot, matchers });
}

module.exports = { resolveSessionTickets };
