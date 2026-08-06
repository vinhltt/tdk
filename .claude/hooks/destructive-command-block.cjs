#!/usr/bin/env node
/**
 * destructive-command-block.cjs - Block destructive shell commands
 *
 * Standalone version for project.
 * Prevents Claude from running file/directory deletion or dangerous git commands.
 * User must run these manually for safety.
 *
 * Exit Codes:
 * - 0: Command allowed
 * - 2: Command blocked (destructive)
 */

const fs = require('fs');

// Read stdin
const hookInput = fs.readFileSync(0, 'utf-8');
if (!hookInput || hookInput.trim().length === 0) process.exit(0);

let data;
try {
  data = JSON.parse(hookInput);
} catch (_) {
  process.exit(0);
}

// Only check Bash commands
if (data.tool_name !== 'Bash' || !data.tool_input || !data.tool_input.command) {
  process.exit(0);
}

const cmd = data.tool_input.command.trim();

// Deletion commands are judged by what they target, not by the verb alone.
// Ordinary cleanup (build output, cache, temp files) runs freely; only
// unrecoverable shapes are blocked.
const DELETE_VERB = /^\s*(sudo\s+)?(rm|rmdir|unlink|del|erase|rd|Remove-Item)\b/i;

// Targets whose deletion is unrecoverable or escapes the working tree.
function isDangerousTarget(raw) {
  const t = raw.replace(/^["']|["']$/g, '');
  if (!t) return false;
  const p = t.replace(/\\/g, '/');

  if (p === '*' || p === '.' || p === '..') return true;       // cwd or everything in it
  if (/^\/+\*?$/.test(p)) return true;                          // /  or  /*
  if (/^[a-zA-Z]:\/*\*?$/.test(p)) return true;                 // C:\  or  C:/*
  if (/^~\/?\*?$/.test(p)) return true;                         // ~  or  ~/*
  if (/^\$\{?(HOME|USERPROFILE)\}?\/?\*?$/.test(p)) return true;
  if (/^\/[^/]+\/?\*?$/.test(p)) return true;                   // /etc, /usr, /tmp — single top-level segment
  if (/(^|\/)\.git(\/|$)/.test(p)) return true;                 // repository metadata
  if (/^\.\.(\/|$)/.test(p)) return true;                       // escapes upward out of the workspace

  return false;
}

// Returns a block reason, or null when the deletion is ordinary.
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

// Split on shell separators so `cd x && rm y` is judged per command, not as a whole.
for (const segment of cmd.split(/&&|\|\||[;|]/)) {
  const reason = inspectDeletion(segment);
  if (reason) {
    console.error([
      '',
      'NOTE: This is not an error - this block is intentional for safety.',
      '',
      'BLOCKED: Unrecoverable delete',
      '',
      `  Command: ${cmd.substring(0, 120)}${cmd.length > 120 ? '...' : ''}`,
      `  Reason:  ${reason}`,
      '',
      '  Deleting a filesystem root, home directory, .git, or a path outside',
      '  the workspace must be run manually by the user.',
      '',
      '  Ordinary deletes (build output, caches, temp files) are allowed.',
      '',
    ].join('\n'));
    process.exit(2);
  }
}

// Git operations that discard work with no undo path.
const destructiveGitPatterns = [
  /\bgit\s+clean\s+(-[a-zA-Z]*f)/,
  /\bgit\s+reset\s+--hard\b/,
  /\bgit\s+checkout\s+--\s+\./,
  /\bgit\s+push\s+--force\b/,
  /\bgit\s+push\s+-f\b/,
  /\bshutil\.rmtree\b/,
];

for (const pattern of destructiveGitPatterns) {
  if (pattern.test(cmd)) {
    console.error([
      '',
      'NOTE: This is not an error - this block is intentional for safety.',
      '',
      'BLOCKED: Destructive command detected',
      '',
      `  Command: ${cmd.substring(0, 120)}${cmd.length > 120 ? '...' : ''}`,
      `  Matched: ${pattern.source}`,
      '',
      '  Commands that discard committed or working-tree state must be run',
      '  manually by the user.',
      '',
    ].join('\n'));
    process.exit(2);
  }
}

process.exit(0);
