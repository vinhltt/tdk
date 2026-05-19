#!/usr/bin/env node

try {
  const fs = require('fs');
  const { createHookTimer, logHookCrash } = require('../lib/hook-logger.cjs');
  const { buildSpeckitContext, wasRecentlyInjected } = require('../lib/context-builder.cjs');

  function main() {
    const timer = createHookTimer('dev-context-injector', { event: 'UserPromptSubmit' });
    try {
      const stdin = fs.readFileSync(0, 'utf-8').trim();
      if (!stdin) {
        timer.end({ status: 'skip', note: 'empty-input', message: 'Skipped: empty stdin input' });
        return 0;
      }

      const payload = JSON.parse(stdin);
      if (wasRecentlyInjected(payload.transcript_path)) {
        timer.end({ status: 'skip', note: 'recently-injected', message: 'Skipped: context already injected in recent session' });
        return 0;
      }

      const { content } = buildSpeckitContext({ cwd: process.cwd() });
      console.log(content);
      timer.end({ status: 'ok', note: 'context-injected', message: 'Speckit context built and injected successfully', content: content });

      try {
        const path = require('path');
        const { recordSession } = require('../lib/session-tracker.cjs');
        const { extractTicketFromBranch, getGitBranch } = require('../lib/context-builder.cjs');
        const { loadSpeckitConfig } = require('../lib/speckit-config-reader.cjs');

        const config = loadSpeckitConfig(process.cwd());
        const branch = getGitBranch();
        const ticketId = extractTicketFromBranch(
          branch,
          config.specs.ticketFormat,
          config.git.prefixList
        );

        const sessionId = payload.sessionId || payload.session_id;
        if (!ticketId) {
          console.log('[session-tracker] ⚠️ Branch không có ticket-id, sessions không track');
        } else if (sessionId) {
          recordSession({
            specsRoot: path.posix.join(config.specs.root, config.specs.defaultFolder),
            ticketId,
            sessionId,
            cwd: process.cwd()
          });
        }
      } catch (e) {
        logHookCrash('session-tracker', e, { event: 'UserPromptSubmit' });
      }

      return 0;
    } catch (error) {
      logHookCrash('dev-context-injector', error, { event: 'UserPromptSubmit' });
      return 0;
    }
  }

  module.exports = { main };

  if (require.main === module) {
    process.exit(main());
  }
} catch (error) {
  try {
    const { logHookCrash } = require('../lib/hook-logger.cjs');
    logHookCrash('dev-context-injector', error, { event: 'UserPromptSubmit' });
  } catch (_) {}
  process.exit(0);
}
