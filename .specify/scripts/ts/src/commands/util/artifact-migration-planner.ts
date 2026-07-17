import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { parsePhasesTable, type PhaseRow } from './phases-table-parser';
import { validateSpecificationQualityGate } from './specification-quality-gate';
import type { ArtifactMigrationOperation, ArtifactMigrationPlan, LegacyArtifactKind } from './artifact-migration-types';

interface Candidate {
  path: string;
  relativePath: string;
  kind: LegacyArtifactKind;
  section?: string;
}

interface PhaseDocument {
  row: PhaseRow;
  path: string;
  markdown: string;
}

function candidateFiles(featureDir: string): Candidate[] {
  const candidates: Candidate[] = [];
  const add = (relativePath: string, kind: LegacyArtifactKind, section?: string) => {
    const path = join(featureDir, relativePath);
    if (existsSync(path)) candidates.push({ path, relativePath, kind, section });
  };

  add('data-model.md', 'data-model', '## Data Model');
  add('quickstart.md', 'quickstart', '## Verification / Runbook');
  add('checklists/requirements.md', 'legacy-checklist');

  const contractsDir = join(featureDir, 'contracts');
  if (existsSync(contractsDir)) {
    for (const entry of readdirSync(contractsDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        add(`contracts/${entry.name}`, 'prose-contract', '## Interfaces & Contracts');
      }
    }
  }
  return candidates;
}

function loadPhases(featureDir: string, errors: string[]): PhaseDocument[] {
  const planPath = join(featureDir, 'plan.md');
  if (!existsSync(planPath)) {
    errors.push('plan.md is required for artifact migration');
    return [];
  }
  const parsed = parsePhasesTable(readFileSync(planPath, 'utf8'));
  if (parsed.errors.length > 0) {
    errors.push(...parsed.errors.map((error) => `plan.md:${error.line}: ${error.message}`));
    return [];
  }
  return parsed.phases.flatMap((row) => {
    const path = join(featureDir, row.file);
    if (!existsSync(path)) {
      errors.push(`Phase file does not exist: ${row.file}`);
      return [];
    }
    return [{ row, path, markdown: readFileSync(path, 'utf8') }];
  });
}

function resolveOwner(candidate: Candidate, phases: PhaseDocument[]): PhaseDocument[] {
  const explicit = phases.filter(({ markdown }) =>
    markdown.includes(candidate.relativePath) || markdown.includes(`\`${basename(candidate.relativePath)}\``));
  if (explicit.length > 0) return explicit;
  return phases.filter(({ markdown }) => candidate.section && markdown.includes(candidate.section));
}

function referenceFiles(featureDir: string, phases: PhaseDocument[], relativeSource: string): string[] {
  return [join(featureDir, 'spec.md'), join(featureDir, 'plan.md'), ...phases.map((phase) => phase.path)]
    .filter((path) => existsSync(path) && readFileSync(path, 'utf8').includes(relativeSource))
    .map((path) => relative(featureDir, path));
}

export function planArtifactMigration(featureDir: string): ArtifactMigrationPlan {
  const errors: string[] = [];
  const warnings: string[] = [];
  const phases = loadPhases(featureDir, errors);
  const candidates = candidateFiles(featureDir);
  const operations: ArtifactMigrationOperation[] = [];

  for (const candidate of candidates) {
    if (candidate.kind === 'legacy-checklist') {
      const specPath = join(featureDir, 'spec.md');
      const gate = existsSync(specPath)
        ? validateSpecificationQualityGate(readFileSync(specPath, 'utf8'))
        : { allowed: false, mode: 'blocked' as const };
      if (!gate.allowed || gate.mode !== 'embedded') {
        errors.push('Legacy checklist cannot be removed until /tdk-clarify writes a valid embedded Specification Quality Gate');
        continue;
      }
      operations.push({
        sourcePath: candidate.path,
        relativeSource: candidate.relativePath,
        kind: candidate.kind,
        replacementPath: specPath,
        targetSection: '## Specification Quality Gate',
        appendSourceContent: false,
        linkFiles: referenceFiles(featureDir, phases, candidate.relativePath),
        validations: [
          'embedded Specification Quality Gate remains valid',
          'legacy checklist links target the embedded quality gate',
        ],
        deleteAfterValidation: true,
      });
      continue;
    }

    const owners = resolveOwner(candidate, phases);
    if (owners.length !== 1) {
      errors.push(`${candidate.relativePath}: expected exactly one owner phase, found ${owners.length}`);
      continue;
    }
    const owner = owners[0]!;
    if (owner.row.status === 'in_progress' || owner.row.status === 'done') {
      errors.push(`${candidate.relativePath}: owner phase ${owner.row.number} is ${owner.row.status}; migrate manually or reset it before retrying`);
      continue;
    }
    operations.push({
      sourcePath: candidate.path,
      relativeSource: candidate.relativePath,
      kind: candidate.kind,
      ownerPhasePath: owner.path,
      ownerPhaseNumber: owner.row.number,
      ownerPhaseStatus: owner.row.status,
      targetSection: candidate.section,
      linkFiles: referenceFiles(featureDir, phases, candidate.relativePath),
      validations: [
        `owner phase contains ${candidate.section}`,
        'migration marker is present after staged write',
        'plan phase statuses remain unchanged',
      ],
      deleteAfterValidation: true,
    });
  }

  if (candidates.length === 0) warnings.push('No legacy artifacts found; migration is already complete');
  return {
    version: 1,
    featureDir,
    generatedAt: new Date().toISOString(),
    dryRun: true,
    operations,
    errors,
    warnings,
  };
}
