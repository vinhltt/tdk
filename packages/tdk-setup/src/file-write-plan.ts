import * as fs from 'node:fs';
import * as path from 'node:path';
import { sha256File } from './checksum';
import { normalizeTargetRelativePath } from './target-relative-path';
import type { Collision, ManagedFile, PlannedWrite, RequiredPrompt, TransformedPluginFile } from './types';

function targetPath(consumerRoot: string, targetRelativePath: string): string {
  return path.join(consumerRoot, normalizeTargetRelativePath(targetRelativePath));
}

function isInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

export function classifyFile(params: {
  consumerRoot: string;
  targetDir?: string;
  file: TransformedPluginFile;
  previous?: ManagedFile;
}): { write?: PlannedWrite; collision?: Collision; prompt?: RequiredPrompt } {
  const targetRelativePath = normalizeTargetRelativePath(params.file.targetRelativePath);
  const target = targetPath(params.consumerRoot, targetRelativePath);
  const claudeRoot = path.join(params.consumerRoot, params.targetDir ?? '.claude');
  if (!isInside(claudeRoot, target)) {
    return { collision: { kind: 'path-traversal', path: target, plugin: params.file.plugin, message: `Target escapes .claude: ${targetRelativePath}` } };
  }

  let stat: fs.Stats | undefined;
  try {
    stat = fs.lstatSync(target);
  } catch {
    stat = undefined;
  }

  if (stat?.isSymbolicLink()) {
    return { collision: { kind: 'unsafe-symlink', path: target, plugin: params.file.plugin, message: `Refusing to write through symlink: ${targetRelativePath}` } };
  }
  if (stat?.isDirectory()) {
    return { collision: { kind: 'directory-file-conflict', path: target, plugin: params.file.plugin, message: `Target is a directory: ${targetRelativePath}` } };
  }
  if (!stat) {
    return {
      write: {
        plugin: params.file.plugin,
        sourcePath: params.file.sourcePath,
        sourceRelativePath: params.file.sourceRelativePath,
        targetPath: target,
        targetRelativePath,
        sourceChecksum: params.file.sourceChecksum,
        installedChecksum: params.file.installedChecksum,
        content: params.file.content,
        action: 'create',
      },
    };
  }

  const currentChecksum = sha256File(target);
  if (!params.previous) {
    if (currentChecksum === params.file.installedChecksum) return {};
    return {
      write: {
        plugin: params.file.plugin,
        sourcePath: params.file.sourcePath,
        sourceRelativePath: params.file.sourceRelativePath,
        targetPath: target,
        targetRelativePath,
        sourceChecksum: params.file.sourceChecksum,
        installedChecksum: params.file.installedChecksum,
        content: params.file.content,
        expectedTargetChecksum: currentChecksum,
        action: 'update',
      },
      collision: { kind: 'unmanaged-target-exists', path: target, plugin: params.file.plugin, message: `Unmanaged target already exists: ${targetRelativePath}` },
      prompt: { type: 'unmanaged-target-overwrite', path: target, targetRelativePath },
    };
  }

  if (currentChecksum !== params.previous.installedChecksum) {
    return {
      write: {
        plugin: params.file.plugin,
        sourcePath: params.file.sourcePath,
        sourceRelativePath: params.file.sourceRelativePath,
        targetPath: target,
        targetRelativePath,
        sourceChecksum: params.file.sourceChecksum,
        installedChecksum: params.file.installedChecksum,
        content: params.file.content,
        expectedTargetChecksum: currentChecksum,
        action: 'update',
      },
      collision: { kind: 'managed-drift', path: target, plugin: params.file.plugin, message: `Managed target drifted: ${targetRelativePath}` },
      prompt: { type: 'managed-drift-overwrite', path: target, targetRelativePath },
    };
  }

  return {
    write: {
      plugin: params.file.plugin,
      sourcePath: params.file.sourcePath,
      sourceRelativePath: params.file.sourceRelativePath,
      targetPath: target,
      targetRelativePath,
      sourceChecksum: params.file.sourceChecksum,
      installedChecksum: params.file.installedChecksum,
      content: params.file.content,
      expectedTargetChecksum: params.previous.installedChecksum,
      action: 'update',
    },
  };
}
