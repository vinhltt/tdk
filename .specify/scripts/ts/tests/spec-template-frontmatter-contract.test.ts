import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const TEMPLATE_PATH = resolve(
  import.meta.dir,
  '../../../templates/spec-template.md.tpl',
);
const SKILL_PATH = resolve(
  import.meta.dir,
  '../../../plugins/tdk-core/skills/tdk-specify/SKILL.md',
);
const INPUT_ROUTING_REF_PATH = resolve(
  import.meta.dir,
  '../../../plugins/tdk-core/skills/tdk-specify/references/input-routing-and-mode-workflow.md',
);
const GENERATION_REF_PATH = resolve(
  import.meta.dir,
  '../../../plugins/tdk-core/skills/tdk-specify/references/spec-generation-and-validation-workflow.md',
);

function read(path: string): string {
  return readFileSync(path, 'utf-8');
}

describe('spec-template YAML frontmatter migration contract', () => {
  const template = read(TEMPLATE_PATH);
  const skill = read(SKILL_PATH);
  const inputRoutingRef = read(INPUT_ROUTING_REF_PATH);
  const generationRef = read(GENERATION_REF_PATH);
  const contract = `${skill}\n${inputRoutingRef}\n${generationRef}`;

  describe('Template structure', () => {
    it('begins with YAML frontmatter block', () => {
      expect(template).toMatch(/^---\n/);
      expect(template).toContain('---\n# Feature Specification');
    });

    it('contains all required frontmatter keys', () => {
      expect(template).toContain('title:');
      expect(template).toContain('status:');
      expect(template).toContain('feature_branch:');
      expect(template).toContain('milestone_branch:');
      expect(template).toContain('created:');
      expect(template).toContain('input:');
      expect(template).toContain('memory_context_loaded:');
      expect(template).toContain('schema_version:');
    });

    it('includes schema_version: 1', () => {
      expect(template).toContain('schema_version: 1');
    });

    it('contains the H1 title', () => {
      expect(template).toContain('# Feature Specification:');
    });

    it('removes bold-header metadata lines', () => {
      expect(template).not.toContain('**Feature Branch**');
      expect(template).not.toContain('**Created**');
      expect(template).not.toContain('**Status**');
      expect(template).not.toContain('**Input**');
      expect(template).not.toContain('**Memory context loaded**');
    });
  });

  describe('Skill instruction on frontmatter emission', () => {
    it('instructs agent to emit schema_version in frontmatter', () => {
      expect(contract).toContain('schema_version: 1');
    });

    it('instructs agent to set memory_context_loaded based on memory validation', () => {
      expect(contract).toContain('memory_context_loaded');
      expect(contract).toContain('Step 0.memory');
      expect(contract).toContain('true');
      expect(contract).toContain('false');
    });

    it('removes stale unconditional memory_context_loaded: false bullet', () => {
      expect(contract).not.toContain(
        'Note in `spec.md` frontmatter: `memory_context_loaded: false`',
      );
    });

    it('describes frontmatter emission in Step 2 specification section', () => {
      expect(contract).toContain(
        'Emit the YAML frontmatter block at the top with `title`, `status`, `feature_branch`, `milestone_branch`, `created`, `input`, `memory_context_loaded`',
      );
      expect(contract).toContain('schema_version: 1');
    });

    it('instructs agent to record the root branch without switching branches', () => {
      expect(contract).toContain('milestone_branch');
      expect(contract).toContain('git -C "$PROJECT_DIR" branch --show-current');
    });

    it('confirms milestone_branch on polyrepo projects and skips it on single-repo', () => {
      expect(contract).toContain('AskUserQuestion');
      expect(contract).toContain('PROJECT_CONTEXT.subWorkspaces` is non-empty');
      expect(contract).toContain('empty or absent');
    });

    it('separates the branch created FOR a task from the branch created FROM', () => {
      // Base refs are per-repository and settled at implement time, never in spec.md.
      expect(template).toContain('branch created FOR this task');
      expect(template).toContain('NOT the branch it is created FROM');
      expect(template).toContain('milestone/epic branch this task belongs to');
    });
  });
});
