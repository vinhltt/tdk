#!/usr/bin/env node
// Destructive Command Block — PreToolUse hook on Bash.
// Blocks unrecoverable deletes and git operations that discard work with no undo path.
// The user must run these manually.
//
// Called via hook-gateway.cjs (stdin passed as param) or standalone (reads stdin directly).
// Exit codes: 0 = allowed, 2 = blocked (stderr is fed back to the model).
//
// Unlike the injector hooks, this one can return a non-zero exit code. Errors still
// fail open (return 0) — the gateway contract guarantees no hook blocks a tool call
// because of its own crash.

try {
  const fs = require('fs');
  const { loadPayloadHarness } = require('../lib/harness-payload.cjs');
  const { createHookTimer, logHookCrash } = require('../lib/hook-logger.cjs');

  // Deletion commands are judged by what they target, not by the verb alone.
  // Ordinary cleanup (build output, cache, temp files) runs freely; only
  // unrecoverable shapes are blocked.
  const DELETE_VERB = /^\s*(sudo\s+)?(rm|rmdir|unlink|del|erase|rd|Remove-Item)\b/i;

  // Git operations that discard work with no undo path.
  const DESTRUCTIVE_GIT_PATTERNS = [
    /\bgit\s+clean\s+(-[a-zA-Z]*f)/,
    /\bgit\s+reset\s+--hard\b/,
    /\bgit\s+checkout\s+--\s+\./,
    /\bgit\s+push\s+--force\b/,
    /\bgit\s+push\s+-f\b/,
    /\bshutil\.rmtree\b/
  ];

  /**
   * Targets whose deletion is unrecoverable or escapes the working tree.
   * @param {string} raw - A single argument token from the delete command.
   * @returns {boolean} True when deleting this target is unrecoverable.
   */
  function isDangerousTarget(raw) {
    const t = raw.replace(/^["']|["']$/g, '');
    if (!t) return false;
    const p = t.replace(/\\/g, '/');

    if (p === '*' || p === '.' || p === '..') return true;        // cwd or everything in it
    if (/^\/+\*?$/.test(p)) return true;                          // /  or  /*
    if (/^[a-zA-Z]:\/*\*?$/.test(p)) return true;                 // C:\  or  C:/*
    if (/^~\/?\*?$/.test(p)) return true;                         // ~  or  ~/*
    if (/^\$\{?(HOME|USERPROFILE)\}?\/?\*?$/.test(p)) return true;
    if (/^\/[^/]+\/?\*?$/.test(p)) return true;                   // /etc, /usr, /tmp — single top-level segment
    if (/(^|\/)\.git(\/|$)/.test(p)) return true;                 // repository metadata
    if (/^\.\.(\/|$)/.test(p)) return true;                       // escapes upward out of the workspace

    return false;
  }

  /**
   * Inspects one shell segment for an unrecoverable delete.
   * @param {string} segment - A single command between shell separators.
   * @returns {string|null} Block reason, or null when the deletion is ordinary.
   */
  function inspectDeletion(segment) {
    if (!DELETE_VERB.test(segment)) return null;

    if (/--no-preserve-root/.test(segment)) {
      return 'uses --no-preserve-root';
    }

    const tokens = segment.trim().split(/\s+/).slice(1);
    const targets = tokens.filter((t) => !t.startsWith('-'));

    const recursive = tokens.some((t) => /^-[a-zA-Z]*[rR]/.test(t) || /^--recursive$/i.test(t));
    if (recursive && targets.length === 0) {
      return 'recursive delete with no explicit target';
    }

    const bad = targets.find(isDangerousTarget);
    return bad ? `targets ${bad}` : null;
  }

  /**
   * Classifies a full Bash command string.
   * @param {string} cmd - The command as submitted to the Bash tool.
   * @returns {{ kind: string, reason: string }|null} Block verdict, or null when allowed.
   */
  function inspectCommand(cmd) {
    // Split on shell separators so `cd x && rm y` is judged per command, not as a whole.
    for (const segment of cmd.split(/&&|\|\||[;|]/)) {
      const reason = inspectDeletion(segment);
      if (reason) return { kind: 'Unrecoverable delete', reason };
    }

    for (const pattern of DESTRUCTIVE_GIT_PATTERNS) {
      if (pattern.test(cmd)) {
        return { kind: 'Destructive command detected', reason: `matched ${pattern.source}` };
      }
    }

    return null;
  }

  function formatBlockMessage(cmd, verdict) {
    const advice = verdict.kind === 'Unrecoverable delete'
      ? [
        '  Deleting a filesystem root, home directory, .git, or a path outside',
        '  the workspace must be run manually by the user.',
        '',
        '  Ordinary deletes (build output, caches, temp files) are allowed.'
      ]
      : [
        '  Commands that discard committed or working-tree state must be run',
        '  manually by the user.'
      ];

    return [
      '',
      'NOTE: This is not an error - this block is intentional for safety.',
      '',
      `BLOCKED: ${verdict.kind}`,
      '',
      `  Command: ${cmd.substring(0, 120)}${cmd.length > 120 ? '...' : ''}`,
      `  Reason:  ${verdict.reason}`,
      '',
      ...advice,
      ''
    ].join('\n');
  }

  /**
   * Main entry point for destructive-command-block hook.
   * @param {string} [stdinData] - Pre-read stdin from hook-gateway.cjs. If omitted, reads stdin directly.
   * @returns {number} Exit code — 2 blocks the tool call, 0 allows it.
   */
  function main(stdinData) {
    const timer = createHookTimer('destructive-command-block', { event: 'PreToolUse' });
    try {
      const stdin = (stdinData ?? fs.readFileSync(0, 'utf-8')).trim();
      if (!stdin) {
        timer.end({ status: 'skip', note: 'empty-input', message: 'Skipped: empty stdin input' });
        return 0;
      }

      const payload = loadPayloadHarness(stdin);
      const cmd = payload.toolName === 'bash' ? payload.toolInput?.command?.trim() : '';
      if (!cmd) {
        timer.end({ status: 'skip', note: 'not-bash-command', message: 'Skipped: no Bash command in payload' });
        return 0;
      }

      const verdict = inspectCommand(cmd);
      if (!verdict) {
        timer.end({ status: 'ok', note: 'allowed' });
        return 0;
      }

      console.error(formatBlockMessage(cmd, verdict));
      timer.end({ status: 'block', exit: 2, note: verdict.reason, message: `Blocked: ${verdict.kind}`, content: cmd });
      return 2;
    } catch (error) {
      logHookCrash('destructive-command-block', error, { event: 'PreToolUse' });
      return 0;
    }
  }

  module.exports = { main, inspectCommand, inspectDeletion, isDangerousTarget };

  if (require.main === module) {
    process.exit(main());
  }
} catch (error) {
  try {
    const { logHookCrash } = require('../lib/hook-logger.cjs');
    logHookCrash('destructive-command-block', error, { event: 'PreToolUse' });
  } catch (_) {}
  process.exit(0);
}
