import { sha256Buffer, sha256File } from './checksum';
import type { ConvertTargetFile, FlatClaudeMdRecord, MigrationFact } from './flat-claude-types';
import { ompTargetRelativePath } from './omp-target-mapper';

const OMP_CONTEXT_CONTENT = Buffer.from('@../CLAUDE.md\n', 'utf-8');
const OMP_CONTEXT_TARGET = ompTargetRelativePath('context', 'AGENTS.md');

export interface OmpContextEmitResult {
  files: ConvertTargetFile[];
  facts: MigrationFact[];
}

export function emitOmpContextFile(record?: FlatClaudeMdRecord): OmpContextEmitResult {
  if (!record) {
    return {
      files: [],
      facts: [{
        layer: 1,
        status: 'note',
        source: 'CLAUDE.md',
        message: 'Consumer has no root CLAUDE.md; .omp/AGENTS.md was not generated.',
      }],
    };
  }

  return {
    files: [{
      sourcePath: record.sourcePath,
      sourceRelativePath: record.sourceRelativePath,
      targetRelativePath: OMP_CONTEXT_TARGET,
      sourceChecksum: sha256File(record.sourcePath),
      installedChecksum: sha256Buffer(OMP_CONTEXT_CONTENT),
      content: OMP_CONTEXT_CONTENT,
      part: 'context',
    }],
    facts: [{
      layer: 1,
      status: 'converted',
      source: record.sourceRelativePath,
      message: 'Mapped root CLAUDE.md to .omp/AGENTS.md through an @ import.',
    }],
  };
}
