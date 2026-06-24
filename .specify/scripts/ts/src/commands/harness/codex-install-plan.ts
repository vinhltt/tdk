import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
  buildCodexConfigEntry,
  buildFeaturesFlagBlock,
  buildHooksJsonFragment,
  convertAgentToCodexToml,
  mergeConfigToml,
  mergeFeaturesFlagToml,
} from '../../lib/harness-transform';
import { sha256Buffer, sha256File } from './checksum';
import { codexPackageRoot } from './codex-package-root';
import { mergeCodexHooksJson } from './codex-hooks-merge';
import { rewriteCodexGeneratedText, rewriteCodexSlugPrefix, rewriteHyphenPrefix } from './codex-slug-prefix-rewrite';
import {
  codexAgentTarget,
  codexConfigTarget,
  codexHookFileTarget,
  codexHooksJsonTarget,
  codexLibTarget,
  codexSkillTarget,
  isCodexInternalSkillEntrypoint,
} from './codex-target-mapper';
import { manifestPathFor } from './manifest-store';
import { assertSafeCodexTargetRelativePath, normalizeTargetRelativePath } from './target-relative-path';
import type { Manifest } from '../changelog/checks/types';
import type {
  Collision,
  HarnessInstallManifest,
  InstallPlan,
  ManagedFile,
  PlannedRemoval,
  PlannedWrite,
  RequiredPrompt,
} from './types';

interface CodexInstallArtifact {
  plugin: string;
  sourcePath: string;
  sourceRelativePath: string;
  targetRelativePath: string;
  sourceChecksum: string;
  content: Buffer;
}

export interface BuildCodexInstallPlanInput {
  consumerRoot: string;
  selectedPlugins: string[];
  previousManifest: HarnessInstallManifest;
  sourcePrefix: string;
  targetPrefix: string;
  installSettingsPath?: string;
  nextInstallSettings?: unknown;
}

function nowIso(): string {
  return new Date().toISOString();
}

function targetPath(root: string, targetRelativePath: string): string {
  return path.join(root, normalizeTargetRelativePath(targetRelativePath));
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
}

/**
 * Validate an artifact path from the codex manifest (official layout).
 * Allowed: .codex-plugin/plugin.json | skills/... | hooks/...cjs | hooks/codex-hooks.json | lib/...cjs
 * Rejected: agents/, config.toml (install-only), old .codex-plugin/skills/... etc.
 */
function validateCodexInstallArtifactPath(relativePath: string): void {
  if (
    path.posix.isAbsolute(relativePath) ||
    relativePath.includes('\\') ||
    relativePath.split('/').includes('..') ||
    relativePath.split('/').includes('.')
  ) {
    throw new Error(`Unsafe codex source path: ${relativePath}`);
  }
  const allowed =
    relativePath === '.codex-plugin/plugin.json' ||
    relativePath === 'hooks/codex-hooks.json' ||
    /^skills\/.+/.test(relativePath) ||
    /^hooks\/.+\.cjs$/.test(relativePath) ||
    /^lib\/.+\.cjs$/.test(relativePath);
  if (!allowed) throw new Error(`Unexpected codex artifact shape: ${relativePath}`);
}

/**
 * Read and verify a file from the codex package root.
 * Source base is now .specify/codex-plugins/<plugin>/ (official layout).
 */
function verifyArtifact(consumerRoot: string, plugin: string, relativePath: string, expectedChecksum: string): Buffer {
  validateCodexInstallArtifactPath(relativePath);
  const pkgRoot = codexPackageRoot(consumerRoot, plugin);
  const sourcePath = path.join(pkgRoot, relativePath);
  const stat = fs.lstatSync(sourcePath);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`Refusing non-file Codex artifact: ${plugin}/${relativePath}`);
  const content = fs.readFileSync(sourcePath);
  if (sha256Buffer(content) !== expectedChecksum) throw new Error(`Codex artifact checksum mismatch: ${plugin}/${relativePath}`);
  return content;
}

function isPrefixRewriteTextArtifact(relativePath: string): boolean {
  return (
    relativePath.endsWith('.toml') ||
    relativePath.endsWith('.json') ||
    relativePath.endsWith('.md') ||
    relativePath.endsWith('.txt') ||
    relativePath.endsWith('.tpl') ||
    relativePath.endsWith('.py') ||
    relativePath.endsWith('.ts') ||
    relativePath.endsWith('.js') ||
    relativePath.endsWith('.yaml') ||
    relativePath.endsWith('.yml')
  );
}

function installContent(content: Buffer, relativePath: string, prefixSettings: { sourcePrefix: string; targetPrefix: string }): Buffer {
  if (prefixSettings.sourcePrefix === prefixSettings.targetPrefix) return content;
  if (!isPrefixRewriteTextArtifact(relativePath)) return content;
  return Buffer.from(rewriteCodexGeneratedText(content.toString('utf-8'), prefixSettings), 'utf-8');
}

/**
 * Read package artifacts from the codex manifest (new discriminator: package-root prefix).
 * The codex manifest lives at .specify/codex-plugins/manifest.json.
 * Source agent*.md files are read from .specify/plugins/<plugin>/agents/ (two-root model).
 */
function readArtifacts(input: BuildCodexInstallPlanInput): { artifacts: CodexInstallArtifact[]; configBlocks: string[]; hasHooks: boolean; } {
  // Codex manifest covers the generated package artifacts
  const codexManifestPath = path.join(input.consumerRoot, '.specify', 'codex-plugins', 'manifest.json');
  const codexManifest = readJson<Manifest>(codexManifestPath);

  // Source plugins manifest covers source files (agents/*.md, skills, hooks, etc.)
  const sourceManifestPath = path.join(input.consumerRoot, '.specify', 'plugins', 'manifest.json');
  const sourceManifest = readJson<Manifest>(sourceManifestPath);

  const artifacts: CodexInstallArtifact[] = [];
  const configBlocks: string[] = [];
  let hasHooks = false;
  const prefixSettings = { sourcePrefix: input.sourcePrefix, targetPrefix: input.targetPrefix };

  for (const plugin of input.selectedPlugins) {
    const codexEntry = codexManifest.plugins[plugin];
    if (!codexEntry) throw new Error(`Unknown plugin "${plugin}" in .specify/codex-plugins/manifest.json.`);

    const pkgRoot = codexPackageRoot(input.consumerRoot, plugin);

    // --- Package artifacts (skills / hooks / lib) ---
    for (const [relativePath, checksum] of Object.entries(codexEntry.files ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
      // Skip plugin metadata file — not installed
      if (relativePath === '.codex-plugin/plugin.json') continue;
      // Hook declaration drives hooksFragment assembly below, not a direct target copy
      if (relativePath === 'hooks/codex-hooks.json') {
        hasHooks = true;
        continue;
      }

      let targetRelativePath: string | undefined;
      if (relativePath.startsWith('skills/')) {
        const [, skillName, ...rest] = relativePath.split('/');
        if (!skillName || rest.length === 0) throw new Error(`Invalid skill artifact path: ${relativePath}`);
        const rewrittenSkill = rewriteHyphenPrefix(skillName, prefixSettings);
        const skillRelativePath = rest.join('/');
        if (isCodexInternalSkillEntrypoint(rewrittenSkill, skillRelativePath)) continue;
        targetRelativePath = codexSkillTarget(rewrittenSkill, skillRelativePath);
      } else if (relativePath.startsWith('hooks/')) {
        targetRelativePath = codexHookFileTarget(relativePath.slice('hooks/'.length));
      } else if (relativePath.startsWith('lib/')) {
        targetRelativePath = codexLibTarget(relativePath.slice('lib/'.length));
      } else {
        throw new Error(`Unexpected Codex artifact path: ${relativePath}`);
      }

      const content = verifyArtifact(input.consumerRoot, plugin, relativePath, checksum);
      const sourcePath = path.join(pkgRoot, relativePath);

      artifacts.push({
        plugin,
        sourcePath,
        sourceRelativePath: `.specify/codex-plugins/${plugin}/${relativePath}`,
        targetRelativePath: assertSafeCodexTargetRelativePath(targetRelativePath, 'Codex target path'),
        sourceChecksum: checksum,
        content: installContent(content, relativePath, prefixSettings),
      });
    }

    // --- Install-time agent conversion (two-root model) ---
    // Agent source is at .specify/plugins/<plugin>/agents/*.md (Claude source root).
    // The existing source manifest already hashes agents/*.md — no new manifest needed.
    const sourceEntry = sourceManifest.plugins[plugin];
    const agentFiles = Object.keys(sourceEntry?.files ?? {})
      .filter((f) => /^agents\/[^/]+\.md$/.test(f))
      .sort();

    for (const agentRelativePath of agentFiles) {
      const agentSourcePath = path.join(input.consumerRoot, '.specify', 'plugins', plugin, agentRelativePath);
      if (!fs.existsSync(agentSourcePath)) continue;
      const agentMd = fs.readFileSync(agentSourcePath, 'utf-8');

      // Parse frontmatter for name/description/tools
      const fmMatch = agentMd.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
      const frontmatter: Record<string, unknown> = {};
      let body = agentMd;
      if (fmMatch) {
        const parsed = parseYaml(fmMatch[1]!);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          Object.assign(frontmatter, parsed);
        }
        body = fmMatch[2]!;
      }
      const agentName = (typeof frontmatter.name === 'string' && frontmatter.name.trim())
        ? frontmatter.name.trim()
        : path.basename(agentRelativePath, '.md');
      const agentDesc = typeof frontmatter.description === 'string' ? frontmatter.description : undefined;

      const converted = convertAgentToCodexToml({ name: agentName, description: agentDesc, frontmatter, body });

      // Agent target follows prefix rewrite
      const rewrittenAgentSlug = rewriteCodexSlugPrefix(converted.filename.replace(/\.toml$/, ''), prefixSettings);
      const agentTargetRelativePath = codexAgentTarget(`${rewrittenAgentSlug}.toml`);
      const tomlContent = `# AUTO-GENERATED by TDK harness install - DO NOT EDIT\n${converted.toml}\n`;

      artifacts.push({
        plugin,
        sourcePath: agentSourcePath,
        sourceRelativePath: `.specify/plugins/${plugin}/${agentRelativePath}`,
        targetRelativePath: assertSafeCodexTargetRelativePath(agentTargetRelativePath, 'Codex agent target'),
        sourceChecksum: sha256Buffer(Buffer.from(agentMd, 'utf-8')),
        content: Buffer.from(tomlContent, 'utf-8'),
      });

      // Build config block for this agent (prefix-rewritten)
      const rewrittenName = `${rewrittenAgentSlug}`;
      const rewrittenDesc = agentDesc
        ? rewriteCodexGeneratedText(agentDesc, prefixSettings)
        : agentName;
      configBlocks.push(buildCodexConfigEntry(rewrittenName, rewrittenDesc));
    }
  }

  return { artifacts, configBlocks, hasHooks };
}

/**
 * Build the merged hooks.json fragment from codex-hooks.json files in the package roots.
 * Hooks key is now hooks/codex-hooks.json (was .codex-plugin/hooks.json).
 */
function hooksFragmentFromArtifacts(input: BuildCodexInstallPlanInput): Record<string, unknown[]>  {
  const codexManifestPath = path.join(input.consumerRoot, '.specify', 'codex-plugins', 'manifest.json');
  const codexManifest = readJson<Manifest>(codexManifestPath);
  const fragment: Record<string, unknown[]> = {};
  for (const plugin of input.selectedPlugins) {
    const checksum = codexManifest.plugins[plugin]?.files?.['hooks/codex-hooks.json'];
    if (!checksum) continue;
    const content = verifyArtifact(input.consumerRoot, plugin, 'hooks/codex-hooks.json', checksum).toString('utf-8');
    const parsed = JSON.parse(content) as Record<string, unknown[]>;
    const rewritten = buildHooksJsonFragment(
      Object.fromEntries(Object.entries(parsed).map(([event, hooks]) => [
        event,
        hooks.map((hook) => ({
          command: (hook as { command: string }).command.replace(/^node\s+"?/, '').replace(/"?$/, ''),
          ...((hook as { matcher?: string }).matcher ? { matcher: (hook as { matcher: string }).matcher } : {}),
          ...((hook as { timeout?: number }).timeout === undefined ? {} : { timeout: (hook as { timeout: number }).timeout }),
        })),
      ])),
      Object.fromEntries(Object.values(parsed).flat().map((hook) => {
        const command = (hook as { command: string }).command.replace(/^node\s+"?/, '').replace(/"?$/, '');
        return [command, command];
      })),
      plugin,
    );
    for (const [event, hooks] of Object.entries(rewritten)) {
      fragment[event] = [...(fragment[event] ?? []), ...hooks];
    }
  }
  return fragment;
}

function previousByTarget(previous: ManagedFile[]): Map<string, ManagedFile> {
  return new Map(previous.map((file) => [normalizeTargetRelativePath(file.targetRelativePath), file]));
}

function classifyDesiredFile(root: string, artifact: CodexInstallArtifact, previous?: ManagedFile): {
  write?: PlannedWrite;
  managed?: ManagedFile;
  collision?: Collision;
} {
  const targetRelativePath = normalizeTargetRelativePath(artifact.targetRelativePath);
  const target = targetPath(root, targetRelativePath);
  const installedChecksum = sha256Buffer(artifact.content);
  const managed: ManagedFile = {
    plugin: artifact.plugin,
    sourceRelativePath: artifact.sourceRelativePath,
    targetRelativePath,
    sourceChecksum: artifact.sourceChecksum,
    installedChecksum,
  };
  if (!fs.existsSync(target)) {
    return {
      write: { plugin: artifact.plugin, sourcePath: artifact.sourcePath, sourceRelativePath: artifact.sourceRelativePath, targetPath: target, targetRelativePath, sourceChecksum: artifact.sourceChecksum, installedChecksum, content: artifact.content, action: 'create' },
      managed,
    };
  }
  const stat = fs.lstatSync(target);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    return { collision: { kind: 'directory-file-conflict', path: target, plugin: artifact.plugin, message: `Target is not a regular file: ${targetRelativePath}` } };
  }
  const currentChecksum = sha256File(target);
  if (!previous) {
    return { collision: { kind: 'unmanaged-target-exists', path: target, plugin: artifact.plugin, message: `Target exists outside TDK Codex ownership: ${targetRelativePath}` } };
  }
  if (currentChecksum === installedChecksum) return { managed };
  if (currentChecksum === previous.installedChecksum) {
    return {
      write: { plugin: artifact.plugin, sourcePath: artifact.sourcePath, sourceRelativePath: artifact.sourceRelativePath, targetPath: target, targetRelativePath, sourceChecksum: artifact.sourceChecksum, installedChecksum, content: artifact.content, expectedTargetChecksum: currentChecksum, action: 'update' },
      managed,
    };
  }
  return { managed: previous, collision: { kind: 'managed-drift', path: target, plugin: artifact.plugin, message: `Managed Codex target has user edits: ${targetRelativePath}` } };
}

function staleRemoval(root: string, previous: ManagedFile): { removal?: PlannedRemoval; keep?: ManagedFile; collision?: Collision } {
  if (previous.plugin === 'convert-flat') return { keep: previous };
  if (previous.targetRelativePath === codexConfigTarget() || previous.targetRelativePath === codexHooksJsonTarget()) return {};
  const target = targetPath(root, previous.targetRelativePath);
  if (!fs.existsSync(target)) return {};
  const stat = fs.lstatSync(target);
  if (!stat.isFile() || stat.isSymbolicLink()) return { keep: previous, collision: { kind: 'directory-file-conflict', path: target, plugin: previous.plugin, message: `Stale managed target is not a file: ${previous.targetRelativePath}` } };
  const currentChecksum = sha256File(target);
  if (currentChecksum !== previous.installedChecksum) return { keep: previous, collision: { kind: 'managed-drift', path: target, plugin: previous.plugin, message: `Stale managed Codex target has user edits: ${previous.targetRelativePath}` } };
  return { removal: { targetPath: target, targetRelativePath: previous.targetRelativePath, previous } };
}

export function buildCodexInstallPlan(input: BuildCodexInstallPlanInput): InstallPlan {
  const { artifacts, configBlocks, hasHooks } = readArtifacts(input);
  const existingConfig = fs.existsSync(targetPath(input.consumerRoot, codexConfigTarget()))
    ? fs.readFileSync(targetPath(input.consumerRoot, codexConfigTarget()), 'utf-8')
    : '';
  const mergedAgentsConfig = configBlocks.length > 0 ? mergeConfigToml(existingConfig, configBlocks.sort().join('\n\n')) : existingConfig;
  const mergedConfig = hasHooks ? mergeFeaturesFlagToml(mergedAgentsConfig) : mergedAgentsConfig;
  if (mergedConfig !== existingConfig) {
    artifacts.push({
      plugin: input.selectedPlugins[0] ?? 'codex',
      sourcePath: path.join(input.consumerRoot, '.specify', 'codex-plugins', 'manifest.json'),
      sourceRelativePath: '.specify/codex-plugins/manifest.json',
      targetRelativePath: codexConfigTarget(),
      sourceChecksum: sha256Buffer(Buffer.from(configBlocks.join('\n'))),
      content: Buffer.from(mergedConfig, 'utf-8'),
    });
  }

  const existingHooks = fs.existsSync(targetPath(input.consumerRoot, codexHooksJsonTarget()))
    ? fs.readFileSync(targetPath(input.consumerRoot, codexHooksJsonTarget()), 'utf-8')
    : '';
  const managedOrigins = new Set([...input.previousManifest.selectedPlugins.filter((plugin) => plugin !== 'convert-flat'), ...input.selectedPlugins]);
  const hooksFragment = hooksFragmentFromArtifacts(input);
  if (Object.keys(hooksFragment).length > 0 || existingHooks.trim()) {
    const mergedHooks = mergeCodexHooksJson(existingHooks, hooksFragment, managedOrigins);
    if (mergedHooks !== existingHooks) {
      artifacts.push({
        plugin: input.selectedPlugins[0] ?? 'codex',
        sourcePath: path.join(input.consumerRoot, '.specify', 'codex-plugins', 'manifest.json'),
        sourceRelativePath: '.specify/codex-plugins/manifest.json',
        targetRelativePath: codexHooksJsonTarget(),
        sourceChecksum: sha256Buffer(Buffer.from(JSON.stringify(hooksFragment))),
        content: Buffer.from(mergedHooks, 'utf-8'),
      });
    }
  }

  const previousMap = previousByTarget(input.previousManifest.managedFiles);
  const writes: PlannedWrite[] = [];
  const removals: PlannedRemoval[] = [];
  const collisions: Collision[] = [];
  const prompts: RequiredPrompt[] = [];
  const nextManaged = new Map<string, ManagedFile>();
  const desiredTargets = new Set<string>();

  for (const artifact of artifacts.sort((a, b) => a.targetRelativePath.localeCompare(b.targetRelativePath))) {
    desiredTargets.add(artifact.targetRelativePath);
    const state = classifyDesiredFile(input.consumerRoot, artifact, previousMap.get(artifact.targetRelativePath));
    if (state.write) writes.push(state.write);
    if (state.managed) nextManaged.set(state.managed.targetRelativePath, state.managed);
    if (state.collision) collisions.push(state.collision);
  }

  for (const previous of input.previousManifest.managedFiles) {
    if (desiredTargets.has(previous.targetRelativePath)) continue;
    const state = staleRemoval(input.consumerRoot, previous);
    if (state.removal) removals.push(state.removal);
    if (state.keep) nextManaged.set(state.keep.targetRelativePath, state.keep);
    if (state.collision) collisions.push(state.collision);
  }

  const nextManifest: HarnessInstallManifest = {
    version: 1,
    harness: 'codex',
    selectedPlugins: [...input.selectedPlugins].sort(),
    installerVersion: '0.1.0',
    installedAt: nowIso(),
    managedFiles: [...nextManaged.values()].sort((a, b) => a.targetRelativePath.localeCompare(b.targetRelativePath)),
    managedHooks: input.previousManifest.managedHooks,
  };

  return {
    harness: 'codex',
    consumerRoot: input.consumerRoot,
    selectedPlugins: [...input.selectedPlugins].sort(),
    targetDir: '.codex',
    claudeSettingsPath: codexConfigTarget(),
    manifestPath: manifestPathFor(input.consumerRoot, 'codex'),
    installSettingsPath: input.installSettingsPath,
    writes: writes.sort((a, b) => a.targetRelativePath.localeCompare(b.targetRelativePath)),
    removals: removals.sort((a, b) => a.targetRelativePath.localeCompare(b.targetRelativePath)),
    hookMutations: [],
    collisions,
    prompts,
    warnings: [],
    nextManifest,
    settingsChanged: false,
    nextInstallSettings: input.nextInstallSettings,
    installSettingsChanged: input.nextInstallSettings !== undefined,
  };
}
