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

// Destructive command patterns
const destructivePatterns = [
  // Unix rm variants
  /\brm\s+(-[a-zA-Z]*f[a-zA-Z]*)?\s/,
  /\brm\s+[^|&;]+/,
  /\brmdir\s/,
  /\bunlink\s/,

  // Windows del/rd
  /\bdel\s/i,
  /\brd\s/i,
  /\bRemove-Item\b/i,

  // Python destructive
  /\bshutil\.rmtree\b/,
  /\bos\.remove\b/,
  /\bos\.unlink\b/,

  // Git destructive
  /\bgit\s+clean\s+(-[a-zA-Z]*f)/,
  /\bgit\s+reset\s+--hard\b/,
  /\bgit\s+checkout\s+--\s+\./,
  /\bgit\s+push\s+--force\b/,
  /\bgit\s+push\s+-f\b/,
];

for (const pattern of destructivePatterns) {
  if (pattern.test(cmd)) {
    const msg = [
      '',
      'NOTE: This is not an error - this block is intentional for safety.',
      '',
      `BLOCKED: Destructive command detected`,
      '',
      `  Command: ${cmd.substring(0, 120)}${cmd.length > 120 ? '...' : ''}`,
      `  Matched: ${pattern.source}`,
      '',
      '  Destructive commands (rm, del, rmdir, git reset --hard, etc.)',
      '  must be run manually by the user to prevent accidental data loss.',
      '',
    ].join('\n');
    console.error(msg);
    process.exit(2);
  }
}

process.exit(0);
