#!/usr/bin/env node
// Dev Context Injector — UserPromptSubmit hook.
// Builds and injects speckit development context (workspace info, rules, paths, git config)
// into model context on each user prompt. Skips if recently injected (dedup via transcript).
//
// Called via hook-gateway.cjs (stdin passed as param) or standalone (reads stdin directly).
// Fail-open: any error → exit 0 (never blocks prompt submission).

try {
  const fs = require('fs');
  const path = require('path');
  const { loadPayloadHarness } = require('../lib/harness-payload.cjs');
  const { logHook, createHookTimer, logHookCrash } = require('../lib/hook-logger.cjs');
  const { buildSpeckitContext, wasRecentlyInjected } = require('../lib/context-builder.cjs');
  const { loadSpeckitConfig } = require('../lib/speckit-config-reader.cjs');
  const { resolveSessionTickets } = require('../lib/session-ticket-resolver.cjs');
  const { recordSession } = require('../lib/session-tracker.cjs');
  /**
   * Resolve the project root that owns configuration and specs.
   * `CLAUDE_PROJECT_DIR` wins; only an absent variable falls back to the
   * project root this process was launched from. `payload.cwd` is an activity
   * location and never selects configuration.
   * @returns {string|null} Canonical project root, or null when untrustworthy.
   */
  function resolveTrustedProjectRoot() {
    const explicit = process.env.CLAUDE_PROJECT_DIR;
    const candidate = typeof explicit === 'string' && explicit.trim().length > 0
      ? explicit.trim()
      : process.cwd();

    if (!path.isAbsolute(candidate)) return null;

    try {
      const canonical = fs.realpathSync.native(candidate);
      if (!fs.statSync(canonical).isDirectory()) return null;
      if (!fs.statSync(path.join(canonical, '.specify', '.specify.json')).isFile()) return null;
      return canonical;
    } catch (_) {
      return null;
    }
  }

  function logTracking(fields) {
    try {
      logHook('session-tracker', { event: 'UserPromptSubmit', ...fields });
    } catch (_) {
      // Logging must never decide whether the remaining tickets get recorded.
    }
  }

  /**
   * Record this session against every ticket the prompt associates with it.
   * Associations are additive and each write is isolated, so one failing
   * target never suppresses the others or the injected context.
   * @param {import('../lib/harness-payload.cjs').HarnessPayload} payload
   * @param {{ resolveSessionTickets?: Function, recordSession?: Function, loadSpeckitConfig?: Function }} [dependencies]
   */
  function trackSession(payload, dependencies = {}) {
    const resolveTickets = dependencies.resolveSessionTickets || resolveSessionTickets;
    const record = dependencies.recordSession || recordSession;
    const loadConfig = dependencies.loadSpeckitConfig || loadSpeckitConfig;

    const workspaceRoot = resolveTrustedProjectRoot();
    if (!workspaceRoot) {
      logTracking({
        status: 'skip',
        note: 'invalid-project-root',
        message: 'Skipped session tracking: invalid-project-root'
      });
      return;
    }

    let config;
    try {
      config = loadConfig(workspaceRoot, { strict: true });
    } catch (_) {
      logTracking({
        status: 'skip',
        note: 'invalid-config',
        message: 'Skipped session tracking: invalid-config'
      });
      return;
    }

    const resolution = resolveTickets({ payload, config, workspaceRoot });
    if (resolution.reason) {
      logTracking({
        status: 'skip',
        note: resolution.reason,
        message: `Skipped session tracking: ${resolution.reason}`
      });
    }
    for (const candidate of resolution.skipped || []) {
      logTracking({
        status: 'skip',
        note: candidate.reason,
        ticketId: candidate.ticketId,
        message: `Skipped session tracking for ${candidate.ticketId}: ${candidate.reason}`
      });
    }

    const specsRoot = path.posix.join(config.specs.root, config.specs.defaultFolder);
    for (const association of resolution.associations || []) {
      try {
        const tracking = record({
          specsRoot,
          ticketId: association.ticketId,
          sessionId: payload.sessionId,
          cwd: workspaceRoot
        });
        logTracking({
          status: tracking?.skipped ? 'skip' : 'ok',
          note: tracking?.skipped || association.source,
          ticketId: association.ticketId,
          source: association.source,
          recorded: tracking?.recorded === true,
          message: tracking?.skipped
            ? `Skipped session tracking for ${association.ticketId}: ${tracking.skipped}`
            : `Session ${tracking?.recorded ? 'recorded' : 'already recorded'} for ${association.ticketId}`
        });
      } catch (error) {
        logTracking({
          status: 'skip',
          note: 'record-error',
          ticketId: association.ticketId,
          source: association.source,
          message: `Failed session tracking for ${association.ticketId}: ${error?.code || 'record-error'}`
        });
      }
    }
  }
  /**
   * Main entry point for dev-context-injector hook.
   * @param {string} [stdinData] - Pre-read stdin from hook-gateway.cjs. If omitted, reads stdin directly.
   * @param {{ resolveSessionTickets?: Function, recordSession?: Function, loadSpeckitConfig?: Function }} [trackingDependencies]
   * @returns {number} Exit code (always 0 — fail-open).
   */
  function main(stdinData, trackingDependencies) {
    const timer = createHookTimer('dev-context-injector', { event: 'UserPromptSubmit' });
    try {
      const stdin = (stdinData ?? fs.readFileSync(0, 'utf-8')).trim();
      if (!stdin) {
        timer.end({ status: 'skip', note: 'empty-input', message: 'Skipped: empty stdin input' });
        return 0;
      }
      const payload = loadPayloadHarness(stdin);
      try {
        trackSession(payload, trackingDependencies);
      } catch (error) {
        logHookCrash('session-tracker', error, { event: 'UserPromptSubmit' });
      }
      if (wasRecentlyInjected(payload.transcriptPath)) {
        timer.end({ status: 'skip', note: 'recently-injected', message: 'Skipped: context already injected in recent session' });
        return 0;
      }
      const { content } = buildSpeckitContext({ cwd: process.cwd() });
      console.log(content);
      timer.end({ status: 'ok', note: 'context-injected', message: 'Speckit context built and injected successfully', content: content });
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
