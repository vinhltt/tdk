// 4-level UT rule resolution cascade
// Collects all existing levels in base->specific order for cascade merge.

import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Canonical base->specific order; must match Phase 02 JSON + Phase 03 contract.
export type RuleLevel = 'global' | 'sw-parent' | 'sw-own' | 'module';

export interface RulesCascadeOptions {
  workspaceRoot: string;
  docsPath: string;
  ruleSubPath: string;
  swName?: string;
  moduleName?: string;
  targetRoot?: string;
  targetDocsPath?: string;
}

export interface RulesCascadeEntry {
  path: string;
  level: RuleLevel;
}

export interface RulesCascadeResult {
  primary: string | null;
  entries: RulesCascadeEntry[];
}

export interface ResolveUtRulesOptions {
  workspaceRoot: string;
  docsPath: string;
  swName?: string;
  moduleName?: string;
  targetRoot?: string;
  targetDocsPath?: string;
}

/**
 * Entries contain ONLY existing regular files (verified via statSync).
 * Callers may use entries.length > 0 as existence proxy, but JSON emitters
 * SHOULD re-probe if TOCTOU matters.
 *
 * Cascade order: L4 global -> L3 sw-parent -> L2 sw-own -> L1 module (base->specific).
 * primary = most-specific existing file (last entry), or null if none exist.
 */
export function resolveRulesCascade(opts: RulesCascadeOptions): RulesCascadeResult {
  const { workspaceRoot, docsPath, ruleSubPath, swName, moduleName, targetRoot, targetDocsPath } = opts;
  const entries: RulesCascadeEntry[] = [];

  // L4 Global — always attempted
  const l4 = join(workspaceRoot, docsPath, ruleSubPath);
  if (isRegularFile(l4)) entries.push({ path: l4, level: 'global' });

  // L3 Sub-workspace parent shared config — needs swName
  if (swName) {
    const l3 = join(workspaceRoot, docsPath, 'sub-workspaces', swName, ruleSubPath);
    if (isRegularFile(l3)) entries.push({ path: l3, level: 'sw-parent' });
  }

  // L2 Sub-workspace own docs — needs targetRoot
  if (targetRoot) {
    const l2 = join(targetRoot, targetDocsPath ?? docsPath, ruleSubPath);
    if (isRegularFile(l2)) entries.push({ path: l2, level: 'sw-own' });
  }

  // L1 Module-specific — needs swName and moduleName
  if (swName && moduleName) {
    const l1 = join(workspaceRoot, docsPath, 'sub-workspaces', swName, 'modules', moduleName, ruleSubPath);
    if (isRegularFile(l1)) entries.push({ path: l1, level: 'module' });
  }

  return { primary: entries.at(-1)?.path ?? null, entries };
}

/**
 * Resolve UT rules file using 4-level cascade, returning most-specific match.
 * Preserved signature — delegates to resolveRulesCascade.
 */
export function resolveUtRules(opts: ResolveUtRulesOptions): string | null {
  return resolveRulesCascade({ ...opts, ruleSubPath: 'rules/test/ut-rule.md' }).primary;
}

// Rejects directories, symlinks-to-dir, and missing paths; guards EISDIR downstream.
function isRegularFile(p: string): boolean {
  try {
    return existsSync(p) && statSync(p).isFile();
  } catch {
    return false;
  }
}
