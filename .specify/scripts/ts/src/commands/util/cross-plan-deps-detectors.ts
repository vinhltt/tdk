// Detector + line-anchored auto-fix for cross-plan dependency findings.
// Pure functions; no filesystem I/O for detection. applyD1Fix is the
// only function that mutates files (line-anchored regex on `blockedBy:`).

import { readFileSync, writeFileSync } from 'node:fs';

export interface PlanIndexEntry {
  task_id: string;
  filePath: string;
  blocks: string[];
  blockedBy: string[];
  schema_version: number | null;
  status: string | null;
  mode: string | null;
}

export type FindingType = 'D1' | 'D2' | 'D3' | 'D4';

export interface Finding {
  id: number;
  type: FindingType;
  severity: 'warn' | 'error';
  detail: string;
  fixable: boolean;
  fix?: { target_plan_path: string; target_task_id: string; add_blocked_by: string };
}

export function detectAll(index: Map<string, PlanIndexEntry>, currentId: string): Finding[] {
  const out: Finding[] = [];
  let nextId = 1;
  const push = (f: Omit<Finding, 'id'>) => out.push({ id: nextId++, ...f });

  for (const [id, plan] of index) {
    // D3 self-references
    for (const ref of [...plan.blocks, ...plan.blockedBy]) {
      if (ref === id) push({ type: 'D3', severity: 'warn', detail: `${id} references itself`, fixable: false });
    }
    // D4 dangling refs (skip if ref is current task being created — it may not exist yet)
    for (const ref of plan.blocks) {
      if (ref !== currentId && !index.has(ref)) {
        push({ type: 'D4', severity: 'warn', detail: `${id} blocks: [${ref}] — ${ref} not found`, fixable: false });
      }
    }
    for (const ref of plan.blockedBy) {
      if (ref !== currentId && !index.has(ref)) {
        push({ type: 'D4', severity: 'warn', detail: `${id} blockedBy: [${ref}] — ${ref} not found`, fixable: false });
      }
    }
  }
  // D1 + D2 (pairwise)
  for (const [a, planA] of index) {
    for (const b of planA.blocks) {
      const planB = index.get(b);
      if (!planB) continue;
      if (!planB.blockedBy.includes(a)) {
        push({
          type: 'D1',
          severity: 'warn',
          detail: `${a} blocks ${b} but ${b} missing blockedBy: [${a}]`,
          fixable: true,
          fix: { target_plan_path: planB.filePath, target_task_id: b, add_blocked_by: a },
        });
      }
      if (planB.blocks.includes(a)) {
        push({ type: 'D2', severity: 'warn', detail: `circular: ${a} ↔ ${b}`, fixable: false });
      }
    }
  }
  return out;
}

export function applyD1Fix(target: { plan: PlanIndexEntry; addId: string }): { ok: boolean; reason?: string } {
  if ((target.plan.schema_version ?? 0) < 2) {
    return { ok: false, reason: `schema_version <2 — migrate manually` };
  }
  const content = readFileSync(target.plan.filePath, 'utf8');
  // Match the YAML frontmatter `blockedBy:` line. Two forms supported:
  //   blockedBy: [a, b]            (inline array)
  //   blockedBy:\n  - a\n  - b     (block array — refuse, defer to manual fix)
  const inlineRe = /^(blockedBy:\s*\[)([^\]]*)(\])\s*$/m;
  const blockRe = /^blockedBy:\s*$/m;
  if (inlineRe.test(content)) {
    const updated = content.replace(inlineRe, (_, open: string, body: string, close: string) => {
      const items = body.split(',').map((s) => s.trim()).filter(Boolean);
      if (items.includes(target.addId)) return `${open}${body}${close}`;
      const rebuilt = items.length === 0 ? target.addId : `${items.join(', ')}, ${target.addId}`;
      return `${open}${rebuilt}${close}`;
    });
    writeFileSync(target.plan.filePath, updated);
    return { ok: true };
  }
  if (blockRe.test(content)) return { ok: false, reason: 'block-style YAML array — fix manually' };
  return { ok: false, reason: 'no blockedBy line — add manually' };
}
