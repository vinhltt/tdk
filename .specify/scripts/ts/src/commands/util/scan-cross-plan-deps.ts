// CLI: scan-cross-plan-deps
// Walks .specify/<specsRoot>/**/plan.md, builds a content-hash cache,
// and runs cross-plan dependency detection. Emits JSON to stdout.
// Detection is advisory; failures never STOP plan creation.
//
// Bun runtime required (matches setup-plan.ts precedent — Validation S4 D15).

import { readFileSync, writeFileSync, renameSync, existsSync, statSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { Command } from 'commander';
import { loadFeatureEnv, getRepoRoot, formatAgentJson, writeAgentJson } from '../../utils/index';
import { extractFrontmatter, type FrontmatterResult } from './parse-plan-frontmatter';
import { detectAll, applyD1Fix, type PlanIndexEntry } from './cross-plan-deps-detectors';

interface CacheEntry {
  content_hash: string;
  blocks: string[];
  blockedBy: string[];
  status: string;
  mode: string;
}

interface CacheFile {
  scanned_at: string;
  plans: Record<string, CacheEntry>;
}

const ARCHIVE_DIR = 'archive';
const CACHE_FILENAME = '.deps-cache.json';

function findPlanFiles(specsRoot: string): string[] {
  if (!existsSync(specsRoot)) return [];
  const out: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 3) return;
    let entries: string[];
    try { entries = readdirSync(dir); } catch { return; }
    for (const name of entries) {
      if (name.startsWith('.') || name === ARCHIVE_DIR || name === 'node_modules') continue;
      const full = join(dir, name);
      let stat;
      try { stat = statSync(full); } catch { continue; }
      if (stat.isDirectory()) walk(full, depth + 1);
      else if (name === 'plan.md') out.push(full);
    }
  };
  walk(specsRoot, 0);
  return out;
}

function loadCache(cachePath: string): CacheFile {
  if (!existsSync(cachePath)) return { scanned_at: '', plans: {} };
  try {
    const parsed = JSON.parse(readFileSync(cachePath, 'utf8'));
    if (parsed && typeof parsed === 'object' && parsed.plans) return parsed as CacheFile;
  } catch { /* fall through */ }
  return { scanned_at: '', plans: {} };
}

function writeCacheAtomic(cachePath: string, data: CacheFile): void {
  mkdirSync(dirname(cachePath), { recursive: true });
  const tmp = cachePath + '.tmp';
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, cachePath);
}

function buildIndex(planFiles: string[], cache: CacheFile): { index: Map<string, PlanIndexEntry>; hits: number } {
  const index = new Map<string, PlanIndexEntry>();
  let hits = 0;
  for (const file of planFiles) {
    const fallbackId = basename(dirname(file));
    const fr: FrontmatterResult | null = extractFrontmatter(file, fallbackId);
    if (!fr || !fr.canonical.task_id) continue;
    const id = fr.canonical.task_id;
    const cached = cache.plans[id];
    if (cached && cached.content_hash === fr.contentHash) hits++;
    cache.plans[id] = {
      content_hash: fr.contentHash,
      blocks: fr.canonical.blocks,
      blockedBy: fr.canonical.blockedBy,
      status: fr.canonical.status ?? '',
      mode: fr.canonical.mode ?? '',
    };
    index.set(id, {
      task_id: id,
      filePath: file,
      blocks: fr.canonical.blocks,
      blockedBy: fr.canonical.blockedBy,
      schema_version: fr.canonical.schema_version,
      status: fr.canonical.status,
      mode: fr.canonical.mode,
    });
  }
  return { index, hits };
}

function main(): void {
  const program = new Command()
    .name('scan-cross-plan-deps')
    .description('Detect cross-plan dependency issues across .specify/specs/**/plan.md')
    .option('--current <task_id>', 'TASK_ID currently being planned (excluded from D4)')
    .option('--fix-d1 <ids>', 'Comma-separated finding ids (from prior --json scan) to apply D1 auto-fix')
    .option('--verify', 'Re-scan; exit 1 if any findings remain', false)
    .option('--json', 'Output JSON (default)', true)
    .parse();

  const opts = program.opts<{ current?: string; fixD1?: string; verify: boolean; json: boolean }>();
  const env = loadFeatureEnv();
  const specsRoot = join(getRepoRoot(), env.specsRoot);
  const cachePath = join(specsRoot, env.defaultFolder, CACHE_FILENAME);

  const startedAt = Date.now();
  const cache = loadCache(cachePath);
  const planFiles = findPlanFiles(specsRoot);
  const { index, hits } = buildIndex(planFiles, cache);
  const findings = detectAll(index, opts.current ?? '');

  const fixResults: Array<{ finding_id: number; ok: boolean; reason?: string }> = [];
  if (opts.fixD1) {
    const wanted = new Set(
      opts.fixD1.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n)),
    );
    for (const f of findings) {
      if (!wanted.has(f.id) || !f.fixable || !f.fix) continue;
      const target = index.get(f.fix.target_task_id);
      if (!target) {
        fixResults.push({ finding_id: f.id, ok: false, reason: 'target plan disappeared' });
        continue;
      }
      fixResults.push({ finding_id: f.id, ...applyD1Fix({ plan: target, addId: f.fix.add_blocked_by }) });
    }
  }

  const scanned_at = new Date().toISOString();
  cache.scanned_at = scanned_at;
  writeCacheAtomic(cachePath, cache);

  const output = {
    current_task_id: opts.current ?? null,
    scanned_at,
    scan_duration_ms: Date.now() - startedAt,
    cache_hit_ratio: planFiles.length === 0 ? 1 : Number((hits / planFiles.length).toFixed(2)),
    plans_found: planFiles.length,
    findings,
    fix_results: fixResults,
  };
  if (opts.verify && findings.length > 0) {
    process.stdout.write(formatAgentJson(output));
    process.exit(1);
  }
  writeAgentJson(output);
}

main();
