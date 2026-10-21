// Retro progress of a feature, derived from its retro artifacts. There is no stored field: the
// files are the source of truth, so a read can never disagree with what `/tdk-retro-*` last wrote.
//
//   none      no retro-feedback.md
//   collected feedback present, no learning-delta.md
//   proposed  learning-delta.md has an entry that is still proposed/approved (or unreadable)
//   done      every entry is applied/rejected/blocked
//
// Entry status values and the `- status: <value>` entry line are defined in
// tdk-retro/skills/_shared/learning-delta-schema.md.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readOptionalFile } from './feature-lifecycle-status';

export type RetroStatus = 'none' | 'collected' | 'proposed' | 'done';

export interface RetroStatusResult {
  retro_status: RetroStatus;
  /** Delta entries with status `blocked`; 0 when there is no delta. */
  blocked: number;
}

const TERMINAL_ENTRY_STATUSES = new Set(['applied', 'rejected', 'blocked']);
const ENTRY_HEADING = /^### Entry\b.*$/m;
// Anchored at column 0: `content:` fences are indented, so quoted `- status:` lines never match.
const ENTRY_STATUS_LINE = /^- status:[ \t]*(\S+)[ \t]*$/m;

/** Status of each `### Entry` section; a section without a status line yields an empty string. */
function readEntryStatuses(deltaMd: string): string[] {
  return deltaMd.split(ENTRY_HEADING).slice(1)
    .map(section => section.match(ENTRY_STATUS_LINE)?.[1]?.toLowerCase() ?? '');
}

export function deriveRetroStatus(featureDir: string): RetroStatusResult {
  if (!existsSync(join(featureDir, 'retro-feedback.md'))) return { retro_status: 'none', blocked: 0 };

  const deltaPath = join(featureDir, 'learning-delta.md');
  if (!existsSync(deltaPath)) return { retro_status: 'collected', blocked: 0 };
  // The delta exists: a read failure (permissions, a directory) must not look like "no delta yet".
  const deltaMd = readOptionalFile(deltaPath);
  if (deltaMd === null) return { retro_status: 'proposed', blocked: 0 };

  const statuses = readEntryStatuses(deltaMd);
  const blocked = statuses.filter(status => status === 'blocked').length;
  // A delta with no readable entries cannot be proven complete, so it is not reported as done.
  const allTerminal = statuses.length > 0 && statuses.every(status => TERMINAL_ENTRY_STATUSES.has(status));
  return { retro_status: allTerminal ? 'done' : 'proposed', blocked };
}
