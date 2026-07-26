import { describe, expect, it } from 'bun:test';
import {
  findFixedDenyReason,
  ROOT_SHARED_WRITE_DENY_NAMES,
  ROOT_SHARED_WRITE_DENY_PATTERNS,
} from '../src/commands/util/parallel-phase-write-deny-policy';

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
      'bun.lockb',
      'packages/app/bun.lockb',
      'package-lock.json',
      'PACKAGE-LOCK.JSON',
      'npm-shrinkwrap.json',
      'pnpm-lock.yaml',
      'go.sum',
      'Package.resolved',
      'package.resolved',
      'nested/dir/foo.lock',
      'FOO.LOCK',
    ];
    for (const p of lockCases) {
      it(`denies ${p}`, () => {
        expect(findFixedDenyReason(p)).not.toBeNull();
      });
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
      '.specify/codex-plugins/tdk-core/plugin.json',
      '.specify/release-manifest.json',
      '.specify/.deps-cache.json',
      '.specify/scripts/.deps-cache.json.bak',
      '.specify/state/lease.json',
      '.specify/plugins/manifest.json',
      '.specify/plugins/plugin-dependencies.json',
      '.specify/.specify.json',
    ];
    for (const p of specifyCases) {
      it(`denies ${p}`, () => {
        expect(findFixedDenyReason(p)).not.toBeNull();
      });
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
