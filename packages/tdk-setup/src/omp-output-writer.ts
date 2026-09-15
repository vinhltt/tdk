import { emitOmpAgentFiles } from './omp-agent-emitter';
import { emitOmpConfigFile } from './omp-config-emitter';
import { emitOmpContextFile } from './omp-context-emitter';
import { emitOmpHookFiles } from './omp-hook-emitter';
import { loadHarnessManifest } from './manifest-store';
import { emitOmpRuleFiles } from './omp-rule-emitter';
import { emitOmpSkillFiles, validateOmpSkillSources } from './omp-skill-emitter';
import type { ConvertPart } from './convert-parts';
import type { HookTargetPlatform } from './lib/harness-transform/hook-command';
import type {
  ConvertTargetFile,
  FlatClaudeAgentRecord,
  FlatClaudeInventory,
  FlatClaudeHooksRecord,
  FlatClaudeMdRecord,
  FlatClaudeRuleRecord,
  FlatClaudeSkillRecord,
  FlatClaudeSettingsRecord,
  MigrationFact,
} from './flat-claude-types';
import type { OmpModelMap } from './install-settings';
import type { HarnessInstallManifest } from './types';

export interface OmpWritePlan {
  files: ConvertTargetFile[];
  warnings: string[];
  facts: MigrationFact[];
}

export interface BuildOmpWritePlanInput {
  inventory: FlatClaudeInventory;
  selectedParts: readonly ConvertPart[];
  activeParts: readonly ConvertPart[];
  modelMap: OmpModelMap;
  previousManifest: HarnessInstallManifest;
  hookTargetPlatform?: HookTargetPlatform;
}

export function buildOmpWritePlan(input: BuildOmpWritePlanInput): OmpWritePlan {
  for (const part of input.selectedParts) {
    if (!input.activeParts.includes(part)) {
      throw new Error(`Selected OMP part is not active: ${part}.`);
    }
  }
  const settingsParseError = input.inventory.settingsParseError;
  if (
    settingsParseError
    && (input.activeParts.includes('settings') || input.selectedParts.includes('hooks'))
  ) {
    const affected = [
      input.activeParts.includes('settings') ? 'settings' : undefined,
      input.selectedParts.includes('hooks') ? 'hooks' : undefined,
    ].filter((part): part is string => part !== undefined).join(' and ');
    throw new Error(
      `Cannot reconcile OMP ${affected}: ${settingsParseError.sourceRelativePath} is malformed: ${settingsParseError.message}`,
    );
  }
  const files: ConvertTargetFile[] = [];
  const warnings: string[] = [];
  const facts: MigrationFact[] = [];
  if (input.selectedParts.includes('agents')) {
    const agents = input.inventory.records.filter(
      (record): record is FlatClaudeAgentRecord => record.kind === 'agent',
    );
    const emitted = emitOmpAgentFiles(agents, input.modelMap);
    files.push(...emitted.files);
    warnings.push(...emitted.warnings);
  }
  if (input.selectedParts.includes('rules')) {
    const rules = input.inventory.records.filter(
      (record): record is FlatClaudeRuleRecord => record.kind === 'rule',
    );
    const emitted = emitOmpRuleFiles(
      rules,
      input.inventory.consumerRoot,
      loadHarnessManifest(input.inventory.consumerRoot, 'claude'),
    );
    files.push(...emitted.files);
    warnings.push(...emitted.warnings);
  }
  if (input.selectedParts.includes('context')) {
    const context = input.inventory.records.find(
      (record): record is FlatClaudeMdRecord => record.kind === 'claude-md',
    );
    const emitted = emitOmpContextFile(context);
    files.push(...emitted.files);
    facts.push(...emitted.facts);
  }
  if (input.selectedParts.includes('hooks')) {
    if (input.hookTargetPlatform === undefined) {
      throw new Error('OMP hook conversion requires a resolved target platform.');
    }
    const hooks = input.inventory.records.find(
      (record): record is FlatClaudeHooksRecord => record.kind === 'hooks',
    );
    const emitted = emitOmpHookFiles(hooks, input.hookTargetPlatform);
    files.push(...emitted.files);
    warnings.push(...emitted.warnings);
    facts.push(...emitted.facts);
  }
  if (input.activeParts.includes('skills')) {
    const skills = input.inventory.records.filter(
      (record): record is FlatClaudeSkillRecord => record.kind === 'skill',
    );
    const settings = input.inventory.records.find(
      (record): record is FlatClaudeSettingsRecord => record.kind === 'settings',
    );
    if (input.selectedParts.includes('skills')) {
      const emitted = emitOmpSkillFiles(skills, settings?.value, input.inventory.skillSymlinks);
      files.push(...emitted.files);
      warnings.push(...emitted.warnings);
    } else {
      validateOmpSkillSources(skills, settings?.value, input.inventory.skillSymlinks);
    }
  }
  const config = emitOmpConfigFile({
    inventory: input.inventory,
    activeParts: input.activeParts,
    modelMap: input.modelMap,
    previousManifest: input.previousManifest,
  });
  if (config.file) files.push(config.file);
  warnings.push(...config.warnings);
  facts.push(...config.facts);
  files.sort((left, right) => left.targetRelativePath.localeCompare(right.targetRelativePath));
  return { files, warnings, facts };
}
