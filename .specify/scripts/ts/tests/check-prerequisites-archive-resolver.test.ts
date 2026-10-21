import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { resolvePrerequisiteTarget } from '../src/commands/util/check-prerequisites';

const CLI = resolve(import.meta.dir, '../src/commands/util/check-prerequisites.ts');

type Target = ReturnType<typeof resolvePrerequisiteTarget>;

async function runCli(repo: string, args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(['bun', CLI, ...args], {
    cwd: repo,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, CLAUDE_PROJECT_DIR: repo },
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}

describe('check-prerequisites resolver', () => {
  let repo: string;
  let env: { repoRoot: string; specsRoot: string; defaultFolder: string };
  const mkSpec = (...segments: string[]): string => {
    const dir = join(repo, '.specify', ...segments);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'spec.md'), '# spec\n', 'utf-8');
    return dir;
  };
  const resolveArchived = (input: string): Target => resolvePrerequisiteTarget(input, env, { allowArchived: true });
  const dirOf = (target: Target): string => {
    if ('error' in target) throw new Error(target.error);
    return target.featureDir;
  };

  beforeEach(() => {
    repo = realpathSync(mkdtempSync(join(tmpdir(), 'prereq-resolver-')));
    env = { repoRoot: repo, specsRoot: '.specify', defaultFolder: 'feature' };
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  describe('without allowArchived', () => {
    it('keeps the folder of a prefixed id', () => {
      const target = resolvePrerequisiteTarget('specs/sample-1', env, { allowArchived: false });
      expect(target).toEqual({ featureDir: join(repo, '.specify', 'specs', 'sample-1'), taskId: 'specs/sample-1', archived: false });
    });

    it('joins the default folder for a bare id', () => {
      const target = resolvePrerequisiteTarget('sample-1', env, { allowArchived: false });
      expect(dirOf(target)).toBe(join(repo, '.specify', 'feature', 'sample-1'));
    });

    it('rejects the reserved archive folder, case-insensitively', () => {
      for (const input of ['archive/specs/sample-1', 'Archive/sample-1']) {
        const target = resolvePrerequisiteTarget(input, env, { allowArchived: false });
        expect('error' in target && target.error).toContain('reserved');
      }
    });

    it('reports path traversal as an error instead of throwing', () => {
      const target = resolvePrerequisiteTarget('specs/../../etc', env, { allowArchived: false });
      expect('error' in target).toBe(true);
    });
  });

  describe('with allowArchived: ids', () => {
    it('prefers the archived copy of a bare id and marks it archived', () => {
      mkSpec('archive', 'feature', 'sample-1');
      const target = resolveArchived('sample-1');
      expect(target).toEqual({ featureDir: join(repo, '.specify', 'archive', 'feature', 'sample-1'), taskId: 'feature/sample-1', archived: true });
    });

    it('falls back to the active copy when nothing is archived', () => {
      mkSpec('feature', 'sample-1');
      expect(resolveArchived('sample-1')).toEqual({ featureDir: join(repo, '.specify', 'feature', 'sample-1'), taskId: 'feature/sample-1', archived: false });
    });

    it('looks under the prefixed folder, archive first', () => {
      mkSpec('archive', 'specs', 'sample-1');
      const target = resolveArchived('specs/sample-1');
      expect(dirOf(target)).toBe(join(repo, '.specify', 'archive', 'specs', 'sample-1'));
    });

    it('errors listing both paths when the id exists archived and active', () => {
      mkSpec('archive', 'specs', 'sample-1');
      mkSpec('specs', 'sample-1');
      const target = resolveArchived('specs/sample-1');
      expect('error' in target && target.error).toContain(join(repo, '.specify', 'archive', 'specs', 'sample-1'));
      expect('error' in target && target.error).toContain(join(repo, '.specify', 'specs', 'sample-1'));
    });

    it('errors when neither copy exists', () => {
      expect('error' in resolveArchived('specs/sample-404')).toBe(true);
    });

    it('resolves an explicit archive/<folder>/<ticket> id with the canonical id and no active fallback', () => {
      mkSpec('archive', 'specs', 'sample-1');
      expect(resolveArchived('archive/specs/sample-1')).toEqual({
        featureDir: join(repo, '.specify', 'archive', 'specs', 'sample-1'),
        taskId: 'specs/sample-1',
        archived: true,
      });

      mkSpec('specs', 'sample-2');
      expect('error' in resolveArchived('archive/specs/sample-2')).toBe(true);
    });

    it('rejects a nested archive folder', () => {
      expect('error' in resolveArchived('archive/archive/sample-1')).toBe(true);
    });
  });

  describe('with allowArchived: paths', () => {
    it('accepts specs-root-prefixed, ./ and absolute forms of an archived spec', () => {
      const dir = mkSpec('archive', 'specs', 'sample-1');
      for (const input of ['.specify/archive/specs/sample-1', './.specify/archive/specs/sample-1', dir]) {
        expect(resolveArchived(input)).toEqual({ featureDir: dir, taskId: 'specs/sample-1', archived: true });
      }
    });

    it('accepts an active spec path without the archive flag set on the result', () => {
      const dir = mkSpec('specs', 'sample-1');
      expect(resolveArchived('.specify/specs/sample-1')).toEqual({ featureDir: dir, taskId: 'specs/sample-1', archived: false });
    });

    it('treats feature/aa-123 style input as an id, not a path', () => {
      mkSpec('archive', 'feature', 'aa-123');
      expect(resolveArchived('feature/aa-123')).toMatchObject({ archived: true, taskId: 'feature/aa-123' });
    });

    it('rejects paths outside the specs root, including .. and sibling prefixes', () => {
      mkdirSync(join(repo, 'elsewhere', 'specs', 'sample-1'), { recursive: true });
      mkdirSync(join(repo, '.specify-evil', 'specs', 'sample-1'), { recursive: true });
      mkSpec('specs', 'sample-1');
      for (const input of [
        join(repo, 'elsewhere', 'specs', 'sample-1'),
        join(repo, '.specify-evil', 'specs', 'sample-1'),
        './.specify/../elsewhere/specs/sample-1',
        '.specify/specs/../../elsewhere/specs/sample-1',
      ]) {
        const target = resolveArchived(input);
        expect('error' in target).toBe(true);
      }
    });

    it('rejects a symlink that escapes the specs root', () => {
      const outside = join(repo, 'elsewhere', 'sample-1');
      mkdirSync(outside, { recursive: true });
      mkdirSync(join(repo, '.specify', 'archive', 'specs'), { recursive: true });
      symlinkSync(outside, join(repo, '.specify', 'archive', 'specs', 'sample-1'));
      expect('error' in resolveArchived('.specify/archive/specs/sample-1')).toBe(true);
    });

    it('errors when the path does not exist', () => {
      expect('error' in resolveArchived('.specify/archive/specs/sample-404')).toBe(true);
    });

    it('rejects the specs root and non-feature depths, and tolerates a trailing slash', () => {
      mkSpec('archive', 'specs', 'sample-1');
      for (const input of ['.specify/', '.specify/archive', '.specify/archive/specs']) {
        expect('error' in resolveArchived(input)).toBe(true);
      }
      expect('error' in resolveArchived('.specify/archive/specs/sample-1/')).toBe(false);
    });
  });

  describe('CLI', () => {
    it('exits 1 on an archive-prefixed id under --paths-only without --allow-archived', async () => {
      mkSpec('archive', 'specs', 'sample-1');
      const { exitCode, stdout, stderr } = await runCli(repo, ['archive/specs/sample-1', '--paths-only', '--json']);
      expect(exitCode).toBe(1);
      expect(stdout).toBe('');
      expect(stderr).toContain('reserved');
    });

    it('resolves a prefixed id to its own folder under --paths-only and echoes the caller id', async () => {
      const { exitCode, stdout } = await runCli(repo, ['specs/sample-1', '--paths-only', '--json']);
      expect(exitCode).toBe(0);
      const json = JSON.parse(stdout) as Record<string, unknown>;
      expect(json['featureDir']).toBe(join(repo, '.specify', 'specs', 'sample-1'));
      expect(json['taskId']).toBe('specs/sample-1');
      expect(json).not.toHaveProperty('archived');
    });

    it('reports archived and canonical taskId for archive/<folder>/<ticket> with --allow-archived', async () => {
      const dir = mkSpec('archive', 'specs', 'sample-1');
      const { exitCode, stdout } = await runCli(repo, ['archive/specs/sample-1', '--allow-archived', '--paths-only', '--json']);
      expect(exitCode).toBe(0);
      const json = JSON.parse(stdout) as Record<string, unknown>;
      expect(json).toMatchObject({ taskId: 'specs/sample-1', archived: true, featureDir: dir });
    });

    it('checks existence under --paths-only when --allow-archived is set', async () => {
      const { exitCode } = await runCli(repo, ['specs/sample-404', '--allow-archived', '--paths-only', '--json']);
      expect(exitCode).toBe(1);
    });

    it('rejects a directory without spec.md or plan.md, by path and by id', async () => {
      mkdirSync(join(repo, '.specify', 'scripts', 'ts'), { recursive: true });
      mkdirSync(join(repo, '.specify', 'plugins', 'tdk-core'), { recursive: true });
      mkdirSync(join(repo, '.specify', 'archive', 'specs', 'sample-1'), { recursive: true });
      for (const input of ['.specify/scripts/ts', './.specify/plugins/tdk-core', 'archive/specs/sample-1']) {
        const { exitCode, stderr } = await runCli(repo, [input, '--allow-archived', '--paths-only', '--json']);
        expect(exitCode).toBe(1);
        expect(stderr).toContain('no spec.md or plan.md');
      }
    });

    it('accepts a directory that holds only plan.md', async () => {
      const dir = join(repo, '.specify', 'archive', 'specs', 'sample-2');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'plan.md'), '# plan\n', 'utf-8');
      const { exitCode } = await runCli(repo, ['archive/specs/sample-2', '--allow-archived', '--paths-only', '--json']);
      expect(exitCode).toBe(0);
    });

    it('validates docs of an archived spec and returns archived in the full JSON', async () => {
      const dir = mkSpec('archive', 'specs', 'sample-1');
      writeFileSync(join(dir, 'plan.md'), '# plan\n', 'utf-8');
      const { exitCode, stdout } = await runCli(repo, ['specs/sample-1', '--allow-archived', '--json']);
      expect(exitCode).toBe(0);
      const json = JSON.parse(stdout) as { archived: boolean; taskId: string; availableDocs: string[] };
      expect(json.archived).toBe(true);
      expect(json.taskId).toBe('specs/sample-1');
      expect(json.availableDocs).toEqual(['plan.md', 'spec.md']);
    });
  });
});

describe('tdk-specify archive reservation', () => {
  it('stops before any read or write when the parsed folder is the archive folder', () => {
    const reference = readFileSync(
      resolve(import.meta.dir, '../../../plugins/tdk-core/skills/tdk-specify/references/input-routing-and-mode-workflow.md'),
      'utf-8',
    );
    const stop = reference.indexOf('`FOLDER` == `archive`');
    expect(stop).toBeGreaterThan(-1);
    expect(stop).toBeLessThan(reference.indexOf('mkdir -p "$FEATURE_DIR"'));
    expect(reference.slice(stop, stop + 400)).toContain('STOP');
  });
});
