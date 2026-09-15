import { sha256Buffer, sha256File } from './checksum';
import type {
  ConvertTargetFile,
  FlatClaudeHooksRecord,
  MigrationFact,
} from './flat-claude-types';
import {
  buildClaudeHookBridge,
  OMP_EVENT_BY_CLAUDE_HOOK_EVENT,
  type SupportedClaudeHookEvent,
} from './lib/harness-transform/claude-hook-bridge';
import { classifyHookCommand, type HookTargetPlatform } from './lib/harness-transform/hook-command';
import { ompTargetRelativePath } from './omp-target-mapper';

export interface OmpHookEmitResult {
  files: ConvertTargetFile[];
  warnings: string[];
  facts: MigrationFact[];
}

function isSupportedEvent(event: string): event is SupportedClaudeHookEvent {
  return Object.hasOwn(OMP_EVENT_BY_CLAUDE_HOOK_EVENT, event);
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'all';
}

function degradationFact(event: SupportedClaudeHookEvent, source: string): MigrationFact | undefined {
  const messageByEvent: Partial<Record<SupportedClaudeHookEvent, string>> = {
    Stop: 'Stop hooks run on terminal OMP agent_end events for main sessions only, but cannot block or continue stopping.',
    UserPromptSubmit: 'UserPromptSubmit hooks can inject context in OMP, but cannot block or rewrite the prompt.',
    SubagentStart: 'SubagentStart runs only for mechanically detected OMP child sessions, without agent_id or agent_type matcher data.',
    SubagentStop: 'SubagentStop runs only for mechanically detected OMP child sessions, without subagent-specific payload, agent matcher data, or stop blocking.',
  };
  const message = messageByEvent[event];
  if (!message) return undefined;
  return {
    layer: 1,
    status: 'note',
    source,
    key: `hooks.${event}`,
    message,
  };
}

export function emitOmpHookFiles(record: FlatClaudeHooksRecord | undefined, targetPlatform: HookTargetPlatform): OmpHookEmitResult {
  if (!record) return { files: [], warnings: [], facts: [] };

  const unsupportedEvents = Object.keys(record.hooksByEvent).filter((event) => !isSupportedEvent(event));
  if (unsupportedEvents.length > 0) {
    throw new Error(
      `Unsupported Claude hook events for OMP conversion:\n${unsupportedEvents.sort().map((event) => `- ${event}`).join('\n')}`,
    );
  }

  const files: ConvertTargetFile[] = [];
  const facts: MigrationFact[] = [];
  const errors: string[] = [];
  const sourceChecksum = sha256File(record.sourcePath);
  const events = Object.entries(record.hooksByEvent).sort(([left], [right]) => left.localeCompare(right));

  for (const [eventName, hooks] of events) {
    const event = eventName as SupportedClaudeHookEvent;
    hooks.forEach((hook, index) => {
      const identity = `${event}:${index + 1}`;
      if (Object.hasOwn(hook, 'args') || Object.hasOwn(hook, 'shell')) {
        errors.push(`${identity} unsupported-exec-metadata`);
        return;
      }
      let execution;
      try {
        execution = classifyHookCommand(hook.command);
      } catch {
        errors.push(`${identity} malformed-command`);
        return;
      }
      if (execution.kind === 'posix-shell') {
        if (targetPlatform === 'win32') {
          errors.push(`${identity} unsupported-platform: POSIX shell required`);
          return;
        }
        facts.push({
          layer: 1,
          status: 'note',
          source: record.sourceRelativePath,
          key: `hooks.${identity}`,
          message: `${identity} is POSIX-only and uses /bin/sh.`,
        });
      }
      const bridge = Buffer.from(buildClaudeHookBridge({
        event,
        execution,
        identity,
        matcher: hook.matcher,
        timeoutSeconds: hook.timeout,
      }), 'utf-8');
      const filename = `${slug(event)}-${slug(hook.matcher ?? 'all')}-${String(index + 1).padStart(3, '0')}.ts`;
      files.push({
        sourcePath: record.sourcePath,
        sourceRelativePath: record.sourceRelativePath,
        targetRelativePath: ompTargetRelativePath('hooks', filename),
        sourceChecksum,
        installedChecksum: sha256Buffer(bridge),
        content: bridge,
        part: 'hooks',
      });
    });

    if (hooks.length > 0) {
      facts.push({
        layer: 1,
        status: 'converted',
        source: record.sourceRelativePath,
        key: `hooks.${event}`,
        message: `Mapped ${hooks.length} ${event} hook command${hooks.length === 1 ? '' : 's'} to OMP ${OMP_EVENT_BY_CLAUDE_HOOK_EVENT[event]}.`,
      });
      const degradation = degradationFact(event, record.sourceRelativePath);
      if (degradation) facts.push(degradation);
      if (
        (event === 'SessionStart' || event === 'PreCompact')
        && hooks.some((hook) => hook.matcher !== undefined && hook.matcher.trim() !== '' && hook.matcher.trim() !== '*')
      ) {
        facts.push({
          layer: 1,
          status: 'note',
          source: record.sourceRelativePath,
          key: `hooks.${event}.matcher`,
          message: `${event} matchers cannot be evaluated from the OMP ${OMP_EVENT_BY_CLAUDE_HOOK_EVENT[event]} payload; matching entries run for every such OMP event.`,
        });
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Unsupported OMP hook commands:\n${errors.map((error) => `- ${error}`).join('\n')}`);
  }

  files.sort((left, right) => left.targetRelativePath.localeCompare(right.targetRelativePath));
  return { files, warnings: [], facts };
}
