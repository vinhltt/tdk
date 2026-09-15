import * as path from 'node:path';

export type HookTargetPlatform = 'win32' | 'linux' | 'darwin';

export type HookArgumentPart =
  | { kind: 'literal'; value: string }
  | { kind: 'project-root' };

export type HookArgument = readonly HookArgumentPart[];

export type HookExecution =
  | { kind: 'node'; script: HookArgument; args: readonly HookArgument[] }
  | { kind: 'posix-shell'; command: string };

interface ParsedWord {
  parts: HookArgumentPart[];
  started: boolean;
}

interface ParsedCommand {
  words: ParsedWord[];
  shellRequired: boolean;
}

const PROJECT_ROOT_CD_PREFIX = 'cd "$CLAUDE_PROJECT_DIR" && ';
const INVALID_COMMAND_MESSAGE = 'Invalid hook command';
const INVALID_PLATFORM_MESSAGE = 'Invalid hook target platform';

function invalidHookCommand(): never {
  throw new Error(INVALID_COMMAND_MESSAGE);
}

function appendLiteral(word: ParsedWord, value: string): void {
  if (value === '') return;
  const previous = word.parts.at(-1);
  if (previous?.kind === 'literal') {
    previous.value += value;
    return;
  }
  word.parts.push({ kind: 'literal', value });
}


function finishWord(words: ParsedWord[], word: ParsedWord): ParsedWord {
  if (!word.started) return word;
  if (word.parts.length === 0) word.parts.push({ kind: 'literal', value: '' });
  words.push(word);
  return { parts: [], started: false };
}

function isUnquotedShellSyntax(character: string, word: ParsedWord): boolean {
  if ('&|;<>()*?[]{}'.includes(character)) return true;
  if (character === '#' || character === '~') return !word.started;
  return false;
}

function tokenize(command: string): ParsedCommand {
  if (/[\0\r\n]/.test(command)) invalidHookCommand();

  const words: ParsedWord[] = [];
  let word: ParsedWord = { parts: [], started: false };
  let state: 'unquoted' | 'single-quoted' | 'double-quoted' = 'unquoted';
  let shellRequired = false;

  for (let index = 0; index < command.length; index += 1) {
    const character = command[index]!;

    if (state === 'single-quoted') {
      if (character === "'") {
        state = 'unquoted';
      } else {
        appendLiteral(word, character);
      }
      continue;
    }

    if (state === 'double-quoted') {
      if (character === '"') {
        state = 'unquoted';
        continue;
      }
      if (character === '\\') {
        const next = command[index + 1];
        if (next === undefined) invalidHookCommand();
        if (next === '$' || next === '`' || next === '"' || next === '\\') {
          appendLiteral(word, next);
          index += 1;
        } else {
          appendLiteral(word, '\\');
        }
        continue;
      }
      if (character === '$') {
        const next = command[index + 1];
        if (next === '{') {
          const rootVariable = '${CLAUDE_PROJECT_DIR}';
          if (command.startsWith(rootVariable, index)) {
            word.parts.push({ kind: 'project-root' });
            index += rootVariable.length - 1;
          } else {
            shellRequired = true;
            appendLiteral(word, character);
          }
          continue;
        }
        if (next && /[A-Za-z_]/.test(next)) {
          let end = index + 2;
          while (end < command.length && /[A-Za-z0-9_]/.test(command[end]!)) end += 1;
          const name = command.slice(index + 1, end);
          if (name === 'CLAUDE_PROJECT_DIR') {
            word.parts.push({ kind: 'project-root' });
          } else {
            shellRequired = true;
            appendLiteral(word, `$${name}`);
          }
          index = end - 1;
          continue;
        }
        shellRequired = true;
        appendLiteral(word, character);
        continue;
      }
      if (character === '`') shellRequired = true;
      appendLiteral(word, character);
      continue;
    }

    if (character === ' ' || character === '\t') {
      word = finishWord(words, word);
      continue;
    }
    if ('&|;<>()'.includes(character)) {
      shellRequired = true;
      word = finishWord(words, word);
      continue;
    }
    if (character === '#' && !word.started) {
      shellRequired = true;
      break;
    }
    if (character === "'") {
      word.started = true;
      state = 'single-quoted';
      continue;
    }
    if (character === '"') {
      word.started = true;
      state = 'double-quoted';
      continue;
    }
    if (character === '\\') {
      const next = command[index + 1];
      if (next === undefined) invalidHookCommand();
      word.started = true;
      appendLiteral(word, next);
      index += 1;
      continue;
    }
    if (character === '$' || character === '`' || isUnquotedShellSyntax(character, word)) {
      shellRequired = true;
    }
    word.started = true;
    appendLiteral(word, character);
  }

  if (state !== 'unquoted') invalidHookCommand();
  finishWord(words, word);
  return { words, shellRequired };
}

function literalValue(word: ParsedWord): string | undefined {
  const part = word.parts[0];
  return word.parts.length === 1 && part?.kind === 'literal' ? part.value : undefined;
}

function isSafeRelativeScriptPath(value: string): boolean {
  const segments = value.split('/');
  return value.length > 0
    && !value.startsWith('-')
    && !value.includes('\\')
    && !path.posix.isAbsolute(value)
    && !path.win32.isAbsolute(value)
    && !/^[A-Za-z]:/.test(value)
    && !segments.some((segment) => segment === '' || segment === '.' || segment === '..')
    && path.posix.normalize(value) === value;
}

function isSafeScript(script: HookArgument): boolean {
  const rootIndexes = script.flatMap((part, index) => part.kind === 'project-root' ? [index] : []);
  if (rootIndexes.length === 0) {
    const value = script.map((part) => part.kind === 'literal' ? part.value : '').join('');
    return isSafeRelativeScriptPath(value);
  }
  if (rootIndexes.length !== 1 || rootIndexes[0] !== 0) return false;

  const tail = script.slice(1);
  if (tail.some((part) => part.kind !== 'literal')) return false;
  const rootRelativePath = tail.map((part) => part.kind === 'literal' ? part.value : '').join('');
  return rootRelativePath.startsWith('/') && isSafeRelativeScriptPath(rootRelativePath.slice(1));
}

export function classifyHookCommand(command: string): HookExecution {
  const parsed = tokenize(
    command.startsWith(PROJECT_ROOT_CD_PREFIX)
      ? command.slice(PROJECT_ROOT_CD_PREFIX.length)
      : command,
  );
  if (parsed.shellRequired || parsed.words.length < 2 || literalValue(parsed.words[0]!) !== 'node') {
    return { kind: 'posix-shell', command };
  }

  const script = parsed.words[1]!.parts;
  if (!isSafeScript(script)) return { kind: 'posix-shell', command };

  return {
    kind: 'node',
    script,
    args: parsed.words.slice(2).map((word) => word.parts),
  };
}

export function isHookTargetPlatform(value: unknown): value is HookTargetPlatform {
  return value === 'win32' || value === 'linux' || value === 'darwin';
}

export function resolveHookTargetPlatform(
  explicit: string | undefined,
  saved: HookTargetPlatform | undefined,
  host: string = process.platform,
): { platform: HookTargetPlatform; source: 'explicit' | 'saved' | 'host-default' } {
  if (explicit !== undefined) {
    if (!isHookTargetPlatform(explicit)) throw new Error(INVALID_PLATFORM_MESSAGE);
    return { platform: explicit, source: 'explicit' };
  }
  if (saved !== undefined) {
    if (!isHookTargetPlatform(saved)) throw new Error(INVALID_PLATFORM_MESSAGE);
    return { platform: saved, source: 'saved' };
  }
  if (!isHookTargetPlatform(host)) throw new Error(INVALID_PLATFORM_MESSAGE);
  return { platform: host, source: 'host-default' };
}
