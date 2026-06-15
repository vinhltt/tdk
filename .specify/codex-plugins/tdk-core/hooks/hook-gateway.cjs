#!/usr/bin/env node
// Hook Gateway — single entry point for all tdk-core hooks.
// Checks .specify.json "hooks.disabled" array before delegating to the actual hook.
// This enforces disable at one point — hook authors don't need disable logic.
//
// Usage in hooks.json:
//   "command": "node hook-gateway.cjs <hook-name>"
//
// Disable a hook via .specify.json:
//   { "hooks": { "disabled": ["path-rule-injector"] } }
//
// Fail-open: any error → exit 0 (never blocks tool calls).

try {
  const fs = require('fs');
  const path = require('path');
  const { createHookTimer, logHookCrash } = require('../lib/hook-logger.cjs');
  const { loadSpeckitConfig } = require('../lib/speckit-config-reader.cjs');

  const hookName = process.argv[2];
  if (!hookName) { process.exit(0); }

  const timer = createHookTimer('hook-gateway', { event: 'gateway', hook: hookName });
  const config = loadSpeckitConfig(process.cwd());
  // Non-array disabled values (e.g. true, "string") → treat as empty (fail-open)
  const disabled = Array.isArray(config.hooks?.disabled) ? config.hooks.disabled : [];

  if (disabled.includes(hookName)) {
    timer.end({ status: 'skip', note: 'hook-disabled', hook: hookName });
    process.exit(0);
  }

  // Read stdin once, pass to hook — avoids double-read since stdin is consumed on first read
  const stdinData = fs.readFileSync(0, 'utf-8');
  const hookModule = require(path.join(__dirname, hookName + '.cjs'));
  const exitCode = hookModule.main(stdinData);
  timer.end({ status: 'ok', note: 'delegated', hook: hookName });
  process.exit(exitCode || 0);
} catch (error) {
  try {
    const { logHookCrash } = require('../lib/hook-logger.cjs');
    logHookCrash('hook-gateway', error, { event: 'gateway' });
  } catch (_) {}
  process.exit(0);
}
