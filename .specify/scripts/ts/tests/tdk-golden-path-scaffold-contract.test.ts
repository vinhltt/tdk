import { describe, expect, it } from 'bun:test';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SCAFFOLD_SKILLS_DIR = resolve(import.meta.dir, '../../../plugins/tdk-scaffold/skills');
const CORE_SKILLS_DIR = resolve(import.meta.dir, '../../../plugins/tdk-core/skills');
const UTILS_SKILLS_DIR = resolve(import.meta.dir, '../../../plugins/tdk-utils/skills');
const DOCS_DIR = resolve(import.meta.dir, '../../../docs/en/guides');
const MANIFEST_PATH = resolve(import.meta.dir, '../../../plugins/manifest.json');
const SCAFFOLD_INTERFACE_PATH = resolve(import.meta.dir, '../../../plugins/tdk-scaffold/.claude-plugin/interface.json');
const CODEX_SCAFFOLD_PLUGIN_PATH = resolve(import.meta.dir, '../../../codex-plugins/tdk-scaffold/.codex-plugin/plugin.json');
const README_PATH = resolve(import.meta.dir, '../../../../README.md');

const SKILL_NAME = 'tdk-golden-path-scaffold';

const REQUIRED_REFERENCES = [
  'references/golden-path-output-contract.md',
  'references/golden-path-recipe-schema.md',
  'references/workflow-dry-run.md',
  'references/workflow-apply.md',
  'references/safety-gates.md',
];

const REQUIRED_TEMPLATES = [
  'templates/golden-path-scaffold-plan.md.tpl',
  'templates/golden-path-recipe.json.tpl',
  'templates/generated-files-report.md.tpl',
  'templates/golden-path-notes.md.tpl',
  'templates/project-structure.md.tpl',
];

const REQUIRED_OUTPUT_PATHS = [
  '.specify/configurations/golden-path/golden-path-scaffold-plan.md',
  '.specify/configurations/golden-path/golden-path-recipe.json',
  '.specify/configurations/golden-path/generated-files-report.md',
];

const ALLOWED_ACTIONS = ['mkdir', 'touch-gitkeep', 'write-specify-doc', 'write-config-template'];

const FORBIDDEN_PROMISES = [
  'install dependencies',
  'run package manager',
  'write package.json',
  'create migration',
  'write migration',
  'create endpoint',
  'generate endpoint',
  'create ui component',
  'generate ui component',
  'create domain model',
  'generate domain model',
  'executes shell commands',
  'runs shell commands',
  'writes .env',
];

function skillDir(): string {
  return resolve(SCAFFOLD_SKILLS_DIR, SKILL_NAME);
}

function read(path: string): string {
  return readFileSync(path, 'utf-8');
}

function walkFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walkFiles(path) : [path];
  });
}

describe('TDK golden-path scaffold contracts', () => {
  const goldenPathDir = skillDir();
  const skillPath = join(goldenPathDir, 'SKILL.md');
  const skill = existsSync(skillPath) ? read(skillPath) : '';

  it('registers golden-path scaffold as a TDK scaffold skill', () => {
    expect(existsSync(skillPath)).toBe(true);
    expect(skill).toContain('name: tdk-golden-path-scaffold');
    expect(skill).toContain('[topology|file] [--dry-run|--yes] [--preset <name>]');
    expect(skill).toContain('category: scaffold');
    expect(skill).toContain('  version: "1.2.0"');
    expect(existsSync(join(CORE_SKILLS_DIR, SKILL_NAME, 'SKILL.md'))).toBe(false);
    expect(existsSync(join(UTILS_SKILLS_DIR, SKILL_NAME, 'SKILL.md'))).toBe(false);
  });

  it('uses progressive disclosure through required references and templates', () => {
    expect(skill).toContain('Load shared references before writing');
    expect(skill).toContain('Load exactly one workflow reference');

    for (const reference of REQUIRED_REFERENCES) {
      expect(existsSync(join(goldenPathDir, reference))).toBe(true);
      expect(skill).toContain(reference);
    }

    for (const template of REQUIRED_TEMPLATES) {
      expect(existsSync(join(goldenPathDir, template))).toBe(true);
      expect(skill).toContain(template);
    }
  });

  it('keeps dry-run output under the golden-path configuration directory', () => {
    const outputContract = read(join(goldenPathDir, 'references/golden-path-output-contract.md'));
    const planTemplate = read(join(goldenPathDir, 'templates/golden-path-scaffold-plan.md.tpl'));
    const recipeTemplate = read(join(goldenPathDir, 'templates/golden-path-recipe.json.tpl'));
    const reportTemplate = read(join(goldenPathDir, 'templates/generated-files-report.md.tpl'));

    expect(skill).toContain('dry-run is the default');
    expect(outputContract).toContain('Dry-run writes review artifacts only');

    for (const outputPath of REQUIRED_OUTPUT_PATHS) {
      expect(outputContract).toContain(outputPath);
    }

    expect(planTemplate).toContain('status: draft');
    expect(recipeTemplate).toContain('"status": "draft"');
    expect(reportTemplate).toContain('## Created');
    expect(reportTemplate).toContain('## Skipped');
    expect(reportTemplate).toContain('## Existing');
    expect(reportTemplate).toContain('## Refused');
  });

  it('defines a tiny approved recipe action set and guarded apply mode', () => {
    const recipeSchema = read(join(goldenPathDir, 'references/golden-path-recipe-schema.md'));
    const applyWorkflow = read(join(goldenPathDir, 'references/workflow-apply.md'));
    const safetyGates = read(join(goldenPathDir, 'references/safety-gates.md'));
    const recipeTemplate = read(join(goldenPathDir, 'templates/golden-path-recipe.json.tpl'));

    for (const action of ALLOWED_ACTIONS) {
      expect(recipeSchema).toContain(action);
    }

    expect(applyWorkflow).toContain('`--yes` requires `golden-path-recipe.json` with `status: approved`');
    expect(applyWorkflow).toContain('Existing non-empty directories are skipped');
    expect(recipeSchema).toContain('Unknown actions fail closed');
    expect(safetyGates).toContain('Reject absolute paths');
    expect(safetyGates).toContain('Reject `..` path traversal');
    expect(safetyGates).toContain('Reject symlink escapes');
    expect(safetyGates).toContain('Reject secret-like file names');

    for (const template of ['golden-path-notes', 'project-structure']) {
      expect(recipeTemplate).toContain(`"template": "${template}"`);
      expect(recipeSchema).toContain(template);
      expect(existsSync(join(goldenPathDir, 'templates', `${template}.md.tpl`))).toBe(true);
    }

    expect(recipeSchema).not.toContain('module-notes');
  });

  it('keeps golden-path text free of source-code, dependency, and shell promises', () => {
    const combined = walkFiles(goldenPathDir)
      .filter((path) => path.endsWith('.md') || path.endsWith('.tpl'))
      .map((path) => read(path).toLowerCase())
      .join('\n');

    for (const forbidden of FORBIDDEN_PROMISES) {
      expect(combined).not.toContain(forbidden);
    }

    expect(combined).toContain('does not generate fake business code');
    expect(combined).toContain('does not mutate `.specify/.specify.json`');
    expect(combined).toContain('does not run shell commands');
    expect(combined).toContain('does not install package dependencies');
  });

  it('preserves existing recommendation scaffold scope', () => {
    const recommendationSkill = read(join(SCAFFOLD_SKILLS_DIR, 'tdk-scaffold-from-recommendation/SKILL.md'));

    expect(recommendationSkill).toContain('recommendation-<project>.md');
    expect(recommendationSkill).toContain('Scaffold skills');
    expect(recommendationSkill).toContain('Scaffold agents');
    expect(recommendationSkill).not.toContain('golden-path-recipe.json');
    expect(recommendationSkill).not.toContain('workspace-topology.json');
  });

  it('registers golden-path scaffold docs and manifest entries', () => {
    const manifest = read(MANIFEST_PATH);
    const readme = read(README_PATH);
    const commandReference = read(join(DOCS_DIR, 'command-reference.md'));
    const documentFlow = read(join(DOCS_DIR, 'document-flow.md'));
    const sourceInterface = read(SCAFFOLD_INTERFACE_PATH);
    const codexPlugin = read(CODEX_SCAFFOLD_PLUGIN_PATH);

    expect(manifest).toContain('"tdk-golden-path-scaffold"');
    expect(readme).toContain('/tdk-golden-path-scaffold');
    expect(readme).toContain('tdk-scaffold/        # Skill/agent and golden-path scaffolding (3 skills)');
    expect(commandReference).toContain('/tdk-golden-path-scaffold [topology|file] [--dry-run|--yes] [--preset <name>]');
    expect(commandReference).toContain('golden-path-recipe.json');
    expect(documentFlow).toContain('/tdk-golden-path-scaffold');
    expect(documentFlow).toContain('golden-path-scaffold-plan.md');
    expect(sourceInterface).toContain('golden-path');
    expect(sourceInterface).toContain('skeleton');
    expect(codexPlugin).toContain('golden-path');
    expect(codexPlugin).toContain('skeleton');
  });
});
