import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_CONVERT_PARTS, type ConvertPart } from './convert-parts';
import { CONVERT_FLAT_OWNER } from './convert-reconcile';
import { loadHarnessManifest, manifestPathFor } from './manifest-store';
import type { InstallSettings } from './install-settings';

export interface NextStepsInput {
  consumerRoot: string;
  mode: 'dry-run' | 'applied';
  /** Stale item count from claudeInstallIsStale, computed before any write. */
  claudeChanges: number;
  settings: InstallSettings | undefined;
}

const ENTRY = fileURLToPath(new URL('./index.ts', import.meta.url));
const OMP_CONFLICT_NOTE = 'note: --yes stops on conflicts without writing; --force overwrites your .omp edits, so port wanted edits into .claude/ first.';
const OMP_TAKEOVER_NOTE = 'note: first apply takes ownership of existing .omp files (incl. config.yml); review the dry-run first.';

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function isDirectory(target: string): boolean {
  return fs.existsSync(target) && fs.statSync(target).isDirectory();
}

function convertCommand(root: string, harness: 'omp' | 'codex', flag: '--dry-run' | '--yes' | '--check', parts?: readonly ConvertPart[]): string {
  const partsArg = parts ? ` --parts ${parts.join(',')}` : '';
  return `bun ${shellQuote(ENTRY)} convert-flat ${shellQuote(root)} --harness ${harness}${partsArg} ${flag}`;
}

function changedLabel(count: number): string {
  return `Claude projection changed (${count} item${count === 1 ? '' : 's'})`;
}

function ompLines(input: NextStepsInput): string[] {
  if (input.settings?.harnesses.omp?.enabled === false) return [];
  const root = input.consumerRoot;
  if (fs.existsSync(manifestPathFor(root, 'omp'))) {
    // A malformed manifest throws here on purpose; the install caller reports it as unavailable.
    const parts = loadHarnessManifest(root, 'omp').convertedParts ?? [...ALL_CONVERT_PARTS];
    // An explicit empty selection means the user opted out of every OMP part.
    if (parts.length === 0) return [];
    if (input.claudeChanges === 0) {
      return ['  omp: Claude projection unchanged; verify OMP drift with:', `    ${convertCommand(root, 'omp', '--check')}`];
    }
    return [
      `  omp: ${changedLabel(input.claudeChanges)}; OMP may be stale.`,
      `    ${convertCommand(root, 'omp', '--dry-run', parts)}`,
      `    ${convertCommand(root, 'omp', '--yes', parts)}`,
      `    ${OMP_CONFLICT_NOTE}`,
    ];
  }
  if (!isDirectory(path.join(root, '.omp'))) return [];
  return [
    '  omp: .omp/ exists without a TDK ownership manifest.',
    `    ${convertCommand(root, 'omp', '--dry-run', ALL_CONVERT_PARTS)}`,
    `    ${OMP_TAKEOVER_NOTE}`,
  ];
}

function codexLines(input: NextStepsInput): string[] {
  const root = input.consumerRoot;
  if (fs.existsSync(manifestPathFor(root, 'codex'))) {
    const flatOwned = loadHarnessManifest(root, 'codex').managedFiles.some((file) => file.plugin === CONVERT_FLAT_OWNER);
    // Package-only Codex reads .specify/codex-plugins/, not .claude/, so a Claude change cannot stale it.
    if (!flatOwned || input.claudeChanges === 0) return [];
    return [
      `  codex: ${changedLabel(input.claudeChanges)}; convert-flat Codex may be stale.`,
      `    ${convertCommand(root, 'codex', '--dry-run')}`,
      `    ${convertCommand(root, 'codex', '--yes')}`,
    ];
  }
  if (!isDirectory(path.join(root, '.codex'))) return [];
  return [
    '  codex: .codex/ exists without a TDK ownership manifest.',
    `    ${convertCommand(root, 'codex', '--dry-run')}`,
  ];
}

/**
 * Read-only advisory printed after a Claude install: OMP and flat Codex are derived
 * from .claude/, so they may need a convert-flat rerun. Returns undefined when no
 * sibling projection is detected.
 */
export function renderNextSteps(input: NextStepsInput): string | undefined {
  const lines = [...ompLines(input), ...codexLines(input)];
  if (lines.length === 0) return undefined;
  const header = input.mode === 'dry-run' ? 'After applying this install:' : 'Next steps (other harnesses):';
  return `\n${header}\n${lines.join('\n')}\n`;
}
