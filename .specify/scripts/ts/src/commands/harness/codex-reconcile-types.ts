import type { InstallPlan, ManagedFile } from './types';

export type ReconcileAction = 'install' | 'update' | 'skip' | 'delete' | 'conflict';

export interface ReconcileItem {
  action: ReconcileAction;
  targetRelativePath: string;
  reason: string;
  previous?: ManagedFile;
}

export interface CodexReconcilePlan {
  consumerRoot: string;
  manifestPath: string;
  items: ReconcileItem[];
  installPlan: InstallPlan;
  conflicts: ReconcileItem[];
  warnings: string[];
}
