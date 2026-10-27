// Fitness guard: TDK consumers (every plugin except tdk-memory, plus the shared
// templates) must learn the memory root from the Status Block
// (`/tdk-memory-query --status`) and must not name, resolve, or read it themselves.
//
// Three patterns fail the scan:
//   1. the default root literal `.specify/memory`
//   2. self-resolution of the root: `memory.path`, or `specs.root` next to a quoted `memory`
//   3. a direct read of `memory-index.md` / `memory.yaml` (file name on the same line as a read verb)
//
// `--memory-root <root>` is not matched on purpose: a consumer legitimately forwards the
// root from its own Status Block to `--ensure-templates` and `--finalize-written`.
//
// Allowlists carry a reason. Hand-written files are matched per line (by the line text, so
// unrelated edits that move line numbers do not break them); generated bundles embed the
// literal in zod defaults and shift lines on every rebuild, so they are allowed per file.

import { describe, expect, it } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const SPECIFY_ROOT = resolve(import.meta.dir, '../../..');
const SCANNED_EXTENSIONS = new Set(['.md', '.cjs', '.js', '.ts', '.tpl']);
const EXCLUDED_DIR_NAMES = new Set(['node_modules', 'tests', '__tests__']);
const EXCLUDED_FILE_NAMES = new Set(['CHANGELOG.md']);
// tdk-memory owns the memory contract; it is the only plugin allowed to name the root.
const EXCLUDED_PLUGIN = 'tdk-memory';

type PatternId = 'default-root-literal' | 'self-resolved-root' | 'direct-index-or-manifest-read';

interface PatternRule {
  id: PatternId;
  matches: (line: string) => boolean;
}

const READ_VERB = /\b(?:Read|read|Glob|glob|exists|open|parse|load)\b/;
const INDEX_OR_MANIFEST = /memory-index\.md|memory\.yaml/;

const PATTERN_RULES: PatternRule[] = [
  { id: 'default-root-literal', matches: (line) => line.includes('.specify/memory') },
  {
    id: 'self-resolved-root',
    matches: (line) => /memory\.path/.test(line) || /specs\.root[^\n]*['"]memory['"]/.test(line),
  },
  {
    id: 'direct-index-or-manifest-read',
    matches: (line) => INDEX_OR_MANIFEST.test(line) && READ_VERB.test(line),
  },
];

interface LineAllowance {
  file: string; // path relative to .specify/
  lineIncludes: string; // trimmed line must contain this text
  patterns: PatternId[];
  reason: string;
}

interface FileAllowance {
  file: string;
  patterns: PatternId[];
  reason: string;
}

const CONFIG_READER = 'plugins/tdk-core/lib/speckit-config-reader.cjs';

const ALLOWED_LINES: LineAllowance[] = [
  {
    file: CONFIG_READER,
    lineIncludes: "const DEFAULT_MEMORY_PATH = '.specify/memory';",
    patterns: ['default-root-literal'],
    reason: 'Hook-side fallback for the memory context line; hooks cannot run the Status Block step.',
  },
  {
    file: CONFIG_READER,
    lineIncludes: 'metacharacters are never valid in memory.path',
    patterns: ['self-resolved-root'],
    reason: 'Comment on the hook-side config reader that names the setting it validates.',
  },
  {
    file: CONFIG_READER,
    lineIncludes: 'Returns `memory.path` exactly as configured',
    patterns: ['self-resolved-root'],
    reason: 'Doc comment of the hook-side config reader.',
  },
  {
    file: CONFIG_READER,
    lineIncludes: 'config.memory && config.memory.path',
    patterns: ['self-resolved-root'],
    reason: 'Hook-side read of the configured path; hooks cannot run the Status Block step.',
  },
];

const ALLOWED_FILES: FileAllowance[] = [
  {
    file: 'plugins/tdk-core/skills/tdk-review/scripts/review-scope.js',
    patterns: ['default-root-literal', 'self-resolved-root'],
    reason: 'Generated bundle: embeds the memory settings defaults of the shared config schema.',
  },
  {
    file: 'plugins/tdk-utils/skills/tdk-handoff/scripts/handoff-export.js',
    patterns: ['default-root-literal', 'self-resolved-root'],
    reason: 'Generated bundle: embeds the memory settings defaults of the shared config schema.',
  },
];

interface Violation {
  file: string;
  line: number;
  pattern: PatternId;
  text: string;
}

const REMEDIATION = 'use the Status Block (`/tdk-memory-query --status`) instead of naming, resolving, or reading the memory root';

function scanText(file: string, content: string): Violation[] {
  const violations: Violation[] = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i]!;
    for (const rule of PATTERN_RULES) {
      if (!rule.matches(text)) continue;
      const fileAllowed = ALLOWED_FILES.some((a) => a.file === file && a.patterns.includes(rule.id));
      const lineAllowed = ALLOWED_LINES.some(
        (a) => a.file === file && a.patterns.includes(rule.id) && text.includes(a.lineIncludes),
      );
      if (!fileAllowed && !lineAllowed) {
        violations.push({ file, line: i + 1, pattern: rule.id, text: text.trim() });
      }
    }
  }
  return violations;
}

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIR_NAMES.has(entry.name)) walk(full, out);
      continue;
    }
    if (!entry.isFile() || EXCLUDED_FILE_NAMES.has(entry.name)) continue;
    const dot = entry.name.lastIndexOf('.');
    if (dot >= 0 && SCANNED_EXTENSIONS.has(entry.name.slice(dot))) out.push(full);
  }
}

function collectScannedFiles(): string[] {
  const files: string[] = [];
  const pluginsRoot = join(SPECIFY_ROOT, 'plugins');
  if (existsSync(pluginsRoot)) {
    for (const plugin of readdirSync(pluginsRoot, { withFileTypes: true })) {
      if (plugin.isDirectory() && plugin.name !== EXCLUDED_PLUGIN) walk(join(pluginsRoot, plugin.name), files);
    }
  }
  const templatesRoot = join(SPECIFY_ROOT, 'templates');
  if (existsSync(templatesRoot)) walk(templatesRoot, files);
  return files;
}

function formatViolation(v: Violation): string {
  return `${v.file}:${v.line} [${v.pattern}] ${v.text}\n    -> ${REMEDIATION}`;
}

describe('memory root literal fitness', () => {
  it('scans plugins and templates but not tdk-memory', () => {
    const files = collectScannedFiles().map((f) => relative(SPECIFY_ROOT, f));
    expect(files.length).toBeGreaterThan(0);
    expect(files.some((f) => f.startsWith('plugins/tdk-core/'))).toBe(true);
    expect(files.some((f) => f.startsWith('templates/'))).toBe(true);
    expect(files.some((f) => f.startsWith('plugins/tdk-memory/'))).toBe(false);
  });

  it('has no consumer that names, resolves, or reads the memory root itself', () => {
    const violations = collectScannedFiles().flatMap((abs) =>
      scanText(relative(SPECIFY_ROOT, abs), readFileSync(abs, 'utf-8')),
    );
    expect(violations.map(formatViolation)).toEqual([]);
  });

  it('keeps every allowlist entry live and justified', () => {
    for (const entry of [...ALLOWED_LINES, ...ALLOWED_FILES]) {
      expect(entry.reason.length).toBeGreaterThan(10);
      const abs = join(SPECIFY_ROOT, entry.file);
      expect(existsSync(abs)).toBe(true);
    }
    for (const entry of ALLOWED_LINES) {
      const content = readFileSync(join(SPECIFY_ROOT, entry.file), 'utf-8');
      expect(content.includes(entry.lineIncludes)).toBe(true);
    }
  });

  describe('patterns fail on a violating line', () => {
    const probe = 'plugins/tdk-core/skills/sample/SKILL.md';

    it('default root literal', () => {
      const found = scanText(probe, 'Write notes to `.specify/memory/domains/`.');
      expect(found.map((v) => v.pattern)).toEqual(['default-root-literal']);
    });

    it('self-resolved root', () => {
      expect(scanText(probe, 'Take the root from `memory.path` in the config.').map((v) => v.pattern)).toEqual([
        'self-resolved-root',
      ]);
      expect(scanText(probe, 'const root = join(specs.root, "memory");').map((v) => v.pattern)).toEqual([
        'self-resolved-root',
      ]);
    });

    it('direct index or manifest read', () => {
      expect(scanText(probe, 'Read memory-index.md to find the domain.').map((v) => v.pattern)).toEqual([
        'direct-index-or-manifest-read',
      ]);
      expect(scanText(probe, 'Confirm memory.yaml exists.').map((v) => v.pattern)).toEqual([
        'direct-index-or-manifest-read',
      ]);
    });

    it('does not flag a forwarded Status Block root or a plain mention without a read verb', () => {
      expect(scanText(probe, 'Run `/tdk-memory-init --ensure-templates --memory-root <memoryRoot>`.')).toEqual([]);
      expect(scanText(probe, 'tdk-memory-update regenerates memory-index.md and refreshes memory.yaml.')).toEqual([]);
    });
  });
});
