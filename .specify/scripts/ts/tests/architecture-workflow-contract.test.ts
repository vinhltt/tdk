import { describe, expect, it } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const INCEPTION_SKILLS_DIR = resolve(import.meta.dir, '../../../plugins/tdk-inception/skills');
const EPIC_SKILLS_DIR = resolve(import.meta.dir, '../../../plugins/tdk-epic/skills');
const INDEX_PATH = resolve(import.meta.dir, '../src/index.ts');
const APPLY_PATH = resolve(import.meta.dir, '../src/commands/config/topology/apply.ts');
const OLD_TOPOLOGY_APPLY_SKILL = ['tdk', 'workspace', 'topology', 'apply'].join('-');

function skillPath(name: string): string {
  return resolve(INCEPTION_SKILLS_DIR, name, 'SKILL.md');
}

function epicSkillPath(name: string): string {
  return resolve(EPIC_SKILLS_DIR, name, 'SKILL.md');
}

function read(path: string): string {
  return readFileSync(path, 'utf-8');
}

function readIfExists(path: string): string {
  return existsSync(path) ? read(path) : '';
}

function expectNoRuntimeConfigMutation(skill: string): void {
  expect(skill).toContain('does not create or update `.specify/.specify.json`');
  expect(skill).not.toContain('write `.specify/.specify.json`');
  expect(skill).not.toContain('mutate `.specify/.specify.json`');
}

function expectArchitectureWorkflowMetadata(skill: string): void {
  expect(skill).toMatch(/version: "[^"]+"/);
}

describe('architecture workflow foundation contracts', () => {
  const greenfieldPath = skillPath('tdk-greenfield-start');
  const brownfieldPath = skillPath('tdk-brownfield-start');
  const layoutPath = skillPath('tdk-workspace-layout-propose');
  const legacyBoundaryMapPath = skillPath('tdk-boundary-map');
  const topologyPath = skillPath('tdk-workflow-config-apply');

  const greenfield = readIfExists(greenfieldPath);
  const brownfield = readIfExists(brownfieldPath);
  const layout = readIfExists(layoutPath);
  const legacyBoundaryMap = readIfExists(legacyBoundaryMapPath);
  const topology = readIfExists(topologyPath);
  const hld = readIfExists(epicSkillPath('tdk-epic-hld'));
  const index = read(INDEX_PATH);
  const applyCommand = read(APPLY_PATH);

  it('registers the guarded topology apply CLI surface', () => {
    expect(index).toContain('createConfigTopologyApplyCommand');
    expect(index).toContain("new Command('topology')");
    expect(applyCommand).toContain("option('--yes'");
    expect(applyCommand).toContain("option('--expect-hash <hash>'");
  });

  it('keeps new foundation skills in the architecture workflow category', () => {
    expectArchitectureWorkflowMetadata(greenfield);
    expectArchitectureWorkflowMetadata(brownfield);
    expectArchitectureWorkflowMetadata(layout);
    expectArchitectureWorkflowMetadata(topology);
  });

  it('keeps boundary-map as a compatibility wrapper for workspace layout proposal', () => {
    expect(existsSync(layoutPath)).toBe(true);
    expect(existsSync(legacyBoundaryMapPath)).toBe(true);
    expect(layout).toContain('name: tdk-workspace-layout-propose');
    expect(layout).toContain('.specify/configurations/workspace-layout/workspace-layout-proposal.json');
    expect(legacyBoundaryMap).toContain('deprecated compatibility route');
    expect(legacyBoundaryMap).toContain('/tdk-workspace-layout-propose');
    expect(legacyBoundaryMap).toContain('.specify/configurations/workspace-topology/workspace-topology.json');
  });

  it('adds greenfield start as report-only new-project intake', () => {
    expect(existsSync(greenfieldPath)).toBe(true);
    expect(greenfield).toContain('name: tdk-greenfield-start');
    expect(greenfield).toContain('[brief|file] [--full|--quick|--unknown]');
    expect(greenfield).toContain('--full` is the default');
    expect(greenfield).toContain('--quick');
    expect(greenfield).toContain('--unknown');
    expect(greenfield).toContain('.specify/configurations/inception/project-inception.md');
    expect(greenfield).toContain('does not choose final architecture');
    expect(greenfield).not.toContain('--single-app');
    expect(greenfield).not.toContain('--monorepo');
    expectNoRuntimeConfigMutation(greenfield);
  });

  it('adds brownfield start as observe-first repo onboarding', () => {
    expect(existsSync(brownfieldPath)).toBe(true);
    expect(brownfield).toContain('name: tdk-brownfield-start');
    expect(brownfield).toContain('[repo-root] [--full|--config-only|--unknown]');
    expect(brownfield).toContain('--full` is the observe-first default');
    expect(brownfield).toContain('--config-only');
    expect(brownfield).toContain('--unknown');
    expect(brownfield).toContain('.specify/configurations/inception/brownfield-onboarding.md');
    expect(brownfield).toContain('redact');
    expect(brownfield).toContain('does not ask product-scope discovery questions by default');
    expect(brownfield).toContain('does not move, rename, scaffold, or refactor source folders');
    expectNoRuntimeConfigMutation(brownfield);
  });

  it('adds workflow config apply as an interactive wrapper over the TypeScript CLI', () => {
    expect(existsSync(topologyPath)).toBe(true);
    expect(existsSync(skillPath(OLD_TOPOLOGY_APPLY_SKILL))).toBe(false);
    expect(topology).toContain('name: tdk-workflow-config-apply');
    expect(topology).toContain('[(no flags)|--dry-run|--reconcile|--yes --expect-hash <hash>]');
    expect(topology).toContain('no flags is the default human mode');
    expect(topology).toContain('Do not make the');
    expect(topology).toContain('user copy it manually');
    expect(topology).toContain('Apply this workflow config patch to `.specify/.specify.json`?');
    expect(topology).toContain('`--yes` without `--expect-hash` exits 1');
    expect(topology).toContain('automation apply remains explicit: `--yes --expect-hash <planHash>`');
    expect(topology).toContain('existing JSON `.specify/.specify.json` is required');
    expect(topology).toContain('bun src/index.ts config topology apply');
    expect(topology).toContain('.specify/configurations/workspace-layout/workspace-layout-proposal.json');
    expect(topology).toContain('.specify/configurations/workspace-topology/workspace-topology.json');
    expect(topology).toContain('workspace-layout-proposal.json` is the authoring proposal');
    expect(topology).toContain('workspace-topology.json` remains a legacy fallback');
    expect(topology).toContain('`.specify/.specify.json` is derived runtime config');
    expect(topology).toContain('shell-like routing values hard-fail');
    expect(topology).toContain('deferred: first-time config creation');
    expect(topology).toContain('`--reconcile` apply');
    expect(topology).toContain('TOPOLOGY_ARG="$PROJECT_DIR/$TOPOLOGY_PATH"');
    expect(topology).not.toContain('dry-run is the default');
    expect(topology).not.toContain('--create-dirs');
  });

  it('keeps HLD epic-scoped and out of project topology ownership', () => {
    expect(hld).toContain('Produce parent epic high-level design');
    expect(hld).toContain('This command does NOT:');
    expect(hld).toContain('Create implementation plans');
    expect(hld).toContain('Implement code');
    expect(hld).not.toContain('workspace-topology.json');
    expect(hld).not.toContain('topology apply');
    expect(hld).not.toContain('.specify/.specify.json');
  });
});

describe('one-command project bootstrap entry', () => {
  const entryDir = resolve(INCEPTION_SKILLS_DIR, 'tdk-project-bootstrap');
  const skill = read(skillPath('tdk-project-bootstrap'));
  const agentsContract = read(resolve(entryDir, 'references/agents-md-contract.md'));

  it('is a user-invocable inception skill holding only SKILL.md and the AGENTS.md contract', () => {
    expect(skill).toContain('name: tdk-project-bootstrap');
    expect(skill).toContain('user-invocable: true');
    expect(skill).toContain('argument-hint: "[brief|file] [--brownfield|--greenfield] [--quick]"');
    expectArchitectureWorkflowMetadata(skill);
    expect(readdirSync(entryDir).sort()).toEqual(['SKILL.md', 'references']);
    expect(readdirSync(resolve(entryDir, 'references'))).toEqual(['agents-md-contract.md']);
  });

  it('asks only the config gate question, driven by the topology CLI dry-run', () => {
    expect(skill).toContain('Running this command is the consent');
    expect(skill).toContain('only question this command asks');
    for (const token of ['--dry-run', '--expect-hash <planHash>', '--accept-overwrites', '` no changes`']) {
      expect(skill).toContain(token);
    }
    // The parsed `before` and raw `after` configs never compare equal; the diff tail is the signal.
    expect(skill).not.toContain('changes.before');
    expect(skill).toContain('empty `subWorkspaces[]` in the proposal: skip config and the sub-workspace step without calling the CLI');
    expect(skill).toContain('A non-zero exit or non-JSON stdout');
  });

  it('seeds a minimal config only when neither a JSON nor a YAML config exists', () => {
    for (const token of ['git.mainBranch', '"prefixList": "feat"', '"defaultFolder": "feature"', '"ticketFormat"']) {
      expect(skill).toContain(token);
    }
    expect(skill).toContain('When neither `.specify/.specify.json` nor `.specify/.specify.yaml` exists');
    expect(skill).toContain('When only `.specify/.specify.yaml` exists, do not seed');
    expect(skill).toContain('do not copy `.specify.json.example`');
    expect(skill).toContain('seeds a minimal `.specify/.specify.json` when no config exists');
    expect(skill).toContain('`/tdk-workflow-config-apply` still never creates one');
  });

  it('hands memory, constitution, and sub-workspaces to their owners without questions', () => {
    expect(skill).toContain('===TDK-MEMORY-DOMAIN===');
    // Inferred domains are binding memory, so a purely technical repository must infer none.
    expect(skill).toContain('a purely technical library or tool has no domain');
    // A fresh greenfield layout has no folders yet, so the sub-workspace step has nothing to work on.
    expect(skill).toContain('and at least one of their paths exists');
    expect(skill).toContain('When none of the paths exists, as after a fresh greenfield layout, skip this step');
    expect(skill).toContain('provenance: inferred');
    expect(skill).toContain('/tdk-constitution --init --auto');
    expect(skill).toContain('check `bun` and `repomix` on `PATH` first');
    expect(skill).toContain('How to add a sub-workspace later');
  });

  it('resumes on rerun and halts before memory when evidence or the gate is not ready', () => {
    expect(skill).toContain('**Halt** means: skip every remaining step of §2–§7, then run §8 and §9.');
    // Resuming never cascades on its own: the user deletes the later files of a chain.
    expect(skill).toContain('To regenerate a file, delete it and every later file in its chain');
    expect(skill).toContain('unless the inception report already exists and is not `not-ready`');
    expect(skill).toContain('On a rerun keep the lines and review items of every step that skips');
    expect(skill).toContain('Skip when `architecture-decision.md` exists.');
    expect(skill).toContain('With findings, the only apply option is `Apply including overwrites`');
    expect(skill).toContain('Next: fix the listed items, then rerun /tdk-project-bootstrap');
  });

  it('keeps AGENTS.md a project description with a Claude Code bridge', () => {
    expect(agentsContract).toContain('Create only when');
    expect(agentsContract).toContain('150 lines');
    expect(agentsContract).toContain('@AGENTS.md');
    expect(agentsContract).toContain('Never include a TDK marker block (any `<!-- tdk` comment)');
    expect(skill).not.toMatch(/^<!-- tdk/m);
  });
});
