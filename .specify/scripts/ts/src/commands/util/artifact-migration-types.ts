export type LegacyArtifactKind = 'data-model' | 'quickstart' | 'prose-contract' | 'legacy-checklist';

export interface ArtifactMigrationOperation {
  sourcePath: string;
  relativeSource: string;
  kind: LegacyArtifactKind;
  ownerPhasePath?: string;
  replacementPath?: string;
  ownerPhaseNumber?: number;
  ownerPhaseStatus?: string;
  targetSection?: string;
  appendSourceContent?: boolean;
  linkFiles: string[];
  validations: string[];
  deleteAfterValidation: true;
}

export interface ArtifactMigrationPlan {
  version: 1;
  featureDir: string;
  generatedAt: string;
  dryRun: true;
  operations: ArtifactMigrationOperation[];
  errors: string[];
  warnings: string[];
}

export interface MigrationBackupRecord {
  path: string;
  backupPath: string;
  existed: boolean;
  originalHash: string | null;
  appliedHash?: string | null;
}

export interface ArtifactMigrationManifest extends Omit<ArtifactMigrationPlan, 'dryRun'> {
  transactionDir: string;
  state: 'planned' | 'applying' | 'committed' | 'rolled_back' | 'failed';
  backups: MigrationBackupRecord[];
  error?: string;
}
