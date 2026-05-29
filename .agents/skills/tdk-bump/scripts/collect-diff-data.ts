#!/usr/bin/env bun
// Collect git diff data for .specify/, .claude/, .github/ config changes.
//
// Outputs structured JSON: version (from marketplace.json) + filtered/grouped changes.
// Config (changelog.exclude) is read from .specify/.specify.json.
// Purely mechanical — no AI logic. Used by tdk-bump SKILL.md.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

// Directories to track
const TRACKED_PREFIXES = [".specify/", ".claude/", ".github/"] as const;

// Always excluded from changelog
const DEFAULT_EXCLUDES = [".specify/CHANGELOG.md"] as const;

// Path prefix → component group label
const COMPONENT_MAP: readonly [string, string][] = [
  [".claude/scripts/", "Claude Scripts"],
  [".claude/commands/", "Claude Commands"],
  [".claude/templates/", "Claude Templates"],
  [".claude/skills/", "Claude Skills"],
  [".claude/agents/", "Claude Agents"],
  [".claude/hooks/", "Claude Hooks"],
  [".specify/scripts/", "Scripts"],
  [".specify/commands/", "Commands"],
  [".specify/templates/", "Templates"],
  [".specify/**/skills/", "Skills"],
  [".specify/**/agents/", "Agents"],
  [".specify/**/hooks/", "Hooks"],
  [".specify/configurations/", "Configurations"],
  [".specify/docs/guides/", "Guides"],
  [".specify/docs/setup/", "Setup"],
  [".specify/docs/", "Docs"],
];

interface DiffEntry {
  status: string;
  path: string;
  old_path?: string;
  group?: string;
}

interface Output {
  version: string | null;
  changes: DiffEntry[];
}

/** Convert a path prefix (supports ** / * glob) to a regex for startswith matching. */
export function prefixToRegex(prefix: string): RegExp {
  // Escape regex special chars (matches Python `re.escape`)
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Replace escaped \*\* with .+ (one or more path segments incl. slashes)
  // Replace escaped \* with [^/]+ (exactly one path segment)
  const pattern = escaped.replace(/\\\*\\\*/g, ".+").replace(/\\\*/g, "[^/]+");
  return new RegExp("^" + pattern);
}

/** Map file path to component group label. Supports ** glob in COMPONENT_MAP prefixes. */
export function classifyGroup(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  for (const [prefix, label] of COMPONENT_MAP) {
    if (prefix.includes("**") || prefix.includes("*")) {
      if (prefixToRegex(prefix).test(normalized)) return label;
    } else if (normalized.startsWith(prefix)) {
      return label;
    }
  }
  // Fallback for top-level .specify/ files and anything else
  return "General";
}

/** Check if path matches any exclude pattern. Supports glob (**), trailing slash, exact. */
export function isExcluded(path: string, excludes: readonly string[]): boolean {
  const normalized = path.replace(/\\/g, "/");
  for (const pattern of excludes) {
    const p = pattern.replace(/\\/g, "/");
    if (p.includes("**") || p.includes("*")) {
      if (prefixToRegex(p).test(normalized)) return true;
    } else if (p.endsWith("/")) {
      if (normalized.startsWith(p)) return true;
    } else {
      if (normalized === p) return true;
    }
  }
  return false;
}

/** Check if path belongs to a tracked directory. */
export function isTracked(path: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  return TRACKED_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

/** Parse git diff --name-status output into structured entries. */
export function parseDiffLines(lines: string[]): DiffEntry[] {
  const entries: DiffEntry[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    const statusRaw = (parts[0] ?? "").trim();
    if (!statusRaw) continue;
    const status = statusRaw[0]!; // Normalize R100 → R

    if ((status === "R" || status === "C") && parts.length >= 3) {
      entries.push({ status, old_path: parts[1]!, path: parts[2]! });
    } else if (parts.length >= 2) {
      entries.push({ status, path: parts[1]! });
    }
  }
  return entries;
}

/** Auto-detect git repository root. */
async function detectGitRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;
  if (proc.exitCode !== 0) {
    console.error("Error: not a git repository");
    process.exit(1);
  }
  const stdout = await new Response(proc.stdout).text();
  return stdout.trim();
}

/** Read version from marketplace.json metadata.version. Returns semver or null. */
async function parseMarketplaceVersion(projectRoot: string): Promise<string | null> {
  const marketplacePath = join(projectRoot, ".claude-plugin", "marketplace.json");
  if (!existsSync(marketplacePath)) return null;
  try {
    const data = await Bun.file(marketplacePath).json();
    const version = data?.metadata?.version;
    return version || null;
  } catch {
    return null;
  }
}

/** Read changelog.exclude from .specify/.specify.json. */
async function parseChangelogExcludes(projectRoot: string): Promise<string[]> {
  const jsonPath = join(projectRoot, ".specify", ".specify.json");

  if (!existsSync(jsonPath)) {
    const yamlPath = join(projectRoot, ".specify", ".specify.yaml");
    if (existsSync(yamlPath)) {
      console.error(
        "speckit: found .specify.yaml but .specify.json is required. Run:\n  bash .specify/scripts/bash/migrate-yaml-to-json.sh",
      );
      process.exit(1);
    } else {
      console.error("speckit: .specify/.specify.json not found.");
      process.exit(1);
    }
  }

  try {
    const data = await Bun.file(jsonPath).json();
    const changelogCfg = data?.changelog;
    if (!changelogCfg || typeof changelogCfg !== "object" || Array.isArray(changelogCfg)) {
      return [];
    }
    const excludes = changelogCfg.exclude;
    return Array.isArray(excludes) ? excludes : [];
  } catch {
    return [];
  }
}

/** Run git diff --name-status and return raw output lines. */
async function runGitDiff(projectRoot: string, sinceRef: string | undefined): Promise<string[]> {
  const cmd = sinceRef
    ? ["git", "diff", "--name-status", `${sinceRef}..HEAD`]
    : ["git", "diff", "--cached", "--name-status"];
  const proc = Bun.spawn(cmd, { cwd: projectRoot, stdout: "pipe", stderr: "pipe" });
  await proc.exited;
  if (proc.exitCode !== 0) {
    const stderr = (await new Response(proc.stderr).text()).trim();
    console.error(`Error running git diff: ${stderr}`);
    process.exit(1);
  }
  const stdout = await new Response(proc.stdout).text();
  return stdout.trim() ? stdout.trim().split(/\r?\n/) : [];
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      since: { type: "string" },
      "project-root": { type: "string" },
    },
    allowPositionals: false,
    strict: true,
  });

  const projectRoot = values["project-root"] ?? (await detectGitRoot());

  const version = await parseMarketplaceVersion(projectRoot);
  const customExcludes = await parseChangelogExcludes(projectRoot);
  const allExcludes = [...DEFAULT_EXCLUDES, ...customExcludes];

  const diffLines = await runGitDiff(projectRoot, values.since);
  const entries = parseDiffLines(diffLines);

  const changes: DiffEntry[] = [];
  for (const entry of entries) {
    if (!isTracked(entry.path)) continue;
    if (isExcluded(entry.path, allExcludes)) continue;
    entry.group = classifyGroup(entry.path);
    changes.push(entry);
  }

  const output: Output = { version, changes };
  console.log(JSON.stringify(output, null, 2));
}

if (import.meta.main) {
  await main();
}
