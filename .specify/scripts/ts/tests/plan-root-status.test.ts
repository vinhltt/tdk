import { describe, expect, it } from 'bun:test';
import {
  derivePlanRootStatus,
  type LifecycleStatus,
  normalizeLifecycleStatus,
  readFrontmatterStatus,
  renderPlanStatuses,
  renderSpecLifecycleStatus,
} from '../src/commands/util/plan-root-status';
import type { PhaseStatus } from '../src/commands/util/phases-table-parser';

const PHASE_STATUSES: PhaseStatus[] = ['blocked', 'cancelled', 'done', 'in_progress', 'skipped', 'todo'];

// Hand-written oracle keyed by the sorted set of distinct phase statuses.
// Kept as an explicit lookup so it does not re-run the implementation predicates.
const ORACLE: Record<string, LifecycleStatus> = {
  '': 'planned',
  'blocked': 'blocked',
  'cancelled': 'cancelled',
  'done': 'done',
  'in_progress': 'in_progress',
  'skipped': 'cancelled',
  'todo': 'planned',
  'blocked,cancelled': 'blocked',
  'blocked,done': 'in_progress',
  'blocked,in_progress': 'in_progress',
  'blocked,skipped': 'blocked',
  'blocked,todo': 'planned',
  'cancelled,done': 'done',
  'cancelled,in_progress': 'in_progress',
  'cancelled,skipped': 'cancelled',
  'cancelled,todo': 'planned',
  'done,in_progress': 'in_progress',
  'done,skipped': 'done',
  'done,todo': 'in_progress',
  'in_progress,skipped': 'in_progress',
  'in_progress,todo': 'in_progress',
  'skipped,todo': 'planned',
  'blocked,cancelled,done': 'in_progress',
  'blocked,cancelled,in_progress': 'in_progress',
  'blocked,cancelled,skipped': 'blocked',
  'blocked,cancelled,todo': 'planned',
  'blocked,done,in_progress': 'in_progress',
  'blocked,done,skipped': 'in_progress',
  'blocked,done,todo': 'in_progress',
  'blocked,in_progress,skipped': 'in_progress',
  'blocked,in_progress,todo': 'in_progress',
  'blocked,skipped,todo': 'planned',
  'cancelled,done,in_progress': 'in_progress',
  'cancelled,done,skipped': 'done',
  'cancelled,done,todo': 'in_progress',
  'cancelled,in_progress,skipped': 'in_progress',
  'cancelled,in_progress,todo': 'in_progress',
  'cancelled,skipped,todo': 'planned',
  'done,in_progress,skipped': 'in_progress',
  'done,in_progress,todo': 'in_progress',
  'done,skipped,todo': 'in_progress',
  'in_progress,skipped,todo': 'in_progress',
};

function multisets(maxSize: number): PhaseStatus[][] {
  const out: PhaseStatus[][] = [[]];
  const grow = (prefix: PhaseStatus[], start: number): void => {
    if (prefix.length === maxSize) return;
    for (let i = start; i < PHASE_STATUSES.length; i++) {
      const next = [...prefix, PHASE_STATUSES[i]!];
      out.push(next);
      grow(next, i);
    }
  };
  grow([], 0);
  return out;
}

const rowsOf = (statuses: PhaseStatus[]) => statuses.map((status) => ({ status }));

describe('derivePlanRootStatus', () => {
  const all = multisets(3);

  it('enumerates all 84 multisets with k <= 3', () => {
    expect(all).toHaveLength(84);
  });

  it('matches the oracle for every multiset', () => {
    for (const statuses of all) {
      const key = [...new Set(statuses)].sort().join(',');
      expect({ statuses, status: derivePlanRootStatus(rowsOf(statuses), null) })
        .toEqual({ statuses, status: ORACLE[key]! });
    }
  });

  it('keeps archived sticky for every multiset', () => {
    for (const statuses of all) expect(derivePlanRootStatus(rowsOf(statuses), 'archived')).toBe('archived');
  });

  it('ignores non-archived stored values', () => {
    expect(derivePlanRootStatus(rowsOf(['done']), 'planned')).toBe('done');
    expect(derivePlanRootStatus(rowsOf(['todo']), 'done')).toBe('planned');
  });

  it('keeps a spike plan with blocked dependents planned', () => {
    expect(derivePlanRootStatus(rowsOf(['todo', 'blocked', 'blocked']), null)).toBe('planned');
    expect(derivePlanRootStatus(rowsOf(['done', 'blocked']), null)).toBe('in_progress');
    expect(derivePlanRootStatus(rowsOf(['skipped', 'todo']), null)).toBe('planned');
  });
});

describe('normalizeLifecycleStatus', () => {
  it('reads canonical values without legacy flag', () => {
    expect(normalizeLifecycleStatus('in_progress', 'plan')).toEqual({ status: 'in_progress', legacy: false, unknown: false });
  });

  it('maps plan aliases and spec case variants as legacy', () => {
    expect(normalizeLifecycleStatus('todo', 'plan')).toEqual({ status: 'planned', legacy: true, unknown: false });
    expect(normalizeLifecycleStatus('skipped', 'plan')).toEqual({ status: 'cancelled', legacy: true, unknown: false });
    expect(normalizeLifecycleStatus('Draft', 'spec')).toEqual({ status: 'draft', legacy: true, unknown: false });
    expect(normalizeLifecycleStatus('"done"', 'spec')).toEqual({ status: 'done', legacy: true, unknown: false });
  });

  it('does not apply plan aliases to spec values', () => {
    expect(normalizeLifecycleStatus('todo', 'spec')).toEqual({ status: 'draft', legacy: true, unknown: true });
  });

  it('falls back to draft for unknown values', () => {
    expect(normalizeLifecycleStatus('wip', 'plan')).toEqual({ status: 'draft', legacy: true, unknown: true });
  });
});

describe('readFrontmatterStatus', () => {
  it('reads the raw value without an inline comment', () => {
    expect(readFrontmatterStatus('---\nstatus: draft  # draft | ready\n---\n')).toBe('draft');
  });

  it('returns null without frontmatter or key', () => {
    expect(readFrontmatterStatus('# no frontmatter\n')).toBeNull();
    expect(readFrontmatterStatus('---\ntitle: x\n---\n')).toBeNull();
  });

  it('handles BOM and CRLF', () => {
    expect(readFrontmatterStatus('﻿---\r\nstatus: Draft\r\n---\r\n')).toBe('Draft');
  });
});

function plan(rootStatus: string | null, rows: PhaseStatus[], eol = '\n'): string {
  const fm = ['---', 'title: "Sample plan"', ...(rootStatus === null ? [] : [`status: ${rootStatus}`]), '---'];
  const table = rows.map((status, index) => {
    const n = String(index + 1).padStart(2, '0');
    return `| ${n} | [phase-${n}-sample](phase-${n}-sample.md) | ${status} | — | — |`;
  });
  return [
    ...fm, '', '# Sample plan', '', '## Phases', '',
    '| # | File | Status | Blocks | BlockedBy |',
    '|---|------|--------|--------|-----------|',
    ...table, '', '## Notes', '',
  ].join(eol);
}

describe('renderPlanStatuses', () => {
  it('rewrites a legacy todo root to planned, then becomes a no-op', () => {
    const first = renderPlanStatuses(plan('todo', ['todo', 'todo']), new Map());
    expect(first).toMatchObject({ status: 'planned', changed: true });
    expect(first.planMd).toContain('status: planned\n');

    const second = renderPlanStatuses(first.planMd, new Map());
    expect(second).toEqual({ planMd: first.planMd, status: 'planned', changed: false });
  });

  it('applies row updates and derives the root in one render', () => {
    const result = renderPlanStatuses(plan('planned', ['todo', 'todo']), new Map([[1, 'in_progress' as PhaseStatus]]));
    expect(result.status).toBe('in_progress');
    expect(result.changed).toBe(true);
    expect(result.planMd).toContain('status: in_progress\n');
    expect(result.planMd).toContain('| 01 | [phase-01-sample](phase-01-sample.md) | in_progress |');
  });

  it('leaves table bytes untouched on reconcile with no updates', () => {
    const md = plan('done', ['done', 'done']).replace('| 01 |', '|  01 |');
    const result = renderPlanStatuses(md, new Map());
    expect(result).toEqual({ planMd: md, status: 'done', changed: false });
  });

  it('keeps archived sticky even when rows change', () => {
    const result = renderPlanStatuses(plan('archived', ['done']), new Map([[1, 'todo' as PhaseStatus]]));
    expect(result.status).toBe('archived');
    expect(result.changed).toBe(false);
  });

  it('does not insert a missing root status key', () => {
    const md = plan(null, ['done']);
    const result = renderPlanStatuses(md, new Map());
    expect(result).toEqual({ planMd: md, status: 'done', changed: false });
  });

  it('keeps CRLF on the rewritten status line', () => {
    const result = renderPlanStatuses(plan('todo', ['done'], '\r\n'), new Map());
    expect(result.status).toBe('done');
    expect(result.planMd).toContain('\r\nstatus: done\r\n');
  });

  it('preserves a BOM while updating the root', () => {
    const result = renderPlanStatuses(`﻿${plan('todo', ['done'])}`, new Map());
    expect(result.planMd.startsWith('﻿---\n')).toBe(true);
    expect(result.planMd).toContain('status: done\n');
  });

  it('keeps $ replacement patterns in plan and spec frontmatter literal', () => {
    const md = plan('todo', ['done']).replace('title: "Sample plan"', () => "title: \"$$ and $' and $&\"");
    expect(renderPlanStatuses(md, new Map()).planMd).toBe(md.replace('status: todo', 'status: done'));
    const specMd = "---\ntitle: $'cost$$\nstatus: draft\n---\n";
    expect(renderSpecLifecycleStatus(specMd, 'done').specMd).toBe("---\ntitle: $'cost$$\nstatus: done\n---\n");
  });

  it('throws on a plan without a parseable ## Phases table', () => {
    expect(() => renderPlanStatuses('---\nstatus: todo\n---\n# no phases\n', new Map())).toThrow('## Phases section not found');
  });
});

describe('renderSpecLifecycleStatus', () => {
  it('rewrites the value and keeps the vocabulary comment', () => {
    const result = renderSpecLifecycleStatus('---\nstatus: draft  # draft | ready\n---\n# Spec\n', 'done');
    expect(result).toEqual({ specMd: '---\nstatus: done  # draft | ready\n---\n# Spec\n', hasStatusKey: true });
  });

  it('reports a missing key without inserting it', () => {
    const md = '---\ntitle: x\n---\n';
    expect(renderSpecLifecycleStatus(md, 'done')).toEqual({ specMd: md, hasStatusKey: false });
  });
});
