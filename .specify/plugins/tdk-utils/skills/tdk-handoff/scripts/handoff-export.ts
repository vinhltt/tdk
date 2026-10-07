import { Command } from 'commander';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { findConfigFile, hostOf, isWithin, parseConfig } from '../../../../../scripts/ts/src/utils/config';
import { writeAgentJson } from '../../../../../scripts/ts/src/utils/agent-output';
import { renderHandoffArtifact, type RenderedHandoffArtifact } from './handoff-artifact';
import { containsSensitiveHandoffText } from './handoff-redaction';

type ExportFailure = { ok: false; error: string; exitCode: 1 | 2 };
type ExportResult = { ok: true; path: string; kind: string; redactions: number } | ExportFailure;
class ExportError extends Error {
  constructor(readonly code: string, readonly exitCode: 1 | 2 = 1) { super(code); }
}
function errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | null)?.code;
}

/** Missing output parents are permitted; existing aliases are never writer authority. */
function checkDirectory(root: string, path: string): boolean {
  let stat: fs.Stats;
  try { stat = fs.lstatSync(path); }
  catch (error) {
    if (errorCode(error) === 'ENOENT') return false;
    throw new ExportError('unsafe_output_path');
  }
  if (!stat.isDirectory() || stat.isSymbolicLink() || !isWithin(root, fs.realpathSync(path))) {
    throw new ExportError('unsafe_output_path');
  }
  return true;
}

function captureRoot(selected: string): string {
  let root: string;
  try {
    root = fs.realpathSync(selected);
    if (!fs.statSync(root).isDirectory()) throw new Error();
  } catch { throw new ExportError('invalid_capture_root'); }
  // Refuse output aliases before config discovery could follow one.
  checkDirectory(root, join(root, '.specify'));
  checkDirectory(root, join(root, '.specify', 'handoffs'));
  const host = hostOf(root);
  if (host !== null && host !== root) throw new ExportError('capture_root_mismatch');
  const configPath = findConfigFile(root);
  if (host === null && configPath !== null) throw new ExportError('capture_root_mismatch');
  if (configPath !== null && parseConfig(configPath).error !== null) throw new ExportError('invalid_capture_config');
  return root;
}

function prepareDirectory(root: string, path: string): void {
  if (checkDirectory(root, path)) return;
  try { fs.mkdirSync(path); }
  catch (error) {
    if (errorCode(error) !== 'EEXIST') throw new ExportError('write_failed', 2);
  }
  if (!checkDirectory(root, path)) throw new ExportError('unsafe_output_path');
}

/** Create-new only. Cleanup is limited to the inode opened by this invocation. */
function writeNew(path: string, body: string): void {
  // Bun on Windows follows dangling final symlinks even with wx; reject every occupied entry first.
  let existing: fs.Stats | undefined;
  try { existing = fs.lstatSync(path, { throwIfNoEntry: false }); }
  catch { throw new ExportError('write_failed', 2); }
  if (existing) throw new ExportError('collision_exists');
  let fd: number;
  try { fd = fs.openSync(path, 'wx', 0o600); }
  catch (error) {
    if (errorCode(error) === 'EEXIST') throw new ExportError('collision_exists');
    throw new ExportError('write_failed', 2);
  }
  let identity: fs.BigIntStats | undefined;
  let closed = false;
  try {
    identity = fs.fstatSync(fd, { bigint: true });
    fs.writeFileSync(fd, body, 'utf8');
    fs.closeSync(fd);
    closed = true;
  } catch {
    if (!closed) { try { fs.closeSync(fd); } catch { /* Preserve the original write/close failure. */ } }
    try {
      const current = fs.lstatSync(path, { bigint: true });
      if (identity && current.isFile() && current.dev === identity.dev && current.ino === identity.ino) fs.unlinkSync(path);
    } catch { /* Cleanup failure cannot turn an incomplete capture into success. */ }
    throw new ExportError('write_failed', 2);
  }
}

/** No source collection, Git probes, environment-root selection or replacement writes. */
export function exportHandoff(selectedRoot: string, slug: string, input: unknown, now = new Date()): ExportResult {
  try {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 50 || containsSensitiveHandoffText(slug)) {
      throw new ExportError('invalid_slug');
    }
    let artifact: RenderedHandoffArtifact;
    try { artifact = renderHandoffArtifact(input, now); }
    catch (error) {
      const code = error instanceof Error && ['invalid_packet', 'sensitive_focus', 'invalid_structure'].includes(error.message)
        ? error.message : 'invalid_packet';
      throw new ExportError(code);
    }
    const root = captureRoot(selectedRoot);
    prepareDirectory(root, join(root, '.specify'));
    prepareDirectory(root, join(root, '.specify', 'handoffs'));
    const path = `.specify/handoffs/${artifact.date}-${slug}.md`;
    writeNew(join(root, path), artifact.body);
    return { ok: true, path, kind: artifact.kind, redactions: artifact.redactions };
  } catch (error) {
    return error instanceof ExportError
      ? { ok: false, error: error.code, exitCode: error.exitCode }
      : { ok: false, error: 'write_failed', exitCode: 2 };
  }
}

export function createHandoffExportCommand(): Command {
  return new Command('handoff-export')
    .description('Create one sanitized, capture-root-local handoff without replacing existing files')
    .requiredOption('--capture-root <directory>', 'Explicit existing artifact host')
    .requiredOption('--slug <slug>', 'Safe lowercase kebab-case name')
    .allowExcessArguments(false)
    .configureOutput({ writeErr: () => {} })
    .exitOverride()
    .action((options: { captureRoot: string; slug: string }) => {
      let input: unknown;
      try { input = JSON.parse(fs.readFileSync(0, 'utf8')); }
      catch {
        writeAgentJson({ ok: false, error: 'invalid_packet' });
        process.exitCode = 1;
        return;
      }
      const result = exportHandoff(options.captureRoot, options.slug, input);
      if (result.ok) writeAgentJson(result);
      else {
        writeAgentJson({ ok: false, error: result.error });
        process.exitCode = result.exitCode;
      }
    });
}

if (import.meta.main) {
  try { createHandoffExportCommand().parse(); }
  catch (error) {
    if (errorCode(error) !== 'commander.helpDisplayed') {
      writeAgentJson({ ok: false, error: 'invalid_arguments' });
      process.exitCode = 1;
    }
  }
}
