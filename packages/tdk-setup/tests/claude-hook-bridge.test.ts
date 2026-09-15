import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  buildClaudeHookBridge,
  OMP_EVENT_BY_CLAUDE_HOOK_EVENT,
} from '../src/lib/harness-transform/claude-hook-bridge';
import type { ClaudeHookBridgeSpec } from '../src/lib/harness-transform/claude-hook-bridge';
import { classifyHookCommand } from '../src/lib/harness-transform/hook-command';
import { makeConsumer } from './fixtures';

type RegisteredHandler = (event: Record<string, unknown>, context: Record<string, unknown>) => Promise<unknown>;

function writeFile(root: string, relativePath: string, content: string): string {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf-8');
  return target;
}

async function loadBridge(
  spec: { event: ClaudeHookBridgeSpec['event']; command: string; matcher?: string; timeoutSeconds?: number },
  root: string,
) {
  const target = writeFile(root, `.omp/hooks/pre/${spec.event}-${Math.random().toString(16).slice(2)}.ts`, buildClaudeHookBridge({
    event: spec.event,
    execution: classifyHookCommand(spec.command),
    identity: `${spec.event}:1`,
    matcher: spec.matcher,
    timeoutSeconds: spec.timeoutSeconds,
  }));
  let registeredEvent = '';
  let handler: RegisteredHandler | undefined;
  const messages: string[] = [];
  const warnings: string[] = [];
  // The generated path is runtime-selected; this test intentionally exercises Bun's hook-module loading boundary.
  const module = await import(`${pathToFileURL(target).href}?test=${Date.now()}-${Math.random()}`);
  module.default({
    on(event: string, callback: RegisteredHandler) {
      registeredEvent = event;
      handler = callback;
    },
    sendMessage(message: string) {
      messages.push(message);
    },
    logger: {
      warn(message: string) {
        warnings.push(message);
      },
    },
  });
  if (!handler) throw new Error('Generated bridge did not register a handler.');
  return { handler, messages, registeredEvent, warnings };
}

const HEARTBEAT_FILE = 'heartbeat.txt';
const HEARTBEAT_SOURCE = [
  "const fs = require('node:fs');",
  `setInterval(() => fs.appendFileSync('${HEARTBEAT_FILE}', 'x'), 10);`,
  '',
].join('\n');

function heartbeatSize(file: string): number {
  return fs.existsSync(file) ? fs.statSync(file).size : 0;
}

/** A timed-out hook must be dead, not merely abandoned: its heartbeat has to stop growing. */
async function expectHookProcessStopped(file: string): Promise<void> {
  await Bun.sleep(300);
  const settled = heartbeatSize(file);
  await Bun.sleep(300);
  expect(heartbeatSize(file)).toBe(settled);
}

function hookContext(
  root: string,
  sessionFile = '/tmp/omp-session-5.jsonl',
  sessionDir = path.dirname(sessionFile),
) {
  return {
    cwd: root,
    sessionManager: {
      getSessionDir: () => sessionDir,
      getSessionId: () => 'omp-session-5',
      getSessionFile: () => sessionFile,
    },
  };
}

  test('preserves project-root Unicode, literal argv and JSON stdin without shell evaluation', async () => {
    const consumer = makeConsumer('tdk-bridge Đ space & (literal)-');
    writeFile(consumer.root, '.claude/hooks/argv.cjs', [
      "const fs = require('node:fs');",
      "const payload = JSON.parse(fs.readFileSync(0, 'utf8'));",
      "fs.writeFileSync('observed.json', JSON.stringify({argv: process.argv.slice(2), cwd: process.cwd(), payload}));",
      "process.stdout.write('context delivered');",
    ].join('\n'));
    const bridge = await loadBridge({
      event: 'UserPromptSubmit',
      command: [
        'cd "$CLAUDE_PROJECT_DIR" && node "${CLAUDE_PROJECT_DIR}/.claude/hooks/argv.cjs"',
        '""', '"a&b"', "'literal $HOME'", "'$(touch shell-sentinel)'", '"Tiếng Việt"',
      ].join(' '),
    }, consumer.root);
    const prompt = 'private $(touch prompt-sentinel) "quotes" \n next line';
    expect(await bridge.handler({ type: 'before_agent_start', prompt }, hookContext(consumer.root)))
      .toEqual({ message: 'context delivered' });
    const observed = JSON.parse(fs.readFileSync(path.join(consumer.root, 'observed.json'), 'utf8'));
    expect(observed.argv).toEqual(['', 'a&b', 'literal $HOME', '$(touch shell-sentinel)', 'Tiếng Việt']);
    expect(observed.cwd).toBe(consumer.root);
    expect(observed.payload.prompt).toBe(prompt);
    expect(fs.existsSync(path.join(consumer.root, 'shell-sentinel'))).toBe(false);
    expect(fs.existsSync(path.join(consumer.root, 'prompt-sentinel'))).toBe(false);
  });

  // Fake clocks cannot drive OS process signals or observe a surviving descendant's heartbeat.
  test.each(['timeout', 'parent-first', 'overflow'])('terminates owned descendants for %s', async (mode) => {
    const consumer = makeConsumer(`tdk-bridge-tree-${mode}-`);
    const heartbeat = path.join(consumer.root, 'tree-heartbeat');
    writeFile(consumer.root, '.claude/hooks/leaf.cjs', [
      "const fs = require('node:fs');",
      "process.on('SIGTERM', () => {});",
      "setInterval(() => fs.appendFileSync('tree-heartbeat', 'x'), 20);",
      'setTimeout(() => process.exit(0), 10000);',
    ].join('\n'));
    writeFile(consumer.root, '.claude/hooks/tree.cjs', [
      "const fs = require('node:fs');",
      "const {spawn} = require('node:child_process');",
      "const child = spawn('node', ['.claude/hooks/leaf.cjs'], {shell:false, stdio:['ignore','inherit','inherit']});",
      "process.on('SIGTERM', () => { process.stdout.write('{\"decision\":\"block\"}'); process.exit(2); });",
      'const interval = setInterval(() => {',
      "  if (!fs.existsSync('tree-heartbeat') || fs.statSync('tree-heartbeat').size < 3) return;",
      '  clearInterval(interval);',
      mode === 'parent-first' ? '  child.unref(); process.exit(0);' : '',
      mode === 'overflow' ? "  setInterval(() => process.stdout.write(Buffer.alloc(65536, 'x')), 1);" : '',
      '}, 10);',
      'setTimeout(() => process.exit(0), 10000);',
    ].join('\n'));
    const bridge = await loadBridge({
      event: 'PreToolUse',
      command: 'node ".claude/hooks/tree.cjs"',
      timeoutSeconds: 1.5,
    }, consumer.root);
    expect(await bridge.handler({ type: 'tool_call', toolName: 'bash', input: {} }, hookContext(consumer.root))).toBeUndefined();
    if (mode !== 'parent-first' || process.platform !== 'win32') {
      expect(bridge.warnings.join('\n')).toContain(`category=${mode === 'overflow' ? 'output-limit' : 'timeout'}`);
      expect(bridge.warnings.join('\n')).toContain('cleanupFailed=false');
    }
    expect(heartbeatSize(heartbeat)).toBeGreaterThanOrEqual(3);
    await expectHookProcessStopped(heartbeat);
  }, 10000);

  test.each(['invalid-json', 'nonzero'])('redacts private data from %s diagnostics', async (category) => {
    const consumer = makeConsumer('tdk-bridge-private-');
    const secret = 'PRIVATE_PAYLOAD_SENTINEL_165';
    writeFile(consumer.root, '.claude/hooks/private.cjs', [
      "const fs = require('node:fs');",
      "const payload = JSON.parse(fs.readFileSync(0, 'utf8'));",
      "process.stderr.write(payload.prompt);",
      category === 'invalid-json'
        ? "process.stdout.write('{ invalid ' + payload.prompt);"
        : "process.stdout.write('{\"decision\":\"block\"}'); process.exit(1);",
    ].join('\n'));
    const bridge = await loadBridge({
      event: 'UserPromptSubmit',
      command: `node ".claude/hooks/private.cjs" "${secret}"`,
    }, consumer.root);
    expect(await bridge.handler({ type: 'before_agent_start', prompt: secret }, hookContext(consumer.root))).toBeUndefined();
    expect(bridge.warnings.join('\n')).toContain(`category=${category}`);
    expect(bridge.warnings.join('\n')).toContain('UserPromptSubmit:1');
    expect(bridge.warnings.join('\n')).not.toContain(secret);
    expect(bridge.warnings.join('\n')).not.toContain(consumer.root);
    expect(bridge.warnings.every((warning) => warning.length <= 512)).toBe(true);
  });

describe('Claude hook bridge', () => {
  test('loads every supported generated bridge and registers the lifecycle adapter event', async () => {
    for (const [claudeEvent, ompEvent] of Object.entries(OMP_EVENT_BY_CLAUDE_HOOK_EVENT)) {
      const consumer = makeConsumer(`tdk-omp-hook-bridge-load-${claudeEvent}-`);
      const bridge = await loadBridge({
        event: claudeEvent as ClaudeHookBridgeSpec['event'],
        command: 'node -e ""',
      }, consumer.root);
      expect(bridge.registeredEvent).toBe(ompEvent);
    }
  });

  test('launches direct Node with the dual payload and maps exit 2 to a tool block', async () => {
    const consumer = makeConsumer('tdk-omp-hook-bridge-payload-');
    writeFile(consumer.root, '.claude/hooks/probe.cjs', [
      "const fs = require('node:fs');",
      "const payload = JSON.parse(fs.readFileSync(0, 'utf-8'));",
      "fs.writeFileSync('.omp/probe.json', JSON.stringify({ payload, cwd: process.cwd(), env: { project: process.env.CLAUDE_PROJECT_DIR, session: process.env.CLAUDE_SESSION_ID, harness: process.env.TDK_HARNESS } }));",
      "process.stderr.write('blocked by source hook');",
      'process.exit(2);',
    ].join('\n'));
    const bridge = await loadBridge({
      event: 'PreToolUse',
      command: 'node ".claude/hooks/probe.cjs"',
      matcher: 'Bash',
      timeoutSeconds: 1,
    }, consumer.root);

    const result = await bridge.handler({
      type: 'tool_call',
      toolName: 'bash',
      toolCallId: 'tool-5',
      input: { command: 'rm -rf /' },
    }, hookContext(consumer.root));
    const probe = JSON.parse(fs.readFileSync(path.join(consumer.root, '.omp/probe.json'), 'utf-8'));

    expect(bridge.registeredEvent).toBe('tool_call');
    expect(result).toEqual({ block: true, reason: 'blocked by source hook' });
    expect(probe.cwd).toBe(consumer.root);
    expect(probe.env).toEqual({ project: consumer.root, session: 'omp-session-5', harness: 'omp' });
    expect(probe.payload).toEqual(expect.objectContaining({
      session_id: 'omp-session-5',
      transcript_path: '/tmp/omp-session-5.jsonl',
      cwd: consumer.root,
      hook_event_name: 'PreToolUse',
      tool_name: 'bash',
      tool_input: { command: 'rm -rf /' },
      tool_use_id: 'tool-5',
      eventName: 'tool_call',
      context: {
        cwd: consumer.root,
        sessionId: 'omp-session-5',
        sessionFile: '/tmp/omp-session-5.jsonl',
      },
    }));
    expect(probe.payload.event).toEqual(expect.objectContaining({ type: 'tool_call', toolName: 'bash' }));
  });

  test('matches lowercase tool names with wildcard, exact lists, and unanchored regex', async () => {
    const cases = [
      { matcher: '*', matching: 'write', skipped: '' },
      { matcher: 'Bash|Read', matching: 'read', skipped: 'write' },
      { matcher: 'Bash, Write', matching: 'bash', skipped: 'read' },
      { matcher: '^\\S+$', matching: 'BASH', skipped: 'with space' },
      { matcher: '^MCP__MEMORY__.*', matching: 'mcp__memory__store', skipped: 'bash' },
    ];

    for (const [index, item] of cases.entries()) {
      const consumer = makeConsumer(`tdk-omp-hook-bridge-matcher-${index}-`);
      writeFile(consumer.root, '.claude/hooks/match.cjs', [
        "const fs = require('node:fs');",
        "fs.appendFileSync('.omp/matches.txt', 'run\\n');",
        "process.stdout.write('{}');",
      ].join('\n'));
      const bridge = await loadBridge({
        event: 'PreToolUse',
        command: 'node ".claude/hooks/match.cjs"',
        matcher: item.matcher,
      }, consumer.root);
      expect(await bridge.handler({ type: 'tool_call', toolName: item.matching, input: {} }, hookContext(consumer.root))).toBeUndefined();
      if (item.skipped) {
        expect(await bridge.handler({ type: 'tool_call', toolName: item.skipped, input: {} }, hookContext(consumer.root))).toBeUndefined();
      }
      expect(bridge.warnings).toEqual([]);
      expect(fs.readFileSync(path.join(consumer.root, '.omp/matches.txt'), 'utf-8')).toBe('run\n');
    }
  });


  test('maps PreToolUse deny and updatedInput outputs to OMP controls', async () => {
    const consumer = makeConsumer('tdk-omp-hook-bridge-pre-output-');
    writeFile(consumer.root, '.claude/hooks/pre.cjs', [
      "const fs = require('node:fs');",
      "const payload = JSON.parse(fs.readFileSync(0, 'utf-8'));",
      "const output = payload.tool_input.mode === 'deny'",
      "  ? { hookSpecificOutput: { permissionDecision: 'deny', permissionDecisionReason: 'policy denied' } }",
      "  : { hookSpecificOutput: { updatedInput: { command: 'echo safe' } } };",
      'process.stdout.write(JSON.stringify(output));',
    ].join('\n'));
    const bridge = await loadBridge({
      event: 'PreToolUse',
      command: 'node ".claude/hooks/pre.cjs"',
      matcher: 'Bash',
    }, consumer.root);

    expect(await bridge.handler(
      { type: 'tool_call', toolName: 'bash', input: { mode: 'deny' } },
      hookContext(consumer.root),
    )).toEqual({ block: true, reason: 'policy denied' });
    expect(await bridge.handler(
      { type: 'tool_call', toolName: 'bash', input: { mode: 'update' } },
      hookContext(consumer.root),
    )).toEqual({ input: { command: 'echo safe' } });
  });

  test('fails open for source errors, timeouts, and invalid JSON', async () => {
    const cases = [
      { name: 'throw', source: "throw new Error('boom');\n", timeoutSeconds: 1 },
      // A real child heartbeat proves timeout cleanup did not merely abandon the process.
      { name: 'timeout', source: HEARTBEAT_SOURCE, timeoutSeconds: 1 },
      { name: 'json', source: "process.stdout.write('{invalid}');\n", timeoutSeconds: 1 },
    ];

    for (const item of cases) {
      const consumer = makeConsumer(`tdk-omp-hook-bridge-${item.name}-`);
      writeFile(consumer.root, `.claude/hooks/${item.name}.cjs`, item.source);
      const bridge = await loadBridge({
        event: 'PreToolUse',
        command: `node ".claude/hooks/${item.name}.cjs"`,
        matcher: '*',
        timeoutSeconds: item.timeoutSeconds,
      }, consumer.root);
      const result = await bridge.handler(
        { type: 'tool_call', toolName: 'bash', input: { command: 'pwd' } },
        hookContext(consumer.root),
      );

      expect(result).toBeUndefined();
      const category = item.name === 'throw' ? 'nonzero' : item.name === 'json' ? 'invalid-json' : 'timeout';
      expect(bridge.warnings.join('\n')).toContain(`category=${category}`);
      if (item.name === 'timeout') {
        expect(heartbeatSize(path.join(consumer.root, HEARTBEAT_FILE))).toBeGreaterThan(0);
        await expectHookProcessStopped(path.join(consumer.root, HEARTBEAT_FILE));
      }
    }
  });

  test('translates supported output channels and reports unsupported blocking semantics', async () => {
    const consumer = makeConsumer('tdk-omp-hook-bridge-output-');
    writeFile(consumer.root, '.claude/hooks/post.cjs', `process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        updatedToolOutput: { stdout: 'redacted' },
        additionalContext: 'generated file',
      },
    }));\n`);
    writeFile(consumer.root, '.claude/hooks/prompt.cjs', "process.stdout.write('prompt context');\n");
    writeFile(consumer.root, '.claude/hooks/start.cjs', `process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: 'session context' },
    }));\n`);
    writeFile(consumer.root, '.claude/hooks/block.cjs', "process.stderr.write('stop'); process.exit(2);\n");
    writeFile(consumer.root, '.claude/hooks/plain-post.cjs', "process.stdout.write('plain post output');\n");
    writeFile(consumer.root, '.claude/hooks/silent-post-block.cjs', 'process.exit(2);\n');

    const post = await loadBridge({ event: 'PostToolUse', command: 'node ".claude/hooks/post.cjs"' }, consumer.root);
    const postResult = await post.handler({
      type: 'tool_result',
      toolName: 'write',
      input: { path: 'x' },
      content: [{ type: 'text', text: 'original' }],
    }, hookContext(consumer.root));
    expect(postResult).toEqual({ content: [
      { type: 'text', text: '{"stdout":"redacted"}' },
      { type: 'text', text: 'generated file' },
    ] });

    const plainPost = await loadBridge({ event: 'PostToolUse', command: 'node ".claude/hooks/plain-post.cjs"' }, consumer.root);
    expect(await plainPost.handler({
      type: 'tool_result',
      toolName: 'write',
      content: [{ type: 'text', text: 'original' }],
    }, hookContext(consumer.root))).toBeUndefined();

    const silentPostBlock = await loadBridge({
      event: 'PostToolUse',
      command: 'node ".claude/hooks/silent-post-block.cjs"',
    }, consumer.root);
    expect(await silentPostBlock.handler({
      type: 'tool_result',
      toolName: 'write',
      content: [{ type: 'text', text: 'original' }],
    }, hookContext(consumer.root))).toBeUndefined();

    const prompt = await loadBridge({ event: 'UserPromptSubmit', command: 'node ".claude/hooks/prompt.cjs"' }, consumer.root);
    expect(await prompt.handler({ type: 'before_agent_start', prompt: 'hello' }, hookContext(consumer.root)))
      .toEqual({ message: 'prompt context' });

    const start = await loadBridge({ event: 'SessionStart', command: 'node ".claude/hooks/start.cjs"' }, consumer.root);
    expect(await start.handler({ type: 'session_start' }, hookContext(consumer.root))).toBeUndefined();
    expect(start.messages).toEqual(['session context']);

    const compact = await loadBridge({ event: 'PreCompact', command: 'node ".claude/hooks/block.cjs"' }, consumer.root);
    expect(await compact.handler({ type: 'session_before_compact' }, hookContext(consumer.root))).toEqual({ cancel: true });

    const stop = await loadBridge({ event: 'Stop', command: 'node ".claude/hooks/block.cjs"' }, consumer.root);
    expect(await stop.handler({ type: 'agent_end', messages: [
      { role: 'assistant', content: [{ type: 'text', text: 'done' }] },
    ] }, hookContext(consumer.root))).toBeUndefined();
    expect(stop.registeredEvent).toBe('agent_end');
  });

  test('runs SubagentStart and SubagentStop only inside mechanically detected child sessions', async () => {
    const consumer = makeConsumer('tdk-omp-hook-bridge-subagent-');
    writeFile(consumer.root, '.claude/hooks/subagent.cjs', [
      "const fs = require('node:fs');",
      "const payload = JSON.parse(fs.readFileSync(0, 'utf-8'));",
      "fs.appendFileSync('.omp/subagent-runs.txt', `${payload.hook_event_name}\\n`);",
    ].join('\n'));
    const parentSessionFile = writeFile(consumer.root, '.omp/sessions/parent.jsonl', '');
    const childSessionFile = writeFile(consumer.root, '.omp/sessions/parent/child.jsonl', '');

    for (const event of ['SubagentStart', 'SubagentStop'] as const) {
      const bridge = await loadBridge({
        event,
        command: 'node ".claude/hooks/subagent.cjs"',
      }, consumer.root);
      const sideEffectPath = path.join(consumer.root, '.omp/subagent-runs.txt');
      const beforeMainEvent = fs.existsSync(sideEffectPath)
        ? fs.readFileSync(sideEffectPath, 'utf-8')
        : '';
      expect(await bridge.handler(
        { type: OMP_EVENT_BY_CLAUDE_HOOK_EVENT[event] },
        hookContext(consumer.root, `${parentSessionFile}.main`),
      )).toBeUndefined();
      expect(fs.existsSync(sideEffectPath) ? fs.readFileSync(sideEffectPath, 'utf-8') : '')
        .toBe(beforeMainEvent);

      expect(await bridge.handler(
        { type: OMP_EVENT_BY_CLAUDE_HOOK_EVENT[event] },
        hookContext(consumer.root, childSessionFile, path.dirname(childSessionFile)),
      )).toBeUndefined();
    }

    const sideEffectPath = path.join(consumer.root, '.omp/subagent-runs.txt');
    const stop = await loadBridge({
      event: 'Stop',
      command: 'node ".claude/hooks/subagent.cjs"',
    }, consumer.root);
    const beforeChildStop = fs.readFileSync(sideEffectPath, 'utf-8');
    expect(await stop.handler(
      { type: 'agent_end', messages: [] },
      hookContext(consumer.root, childSessionFile, path.dirname(childSessionFile)),
    ))
      .toBeUndefined();
    expect(fs.readFileSync(sideEffectPath, 'utf-8')).toBe(beforeChildStop);
    const beforeMainContinuation = fs.readFileSync(sideEffectPath, 'utf-8');
    expect(await stop.handler(
      { type: 'agent_end', messages: [], willContinue: true },
      hookContext(consumer.root, `${parentSessionFile}.main`),
    )).toBeUndefined();
    expect(fs.readFileSync(sideEffectPath, 'utf-8')).toBe(beforeMainContinuation);
    expect(await stop.handler(
      { type: 'agent_end', messages: [] },
      hookContext(consumer.root, `${parentSessionFile}.main`),
    )).toBeUndefined();

    expect(fs.readFileSync(path.join(consumer.root, '.omp/subagent-runs.txt'), 'utf-8'))
      .toBe('SubagentStart\nSubagentStop\nStop\n');
  });
});
