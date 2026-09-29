import * as fs from 'node:fs';
import * as path from 'node:path';
import { sha256Buffer, sha256File } from './checksum';
import { CONVERT_FLAT_OWNER, OMP_HARNESS_SPEC } from './convert-reconcile';
import type { ConvertPart } from './convert-parts';
import { extractOmpManagedPayload } from './lib/harness-transform/config-yaml-merge';
import { loadHarnessManifest, manifestPathFor } from './manifest-store';
import { validateHarnessTargetPath } from './target-path-safety';

export type DriftKind = 'source-changed' | 'target-modified' | 'target-missing';

export interface DriftFinding {
  part?: ConvertPart;
  sourceRelativePath: string;
  targetRelativePath: string;
  kind: DriftKind;
}

const EMPTY_FILE_CHECKSUM = sha256Buffer(Buffer.alloc(0));

function resolveInsideConsumer(consumerRoot: string, relativePath: string, label: string): string {
  const resolvedRoot = path.resolve(consumerRoot);
  const resolved = path.resolve(resolvedRoot, relativePath);
  const relative = path.relative(resolvedRoot, resolved);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Unsafe ${label} in OMP ownership manifest: ${relativePath}`);
  }
  validateHarnessTargetPath({
    consumerRoot,
    targetPath: path.dirname(resolved),
    allowedRoots: [consumerRoot],
    label,
  });
  return resolved;
}

function fileStat(filePath: string): fs.Stats | undefined {
  try {
    return fs.lstatSync(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

function sourceHasChanged(
  sourcePath: string,
  sourceChecksum: string,
  sourcePresent: boolean | undefined,
): boolean {
  const stat = fileStat(sourcePath);
  if (sourcePresent === false) return stat !== undefined;
  if (stat === undefined || !stat.isFile() || stat.isSymbolicLink()) return true;
  return sha256File(sourcePath) !== sourceChecksum;
}

export function checkOmpDrift(consumerRoot: string): DriftFinding[] {
  const manifestPath = manifestPathFor(consumerRoot, 'omp');
  validateHarnessTargetPath({
    consumerRoot,
    targetPath: manifestPath,
    allowedRoots: [path.join(consumerRoot, '.specify', 'state', 'harness-install')],
    label: 'OMP ownership manifest',
  });
  if (!fs.existsSync(manifestPath)) {
    throw new Error('No OMP conversion manifest found. Run convert-flat with --harness omp before --check.');
  }

  const manifest = loadHarnessManifest(consumerRoot, 'omp');
  const managedFiles = manifest.managedFiles.filter((file) => file.plugin === CONVERT_FLAT_OWNER);
  for (const file of managedFiles) {
    if (
      OMP_HARNESS_SPEC.mergeTargets[file.targetRelativePath]
      && file.managedRegionChecksum === undefined
    ) {
      throw new Error(
        `Managed-region checksum is missing for ${file.targetRelativePath}; `
        + 'rerun convert-flat for part settings to record it before --check.',
      );
    }
  }

  const findings: DriftFinding[] = [];
  for (const file of managedFiles) {
    const sourcePath = resolveInsideConsumer(consumerRoot, file.sourceRelativePath, 'source path');
    const targetPath = resolveInsideConsumer(consumerRoot, file.targetRelativePath, 'target path');
    if (
      file.targetRelativePath === OMP_HARNESS_SPEC.settingsPath
      && file.sourceChecksum === EMPTY_FILE_CHECKSUM
      && file.sourcePresent === undefined
    ) {
      throw new Error(
        `Source-presence metadata is missing for ${file.targetRelativePath}; `
        + 'rerun convert-flat for part settings or skills before --check.',
      );
    }
    const findingBase = {
      ...(file.part === undefined ? {} : { part: file.part }),
      sourceRelativePath: file.sourceRelativePath,
      targetRelativePath: file.targetRelativePath,
    };

    if (sourceHasChanged(sourcePath, file.sourceChecksum, file.sourcePresent)) {
      findings.push({ ...findingBase, kind: 'source-changed' });
    }

    const targetStat = fileStat(targetPath);
    if (targetStat === undefined) {
      findings.push({ ...findingBase, kind: 'target-missing' });
      continue;
    }
    if (!targetStat.isFile() || targetStat.isSymbolicLink()) {
      findings.push({ ...findingBase, kind: 'target-modified' });
      continue;
    }

    if (file.managedRegionChecksum !== undefined) {
      const payload = extractOmpManagedPayload(fs.readFileSync(targetPath, 'utf-8'));
      if (payload === undefined || sha256Buffer(Buffer.from(payload, 'utf-8')) !== file.managedRegionChecksum) {
        findings.push({ ...findingBase, kind: 'target-modified' });
      }
    } else if (sha256File(targetPath) !== file.installedChecksum) {
      findings.push({ ...findingBase, kind: 'target-modified' });
    }
  }

  return findings.sort((left, right) => {
    const pathOrder = left.targetRelativePath.localeCompare(right.targetRelativePath);
    return pathOrder || left.kind.localeCompare(right.kind);
  });
}

export function renderOmpDriftFindings(findings: DriftFinding[]): string {
  if (findings.length === 0) return 'No OMP convert-flat drift detected.\n';

  const lines = ['OMP convert-flat drift detected:'];
  for (const kind of ['source-changed', 'target-modified', 'target-missing'] as const) {
    const grouped = findings.filter((finding) => finding.kind === kind);
    if (grouped.length === 0) continue;
    lines.push(`  ${kind}:`);
    for (const finding of grouped) {
      const part = finding.part === undefined ? '' : ` [part=${finding.part}]`;
      lines.push(`    - ${finding.sourceRelativePath} -> ${finding.targetRelativePath}${part}`);
    }
  }
  return `${lines.join('\n')}\n`;
}
