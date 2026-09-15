import * as fs from 'node:fs';
import * as path from 'node:path';
import { stringify } from 'yaml';
import { sha256Buffer, sha256File } from './checksum';
import { CONVERT_FLAT_OWNER } from './convert-reconcile';
import { mapClaudeToolName } from './lib/harness-transform/claude-tool-to-omp';
import { extractOmpManagedPayload, mergeConfigYaml } from './lib/harness-transform/config-yaml-merge';
import type { ConvertPart } from './convert-parts';
import type {
  ConvertTargetFile,
  FlatClaudeHooksRecord,
  FlatClaudeInventory,
  FlatClaudeSettingsRecord,
  MigrationFact,
} from './flat-claude-types';
import type { OmpModelMap } from './install-settings';
import type { HarnessInstallManifest } from './types';

const OMP_CONFIG_TARGET = '.omp/config.yml';
const SUPPORTED_THINKING_LEVELS = new Set(['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'auto']);
const KNOWN_SETTINGS_KEYS = new Set([
  '$schema',
  'alwaysThinkingEnabled',
  'attribution',
  'disabledMcpjsonServers',
  'effortLevel',
  'enableAllProjectMcpServers',
  'enabledMcpjsonServers',
  'enabledPlugins',
  'env',
  'hooks',
  'includeCoAuthoredBy',
  'model',
  'outputStyle',
  'permissions',
  'prefersReducedMotion',
  'showThinkingSummaries',
  'skillListingBudgetFraction',
  'skillListingMaxDescChars',
  'skillOverrides',
  'statusLine',
]);

type PermissionApproval = 'allow' | 'deny' | 'prompt';

interface OmpConfigEmitInput {
  inventory: FlatClaudeInventory;
  activeParts: readonly ConvertPart[];
  modelMap: OmpModelMap;
  previousManifest: HarnessInstallManifest;
}

export interface OmpConfigEmitResult {
  file?: ConvertTargetFile;
  warnings: string[];
  facts: MigrationFact[];
}

const APPROVAL_RANK: Readonly<Record<PermissionApproval, number>> = {
  allow: 0,
  prompt: 1,
  deny: 2,
};

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function fact(
  status: MigrationFact['status'],
  key: string | undefined,
  message: string,
  source = '.claude/settings.json',
  layer: MigrationFact['layer'] = 1,
): MigrationFact {
  return { layer, status, message, source, ...(key ? { key } : {}) };
}

function permissionValues(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? value as string[]
    : undefined;
}

function parsePermission(value: string): { tool: string; scope?: string } | undefined {
  const match = value.match(/^([A-Za-z][A-Za-z0-9_]*)(?:\(([\s\S]*)\))?$/);
  if (!match?.[1]) return undefined;
  return { tool: match[1], ...(match[2] !== undefined ? { scope: match[2] } : {}) };
}

function bashMatches(scope: string): string[] | undefined {
  const trimmed = scope.trim();
  if (!trimmed) return undefined;
  if (!trimmed.endsWith(':*')) return trimmed.includes('*') ? undefined : [trimmed];
  const prefix = trimmed.slice(0, -2);
  return prefix ? [prefix, `${prefix} *`] : undefined;
}

function mapPermissions(
  permissions: unknown,
  target: Record<string, unknown>,
  facts: MigrationFact[],
  warnings: string[],
): void {
  if (permissions === undefined) return;
  const source = objectValue(permissions);
  if (!source) {
    facts.push(fact('dropped', 'permissions', 'Expected an object; no permission was converted.'));
    return;
  }

  const toolApprovals: Record<string, PermissionApproval> = {};
  const toolCandidates: Array<{ key: string; tool: string; approval: PermissionApproval }> = [];
  const bashPatterns: Array<{ key: string; match: string; approval: PermissionApproval; order: number }> = [];
  let patternOrder = 0;
  const groups: Array<{ key: 'allow' | 'deny' | 'ask'; approval: PermissionApproval }> = [
    { key: 'allow', approval: 'allow' },
    { key: 'deny', approval: 'deny' },
    { key: 'ask', approval: 'prompt' },
  ];
  for (const group of groups) {
    const raw = source[group.key];
    if (raw === undefined) continue;
    const values = permissionValues(raw);
    if (!values) {
      facts.push(fact('dropped', `permissions.${group.key}`, 'Expected a string array.'));
      continue;
    }
    for (const [index, value] of values.entries()) {
      const key = `permissions.${group.key}[${index}]`;
      const parsed = parsePermission(value);
      if (!parsed) {
        facts.push(fact('dropped', key, 'Unsupported permission expression.'));
        continue;
      }
      if (parsed.tool === 'Bash' && parsed.scope !== undefined) {
        const matches = bashMatches(parsed.scope);
        if (!matches) {
          facts.push(fact('dropped', key, 'Unsupported Bash scope; no boundary-safe OMP pattern was emitted.'));
          warnings.push(`Dropped ${key}: Bash scope cannot be represented without broadening command access.`);
        } else {
          for (const match of matches) {
            bashPatterns.push({ key, match, approval: group.approval, order: patternOrder++ });
          }
        }
        continue;
      }
      if (parsed.scope !== undefined) {
        facts.push(fact('dropped', key, 'Scoped non-Bash permission cannot be mapped without broadening access.'));
        continue;
      }
      const tool = mapClaudeToolName(parsed.tool);
      if (!tool) {
        facts.push(fact('dropped', key, 'Unsupported global tool permission.'));
        continue;
      }
      const currentApproval = toolApprovals[tool];
      if (!currentApproval || APPROVAL_RANK[group.approval] > APPROVAL_RANK[currentApproval]) {
        toolApprovals[tool] = group.approval;
      }
      toolCandidates.push({ key, tool, approval: group.approval });
    }
  }
  for (const key of Object.keys(source).sort()) {
    if (key !== 'allow' && key !== 'deny' && key !== 'ask') {
      facts.push(fact('dropped', `permissions.${key}`, 'No equivalent OMP permission setting.'));
    }
  }
  const reportedTools = new Set<string>();
  for (const candidate of toolCandidates) {
    const finalApproval = toolApprovals[candidate.tool];
    if (candidate.approval === finalApproval && !reportedTools.has(candidate.tool)) {
      reportedTools.add(candidate.tool);
      facts.push(fact(
        'converted',
        candidate.key,
        `Mapped to tools.approval.${candidate.tool} (${candidate.approval}).`,
      ));
    } else {
      facts.push(fact('dropped', candidate.key, 'Superseded by a stronger or earlier equivalent tool permission.'));
    }
  }
  if (Object.keys(toolApprovals).length > 0) target.tools = { approval: toolApprovals };
  if (bashPatterns.length > 0) {
    const strongestByMatch = new Map<string, { key: string; match: string; approval: PermissionApproval; order: number }>();
    for (const pattern of bashPatterns) {
      const current = strongestByMatch.get(pattern.match);
      if (!current || APPROVAL_RANK[pattern.approval] > APPROVAL_RANK[current.approval]) {
        strongestByMatch.set(pattern.match, pattern);
      }
    }
    for (const pattern of bashPatterns) {
      if (strongestByMatch.get(pattern.match) === pattern) {
        facts.push(fact('converted', pattern.key, `Mapped Bash scope to bash.patterns (${pattern.approval}).`));
      } else {
        facts.push(fact('dropped', pattern.key, 'Superseded by a stronger or earlier equivalent Bash permission.'));
      }
    }
    const patterns = [...strongestByMatch.values()]
      .sort((left, right) => APPROVAL_RANK[right.approval] - APPROVAL_RANK[left.approval] || left.order - right.order)
      .map(({ match, approval }) => ({ match, approval }));
    target.bash = { patterns };
  }
}

function settingsFragment(
  record: FlatClaudeSettingsRecord | undefined,
  modelMap: OmpModelMap,
  facts: MigrationFact[],
  warnings: string[],
): Record<string, unknown> {
  const target: Record<string, unknown> = {};
  const settings = objectValue(record?.value);
  if (!settings) {
    facts.push(fact('note', undefined, 'No valid .claude/settings.json settings object was available.'));
    return target;
  }

  if (typeof settings.model === 'string') {
    const mapped = Object.hasOwn(modelMap, settings.model) ? modelMap[settings.model] : undefined;
    if (mapped) {
      target.modelRoles = { default: mapped };
      facts.push(fact('converted', 'model', `Mapped through harnesses.omp.modelMap to ${mapped}.`));
    } else facts.push(fact('dropped', 'model', 'No harnesses.omp.modelMap entry for the configured alias.'));
  } else if (settings.model !== undefined) facts.push(fact('dropped', 'model', 'Expected a string model alias.'));

  if (typeof settings.effortLevel === 'string' && SUPPORTED_THINKING_LEVELS.has(settings.effortLevel)) {
    target.defaultThinkingLevel = settings.effortLevel;
    facts.push(fact('converted', 'effortLevel', `Mapped to defaultThinkingLevel: ${settings.effortLevel}.`));
  } else if (settings.effortLevel !== undefined) {
    facts.push(fact('dropped', 'effortLevel', 'Value is not supported by OMP defaultThinkingLevel.'));
  }

  mapPermissions(settings.permissions, target, facts, warnings);

  for (const key of Object.keys(settings).sort()) {
    if (key === 'model' || key === 'effortLevel' || key === 'permissions') continue;
    if (key === 'enableAllProjectMcpServers' && settings[key] === true) {
      facts.push(fact('note', key, 'OMP reads project MCP configuration directly; no emitted setting is required.'));
      continue;
    }
    const reason = key === 'hooks'
      ? 'Hooks are converted only by the hooks part.'
      : key === 'alwaysThinkingEnabled'
        ? 'Claude thinking enablement has no equivalent OMP setting.'
        : key === 'showThinkingSummaries'
          ? 'This is not equivalent to OMP hideThinkingBlock.'
          : KNOWN_SETTINGS_KEYS.has(key)
            ? 'No equivalent OMP project setting; value was not copied.'
            : 'Unknown Claude setting; value was not copied.';
    facts.push(fact('dropped', key, reason));
  }
  return target;
}

function addLocalPresenceFacts(root: string, facts: MigrationFact[]): void {
  const relative = '.claude/settings.local.json';
  const localPath = path.join(root, relative);
  if (!fs.existsSync(localPath)) return;
  const stat = fs.lstatSync(localPath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    facts.push(fact('dropped', undefined, 'Local settings path is not a regular file; nothing was inspected.', relative));
    return;
  }
  let parsed: Record<string, unknown> | undefined;
  try {
    parsed = objectValue(JSON.parse(fs.readFileSync(localPath, 'utf-8')));
  } catch {
    facts.push(fact('dropped', undefined, 'Local settings JSON is invalid; nothing was converted.', relative));
    return;
  }
  if (!parsed) return;
  for (const key of ['hooks', 'permissions']) {
    if (Object.hasOwn(parsed, key)) {
      facts.push(fact('local-not-converted', key, 'Top-level key is present but local settings are not converted.', relative));
    }
  }
}

function addHookSignals(inventory: FlatClaudeInventory, facts: MigrationFact[]): void {
  const hooks = inventory.records.find((record): record is FlatClaudeHooksRecord => record.kind === 'hooks');
  if (hooks) {
    for (const file of hooks.files) {
      const stat = fs.lstatSync(file.sourcePath);
      if (stat.isFile() && !stat.isSymbolicLink() && /rules/i.test(fs.readFileSync(file.sourcePath, 'utf-8'))) {
        facts.push(fact('signal', undefined, 'Text signal only: hook file references rules.', file.sourceRelativePath, 2));
      }
    }
  }
  facts.push(fact(
    'note',
    undefined,
    'Rules now use OMP native loading; any hook that also injects rules remains a second path.',
    '.claude',
    3,
  ));
}

export function emitOmpConfigFile(input: OmpConfigEmitInput): OmpConfigEmitResult {
  const facts: MigrationFact[] = [];
  const warnings: string[] = [];
  const settingsActive = input.activeParts.includes('settings');
  const skillsActive = input.activeParts.includes('skills');
  const previous = input.previousManifest.managedFiles.find(
    (file) => file.plugin === CONVERT_FLAT_OWNER && file.targetRelativePath === OMP_CONFIG_TARGET,
  );
  if (!settingsActive && !skillsActive && !previous) return { warnings, facts };

  const managed: Record<string, unknown> = {};
  const settingsRecord = input.inventory.records.find(
    (record): record is FlatClaudeSettingsRecord => record.kind === 'settings',
  );
  if (settingsActive) {
    Object.assign(managed, settingsFragment(settingsRecord, input.modelMap, facts, warnings));
    addLocalPresenceFacts(input.inventory.consumerRoot, facts);
    addHookSignals(input.inventory, facts);
  }
  if (skillsActive) {
    managed.skills = { enableClaudeUser: false, enableClaudeProject: false };
  }

  const targetPath = path.join(input.inventory.consumerRoot, OMP_CONFIG_TARGET);
  let existing = '';
  if (fs.existsSync(targetPath)) {
    const stat = fs.lstatSync(targetPath);
    if (stat.isFile() && !stat.isSymbolicLink()) existing = fs.readFileSync(targetPath, 'utf-8');
  }
  const managedBlock = Object.keys(managed).length > 0 ? stringify(managed).trimEnd() : '';
  const merged = mergeConfigYaml(existing, managedBlock);
  if (merged.error) throw new Error(merged.error);
  warnings.push(...merged.warnings);

  const currentPayload = extractOmpManagedPayload(existing);
  const desiredPayload = extractOmpManagedPayload(merged.content);
  const sourcePath = settingsRecord?.sourcePath ?? path.join(input.inventory.consumerRoot, '.claude/settings.json');
  const sourceChecksum = settingsRecord && fs.existsSync(settingsRecord.sourcePath)
    ? sha256File(settingsRecord.sourcePath)
    : sha256Buffer(Buffer.alloc(0));
  const content = Buffer.from(merged.content, 'utf-8');
  return {
    file: {
      sourcePath,
      sourceRelativePath: settingsRecord?.sourceRelativePath ?? '.claude/settings.json',
      targetRelativePath: OMP_CONFIG_TARGET,
      sourceChecksum,
      installedChecksum: sha256Buffer(content),
      content,
      ...(desiredPayload !== undefined
        ? { managedRegionChecksum: sha256Buffer(Buffer.from(desiredPayload, 'utf-8')) }
        : { unmanageAfterWrite: true }),
      ...(currentPayload !== undefined
        ? { currentManagedRegionChecksum: sha256Buffer(Buffer.from(currentPayload, 'utf-8')) }
        : {}),
    },
    warnings,
    facts,
  };
}
