import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { FlatClaudeHooksRecord } from '../src/flat-claude-types';
import { OMP_EVENT_BY_CLAUDE_HOOK_EVENT } from '../src/lib/harness-transform/claude-hook-bridge';
import { emitOmpHookFiles } from '../src/omp-hook-emitter';
import { makeConsumer } from './fixtures';

function writeFile(root: string, relativePath: string, content: string): string {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf-8');
  return target;
}

function hooksRecord(root: string, hooksByEvent: FlatClaudeHooksRecord['hooksByEvent']): FlatClaudeHooksRecord {
  const sourcePath = writeFile(root, '.claude/settings.json', JSON.stringify({ hooks: hooksByEvent }, null, 2));
  return {
    kind: 'hooks',
    sourcePath,
    sourceRelativePath: '.claude/settings.json',
    hooksByEvent,
    files: [],
  };
}

describe('OMP hook emitter', () => {
  test('emits discoverable native adapters for every supported event without changing source', async () => {
    const consumer = makeConsumer('tdk-omp-hook-emitter-events-');
    const hooksByEvent = Object.fromEntries(Object.keys(OMP_EVENT_BY_CLAUDE_HOOK_EVENT).map((event) => [
      event,
      [{
        command: `node ".claude/hooks/${event}.cjs"`,
        matcher: event === 'PreToolUse' ? 'Bash|Read' : '*',
        timeout: 7,
      }],
    ]));
    const record = hooksRecord(consumer.root, hooksByEvent);
    const sourceBefore = fs.readFileSync(record.sourcePath);

    const result = emitOmpHookFiles(record, 'win32');

    expect(result.files).toHaveLength(8);
    expect(new Set(result.files.map((file) => file.targetRelativePath)).size).toBe(8);
    expect(result.files.every((file) => file.targetRelativePath.startsWith('.omp/hooks/pre/'))).toBe(true);
    expect(result.files.every((file) => path.posix.dirname(file.targetRelativePath) === '.omp/hooks/pre')).toBe(true);
    for (const [claudeEvent, ompEvent] of Object.entries(OMP_EVENT_BY_CLAUDE_HOOK_EVENT)) {
      const bridge = result.files.find((file) => path.posix.basename(file.targetRelativePath).startsWith(`${claudeEvent.toLowerCase()}-`));
      if (!bridge) throw new Error(`Missing emitted ${claudeEvent} hook`);
      const target = writeFile(consumer.root, bridge.targetRelativePath, bridge.content.toString('utf8'));
      // The generated module path exists only after this test emits its consumer.
      const generated = await import(pathToFileURL(target).href);
      let registeredEvent = '';
      generated.default({ on(event: string) { registeredEvent = event; } });
      expect(registeredEvent).toBe(ompEvent);
    }
    expect(fs.readFileSync(record.sourcePath)).toEqual(sourceBefore);
  });

  test('uses deterministic unique filenames for multiple commands under one matcher', () => {
    const consumer = makeConsumer('tdk-omp-hook-emitter-names-');
    const record = hooksRecord(consumer.root, {
      PreToolUse: [
        { command: 'node ".claude/hooks/first.cjs"', matcher: 'Bash' },
        { command: 'node ".claude/hooks/second.cjs"', matcher: 'Bash' },
      ],
    });

    const first = emitOmpHookFiles(record, 'linux');
    const second = emitOmpHookFiles(record, 'win32');

    expect(first.files.map((file) => file.targetRelativePath)).toEqual([
      '.omp/hooks/pre/pretooluse-bash-001.ts',
      '.omp/hooks/pre/pretooluse-bash-002.ts',
    ]);
    expect(second.files.map((file) => file.content)).toEqual(first.files.map((file) => file.content));
  });

  test('reports lifecycle matchers that OMP payloads cannot evaluate', () => {
    const consumer = makeConsumer('tdk-omp-hook-emitter-lifecycle-matchers-');
    const record = hooksRecord(consumer.root, {
      SessionStart: [{ command: 'node start.cjs', matcher: 'resume' }],
      PreCompact: [{ command: 'node compact.cjs', matcher: 'manual' }],
    });

    const result = emitOmpHookFiles(record, 'linux');
    const messages = result.facts.map((fact) => fact.message).join('\n');

    expect(messages).toContain('SessionStart matchers cannot be evaluated');
    expect(messages).toContain('PreCompact matchers cannot be evaluated');
    expect(messages).toContain('run for every such OMP event');
  });

  test('rejects unknown Claude events before emitting partial output', () => {
    const consumer = makeConsumer('tdk-omp-hook-emitter-unknown-');
    const record = hooksRecord(consumer.root, {
      PreToolUse: [{ command: 'node ok.cjs' }],
      FutureEvent: [{ command: 'node future.cjs' }],
    });

    expect(() => emitOmpHookFiles(record, 'win32')).toThrow();
  });
});
