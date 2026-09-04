#!/usr/bin/env node
// Path Rule Injector — PreToolUse hook for Read|Edit|Write.
// Matches file paths against glob patterns in .specify/rules/*.md YAML frontmatter.
// Injects matching rule content into model context via hookSpecificOutput.additionalContext.
//
// Called via hook-gateway.cjs (stdin passed as param) or standalone (reads stdin directly).
// Fail-open: any error → exit 0 (never blocks tool calls).

try {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  const { createHookTimer, logHookCrash } = require('../lib/hook-logger.cjs');
  const { loadRules } = require('../lib/rule-loader.cjs');
  const { matchFileAgainstGlobs } = require('../lib/rule-matcher.cjs');
  const { loadSpeckitConfig } = require('../lib/speckit-config-reader.cjs');
  const { loadPayloadHarness } = require('../lib/harness-payload.cjs');

  const LOCK_RETRIES = 5;
  const LOCK_BACKOFF_MS = 20;
  const SLEEP_BUF = new Int32Array(new SharedArrayBuffer(4));

  function syncSleep(ms) { Atomics.wait(SLEEP_BUF, 0, 0, ms); }

  /**
   * Extracts file_path from the canonical tool input.
   * @param {object} toolInput - Canonical tool input from the selected harness adapter.
   * @returns {string|null} Absolute file path or null if not present.
   */
  function extractFilePath(toolInput) {
    return typeof toolInput?.file_path === 'string' ? toolInput.file_path : null;
  }

  /**
   * Converts absolute path to workspace-relative path with forward slashes.
   * @param {string} absPath - Absolute file path.
   * @param {string} workspaceRoot - Workspace root directory.
   * @returns {string} Relative path (e.g. "src/app.ts").
   */
  function makeRelative(absPath, workspaceRoot) {
    let rel = path.relative(workspaceRoot, absPath).replace(/\\/g, '/');
    if (rel.startsWith('./')) rel = rel.slice(2);
    return rel;
  }

  function sessionHash(id) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
    return Math.abs(h).toString(36).slice(0, 12);
  }

  /**
   * Checks if an always-apply rule was already injected in this session.
   * Uses file-locked temp file for atomic cross-process dedup.
   * @param {string} ruleFile - Rule filename (e.g. "always-apply-project-guidelines.md").
   * @param {string} sessionId - Claude session ID for scoping dedup.
   * @returns {boolean} True if already injected (skip), false if first time (inject).
   */
  function checkAlwaysApplyDedup(ruleFile, sessionId) {
    const sid = sessionId || process.env.CLAUDE_SESSION_ID || process.cwd();
    const tempFile = path.join(os.tmpdir(), `specify-rules-${sessionHash(sid)}.json`);
    const lockPath = tempFile + '.lock';

    let fd;
    for (let i = 0; i < LOCK_RETRIES; i++) {
      try { fd = fs.openSync(lockPath, 'wx'); break; }
      catch (e) { if (e.code !== 'EEXIST') throw e; syncSleep(LOCK_BACKOFF_MS); }
    }
    // Lock failed → inject anyway (fail-open)
    if (fd === undefined) return false;

    try {
      let data = { injected: [] };
      try { data = JSON.parse(fs.readFileSync(tempFile, 'utf-8')); } catch { /* first time */ }

      if (data.injected.includes(ruleFile)) return true;

      data.injected.push(ruleFile);
      fs.writeFileSync(tempFile, JSON.stringify(data));
      return false;
    } finally {
      fs.closeSync(fd);
      try { fs.unlinkSync(lockPath); } catch { /* lock already gone */ }
    }
  }

  /**
   * Formats rule content for injection. Full mode injects body; reference mode injects path + description.
   * @param {{ file: string, inject: string, description: string, body: string }} rule - Parsed rule object.
   * @param {string} rulesDir - Absolute path to rules directory.
   * @returns {string} Formatted content string for additionalContext.
   */
  function formatRuleContent(rule, rulesDir) {
    if (rule.inject === 'reference') {
      return `\n<!-- rule-ref: ${rule.file} -->\nRule: ${rule.description}\nPath: ${path.join(rulesDir, rule.file)}\nRead this file for detailed guidelines.\n`;
    }
    return `\n<!-- rule: ${rule.file} -->\n${rule.body}\n`;
  }

  /**
   * Main entry point for path-rule-injector hook.
   * @param {string} [stdinData] - Pre-read stdin from hook-gateway.cjs. If omitted, reads stdin directly.
   * @returns {number} Exit code (always 0 — fail-open).
   */
  function main(stdinData) {
    const timer = createHookTimer('path-rule-injector', { event: 'PreToolUse' });
    try {
      const stdin = (stdinData ?? fs.readFileSync(0, 'utf-8')).trim();
      if (!stdin) { timer.end({ status: 'skip', note: 'empty-input' }); return 0; }

      let payload;
      try {
        payload = loadPayloadHarness(stdin);
      } catch (error) {
        timer.end({ status: 'skip', note: 'payload-normalization-failed' });
        logHookCrash('path-rule-injector', error, { event: 'PreToolUse' });
        return 0;
      }

      const toolInput = payload.toolInput;
      if (!toolInput || typeof toolInput !== 'object') {
        timer.end({ status: 'skip', note: 'no-tool-input' });
        return 0;
      }

      const config = loadSpeckitConfig(process.cwd());
      const rulesPath = config.rules?.path || '.specify/rules';
      const rulesDir = path.join(config.__workspaceRoot, rulesPath);

      if (!fs.existsSync(rulesDir)) { timer.end({ status: 'skip', note: 'no-rules-dir' }); return 0; }

      const rules = loadRules(rulesDir);
      if (rules.length === 0) { timer.end({ status: 'skip', note: 'no-rules' }); return 0; }

      const absFilePath = extractFilePath(toolInput);
      const relFilePath = absFilePath ? makeRelative(absFilePath, config.__workspaceRoot) : null;
      const sessionId = payload.sessionId ?? '';

      const parts = [];
      let matchCount = 0;

      for (const rule of rules) {
        if (rule.isAlwaysApply) {
          if (!checkAlwaysApplyDedup(rule.file, sessionId)) {
            parts.push(formatRuleContent(rule, rulesDir));
            matchCount++;
          }
          continue;
        }

        if (relFilePath && rule.paths.length > 0 && matchFileAgainstGlobs(relFilePath, rule.paths)) {
          parts.push(formatRuleContent(rule, rulesDir));
          matchCount++;
        }
      }

      if (parts.length === 0) {
        timer.end({ status: 'ok', note: 'no-match', rulesTotal: rules.length });
        return 0;
      }

      const content = parts.join('\n');
      console.log(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          additionalContext: content,
          permissionDecision: 'allow'
        }
      }));

      timer.end({ status: 'ok', note: 'injected', matchCount, rulesTotal: rules.length });
      return 0;
    } catch (error) {
      logHookCrash('path-rule-injector', error, { event: 'PreToolUse' });
      return 0;
    }
  }

  module.exports = { main, extractFilePath, makeRelative, formatRuleContent, checkAlwaysApplyDedup };

  if (require.main === module) {
    process.exit(main());
  }
} catch (error) {
  try {
    const { logHookCrash } = require('../lib/hook-logger.cjs');
    logHookCrash('path-rule-injector', error, { event: 'PreToolUse' });
  } catch (_) {}
  process.exit(0);
}
