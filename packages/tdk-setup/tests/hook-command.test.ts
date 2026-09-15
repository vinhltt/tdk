import { describe, expect, test } from 'bun:test';
import {
  classifyHookCommand,
  isHookTargetPlatform,
  resolveHookTargetPlatform,
  type HookExecution,
  type HookTargetPlatform,
} from '../src/lib/harness-transform/hook-command';

describe('hook command classification', () => {
  test('classifies every known portable hook command form as direct Node argv', () => {
    const cases: readonly [string, HookExecution][] = [
      [
        'node "${CLAUDE_PROJECT_DIR}/.claude/hooks/neutral-core/hooks/hook-gateway.cjs" hook-name',
        {
          kind: 'node',
          script: [
            { kind: 'project-root' },
            { kind: 'literal', value: '/.claude/hooks/neutral-core/hooks/hook-gateway.cjs' },
          ],
          args: [[{ kind: 'literal', value: 'hook-name' }]],
        },
      ],
      [
        'cd "$CLAUDE_PROJECT_DIR" && node "${CLAUDE_PROJECT_DIR}/.claude/hooks/neutral-core/hooks/hook-gateway.cjs" hook-name',
        {
          kind: 'node',
          script: [
            { kind: 'project-root' },
            { kind: 'literal', value: '/.claude/hooks/neutral-core/hooks/hook-gateway.cjs' },
          ],
          args: [[{ kind: 'literal', value: 'hook-name' }]],
        },
      ],
      [
        'node "$CLAUDE_PROJECT_DIR/.claude/hooks/privacy-block.cjs"',
        {
          kind: 'node',
          script: [
            { kind: 'project-root' },
            { kind: 'literal', value: '/.claude/hooks/privacy-block.cjs' },
          ],
          args: [],
        },
      ],
      [
        'node ".claude/hooks/probe.cjs" "literal with space" ""',
        {
          kind: 'node',
          script: [{ kind: 'literal', value: '.claude/hooks/probe.cjs' }],
          args: [
            [{ kind: 'literal', value: 'literal with space' }],
            [{ kind: 'literal', value: '' }],
          ],
        },
      ],
    ];

    for (const [command, expected] of cases) {
      expect(classifyHookCommand(command)).toEqual(expected);
    }
  });

  test('preserves quoted literals, escaped dollars, and escaped whitespace without shell re-expansion', () => {
    expect(classifyHookCommand('node hook.cjs \'literal $HOME\' \'a&b\' "\\$CLAUDE_PROJECT_DIR" a\\ b')).toEqual({
      kind: 'node',
      script: [{ kind: 'literal', value: 'hook.cjs' }],
      args: [
        [{ kind: 'literal', value: 'literal $HOME' }],
        [{ kind: 'literal', value: 'a&b' }],
        [{ kind: 'literal', value: '$CLAUDE_PROJECT_DIR' }],
        [{ kind: 'literal', value: 'a b' }],
      ],
    });
    expect(classifyHookCommand(String.raw`node hook.cjs "a\qb"`)).toEqual({
      kind: 'node',
      script: [{ kind: 'literal', value: 'hook.cjs' }],
      args: [[{ kind: 'literal', value: 'a\\qb' }]],
    });
  });

  test('concatenates adjacent segments and retains an empty quoted argument', () => {
    expect(classifyHookCommand('node "${CLAUDE_PROJECT_DIR}"\'/.claude/hooks/probe.cjs\' foo" bar"\'baz\' ""')).toEqual({
      kind: 'node',
      script: [
        { kind: 'project-root' },
        { kind: 'literal', value: '/.claude/hooks/probe.cjs' },
      ],
      args: [
        [{ kind: 'literal', value: 'foo barbaz' }],
        [{ kind: 'literal', value: '' }],
      ],
    });
  });

  test('keeps shell-dependent commands in the POSIX shell path', () => {
    const commands = [
      'node "$UNKNOWN_ROOT/hook.cjs"',
      'node $CLAUDE_PROJECT_DIR/hook.cjs',
      'node "$(printf hook.cjs)"',
      'node `printf hook.cjs`',
      'node hook.cjs | cat',
      'node hook.cjs > output.txt',
      'NODE_ENV=test node hook.cjs',
      'cd "$CLAUDE_PROJECT_DIR/subdir" && node hook.cjs',
      'node -e "process.exit()"',
      'node --inspect hook.cjs',
      'node "/tmp/hook.cjs"',
      String.raw`node "C:\hooks\hook.cjs"`,
      'node .claude/../hook.cjs',
    ];

    for (const command of commands) {
      expect(classifyHookCommand(command)).toEqual({ kind: 'posix-shell', command });
    }
  });

  test('preserves valid shell comments without parsing quotes inside them', () => {
    const command = 'node hook.cjs # user\'s "unfinished quote is comment text';
    expect(classifyHookCommand(command)).toEqual({ kind: 'posix-shell', command });
    const operatorComment = 'node hook.cjs;# user\'s hook';
    expect(classifyHookCommand(operatorComment)).toEqual({ kind: 'posix-shell', command: operatorComment });
    expect(classifyHookCommand('node hook.cjs word#suffix "\\#"')).toEqual({
      kind: 'node',
      script: [{ kind: 'literal', value: 'hook.cjs' }],
      args: [[{ kind: 'literal', value: 'word#suffix' }], [{ kind: 'literal', value: '\\#' }]],
    });
  });

  test('checks decoded script values so escaped options, absolute paths, and traversal cannot become direct argv', () => {
    const commands = [
      String.raw`node \-e "process.exit()"`,
      String.raw`node \/tmp/hook.cjs`,
      String.raw`node .claude/\../hook.cjs`,
      'node "${CLAUDE_PROJECT_DIR}/.claude/../hook.cjs"',
    ];

    for (const command of commands) {
      expect(classifyHookCommand(command)).toEqual({ kind: 'posix-shell', command });
    }
  });

  test('rejects malformed commands without returning their contents in the error', () => {
    const commands = [
      'node "unterminated-hook.cjs',
      'node hook.cjs \\',
      'node hook.cjs\n',
      'node hook.cjs\0',
    ];

    for (const command of commands) {
      let thrown: unknown;
      try {
        classifyHookCommand(command);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(Error);
      expect((thrown as Error).message).not.toContain('hook.cjs');
    }
  });
});

describe('hook target platform policy', () => {
  test('recognizes only supported target platforms', () => {
    expect(isHookTargetPlatform('win32')).toBe(true);
    expect(isHookTargetPlatform('linux')).toBe(true);
    expect(isHookTargetPlatform('darwin')).toBe(true);
    expect(isHookTargetPlatform('freebsd')).toBe(false);
    expect(isHookTargetPlatform(undefined)).toBe(false);
  });

  test('resolves explicit target before saved target and host default', () => {
    expect(resolveHookTargetPlatform('win32', 'linux', 'darwin')).toEqual({ platform: 'win32', source: 'explicit' });
    expect(resolveHookTargetPlatform(undefined, 'linux', 'darwin')).toEqual({ platform: 'linux', source: 'saved' });
    expect(resolveHookTargetPlatform(undefined, undefined, 'darwin')).toEqual({ platform: 'darwin', source: 'host-default' });
  });

  test('rejects unsupported explicit, persisted, and host targets', () => {
    expect(() => resolveHookTargetPlatform('freebsd', undefined, 'linux')).toThrow(Error);
    expect(() => resolveHookTargetPlatform(undefined, 'freebsd' as HookTargetPlatform, 'linux')).toThrow(Error);
    expect(() => resolveHookTargetPlatform(undefined, undefined, 'freebsd')).toThrow(Error);
  });
});
