// Records and compares the scaffold-outcome.json baseline that /tdk-scaffold-from-recommendation keeps
// beside a recommendation. Only this script writes the sidecar: merging JSON by hand is the step an agent
// gets wrong most often, and the next scaffold run trusts this file to tell which artifacts changed.
//
// Hashes are line-ending stable for text files, so a checkout with core.autocrlf=true does not report
// every artifact as changed. Dependency-free on purpose: it runs with `bun --no-install` and no bundle.
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, posix, resolve, sep } from 'node:path';

export const SIDECAR_NAME = 'scaffold-outcome.json';
const KINDS = ['skill', 'agent'] as const;
const OUTCOMES = ['created', 'patched', 'reused', 'kept-unchanged'] as const;
const TEXT_EXTENSIONS = new Set(['.md', '.json', '.yaml', '.yml', '.txt', '.tpl']);
const SHA256_HEX = /^[0-9a-f]{64}$/;

type ArtifactKind = (typeof KINDS)[number];
type ArtifactOutcome = (typeof OUTCOMES)[number];
type ErrorCode = 'invalid_args' | 'invalid_rows' | 'path_outside_root' | 'missing_file' | 'foreign_sidecar' | 'invalid_sidecar' | 'io_error';
type FileLabel = 'unchanged' | 'changed' | 'missing';

interface FileDigest { path: string; sha256: string }
interface SourceRecord { path: string; sha256: string; recorded_at: string }
interface ArtifactRecord { kind: ArtifactKind; name: string; path: string; outcome: string; recorded_at: string; files: FileDigest[] }
interface Sidecar { version: 1; recommendation: SourceRecord; proposal: SourceRecord | null; artifacts: ArtifactRecord[] }
interface InputRow { kind: ArtifactKind; name: string; path: string; outcome: ArtifactOutcome; files: string[] }

class OutcomeError extends Error {
  constructor(readonly code: ErrorCode, detail: string) { super(detail); }
}

/** SHA-256 of a file's bytes; known text extensions hash with every CRLF pair folded to LF first. */
export function hashArtifactBytes(path: string, bytes: Uint8Array): string {
  const hash = createHash('sha256');
  if (!TEXT_EXTENSIONS.has(extname(path).toLowerCase()) || !bytes.includes(0x0d)) return hash.update(bytes).digest('hex');
  const folded = new Uint8Array(bytes.length);
  let length = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index] as number;
    if (byte === 0x0d && bytes[index + 1] === 0x0a) continue;
    folded[length++] = byte;
  }
  return hash.update(folded.subarray(0, length)).digest('hex');
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const utcNow = (): string => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const keyOf = (row: { kind: string; path: string }): string => `${row.kind}\u0000${row.path}`;

/** Normalizes a repo-relative POSIX path; `..` escapes are outside the root, any other bad form is invalid. */
function repoRelative(raw: unknown, invalidCode: ErrorCode, label: string): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.includes('\\') || raw.includes('\u0000') || posix.isAbsolute(raw) || /^[A-Za-z]:/.test(raw)) {
    throw new OutcomeError(invalidCode, `${label} must be a repo-relative POSIX path: ${String(raw)}`);
  }
  const normalized = posix.normalize(raw);
  if (normalized === '..' || normalized.startsWith('../')) throw new OutcomeError('path_outside_root', `${label} leaves the project root: ${raw}`);
  if (normalized === '.' || normalized.endsWith('/')) throw new OutcomeError(invalidCode, `${label} must name a file: ${raw}`);
  return normalized;
}

/** Absolute path of an existing file whose real location stays inside the real project root. */
function existingFileInside(root: string, path: string): string | undefined {
  const absolute = join(root, path);
  if (!existsSync(absolute)) return undefined;
  const real = realpathSync(absolute);
  if (real !== root && !real.startsWith(root + sep)) throw new OutcomeError('path_outside_root', `${path} resolves outside the project root`);
  if (!statSync(real).isFile()) throw new OutcomeError('missing_file', `${path} is not a file`);
  return real;
}

function requireFile(root: string, path: string): string {
  const real = existingFileInside(root, path);
  if (!real) throw new OutcomeError('missing_file', `${path} does not exist`);
  return real;
}

const digest = (root: string, path: string): string => hashArtifactBytes(path, readFileSync(requireFile(root, path)));

function parseArgs(argv: string[]): { command: 'record' | 'compare'; options: Map<string, string> } {
  const [command, ...rest] = argv;
  if (command !== 'record' && command !== 'compare') throw new OutcomeError('invalid_args', 'Usage: scaffold-outcome-record.ts record|compare --project-root <root> --recommendation <path>');
  const allowed = command === 'record' ? ['--project-root', '--recommendation', '--proposal', '--rows-file'] : ['--project-root', '--recommendation'];
  const options = new Map<string, string>();
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index] as string;
    const value = rest[index + 1];
    if (!allowed.includes(flag)) throw new OutcomeError('invalid_args', `Unknown option for ${command}: ${flag}`);
    if (value === undefined || value.startsWith('--')) throw new OutcomeError('invalid_args', `Missing value for ${flag}`);
    if (options.has(flag)) throw new OutcomeError('invalid_args', `Repeated option: ${flag}`);
    options.set(flag, value);
  }
  for (const flag of ['--project-root', '--recommendation']) if (!options.has(flag)) throw new OutcomeError('invalid_args', `Missing ${flag}`);
  return { command, options };
}

function projectRoot(raw: string): string {
  const absolute = resolve(raw);
  if (!existsSync(absolute) || !statSync(absolute).isDirectory()) throw new OutcomeError('invalid_args', `--project-root is not a directory: ${raw}`);
  return realpathSync(absolute);
}

function parseSource(value: unknown): SourceRecord {
  if (!isRecord(value) || typeof value.sha256 !== 'string' || !SHA256_HEX.test(value.sha256) || typeof value.recorded_at !== 'string') {
    throw new OutcomeError('invalid_sidecar', 'recommendation or proposal record is malformed');
  }
  return { path: repoRelative(value.path, 'invalid_sidecar', 'source path'), sha256: value.sha256, recorded_at: value.recorded_at };
}

/** Validates the whole sidecar shape; any defect makes it invalid rather than partially trusted. */
function parseSidecar(text: string): Sidecar {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new OutcomeError('invalid_sidecar', 'sidecar is not valid JSON'); }
  if (!isRecord(parsed)) throw new OutcomeError('invalid_sidecar', 'sidecar is not a JSON object');
  if (parsed.version !== 1) throw new OutcomeError('invalid_sidecar', `unsupported sidecar version: ${JSON.stringify(parsed.version)}`);
  if (!Array.isArray(parsed.artifacts)) throw new OutcomeError('invalid_sidecar', 'artifacts is not an array');
  const seen = new Set<string>();
  const artifacts = parsed.artifacts.map((row): ArtifactRecord => {
    if (!isRecord(row) || !KINDS.includes(row.kind as ArtifactKind) || typeof row.name !== 'string' || typeof row.outcome !== 'string'
      || typeof row.recorded_at !== 'string' || !Array.isArray(row.files)) throw new OutcomeError('invalid_sidecar', 'artifact row is malformed');
    const files = row.files.map((file): FileDigest => {
      if (!isRecord(file) || typeof file.sha256 !== 'string' || !SHA256_HEX.test(file.sha256)) throw new OutcomeError('invalid_sidecar', 'artifact file digest is malformed');
      return { path: repoRelative(file.path, 'invalid_sidecar', 'artifact file'), sha256: file.sha256 };
    });
    const record = { ...row, path: repoRelative(row.path, 'invalid_sidecar', 'artifact path'), files } as ArtifactRecord;
    if (seen.has(keyOf(record))) throw new OutcomeError('invalid_sidecar', `duplicate artifact row: ${record.kind} ${record.path}`);
    seen.add(keyOf(record));
    return record;
  });
  return { version: 1, recommendation: parseSource(parsed.recommendation), proposal: parsed.proposal == null ? null : parseSource(parsed.proposal), artifacts };
}

function readSidecarFile(root: string, sidecarPath: string): string | undefined {
  const absolute = join(root, sidecarPath);
  if (!existsSync(absolute) && !isSymlink(absolute)) return undefined;
  if (isSymlink(absolute) || !statSync(absolute).isFile()) throw new OutcomeError('invalid_sidecar', 'sidecar is not a regular file');
  return readFileSync(absolute, 'utf8');
}

function isSymlink(path: string): boolean {
  try { return lstatSync(path).isSymbolicLink(); } catch { return false; }
}

const canonicalPath = (kind: ArtifactKind, name: string): string => (kind === 'skill' ? `.claude/skills/${name}/SKILL.md` : `.claude/agents/${name}.md`);

function parseRows(text: string): InputRow[] {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new OutcomeError('invalid_rows', 'rows are not valid JSON'); }
  if (!Array.isArray(parsed)) throw new OutcomeError('invalid_rows', 'rows must be a JSON array');
  const seen = new Set<string>();
  return parsed.map((row): InputRow => {
    if (!isRecord(row) || !KINDS.includes(row.kind as ArtifactKind) || typeof row.name !== 'string' || !/^[A-Za-z0-9._-]+$/.test(row.name)
      || !OUTCOMES.includes(row.outcome as ArtifactOutcome) || (row.files !== undefined && !Array.isArray(row.files))) {
      throw new OutcomeError('invalid_rows', `row is malformed: ${JSON.stringify(row)}`);
    }
    const kind = row.kind as ArtifactKind;
    const path = repoRelative(row.path, 'invalid_rows', 'row path');
    if (path !== canonicalPath(kind, row.name)) throw new OutcomeError('invalid_rows', `${kind} ${row.name} must use ${canonicalPath(kind, row.name)}`);
    if (seen.has(keyOf({ kind, path }))) throw new OutcomeError('invalid_rows', `duplicate row: ${kind} ${path}`);
    seen.add(keyOf({ kind, path }));
    const extra = ((row.files ?? []) as unknown[]).map((file) => repoRelative(file, 'invalid_rows', 'row file'));
    return { kind, name: row.name, path, outcome: row.outcome as ArtifactOutcome, files: [...new Set([path, ...extra])].sort() };
  });
}

function readRows(rowsFile: string | undefined): string {
  if (rowsFile !== undefined) {
    if (!existsSync(rowsFile)) throw new OutcomeError('invalid_args', `--rows-file not found: ${rowsFile}`);
    return readFileSync(rowsFile, 'utf8');
  }
  if (process.stdin.isTTY) throw new OutcomeError('invalid_args', 'Pass rows on stdin or with --rows-file');
  return readFileSync(0, 'utf8');
}

function record(root: string, options: Map<string, string>): Record<string, unknown> {
  const recommendation = repoRelative(options.get('--recommendation'), 'invalid_args', '--recommendation');
  const proposal = options.has('--proposal') ? repoRelative(options.get('--proposal'), 'invalid_args', '--proposal') : undefined;
  const sidecarPath = posix.join(posix.dirname(recommendation), SIDECAR_NAME);
  const rows = parseRows(readRows(options.get('--rows-file')));
  const now = utcNow();

  // Validate and hash everything before touching the disk: one failure writes nothing.
  const recommendationRecord: SourceRecord = { path: recommendation, sha256: digest(root, recommendation), recorded_at: now };
  const proposalRecord = proposal === undefined ? undefined : { path: proposal, sha256: digest(root, proposal), recorded_at: now };
  const upserts = rows.map((row): ArtifactRecord => ({
    kind: row.kind, name: row.name, path: row.path, outcome: row.outcome, recorded_at: now,
    files: row.files.map((file) => ({ path: file, sha256: digest(root, file) })),
  }));
  const existingText = readSidecarFile(root, sidecarPath);
  const existing = existingText === undefined ? undefined : parseSidecar(existingText);
  if (existing && existing.recommendation.path !== recommendation) {
    throw new OutcomeError('foreign_sidecar', `${sidecarPath} records ${existing.recommendation.path}, not ${recommendation}`);
  }

  const incoming = new Map(upserts.map((row) => [keyOf(row), row]));
  const kept: ArtifactRecord[] = [];
  const artifacts = (existing?.artifacts ?? []).map((row) => {
    const replacement = incoming.get(keyOf(row));
    if (!replacement) { kept.push(row); return row; }
    incoming.delete(keyOf(row));
    return replacement;
  });
  artifacts.push(...incoming.values());
  const sidecar: Sidecar = {
    version: 1,
    recommendation: recommendationRecord,
    proposal: proposalRecord ?? existing?.proposal ?? null,
    artifacts,
  };

  const target = join(root, sidecarPath);
  const temporary = join(root, posix.dirname(sidecarPath), `.${SIDECAR_NAME}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`);
  try {
    writeFileSync(temporary, `${JSON.stringify(sidecar, null, 2)}\n`);
    renameSync(temporary, target);
  } finally {
    rmSync(temporary, { force: true });
  }
  const summary = (row: ArtifactRecord) => ({ kind: row.kind, path: row.path });
  return { ok: true, sidecar: sidecarPath, upserted: upserts.map(summary), kept: kept.map(summary) };
}

function compare(root: string, options: Map<string, string>): Record<string, unknown> {
  const recommendation = repoRelative(options.get('--recommendation'), 'invalid_args', '--recommendation');
  const recommendationHash = digest(root, recommendation);
  const sidecarPath = posix.join(posix.dirname(recommendation), SIDECAR_NAME);
  let sidecar: Sidecar;
  try {
    const text = readSidecarFile(root, sidecarPath);
    if (text === undefined) return { ok: true, state: 'missing', sidecar: sidecarPath };
    const version = (() => { try { const value: unknown = JSON.parse(text); return isRecord(value) ? value.version : undefined; } catch { return undefined; } })();
    if (typeof version === 'number' && version !== 1) return { ok: true, state: 'unsupported-version', sidecar: sidecarPath, version };
    sidecar = parseSidecar(text);
  } catch (error) {
    if (error instanceof OutcomeError) return { ok: true, state: 'invalid', sidecar: sidecarPath, reason: error.message };
    throw error;
  }
  if (sidecar.recommendation.path !== recommendation) {
    return { ok: true, state: 'foreign', sidecar: sidecarPath, recorded_for: sidecar.recommendation.path };
  }
  try {
    const artifacts = sidecar.artifacts.map((row) => {
      const files = row.files.map((file) => {
        const real = existingFileInside(root, file.path);
        const label: FileLabel = real === undefined ? 'missing' : hashArtifactBytes(file.path, readFileSync(real)) === file.sha256 ? 'unchanged' : 'changed';
        return { path: file.path, label };
      });
      const label: FileLabel = files.some((file) => file.label === 'changed') ? 'changed' : files.some((file) => file.label === 'missing') ? 'missing' : 'unchanged';
      return { kind: row.kind, name: row.name, path: row.path, outcome: row.outcome, recorded_at: row.recorded_at, label, files };
    });
    return { ok: true, state: 'present', sidecar: sidecarPath, recommendation_changed: recommendationHash !== sidecar.recommendation.sha256, artifacts };
  } catch (error) {
    // A recorded path that now escapes the root (for example a swapped-in symlink) voids the baseline.
    if (error instanceof OutcomeError) return { ok: true, state: 'invalid', sidecar: sidecarPath, reason: error.message };
    throw error;
  }
}

export function main(argv: string[]): number {
  try {
    const { command, options } = parseArgs(argv);
    const root = projectRoot(options.get('--project-root') as string);
    const result = command === 'record' ? record(root, options) : compare(root, options);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return 0;
  } catch (error) {
    const code: ErrorCode = error instanceof OutcomeError ? error.code : 'io_error';
    const detail = error instanceof Error ? error.message : String(error);
    process.stdout.write(`${JSON.stringify({ ok: false, error: code, detail })}\n`);
    return 1;
  }
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
