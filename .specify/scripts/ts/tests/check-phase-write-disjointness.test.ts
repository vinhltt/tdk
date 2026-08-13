import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  canonicalizeAccessPath,
  checkGitIgnoredWrite,
  checkPhaseWriteDisjointness,
  extractPhaseAccess,
  findFixedDenyReason,
  findNearestExistingAncestor,
  parseMountInfo,
  probeProjectCaseSensitivity,
  resolveProjectFilesystemCapability,
  resolvePhaseAccess,
  ROOT_SHARED_WRITE_DENY_NAMES,
  ROOT_SHARED_WRITE_DENY_PATTERNS,
  walkProjectPath,
  type CaseProbeResult,
  type DisjointnessHostDeps,
  type FilesystemCapabilityResult,
  type PhaseAccessDeclaration,
} from '../src/commands/util/check-phase-write-disjointness';

let root: string;

function file(relPath: string, contents = 'x'): void {
  const abs = join(root, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, contents);
}

function dir(relPath: string): void {
  mkdirSync(join(root, relPath), { recursive: true });
}

function initGitRepo(): void {
  execFileSync('git', ['init', '-q'], { cwd: root });
}

function codes(errors: { code: string }[]): string[] {
  return errors.map((e) => e.code);
}

function phaseMarkdown(parallelSafe: 'auto' | 'never', sectionBody: string): string {
  const frontmatter = parallelSafe === 'never'
    ? ['parallel_safe: never', 'parallel_reason: prior serial-only defect']
    : ['parallel_safe: auto'];
  return ['---', ...frontmatter, '---', '', '# Phase X', '', '## Related Code Files', '', sectionBody, ''].join('\n');
}

function decl(phase: number, partial: Partial<Omit<PhaseAccessDeclaration, 'phase'>>): PhaseAccessDeclaration {
  return { phase, read: [], modify: [], create: [], delete: [], ...partial };
}

beforeEach(() => {
  root = realpathSync.native(mkdtempSync(join(tmpdir(), 'tdk-write-disjointness-')));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// extractPhaseAccess (ported from parallel-phase-access-grammar.test.ts)
// ---------------------------------------------------------------------------

describe('extractPhaseAccess', () => {
  function md(sectionBody: string): string {
    return ['---', 'parallel_safe: auto', '---', '', '# Phase X', '', '## Related Code Files', '', sectionBody, '',
      '## Implementation Steps', '', '1. Do the thing.', ''].join('\n');
  }

  it('complete-read-plus-writes: parses every action with zero errors', () => {
    file('docs/readme.md');
    file('src/existing.ts');
    file('src/old-file.ts');
    const result = extractPhaseAccess(md([
      '- Read: `docs/readme.md`', '- Modify: `src/existing.ts`', '- Create: `src/new-file.ts`', '- Delete: `src/old-file.ts`',
    ].join('\n')), root);
    expect(result.errors).toEqual([]);
    expect(result.reads).toEqual(['docs/readme.md']);
    expect(result.writes).toEqual([
      { action: 'Modify', path: 'src/existing.ts' },
      { action: 'Create', path: 'src/new-file.ts' },
      { action: 'Delete', path: 'src/old-file.ts' },
    ]);
  });

  it('read-only: parses with zero writes and zero errors (mode-gating happens elsewhere)', () => {
    file('docs/readme.md');
    const result = extractPhaseAccess(md('- Read: `docs/readme.md`'), root);
    expect(result.errors).toEqual([]);
    expect(result.writes).toEqual([]);
    expect(result.reads).toEqual(['docs/readme.md']);
  });

  it('missing section: reports MISSING_ACCESS_SECTION', () => {
    const result = extractPhaseAccess(['---', 'parallel_safe: auto', '---', '', '# Phase X', '', '## Implementation Steps', ''].join('\n'), root);
    expect(codes(result.errors)).toContain('MISSING_ACCESS_SECTION');
  });

  it('duplicate section: reports DUPLICATE_ACCESS_SECTION', () => {
    file('src/existing.ts');
    const result = extractPhaseAccess([
      '# Phase X', '', '## Related Code Files', '- Modify: `src/existing.ts`', '', '## Related Code Files', '- Modify: `src/existing.ts`', '',
    ].join('\n'), root);
    expect(codes(result.errors)).toContain('DUPLICATE_ACCESS_SECTION');
  });

  it('duplicate path: same path declared twice under the same action', () => {
    file('src/existing.ts');
    const result = extractPhaseAccess(md(['- Modify: `src/existing.ts`', '- Modify: `src/existing.ts`'].join('\n')), root);
    expect(codes(result.errors)).toContain('DUPLICATE_ACCESS_PATH');
    expect(result.writes).toEqual([{ action: 'Modify', path: 'src/existing.ts' }]);
  });

  it('cross-action path: same path declared under two different actions', () => {
    file('src/existing.ts');
    const result = extractPhaseAccess(md(['- Modify: `src/existing.ts`', '- Delete: `src/existing.ts`'].join('\n')), root);
    expect(codes(result.errors)).toContain('CROSS_ACTION_ACCESS_PATH');
  });

  it('combined-action: rejects a bullet naming two actions', () => {
    file('src/existing.ts');
    const result = extractPhaseAccess(md('- Modify, Create: `src/existing.ts`'), root);
    expect(codes(result.errors)).toContain('COMBINED_ACTION');
    expect(result.writes).toEqual([]);
  });

  it('glob: rejects a wildcard path', () => {
    expect(codes(extractPhaseAccess(md('- Modify: `src/*.ts`'), root).errors)).toContain('GLOB_ACCESS_PATH');
  });

  it('placeholder: rejects an unedited template placeholder', () => {
    expect(codes(extractPhaseAccess(md('- Modify: `[path/to/file]`'), root).errors)).toContain('PLACEHOLDER_ACCESS_PATH');
  });

  it('existing directory: rejects a Modify target that is a directory', () => {
    dir('src');
    expect(codes(extractPhaseAccess(md('- Modify: `src`'), root).errors)).toContain('ACCESS_TARGET_IS_DIRECTORY');
  });

  it('extensionless-create: accepts an absent exact extensionless file name', () => {
    const result = extractPhaseAccess(md('- Create: `Dockerfile`'), root);
    expect(result.errors).toEqual([]);
    expect(result.writes).toEqual([{ action: 'Create', path: 'Dockerfile' }]);
  });

  it('unrecognized bullet: rejects an action outside Read/Modify/Create/Delete', () => {
    file('src/existing.ts');
    const result = extractPhaseAccess(md('- Refactor: `src/existing.ts`'), root);
    expect(codes(result.errors)).toContain('UNRECOGNIZED_ACCESS_BULLET');
    expect(result.writes).toEqual([]);
  });

  it('unbackticked: rejects a path without backticks', () => {
    file('src/existing.ts');
    const result = extractPhaseAccess(md('- Modify: src/existing.ts'), root);
    expect(codes(result.errors)).toContain('UNBACKTICKED_ACCESS_PATH');
    expect(result.writes).toEqual([]);
  });

  it('rejects a Create target that already exists', () => {
    file('src/existing.ts');
    expect(codes(extractPhaseAccess(md('- Create: `src/existing.ts`'), root).errors)).toContain('ACCESS_TARGET_ALREADY_EXISTS');
  });

  it('rejects a Create target with a trailing separator', () => {
    expect(codes(extractPhaseAccess(md('- Create: `src/newdir/`'), root).errors)).toContain('ACCESS_TARGET_TRAILING_SEPARATOR');
  });

  it('rejects a Modify target that does not exist', () => {
    expect(codes(extractPhaseAccess(md('- Modify: `src/missing.ts`'), root).errors)).toContain('ACCESS_TARGET_NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// resolvePhaseAccess (ported from parallel-phase-ownership.test.ts)
// ---------------------------------------------------------------------------

describe('resolvePhaseAccess', () => {
  it('action mismatch: reading a fixed-deny path is allowed, modifying it is denied', () => {
    file('package.json', '{}');
    expect(codes(resolvePhaseAccess(phaseMarkdown('never', '- Read: `package.json`'), root).errors)).not.toContain('DENIED_WRITE_PATH');
    expect(codes(resolvePhaseAccess(phaseMarkdown('never', '- Modify: `package.json`'), root).errors)).toContain('DENIED_WRITE_PATH');
  });

  it('read-only auto phase is rejected for lacking any write', () => {
    file('docs/readme.md');
    expect(codes(resolvePhaseAccess(phaseMarkdown('auto', '- Read: `docs/readme.md`'), root).errors)).toContain('AUTO_PHASE_REQUIRES_WRITE');
  });

  it('auto phase with a write is not rejected for missing writes', () => {
    initGitRepo();
    expect(codes(resolvePhaseAccess(phaseMarkdown('auto', '- Create: `src/new.ts`'), root).errors)).not.toContain('AUTO_PHASE_REQUIRES_WRITE');
  });

  it('denies a git-ignored write path', () => {
    initGitRepo();
    file('.gitignore', 'dist/\n');
    expect(codes(resolvePhaseAccess(phaseMarkdown('auto', '- Create: `dist/out.js`'), root).errors)).toContain('GIT_IGNORED_WRITE_PATH');
  });

  it('allows a non-ignored write path', () => {
    initGitRepo();
    file('.gitignore', 'dist/\n');
    const result = resolvePhaseAccess(phaseMarkdown('auto', '- Create: `src/new.ts`'), root);
    expect(codes(result.errors)).not.toContain('GIT_IGNORED_WRITE_PATH');
    expect(codes(result.errors)).not.toContain('DENIED_WRITE_PATH');
  });

  it('fails closed when git check-ignore cannot run (not a repository)', () => {
    expect(codes(resolvePhaseAccess(phaseMarkdown('auto', '- Create: `src/new.ts`'), root).errors)).toContain('GIT_CHECK_IGNORE_FAILED');
  });
});

// ---------------------------------------------------------------------------
// Path policy (ported from parallel-phase-path-policy.test.ts)
// ---------------------------------------------------------------------------

describe('canonicalizeAccessPath', () => {
  it('accepts a project-relative path', () => {
    const result = canonicalizeAccessPath(root, 'src/foo.ts');
    expect(result.ok).toBe(true);
    expect(result.relativePath).toBe('src/foo.ts');
  });

  it('accepts an in-root absolute path', () => {
    const result = canonicalizeAccessPath(root, join(root, 'src/foo.ts'));
    if (process.platform === 'win32') {
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('drive-letter-path');
      return;
    }
    expect(result.ok).toBe(true);
    expect(result.relativePath).toBe('src/foo.ts');
  });

  it('rejects a relative root escape', () => {
    const result = canonicalizeAccessPath(root, '../outside.ts');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('root-escape');
  });

  it('rejects an absolute path outside the project root', () => {
    if (process.platform === 'win32') {
      const result = canonicalizeAccessPath(root, 'C:/outside/passwd');
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('drive-letter-path');
      return;
    }
    const result = canonicalizeAccessPath(root, '/etc/passwd');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('root-escape');
  });

  it('rejects the project root itself (empty relative path)', () => {
    const result = canonicalizeAccessPath(root, root);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe(process.platform === 'win32' ? 'drive-letter-path' : 'root-escape');
  });

  it('rejects an empty path', () => {
    const result = canonicalizeAccessPath(root, '');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('empty-path');
  });

  it('rejects a drive-letter path', () => {
    expect(canonicalizeAccessPath(root, 'C:\\Users\\file.ts').reason).toBe('drive-letter-path');
  });

  it('rejects a UNC path', () => {
    expect(canonicalizeAccessPath(root, '//server/share/file.ts').reason).toBe('unc-path');
  });

  it('rejects a bare backslash path', () => {
    expect(canonicalizeAccessPath(root, 'src\\foo.ts').reason).toBe('backslash-path');
  });

  it('reports a trailing separator and strips it from the canonical form', () => {
    const result = canonicalizeAccessPath(root, 'src/dir/');
    expect(result.ok).toBe(true);
    expect(result.relativePath).toBe('src/dir');
    expect(result.hadTrailingSeparator).toBe(true);
  });

  it('does not report a trailing separator for a normal path', () => {
    expect(canonicalizeAccessPath(root, 'src/dir').hadTrailingSeparator).toBe(false);
  });

  it('accepts an exact extensionless file name', () => {
    const result = canonicalizeAccessPath(root, 'Dockerfile');
    expect(result.ok).toBe(true);
    expect(result.relativePath).toBe('Dockerfile');
  });
});

describe('walkProjectPath', () => {
  it('reports an existing non-directory target', () => {
    writeFileSync(join(root, 'file.ts'), 'x');
    expect(walkProjectPath(root, 'file.ts')).toEqual({ exists: true, isDirectory: false, symlinkComponent: false });
  });

  it('reports an absent target', () => {
    expect(walkProjectPath(root, 'missing.ts')).toEqual({ exists: false, isDirectory: false, symlinkComponent: false });
  });

  it('reports an existing directory', () => {
    mkdirSync(join(root, 'adir'));
    expect(walkProjectPath(root, 'adir')).toEqual({ exists: true, isDirectory: true, symlinkComponent: false });
  });

  it('rejects a symlink leaf', () => {
    writeFileSync(join(root, 'real.ts'), 'x');
    symlinkSync(join(root, 'real.ts'), join(root, 'link.ts'));
    expect(walkProjectPath(root, 'link.ts').symlinkComponent).toBe(true);
  });

  it('rejects a symlink ancestor', () => {
    mkdirSync(join(root, 'realdir'));
    writeFileSync(join(root, 'realdir', 'file.ts'), 'x');
    symlinkSync(join(root, 'realdir'), join(root, 'linkdir'));
    expect(walkProjectPath(root, 'linkdir/file.ts').symlinkComponent).toBe(true);
  });

  it('validates the nearest existing ancestor for an absent nested target', () => {
    mkdirSync(join(root, 'existingdir'));
    expect(walkProjectPath(root, 'existingdir/newfile.ts')).toEqual({ exists: false, isDirectory: false, symlinkComponent: false });
  });
});

describe('findNearestExistingAncestor', () => {
  it('returns the existing parent directory for an absent nested target', () => {
    mkdirSync(join(root, 'existingdir'));
    expect(findNearestExistingAncestor(root, 'existingdir/newfile.ts')).toBe(join(root, 'existingdir'));
  });

  it('returns the project root when even the immediate parent is absent', () => {
    expect(findNearestExistingAncestor(root, 'missingdir/newfile.ts')).toBe(root);
  });

  it('returns the full path when the target itself exists', () => {
    writeFileSync(join(root, 'file.ts'), 'x');
    expect(findNearestExistingAncestor(root, 'file.ts')).toBe(join(root, 'file.ts'));
  });
});

describe('checkGitIgnoredWrite', () => {
  it('denies a git-ignored path', () => {
    execFileSync('git', ['init', '-q'], { cwd: root });
    writeFileSync(join(root, '.gitignore'), 'ignored.txt\n');
    writeFileSync(join(root, 'ignored.txt'), 'x');
    expect(checkGitIgnoredWrite(root, 'ignored.txt')).toBe('ignored');
  });

  it('allows a non-ignored path', () => {
    execFileSync('git', ['init', '-q'], { cwd: root });
    writeFileSync(join(root, '.gitignore'), 'ignored.txt\n');
    writeFileSync(join(root, 'tracked.ts'), 'x');
    expect(checkGitIgnoredWrite(root, 'tracked.ts')).toBe('not-ignored');
  });

  it('fails closed when git reports a fatal error (not a repository)', () => {
    writeFileSync(join(root, 'file.ts'), 'x');
    expect(checkGitIgnoredWrite(root, 'file.ts')).toBe('error');
  });

  // A path inside a submodule is owned by the submodule's repository, so its
  // ignore rules — not the outer repository's — decide the answer. Asking the
  // outer repository makes git exit 128 instead of 0/1.
  describe('submodule paths', () => {
    /** Build `root` as a git repo with an initialized submodule at `sub/`, ignoring `skipme/` inside it. */
    function initRepoWithSubmodule(): void {
      const upstream = mkdtempSync(join(tmpdir(), 'disjoint-upstream-'));
      const commit = (cwd: string, message: string): void => {
        execFileSync('git', ['add', '-A'], { cwd });
        execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', message], { cwd });
      };

      execFileSync('git', ['init', '-q'], { cwd: upstream });
      writeFileSync(join(upstream, '.gitignore'), 'skipme/\n');
      writeFileSync(join(upstream, 'source.ts'), 'x');
      commit(upstream, 'init');

      execFileSync('git', ['init', '-q'], { cwd: root });
      writeFileSync(join(root, '.gitignore'), 'outeronly.txt\n');
      writeFileSync(join(root, 'r.txt'), 'x');
      commit(root, 'init');
      // Git refuses file:// submodules unless explicitly allowed.
      execFileSync('git', ['-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', upstream, 'sub'], { cwd: root });
      commit(root, 'add submodule');
    }

    it('allows a tracked file inside a submodule', () => {
      initRepoWithSubmodule();
      expect(checkGitIgnoredWrite(root, 'sub/source.ts')).toBe('not-ignored');
    });

    it("denies a path ignored by the submodule's own .gitignore", () => {
      initRepoWithSubmodule();
      mkdirSync(join(root, 'sub/skipme'), { recursive: true });
      writeFileSync(join(root, 'sub/skipme/out.js'), 'x');
      expect(checkGitIgnoredWrite(root, 'sub/skipme/out.js')).toBe('ignored');
    });

    it("does not apply the outer repository's ignore rules inside a submodule", () => {
      initRepoWithSubmodule();
      writeFileSync(join(root, 'sub/outeronly.txt'), 'x');
      expect(checkGitIgnoredWrite(root, 'outeronly.txt')).toBe('ignored');
      expect(checkGitIgnoredWrite(root, 'sub/outeronly.txt')).toBe('not-ignored');
    });

    it('allows a Create target whose parent directories do not exist yet', () => {
      initRepoWithSubmodule();
      expect(checkGitIgnoredWrite(root, 'sub/newdir/nested/new.ts')).toBe('not-ignored');
    });

    it('fails closed when the submodule is not initialized', () => {
      initRepoWithSubmodule();
      execFileSync('git', ['submodule', 'deinit', '-f', 'sub'], { cwd: root, stdio: 'ignore' });
      expect(checkGitIgnoredWrite(root, 'sub/source.ts')).toBe('error');
    });
  });
});

// ---------------------------------------------------------------------------
// Write-deny policy (ported from parallel-phase-write-deny-policy.test.ts)
// ---------------------------------------------------------------------------

describe('findFixedDenyReason', () => {
  it('denies any .git segment at any depth', () => {
    expect(findFixedDenyReason('.git/config')).not.toBeNull();
    expect(findFixedDenyReason('packages/app/.git/HEAD')).not.toBeNull();
  });

  it('denies a migrations segment', () => {
    expect(findFixedDenyReason('src/migrations/001-init.sql')).not.toBeNull();
  });

  it('denies a db/migrate sequence', () => {
    expect(findFixedDenyReason('src/db/migrate/001.ts')).not.toBeNull();
  });

  it('denies a database/migrate sequence', () => {
    expect(findFixedDenyReason('server/database/migrate/001.ts')).not.toBeNull();
  });

  it('allows a migrate segment without db/database prefix', () => {
    expect(findFixedDenyReason('src/migrate/tool.ts')).toBeNull();
  });

  describe('lock files (case-insensitive, any depth)', () => {
    const lockCases = [
      'bun.lockb', 'packages/app/bun.lockb', 'package-lock.json', 'PACKAGE-LOCK.JSON', 'npm-shrinkwrap.json',
      'pnpm-lock.yaml', 'go.sum', 'Package.resolved', 'package.resolved', 'nested/dir/foo.lock', 'FOO.LOCK',
    ];
    for (const p of lockCases) {
      it(`denies ${p}`, () => expect(findFixedDenyReason(p)).not.toBeNull());
    }
  });

  it('denies .github/** at any depth', () => {
    expect(findFixedDenyReason('.github/workflows/ci.yml')).not.toBeNull();
    expect(findFixedDenyReason('packages/foo/.github/workflows/ci.yml')).not.toBeNull();
  });

  it('denies .gitlab/** and .circleci/**', () => {
    expect(findFixedDenyReason('.gitlab/ci.yml')).not.toBeNull();
    expect(findFixedDenyReason('.circleci/config.yml')).not.toBeNull();
  });

  it('denies root tsconfig*.json only at root', () => {
    expect(findFixedDenyReason('tsconfig.json')).not.toBeNull();
    expect(findFixedDenyReason('tsconfig.build.json')).not.toBeNull();
    expect(findFixedDenyReason('packages/app/tsconfig.json')).toBeNull();
  });

  it('denies .gitignore, .gitattributes, AGENTS.md, CLAUDE.md at any depth', () => {
    expect(findFixedDenyReason('.gitignore')).not.toBeNull();
    expect(findFixedDenyReason('packages/app/.gitignore')).not.toBeNull();
    expect(findFixedDenyReason('.gitattributes')).not.toBeNull();
    expect(findFixedDenyReason('AGENTS.md')).not.toBeNull();
    expect(findFixedDenyReason('projects/tdk/CLAUDE.md')).not.toBeNull();
    expect(findFixedDenyReason('.claude/rules/CLAUDE.md')).not.toBeNull();
  });

  it('exports ROOT_SHARED_WRITE_DENY_NAMES and denies every entry at root only', () => {
    expect(ROOT_SHARED_WRITE_DENY_NAMES.size).toBeGreaterThan(0);
    for (const name of ROOT_SHARED_WRITE_DENY_NAMES) {
      expect(findFixedDenyReason(name)).not.toBeNull();
      expect(findFixedDenyReason(`nested/${name}`)).toBeNull();
    }
  });

  it('root shared names are matched case-sensitively', () => {
    expect(findFixedDenyReason('package.json')).not.toBeNull();
    expect(findFixedDenyReason('PACKAGE.JSON')).toBeNull();
  });

  it('exports ROOT_SHARED_WRITE_DENY_PATTERNS and denies requirements*.txt at root only, case-insensitive', () => {
    expect(ROOT_SHARED_WRITE_DENY_PATTERNS.length).toBeGreaterThan(0);
    expect(findFixedDenyReason('requirements.txt')).not.toBeNull();
    expect(findFixedDenyReason('requirements-dev.txt')).not.toBeNull();
    expect(findFixedDenyReason('REQUIREMENTS.TXT')).not.toBeNull();
    expect(findFixedDenyReason('nested/requirements.txt')).toBeNull();
  });

  it('denies top-level harness control trees .claude/**, .codex/**, .agents/**', () => {
    expect(findFixedDenyReason('.claude/rules/foo.md')).not.toBeNull();
    expect(findFixedDenyReason('.codex/hooks.json')).not.toBeNull();
    expect(findFixedDenyReason('.agents/skills/foo/SKILL.md')).not.toBeNull();
  });

  it('does not treat harness control trees as any-depth (top-level only)', () => {
    expect(findFixedDenyReason('packages/app/.claude/rules/foo.md')).toBeNull();
  });

  describe('TDK generated/state/registry paths', () => {
    const specifyCases = [
      '.specify/codex-plugins/tdk-core/plugin.json', '.specify/release-manifest.json', '.specify/.deps-cache.json',
      '.specify/scripts/.deps-cache.json.bak', '.specify/state/lease.json', '.specify/plugins/manifest.json',
      '.specify/plugins/plugin-dependencies.json', '.specify/.specify.json',
    ];
    for (const p of specifyCases) {
      it(`denies ${p}`, () => expect(findFixedDenyReason(p)).not.toBeNull());
    }

    it('denies distribute.json and .claude-plugin/marketplace.json', () => {
      expect(findFixedDenyReason('distribute.json')).not.toBeNull();
      expect(findFixedDenyReason('.claude-plugin/marketplace.json')).not.toBeNull();
    });
  });

  it('allows an ordinary project source file', () => {
    expect(findFixedDenyReason('src/commands/util/some-file.ts')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Host adapters, re-exported (ported from parallel-phase-case-probe.test.ts
// and parallel-phase-mount-capability.test.ts)
// ---------------------------------------------------------------------------

describe('probeProjectCaseSensitivity', () => {
  it('reports host case behavior and leaves no residue behind', () => {
    const result = probeProjectCaseSensitivity(root);
    if (process.platform !== 'win32') expect(result.ok).toBe(true);
    else if (!result.ok) expect(result.reason).toBe('case-insensitive-root');
    expect(readdirSync(root)).toHaveLength(0);
  });

  it('rejects when the case-swapped sentinel aliases the original (simulated case-insensitive root)', () => {
    const result = probeProjectCaseSensitivity(root, { detectAlias: () => true });
    expect(result.ok).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it('rejects and reports a probe error when the root cannot be probed', () => {
    const result = probeProjectCaseSensitivity(join(root, 'does-not-exist'));
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('case-probe-error');
  });

  it('rejects on cleanup failure, reports the exact bounded sentinel path, and calls removeDir exactly once with it', () => {
    const removedPaths: string[] = [];
    const result = probeProjectCaseSensitivity(root, {
      removeDir: (p) => { removedPaths.push(p); throw new Error('simulated cleanup failure'); },
    });
    expect(result.ok).toBe(false);
    expect(removedPaths).toHaveLength(1);
    expect(removedPaths[0]!.startsWith(root)).toBe(true);
    expect(result.reason).toContain(removedPaths[0]!);
  });
});

describe('parseMountInfo / resolveProjectFilesystemCapability', () => {
  it('parses fields and decodes octal mount-point escapes', () => {
    const records = parseMountInfo('100 1 0:1 / /mnt/wsl/My\\040Project rw,relatime shared:1 - ext4 /dev/sdb rw\n');
    expect(records).toHaveLength(1);
    expect(records![0]).toEqual({ mountId: 100, mountPoint: '/mnt/wsl/My Project', fsType: 'ext4' });
  });

  it('skips blank lines without rejecting', () => {
    const records = parseMountInfo('\n\n100 1 0:1 / / rw - ext4 /dev/sda rw\n\n');
    expect(records).not.toBeNull();
    expect(records![0]!.mountPoint).toBe('/');
  });

  it('rejects (returns null) when any non-blank line is unparsable, even alongside a parsable record', () => {
    expect(parseMountInfo('100 1 0:1 / / rw - ext4 /dev/sda rw\nnot a valid mountinfo line\n')).toBeNull();
  });

  it('rejects native Windows before any check', () => {
    expect(resolveProjectFilesystemCapability('/proj', ['/proj/src'], { platform: 'win32' }).ok).toBe(false);
  });

  it('Linux: longest boundary match accepts a same-mount access path', () => {
    const text = '100 1 0:1 / /proj rw shared:1 - ext4 /dev/sda rw\n';
    expect(resolveProjectFilesystemCapability('/proj', ['/proj/src/file.ts'], { platform: 'linux', readMountInfoText: () => text }).ok).toBe(true);
  });

  it('Linux: decodes escaped mount points and still matches', () => {
    const text = '100 1 0:1 / /mnt/wsl/My\\040Project rw shared:1 - ext4 /dev/sdb rw\n';
    const result = resolveProjectFilesystemCapability('/mnt/wsl/My Project', ['/mnt/wsl/My Project/src'], { platform: 'linux', readMountInfoText: () => text });
    expect(result.ok).toBe(true);
  });

  it('Linux: picks the LONGEST boundary match for distinct-length mount points', () => {
    const text = ['100 1 0:1 / / rw shared:1 - ext4 /dev/sda rw', '200 100 0:2 / /proj rw shared:2 - ext4 /dev/sdb rw'].join('\n');
    expect(resolveProjectFilesystemCapability('/proj', ['/proj/src'], { platform: 'linux', readMountInfoText: () => text }).ok).toBe(true);
  });

  it('Linux: a later record at the same mount point wins the tie-break, not the first', () => {
    const text = [
      '100 1 0:1 / /proj rw shared:1 - ext4 /dev/sda rw',
      '200 1 0:2 / /proj rw shared:2 - ext4 /dev/sdb rw',
      '200 200 0:3 / /proj/sub rw shared:3 - ext4 /dev/sdb rw',
    ].join('\n');
    const result = resolveProjectFilesystemCapability('/proj', ['/proj/sub/file.ts'], { platform: 'linux', readMountInfoText: () => text });
    expect(result.ok).toBe(true);
  });

  it('Linux: regression — an ext4 record followed by a drvfs record at the same mount point rejects (Finding A)', () => {
    const text = ['100 1 0:1 / /proj rw shared:1 - ext4  /dev/sda rw', '200 1 0:2 / /proj rw shared:2 - drvfs C:\\      rw'].join('\n');
    const result = resolveProjectFilesystemCapability('/proj', ['/proj/src/x.ts'], { platform: 'linux', readMountInfoText: () => text });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('drvfs-root');
  });

  it('Linux: rejects a nested mount with a different mount ID under the project root', () => {
    const text = ['100 1 0:1 / /proj rw shared:1 - ext4 /dev/sda rw', '200 100 0:2 / /proj/nested rw shared:2 - ext4 /dev/sdb rw'].join('\n');
    expect(resolveProjectFilesystemCapability('/proj', ['/proj/nested/file.ts'], { platform: 'linux', readMountInfoText: () => text }).ok).toBe(false);
  });

  it('Linux: rejects when the project root itself is drvfs', () => {
    const text = '100 1 0:1 / /proj rw shared:1 - drvfs C:\\ rw\n';
    expect(resolveProjectFilesystemCapability('/proj', ['/proj/file.ts'], { platform: 'linux', readMountInfoText: () => text }).ok).toBe(false);
  });

  it('Linux: rejects (case-insensitive) when an access path resolves under a DrvFS mount', () => {
    const text = ['100 1 0:1 / /proj rw shared:1 - ext4 /dev/sda rw', '200 100 0:2 / /proj/win rw shared:2 - DrvFs C:\\ rw'].join('\n');
    expect(resolveProjectFilesystemCapability('/proj', ['/proj/win/file.ts'], { platform: 'linux', readMountInfoText: () => text }).ok).toBe(false);
  });

  it('Linux: accepts a case-sensitive WSL distro root (ext4, not drvfs)', () => {
    const text = '100 1 0:1 / /home/user/project rw shared:1 - ext4 /dev/sdb rw\n';
    expect(resolveProjectFilesystemCapability('/home/user/project', ['/home/user/project/src/x.ts'], { platform: 'linux', readMountInfoText: () => text }).ok).toBe(true);
  });

  it('Linux: unknown root (no matching record) rejects', () => {
    const text = '100 1 0:1 / /somewhere-else rw shared:1 - ext4 /dev/sda rw\n';
    expect(resolveProjectFilesystemCapability('/proj', ['/proj/file.ts'], { platform: 'linux', readMountInfoText: () => text }).ok).toBe(false);
  });

  it('Linux: missing/malformed mountinfo rejects (unknown)', () => {
    const result = resolveProjectFilesystemCapability('/proj', ['/proj/file.ts'], {
      platform: 'linux', readMountInfoText: () => { throw new Error('ENOENT'); },
    });
    expect(result.ok).toBe(false);
  });

  it('non-Linux: same device for root and access paths accepts', () => {
    expect(resolveProjectFilesystemCapability('/proj', ['/proj/a.ts', '/proj/b.ts'], { platform: 'darwin', lstatDev: () => 42 }).ok).toBe(true);
  });

  it('non-Linux: a device change on an access path rejects', () => {
    const devByPath: Record<string, number> = { '/proj': 1, '/proj/a.ts': 1, '/proj/other-volume/b.ts': 2 };
    const result = resolveProjectFilesystemCapability('/proj', ['/proj/a.ts', '/proj/other-volume/b.ts'], {
      platform: 'darwin', lstatDev: (p) => devByPath[p] ?? -1,
    });
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkPhaseWriteDisjointness — the CLI pipeline over JSON access-set input.
// The `resolvePhaseAccess`/`isPathWithinEffectiveReadAuthority` directional
// (write-read vs read-write) and same-path/ancestor `detectPhaseAccessConflicts`
// assertions do not port verbatim: the new `{a, b, paths[]}` output contract
// drops the old `access`/`overlap` fields by design (spec's leaner shape).
// Ported as behavioral equivalents below: same pairs still conflict, read/read
// still never does. `isPathWithinEffectiveReadAuthority` itself has no
// surviving caller (grepped: only parallel-phase-wave-resolver.ts and
// resolve-parallel-phase-wave-input-builder.ts, both phase-4 delete-set) so
// its 4 assertions are dropped, not ported.
// ---------------------------------------------------------------------------

describe('checkPhaseWriteDisjointness', () => {
  it('output shape matches {safe, conflicts, rejected}', () => {
    file('src/a.ts');
    const result = checkPhaseWriteDisjointness([decl(1, { read: ['src/a.ts'] })], root, 'validate-only');
    expect(result).toEqual({ safe: [1], conflicts: [], rejected: [] });
  });

  it('validate-only never invokes the case-probe or mount-capability adapters (spies)', () => {
    initGitRepo();
    const probeCalls: number[] = [];
    const capabilityCalls: number[] = [];
    const declarations = [decl(1, { create: ['src/new-1.ts'] }), decl(2, { create: ['src/new-2.ts'] })];

    const { safe, conflicts, rejected } = checkPhaseWriteDisjointness(declarations, root, 'validate-only', {
      probeCaseSensitivity: (p) => { probeCalls.push(1); return { ok: true } satisfies CaseProbeResult; },
      resolveCapability: (p, a) => { capabilityCalls.push(1); return { ok: true } satisfies FilesystemCapabilityResult; },
    });

    expect(probeCalls.length).toBe(0);
    expect(capabilityCalls.length).toBe(0);
    expect(safe).toEqual([1, 2]);
    expect(conflicts).toEqual([]);
    expect(rejected).toEqual([]);
  });

  it('validate-only performs zero filesystem side effects, proven with real (non-mocked) adapters on a read-only root', () => {
    initGitRepo();
    file('src/existing.ts');
    const before = readdirSync(root, { recursive: true } as never).sort();
    checkPhaseWriteDisjointness([decl(1, { modify: ['src/existing.ts'] })], root, 'validate-only');
    expect(readdirSync(root, { recursive: true } as never).sort()).toEqual(before);

    // The real case-probe mkdirs a sentinel under the root and cleans it up in a
    // `finally`, so a before/after diff alone cannot distinguish "never ran" from
    // "ran and cleaned up". Force the mkdir to fail with EACCES if it ever runs.
    chmodSync(root, 0o500);
    try {
      const result = checkPhaseWriteDisjointness([decl(1, { modify: ['src/existing.ts'] })], root, 'validate-only');
      expect(result.rejected).toEqual([]);
    } finally {
      chmodSync(root, 0o700);
    }
  });

  it('scheduling mode invokes both the case-probe and mount-capability adapters', () => {
    initGitRepo();
    let probeCalls = 0;
    let capabilityCalls = 0;
    file('src/existing.ts');

    checkPhaseWriteDisjointness([decl(1, { modify: ['src/existing.ts'] })], root, 'schedule', {
      probeCaseSensitivity: () => { probeCalls++; return { ok: true }; },
      resolveCapability: () => { capabilityCalls++; return { ok: true }; },
    });

    expect(probeCalls).toBeGreaterThan(0);
    expect(capabilityCalls).toBeGreaterThan(0);
  });

  it('scheduling mode rejects every valid phase when mount capability is unsupported', () => {
    initGitRepo();
    file('src/existing.ts');
    const result = checkPhaseWriteDisjointness([decl(1, { modify: ['src/existing.ts'] })], root, 'schedule', {
      resolveCapability: () => ({ ok: false, reason: 'drvfs-root' }),
    });
    expect(result.safe).toEqual([]);
    expect(result.rejected).toEqual([{ phase: 1, code: 'FILESYSTEM_CAPABILITY_UNSUPPORTED', message: 'drvfs-root' }]);
  });

  it('rejects a glob path from JSON input (step 1, shared with extractPhaseAccess)', () => {
    const result = checkPhaseWriteDisjointness([decl(1, { modify: ['src/*.ts'] })], root, 'validate-only');
    expect(result.rejected).toEqual([{ phase: 1, code: 'GLOB_ACCESS_PATH', message: "access path must not contain a glob: 'src/*.ts'" }]);
  });

  it('rejects a symlinked ancestor from JSON input (step 2, shared with extractPhaseAccess)', () => {
    mkdirSync(join(root, 'realdir'));
    writeFileSync(join(root, 'realdir', 'file.ts'), 'x');
    symlinkSync(join(root, 'realdir'), join(root, 'linkdir'));
    const result = checkPhaseWriteDisjointness([decl(1, { modify: ['linkdir/file.ts'] })], root, 'validate-only');
    expect(result.rejected).toEqual([{ phase: 1, code: 'ACCESS_PATH_SYMLINK_COMPONENT', message: "'linkdir/file.ts' has a symlink component", path: 'linkdir/file.ts' }]);
  });

  it('rejects a git-ignored write and a fixed-deny write (step 6) from JSON input', () => {
    initGitRepo();
    file('.gitignore', 'dist/\n');
    file('package.json', '{}');
    const result = checkPhaseWriteDisjointness([
      decl(1, { create: ['dist/out.js'] }),
      decl(2, { modify: ['package.json'] }),
    ], root, 'validate-only');
    expect(result.safe).toEqual([]);
    expect(result.rejected.map((r) => r.code).sort()).toEqual(['DENIED_WRITE_PATH', 'GIT_IGNORED_WRITE_PATH']);
  });

  it('write/write conflict on the exact same path', () => {
    initGitRepo();
    const result = checkPhaseWriteDisjointness([
      decl(1, { create: ['src/config.ts'] }),
      decl(2, { create: ['src/config.ts'] }),
    ], root, 'validate-only');
    expect(result.conflicts).toEqual([{ a: 1, b: 2, paths: ['src/config.ts'] }]);
    expect(result.safe).toEqual([]);
  });

  it('write/read conflict: one phase modifies what another declares as a read', () => {
    initGitRepo();
    file('docs/readme.md');
    const result = checkPhaseWriteDisjointness([
      decl(1, { modify: ['docs/readme.md'] }),
      decl(2, { read: ['docs/readme.md'] }),
    ], root, 'validate-only');
    expect(result.conflicts).toEqual([{ a: 1, b: 2, paths: ['docs/readme.md'] }]);
  });

  it('read/write conflict: same pair, reversed declaration order, still conflicts', () => {
    initGitRepo();
    file('docs/readme.md');
    const result = checkPhaseWriteDisjointness([
      decl(1, { read: ['docs/readme.md'] }),
      decl(2, { modify: ['docs/readme.md'] }),
    ], root, 'validate-only');
    expect(result.conflicts).toEqual([{ a: 1, b: 2, paths: ['docs/readme.md'] }]);
  });

  it('read/read overlap does not conflict', () => {
    file('docs/readme.md');
    const result = checkPhaseWriteDisjointness([
      decl(1, { read: ['docs/readme.md'] }),
      decl(2, { read: ['docs/readme.md'] }),
    ], root, 'validate-only');
    expect(result.conflicts).toEqual([]);
    expect(result.safe).toEqual([1, 2]);
  });

  // New regression test (plan-mandated): prefix containment, both modes — pure
  // path logic, no host call. Paths deliberately never created on disk: a real
  // `src/api` directory would trip ACCESS_TARGET_IS_DIRECTORY on a Modify/Read
  // target before reaching pairwise intersect, so both sides use non-existent
  // Create targets to isolate the containment rule under test.
  it('prefix containment: src/api vs src/api/users.ts conflicts in both modes', () => {
    initGitRepo();
    const declarations = [decl(1, { create: ['src/api'] }), decl(2, { create: ['src/api/users.ts'] })];
    for (const mode of ['validate-only', 'schedule'] as const) {
      const result = checkPhaseWriteDisjointness(declarations, root, mode);
      expect(result.conflicts).toEqual([{ a: 1, b: 2, paths: ['src/api', 'src/api/users.ts'] }]);
    }
  });

  // New regression test (plan-mandated): case-fold conflict, scheduling mode
  // only. The real case-probe result depends on the host filesystem, so the
  // adapter is injected to deterministically simulate a case-insensitive root.
  it('case-fold: src/Foo.ts vs src/foo.ts conflicts in scheduling mode when the host is case-insensitive', () => {
    initGitRepo();
    const declarations = [decl(1, { create: ['src/Foo.ts'] }), decl(2, { create: ['src/foo.ts'] })];

    const scheduled = checkPhaseWriteDisjointness(declarations, root, 'schedule', {
      probeCaseSensitivity: () => ({ ok: false, reason: 'case-insensitive-root' }),
    });
    expect(scheduled.conflicts).toEqual([{ a: 1, b: 2, paths: ['src/Foo.ts', 'src/foo.ts'] }]);
    expect(scheduled.safe).toEqual([]);
  });

  it('case-fold: deferred under --validate-only regardless of host case sensitivity (no probe call)', () => {
    initGitRepo();
    const declarations = [decl(1, { create: ['src/Foo.ts'] }), decl(2, { create: ['src/foo.ts'] })];
    const result = checkPhaseWriteDisjointness(declarations, root, 'validate-only');
    expect(result.conflicts).toEqual([]);
    expect(result.safe).toEqual([1, 2]);
  });

  it('fail-closed invariant: no phase in `safe` also appears in `conflicts` or `rejected`', () => {
    initGitRepo();
    file('.gitignore', 'dist/\n');
    file('docs/readme.md');
    const declarations = [
      decl(1, { create: ['src/config.ts'] }),
      decl(2, { create: ['src/config.ts'] }), // conflicts with 1
      decl(3, { create: ['dist/out.js'] }), // rejected: git-ignored
      decl(4, { read: ['docs/readme.md'] }), // safe
    ];
    const result = checkPhaseWriteDisjointness(declarations, root, 'validate-only');
    const unsafe = new Set([...result.conflicts.flatMap((c) => [c.a, c.b]), ...result.rejected.map((r) => r.phase)]);
    for (const phase of result.safe) expect(unsafe.has(phase)).toBe(false);
    expect(result.safe).toEqual([4]);
  });
});
