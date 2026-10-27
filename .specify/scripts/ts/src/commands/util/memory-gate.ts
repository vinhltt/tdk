import { existsSync, lstatSync, readFileSync, statSync, type Stats } from 'node:fs';
import { readFile, realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { parse } from 'yaml';
import { realpathOrSelf } from '../../utils/config';
import { runGit } from '../../utils/git-env';

export type GateState = 'clear' | 'review' | 'block-impl' | 'not-checked';
export interface GateResult { state: GateState; reason: string }
export interface Preconditions {
  initialized: boolean;
  coverage: number | null;
  fast: boolean;
  specPresent: boolean;
  decision?: string;
  impactCount: number | null;
  answer?: 'validate' | 'skip';
  interactive: boolean;
}

/** Ordering is part of the public gate contract; unknown coverage is not zero. */
export function memoryPrecondition(input: Preconditions): { action: 'skip' | 'ask' | 'validate' | 'not-checked'; reason: string } {
  if (!input || typeof input.initialized !== 'boolean' || typeof input.fast !== 'boolean' ||
      typeof input.specPresent !== 'boolean' || typeof input.interactive !== 'boolean' ||
      (input.coverage !== null && (!Number.isInteger(input.coverage) || input.coverage < 0)) ||
      (input.impactCount !== null && (!Number.isInteger(input.impactCount) || input.impactCount < 1)) ||
      (input.decision !== undefined && typeof input.decision !== 'string') ||
      (input.answer !== undefined && input.answer !== 'skip' && input.answer !== 'validate')) {
    return { action: 'not-checked', reason: 'invalid precondition input' };
  }
  if (!input.initialized) return { action: 'skip', reason: 'memory uninitialized' };
  if (input.coverage === 0) return { action: 'skip', reason: 'no binding evidence' };
  if (input.fast) return { action: 'skip', reason: 'fast mode' };
  if (input.decision === 'disabled') return { action: 'skip', reason: 'task disabled' };
  if (!input.specPresent) return { action: 'skip', reason: 'no spec.md' };
  if (input.decision !== 'enabled') {
    if (input.answer === 'skip') return { action: 'skip', reason: 'user declined validation' };
    if (!input.answer && input.interactive) return { action: 'ask', reason: 'task decision absent or invalid' };
    if (!input.answer && input.impactCount === 1) return { action: 'skip', reason: 'single impact noninteractive default' };
  }
  if (input.coverage === null || !Number.isInteger(input.coverage) || input.coverage < 0) {
    return { action: 'not-checked', reason: 'binding coverage unknown or invalid' };
  }
  return { action: 'validate', reason: 'memory validation selected' };
}

function contained(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`));
}

const GIT_ENTRY = '.git';
const DEFAULT_MEMORY_PATH = '.specify/memory';
const MAX_CONFIG_BYTES = 1_048_576;
// Mirrors the memory runtime. `memory.path` is screened with the strict set: C0/C1 controls,
// line/paragraph separators, backslash, quotes, and shell metacharacters.
export const FORBIDDEN_MEMORY_PATH_CHARS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\\`$"';&|<>]/;
// Resolved locations (workspace, canonical root) are only ever placed inside double quotes, so only
// the characters that stay active there matter; a backslash is a path separator on Windows.
const FORBIDDEN_LOCATION_CHARS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029`$"]/;

export function hasForbiddenLocationCharacter(value: string, platform: string = process.platform): boolean {
  return FORBIDDEN_LOCATION_CHARS.test(value) || (platform !== 'win32' && value.includes('\\'));
}

function lstatOrUndefined(path: string): Stats | undefined {
  try { return lstatSync(path); } catch { return undefined; }
}

function isDirectory(path: string): boolean {
  try { return statSync(path).isDirectory(); } catch { return false; }
}

/** Nearest ancestor holding a git entry or `.specify/`; falls back to the start directory. */
function discoverWorkspace(start: string): string {
  const origin = realpathOrSelf(start);
  for (let dir = origin; ; dir = dirname(dir)) {
    if (lstatOrUndefined(join(dir, GIT_ENTRY)) || lstatOrUndefined(join(dir, '.specify'))) return dir;
    if (dirname(dir) === dir) return origin;
  }
}

/** The main worktree when `workspace` is a linked worktree; otherwise `workspace` itself. */
function mainWorktreeRoot(workspace: string): string {
  try {
    if (!lstatSync(join(workspace, GIT_ENTRY)).isFile()) return workspace;
    const listing = runGit(['worktree', 'list', '--porcelain'], { cwd: workspace, timeout: 10_000 });
    const lines = (listing.split(/\r?\n\r?\n/)[0] ?? '').split(/\r?\n/);
    const main = lines.find(line => line.startsWith('worktree '));
    return main && !lines.includes('bare') ? realpathOrSelf(main.slice('worktree '.length)) : workspace;
  } catch { return workspace; }
}

/**
 * Relative `memory.path` values that leave the main worktree (for example `../team-memory`) resolve
 * from the main worktree so every worktree reaches the same root. Paths that stay inside the
 * repository resolve in the current workspace, where the branch's own memory lives.
 */
function configuredRootPath(workspace: string, memoryPath: string): string {
  if (isAbsolute(memoryPath)) return resolve(memoryPath);
  const base = mainWorktreeRoot(workspace);
  const viaMainWorktree = resolve(base, memoryPath);
  return contained(base, viaMainWorktree) ? resolve(workspace, memoryPath) : viaMainWorktree;
}

/** `realpath` of the nearest existing ancestor plus the not-yet-existing tail. */
function canonicalFromNearestExisting(path: string): string {
  let current = resolve(path);
  const tail: string[] = [];
  while (!existsSync(current) && dirname(current) !== current) {
    tail.unshift(basename(current));
    current = dirname(current);
  }
  return resolve(realpathOrSelf(current), ...tail);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type GateConfig = { invalid: true; shown: string } | { invalid: false; path?: string; allowExternal: boolean };

/** Reads `<workspace>/.specify/.specify.json` the way the memory runtime does: regular file, bounded size, no fallbacks. */
function readGateConfig(workspace: string): GateConfig {
  const configPath = join(workspace, '.specify', '.specify.json');
  const info = lstatOrUndefined(configPath);
  if (info === undefined) return { invalid: false, allowExternal: false };
  const invalid = (shown = DEFAULT_MEMORY_PATH): GateConfig => ({ invalid: true, shown });
  if (!info.isFile() || info.size > MAX_CONFIG_BYTES) return invalid();
  let raw: unknown;
  try { raw = JSON.parse(readFileSync(configPath, 'utf8')); } catch { return invalid(); }
  if (!isRecord(raw) || (raw.memory !== undefined && !isRecord(raw.memory))) return invalid();
  const memory = raw.memory ?? {};
  let path: string | undefined;
  if (memory.path !== undefined) {
    if (typeof memory.path !== 'string' || memory.path.trim() === '') return invalid();
    if (FORBIDDEN_MEMORY_PATH_CHARS.test(memory.path)) return invalid(memory.path);
    path = memory.path;
  }
  if (memory.allowExternal !== undefined && typeof memory.allowExternal !== 'boolean') return invalid(path);
  return { invalid: false, ...(path === undefined ? {} : { path }), allowExternal: memory.allowExternal === true };
}

/** A marker must be a regular file; a symlink is rejected like the runtime's contained-file check. */
function markerKind(root: string, name: string): 'file' | 'other' | 'symlink' {
  const info = lstatOrUndefined(join(root, name));
  return info === undefined ? 'other' : info.isSymbolicLink() ? 'symlink' : info.isFile() ? 'file' : 'other';
}

/**
 * Cross-check the memory root handed to `report` against the root the config selects, in the same
 * order as the memory runtime. Returns a NOT CHECKED reason, or null when the root is the configured,
 * initialized one. Reasons carry a code plus `memory.path` as configured.
 */
function memoryRootProblem(start: string, memoryRoot: string): string | null {
  const workspace = discoverWorkspace(start);
  const problem = (code: string, shown: string) => `${code} — ${shown.replace(new RegExp(FORBIDDEN_MEMORY_PATH_CHARS, 'g'), '?')}`;

  const config = readGateConfig(workspace);
  if (config.invalid) return problem('config-invalid', config.shown);
  const configured = config.path;

  let shown = configured ?? DEFAULT_MEMORY_PATH;
  let root: string;
  if (configured !== undefined) root = configuredRootPath(workspace, configured);
  else {
    const found = [DEFAULT_MEMORY_PATH, 'memory'].filter(candidate => isDirectory(join(workspace, candidate)));
    if (found.length > 1) return problem('ambiguous-default', shown);
    shown = found[0] ?? (lstatOrUndefined(join(workspace, '.specify')) ? DEFAULT_MEMORY_PATH : 'memory');
    root = join(workspace, shown);
  }

  const canonical = canonicalFromNearestExisting(root);
  if (hasForbiddenLocationCharacter(canonical) || hasForbiddenLocationCharacter(workspace)) return problem('containment', shown);
  const lexicallyInside = contained(workspace, root);
  const external = !(lexicallyInside && contained(workspace, canonical));
  // A root equal to, or above, the workspace (including the filesystem root) is never a memory root.
  if (contained(canonical, workspace)) return problem('containment', shown);
  if (external && !(configured !== undefined && config.allowExternal)) {
    return problem(lexicallyInside ? 'containment' : 'external-not-allowed', shown);
  }
  if (!isDirectory(root)) return problem('root-missing', shown);
  const markers = [markerKind(canonical, 'memory.yaml'), markerKind(canonical, 'memory-index.md')];
  if (markers.includes('symlink')) return problem('containment', shown);
  if (markers.some(kind => kind !== 'file')) return problem('memory-incomplete', shown);
  return canonicalFromNearestExisting(memoryRoot) === canonical ? null : problem('containment', shown);
}

const TYPES: Record<string, true> = {
  'domain-overview': true, services: true, 'business-rules': true, flow: true,
  'data-model': true, screen: true, 'screen-flow': true, 'integration-contract': true,
  'operations-runbook': true, 'quality-requirement': true, 'decision-record': true,
  'report-spec': true, 'risk-debt': true, 'decision-table': true, 'state-machine': true,
  capability: true, 'stakeholder-role': true, 'glossary-term': true,
};

async function evidenceExists(citation: string, memoryRoot: string): Promise<boolean> {
  const hash = citation.lastIndexOf('#');
  if (hash < 1 || hash === citation.length - 1) return false;
  const root = await realpath(memoryRoot);
  const filePart = citation.slice(0, hash);
  const anchor = citation.slice(hash + 1);
  if (filePart.split(/[\\/]/).some(part => part === '..')) return false;
  // Reports normally cite workspace-relative paths, but root-relative paths are accepted too.
  const workspaceCandidate = resolve(filePart);
  const candidate = contained(root, workspaceCandidate) ? workspaceCandidate : resolve(root, filePart);
  if (!contained(root, candidate)) return false;
  const path = await realpath(candidate);
  if (!contained(root, path)) return false;
  const parts = [...relative(root, candidate).split(sep), ...relative(root, path).split(sep)];
  if (parts.some(part => ['_templates', '_deprecated', 'arc42', 'memory-architect', 'assets'].includes(part))) return false;
  const text = await readFile(path, 'utf8');
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!match) return false;
  const metadata = parse(match[1]!);
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata) ||
      typeof metadata.type !== 'string' || TYPES[metadata.type] !== true ||
      metadata.binding !== true || metadata.authority !== 'memory' || metadata.status !== 'active') return false;
  const body = text.slice(match[0].length)
    .replace(/<!--[\s\S]*?(?:-->|$)/g, '')
    .replace(/<(pre|script|style)\b[^>]*>[\s\S]*?(?:<\/\1>|$)/gi, '');
  let fence: { character: string; length: number } | undefined;
  for (const line of body.split(/\r?\n/)) {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (marker && marker[1]![0] === fence.character && marker[1]!.length >= fence.length && !marker[2]!.trim()) fence = undefined;
      continue;
    }
    if (marker) {
      fence = { character: marker[1]![0]!, length: marker[1]!.length };
      continue;
    }
    if (/^(?: {4}|\t)/.test(line)) continue;
    if (anchor.startsWith('^')) {
      if (line.trimEnd().endsWith(` ${anchor}`) || line.trim() === anchor) return true;
    } else {
      const heading = /^ {0,3}#{1,6}[ \t]+(.+?)[ \t]*#*$/.exec(line);
      if (heading && heading[1]!.toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').trim().replace(/\s/g, '-') === anchor) return true;
    }
  }
  return false;
}

/** Treat model output as untrusted. Only a complete, internally consistent report grants an action. */
export async function validateGuardianReport(output: string, exitCode: number, memoryRoot: string, workspace?: string): Promise<GateResult> {
  const invalid = (reason: string): GateResult => ({ state: 'not-checked', reason });
  if (exitCode !== 0) return invalid(`agent exited ${exitCode}`);
  // When the caller names its workspace, the root must be the one the config selects.
  const rootProblem = workspace === undefined ? null : memoryRootProblem(workspace, memoryRoot);
  if (rootProblem !== null) return invalid(rootProblem);
  const text = output.replace(/\r\n/g, '\n');
  const starts = [...text.matchAll(/^=== GUARDIAN REPORT ===$/gm)];
  const ends = [...text.matchAll(/^=== END GUARDIAN REPORT ===$/gm)];
  if (starts.length !== 1 || ends.length !== 1) return invalid('missing or duplicate report delimiters');
  const start = starts[0]!.index!;
  const end = ends[0]!.index!;
  if (end <= start) return invalid('report delimiter order invalid');
  const report = text.slice(start, end);
  for (const field of ['Feature', 'Domains reviewed', 'Memory files checked', 'Date']) {
    const matches = [...report.matchAll(new RegExp(`^${field}: (.+)$`, 'gm'))];
    if (matches.length !== 1 || !matches[0]![1]!.trim()) return invalid(`missing or duplicate ${field}`);
  }
  const headers = [...report.matchAll(/^## (CONFLICTS|WARNINGS|OK|NOT CHECKED|Summary)(?: \([^\n]*\))?\s*$/gm)];
  if ((report.match(/^## /gm) ?? []).length !== 5 ||
      headers.map(m => m[1]).join('|') !== 'CONFLICTS|WARNINGS|OK|NOT CHECKED|Summary') return invalid('missing, unexpected, duplicated, or reordered sections');
  const sections = headers.map((m, i) => report.slice(m.index! + m[0].length, headers[i + 1]?.index ?? report.length).trim());
  for (let i = 0; i < sections.length; i++) {
    const findings = [...sections[i]!.matchAll(/^### (.*)$/gm)];
    if (i >= 2 && findings.length > 0) return invalid('finding heading outside finding section');
    const expectedKind = i === 0 ? 'CONFLICT' : 'WARN';
    const identifiers = new Set<string>();
    for (const finding of findings) {
      if (!new RegExp(`^${expectedKind}-\\d+$`).test(finding[1]!) || identifiers.has(finding[1]!)) return invalid('misplaced or duplicate finding');
      identifiers.add(finding[1]!);
    }
  }
  const summary = sections[4]!;
  const actions = [...text.matchAll(/^Action required: (.+)$/gm)];
  if (actions.length !== 1 || !/^Action required: (CLEAR|REVIEW|BLOCK_IMPL)$/m.test(summary)) return invalid('missing, duplicate, or misplaced action');
  const action = actions[0]![1]!;
  const counts = /^CONFLICTS: (\d+) \| WARNINGS: (\d+) \| OK: (\d+) \| NOT CHECKED: (\d+)$/m.exec(summary);
  const total = /^Total claims checked: (\d+)$/m.exec(summary);
  if (!counts || !total || (summary.match(/^CONFLICTS:/gm) ?? []).length !== 1 || (summary.match(/^Total claims checked:/gm) ?? []).length !== 1) return invalid('invalid summary counts');
  const expected = counts.slice(1).map(Number);
  if (!expected.every(Number.isSafeInteger) || Number(total[1]) !== expected.reduce((a, b) => a + b, 0)) return invalid('inconsistent total claims');
  for (let i = 0; i < 4; i++) {
    const body = sections[i]!;
    const entries = i < 2 ? [...body.matchAll(new RegExp(`^### ${i === 0 ? 'CONFLICT' : 'WARN'}-\\d+`, 'gm'))].length : [...body.matchAll(/^[-*] \S/gm)].length;
    if (entries !== expected[i] || (entries === 0 && !/^None(?: found)?\.?$/i.test(body)) ||
        (entries > 0 && /^None(?: found)?\.?$/im.test(body))) return invalid('section entries disagree with summary');
  }
  const [conflicts, warnings, ok] = expected as [number, number, number, number];
  if (conflicts + warnings + ok === 0) return invalid('no claims verified');
  if ((action === 'CLEAR' && (conflicts !== 0 || warnings !== 0)) ||
      (action === 'REVIEW' && (conflicts !== 0 || warnings === 0)) ||
      (action === 'BLOCK_IMPL' && conflicts === 0)) return invalid('action contradicts counts');
  if (conflicts > 0) {
    const entries = sections[0]!.split(/^### CONFLICT-\d+.*$/m).slice(1);
    for (const entry of entries) {
      const citations = [...entry.matchAll(/^(?:- )?Evidence: (\S+)\s*$/gm)];
      if (citations.length !== 1) return invalid('conflict requires one evidence citation');
      try {
        if (!await evidenceExists(citations[0]![1]!, memoryRoot)) return invalid('conflict evidence is not active binding memory with a real anchor');
      } catch { return invalid('conflict evidence unreadable or malformed'); }
    }
  }
  return { state: action === 'BLOCK_IMPL' ? 'block-impl' : action.toLowerCase() as 'clear' | 'review', reason: `validated ${action} report` };
}

/** Persisted authorization is not consent. The caller must obtain a live answer. */
export function implementationGate(metadata: Record<string, unknown>): 'allow' | 'block' | 'confirm' {
  if (metadata.memory_gate === undefined) return ['memory_gate_reason', 'memory_gate_at', 'memory_gate_actor'].some(key => Object.hasOwn(metadata, key)) ? 'block' : 'allow';
  if (typeof metadata.memory_gate !== 'string') return 'block';
  if (typeof metadata.memory_gate_reason !== 'string' || !metadata.memory_gate_reason.trim() ||
      typeof metadata.memory_gate_at !== 'string' || !/^\d{4}-\d\d-\d\dT/.test(metadata.memory_gate_at) || Number.isNaN(Date.parse(metadata.memory_gate_at))) return 'block';
  if (['clear', 'review', 'skipped'].includes(metadata.memory_gate)) return 'allow';
  if (metadata.memory_gate === 'authorized' && metadata.memory_gate_actor === 'user') return 'confirm';
  return 'block';
}

if (import.meta.main) {
  try {
    const [command, input, root, rawExit = '0'] = process.argv.slice(2);
    if (!input) throw new Error('Usage: memory-gate.ts report <stdout-file> <memory-root> [agent-exit] | precondition <input.json> | implement <plan.md>');
    if (command === 'report') {
      if (!root || !/^-?\d+$/.test(rawExit)) throw new Error('report requires memory root and numeric agent exit');
      const result = await validateGuardianReport(await readFile(input, 'utf8'), Number(rawExit), root, process.cwd());
      console.log(JSON.stringify(result));
      process.exitCode = result.state === 'not-checked' ? 1 : result.state === 'block-impl' ? 2 : 0;
    } else if (command === 'precondition') {
      console.log(JSON.stringify(memoryPrecondition(JSON.parse(await readFile(input, 'utf8')))));
    } else if (command === 'implement') {
      const text = await readFile(input, 'utf8');
      const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
      if (!match) throw new Error('plan frontmatter missing or malformed');
      const metadata = parse(match[1]!);
      if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw new Error('plan frontmatter must be an object');
      const decision = implementationGate(metadata);
      console.log(JSON.stringify({ decision }));
      process.exitCode = decision === 'allow' ? 0 : 2;
    } else throw new Error('unknown memory gate command');
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
