#!/usr/bin/env node

try {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  const { createHookTimer, logHookCrash } = require('../lib/hook-logger.cjs');
  const { loadRules } = require('../lib/rule-loader.cjs');
  const { matchFileAgainstGlobs } = require('../lib/rule-matcher.cjs');
  const { loadSpeckitConfig } = require('../lib/speckit-config-reader.cjs');

  const LOCK_RETRIES = 5;
  const LOCK_BACKOFF_MS = 20;
  const SLEEP_BUF = new Int32Array(new SharedArrayBuffer(4));

  function syncSleep(ms) { Atomics.wait(SLEEP_BUF, 0, 0, ms); }

  function extractFilePath(toolInput) {
    return typeof toolInput?.file_path === 'string' ? toolInput.file_path : null;
  }

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

  function formatRuleContent(rule, rulesDir) {
    if (rule.inject === 'reference') {
      return `\n<!-- rule-ref: ${rule.file} -->\nRule: ${rule.description}\nPath: ${path.join(rulesDir, rule.file)}\nRead this file for detailed guidelines.\n`;
    }
    return `\n<!-- rule: ${rule.file} -->\n${rule.body}\n`;
  }

  function main() {
    const timer = createHookTimer('path-rule-injector', { event: 'PreToolUse' });
    try {
      const stdin = fs.readFileSync(0, 'utf-8').trim();
      if (!stdin) { timer.end({ status: 'skip', note: 'empty-input' }); return 0; }

      let data;
      try { data = JSON.parse(stdin); } catch { timer.end({ status: 'skip', note: 'json-parse-failed' }); return 0; }

      const toolInput = data.tool_input;
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
      const sessionId = data.session_id || data.sessionId || '';

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
