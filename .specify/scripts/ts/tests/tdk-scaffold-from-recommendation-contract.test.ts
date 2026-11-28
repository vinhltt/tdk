import { describe, expect, it } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SCAFFOLD_SKILLS_DIR = resolve(import.meta.dir, '../../../plugins/tdk-scaffold/skills');
const SKILL_PATH = join(SCAFFOLD_SKILLS_DIR, 'tdk-scaffold-from-recommendation/SKILL.md');
const ROUTING_SKILL_PATH = join(SCAFFOLD_SKILLS_DIR, 'tdk-delegate-routing/SKILL.md');
const ROUTING_REFERENCE_DIR = join(SCAFFOLD_SKILLS_DIR, 'tdk-delegate-routing/references');
const PROPOSAL_FORMAT_PATH = join(
  SCAFFOLD_SKILLS_DIR,
  'tdk-scaffold-from-recommendation/references/delegate-routing-proposal-format.md',
);
const REVIEW_REGISTER_PATH = join(ROUTING_REFERENCE_DIR, 'workflow-review-register.md');
const RECOMMEND_SKILL_PATH = join(SCAFFOLD_SKILLS_DIR, 'tdk-sub-workspace-automation-recommend/SKILL.md');
const ROUTE_TEMPLATE_PATH = resolve(import.meta.dir, '../../../templates/plan/delegate-routing-template.tpl');
const SKILLS_GUIDE_PATH = resolve(import.meta.dir, '../../../../.specify/docs/en/guides/skills-guide.md');
const NEW_RECOMMENDATION_PATH =
  '.specify/configurations/automation-recommendations/sub-workspaces/*/automation-recommendation.md';

function read(path: string): string {
  return readFileSync(path, 'utf-8');
}

describe('TDK scaffold-from-recommendation contracts', () => {
  const skill = existsSync(SKILL_PATH) ? read(SKILL_PATH) : '';

  it('prefers new per-sub-workspace recommendation output while keeping old fallback paths', () => {
    expect(existsSync(SKILL_PATH)).toBe(true);
    expect(skill).toContain(NEW_RECOMMENDATION_PATH);
    expect(skill).toContain('.specify/reports/recommendation-*.md');
    expect(skill).toContain('.specify/configurations/automation-recommendations/recommendation-*.md');
  });

  it('parses sub-workspace recommendation frontmatter when present', () => {
    for (const field of [
      'sub_workspace',
      'sub_workspace_path',
      'source_docs_path',
      'dependency_policy',
      'official_docs_read',
      'skill_search_queries',
    ]) {
      expect(skill).toContain(field);
    }
  });

  it('keeps recommendation approval as a human gate before scaffold writes', () => {
    expect(skill).toContain('status: approved');
    expect(skill).toContain('reviewed recommendations');
    expect(skill).toContain('Scaffold skills');
    expect(skill).toContain('Scaffold agents');
  });

  it('emits routing proposals beside approved recommendations without direct route mutation', () => {
    expect(skill).toContain('## Routing Suggestions');
    expect(skill).toContain('delegate-routing-proposal.json');
    expect(skill).toContain('beside the approved recommendation');
    expect(skill).toContain('Never mutate `delegate-routing.md` directly');
  });

  it('registers the tdk-delegate-routing facade and reference contracts', () => {
    expect(existsSync(ROUTING_SKILL_PATH)).toBe(true);
    const routingSkill = read(ROUTING_SKILL_PATH);
    const skillsGuide = read(SKILLS_GUIDE_PATH);
    for (const action of ['diff', 'register', 'verify']) {
      expect(routingSkill).toContain(`routing delegate ${action}`);
    }
    for (const removed of ['init', 'inspect', 'check', 'optimize']) {
      expect(routingSkill).not.toContain(`routing delegate ${removed}`);
    }
    for (const reference of [
      'delegate-routing-file-contract.md',
      'delegate-routing-proposal-format.md',
      'workflow-review-register.md',
      'update-and-conflict-policy.md',
    ]) {
      expect(existsSync(join(ROUTING_REFERENCE_DIR, reference))).toBe(true);
    }
    expect(existsSync(join(ROUTING_REFERENCE_DIR, 'workflow-init.md'))).toBe(false);
    expect(skillsGuide).toContain('/tdk-delegate-routing');
    expect(skillsGuide).toContain('delegate-routing-proposal.json');
  });
});

describe('TDK review domain scaffold contracts', () => {
  const patterns = join(SCAFFOLD_SKILLS_DIR, 'tdk-scaffold-from-recommendation/references');
  const agentPattern = read(join(patterns, 'agent-output-pattern.md'));
  const skillPattern = read(join(patterns, 'skill-output-pattern.md'));
  const reviewerVariant = agentPattern.slice(agentPattern.indexOf('## Reviewer Variant'));
  const variantExample = reviewerVariant.slice(reviewerVariant.indexOf('```markdown'));
  const shippedReviewer = read(resolve(SCAFFOLD_SKILLS_DIR, '../../tdk-utils/agents/tdk-code-reviewer.md'));
  // A section runs from its heading to the next `## ` heading; a missing heading or a missing end yields ''.
  const section = (text: string, heading: string): string => {
    const start = text.indexOf(`${heading}\n`);
    const end = start < 0 ? -1 : text.indexOf('\n## ', start + 1);
    return end < 0 ? '' : text.slice(start, end);
  };

  it('generates a reviewer that is read-only: no write, shell, or spawn tools and no executor status line', () => {
    expect(reviewerVariant).toContain('tools: Read, Grep, Glob, Skill');
    expect(reviewerVariant).toMatch(/Never grant `Edit`, `Write`, `Bash`/);
    expect(reviewerVariant).toMatch(/no `Status:` executor contract/);
    expect(variantExample).not.toMatch(/^tools:.*\b(Edit|Write|Bash|Task|Agent)\b/m);
    expect(variantExample).not.toContain('Status:');
  });

  it('points the reviewer variant at the shipped reviewer inputs and schema instead of inventing one', () => {
    expect(reviewerVariant).toContain('tdk-utils/agents/tdk-code-reviewer.md');
    for (const input of ['TASK_ID', 'LENSES', 'MATERIAL', 'ONLY_PATHS']) expect(reviewerVariant).toContain(input);
    for (const field of ['lenses', 'requirement_ref', 'evidence', 'notChecked', 'filesReviewed', 'invalid_lens', 'empty_or_malformed_input']) {
      expect(reviewerVariant).toContain(field);
    }
    expect(reviewerVariant).not.toMatch(/\bLENS\b|batch|wave/);
  });

  it('makes a generated reviewer read the change and apply the lenses the way the shipped reviewer does', () => {
    expect(reviewerVariant).toMatch(
      /Copy the `## Reading the change` and `## Lens checklists` sections of `tdk-utils\/agents\/tdk-code-reviewer\.md` verbatim/,
    );
    expect(section(shippedReviewer, '## Reading the change')).toContain('filesReviewed');
    expect(section(shippedReviewer, '## Lens checklists')).toContain('is outside this review');
    // The example must carry both shipped sections byte for byte, so the two cannot drift.
    for (const heading of ['## Reading the change', '## Lens checklists']) {
      const shipped = section(shippedReviewer, heading);
      expect({ heading, empty: shipped === '' }).toEqual({ heading, empty: false });
      expect({ heading, copy: section(variantExample, heading) }).toEqual({ heading, copy: shipped });
    }
  });

  it('declares the full review contract only in the generated example metadata', () => {
    const frontmatterStart = variantExample.indexOf('---\n');
    const frontmatter = variantExample.slice(frontmatterStart, variantExample.indexOf('\n---\n', frontmatterStart + 4));
    expect(frontmatter).toMatch(/^metadata:\n(?: {2}.*\n)* {2}review_contract: full$/m);
    expect(shippedReviewer).not.toContain('review_contract');
  });

  it('states when /tdk-review trusts the declaration and when it falls back to the core reviewer', () => {
    expect(reviewerVariant).toMatch(/reads `review_contract` only with `--specialist`/);
    expect(reviewerVariant).toMatch(/canonical `\.claude\/agents\/<name>\.md`, because the OMP and Codex conversions drop `metadata`/);
    expect(reviewerVariant).toMatch(/output is broken, lacks a spec row, or misses a file, `\/tdk-review` runs `@tdk-code-reviewer`/);
    expect(reviewerVariant).toMatch(/first declared agent of a slice or part in resolver order replaces `@tdk-code-reviewer`/);
    expect(reviewerVariant).toMatch(/does not replace `@tdk-code-reviewer`[^\n]*`"lenses": \["routed"\]`/);
  });

  it('keeps the executor variant for executors only and routes reviewers to their own variant', () => {
    expect(agentPattern).toMatch(/uses the Reviewer Variant below/);
    expect(agentPattern).not.toMatch(/Reviewers, researchers, coordinators[^\n]*keep the pattern above unchanged/);
  });

  it('describes a review lens skill that never writes', () => {
    const lens = skillPattern.slice(skillPattern.indexOf('## Review Lens Skill Shape'), skillPattern.indexOf('## Content Guidelines'));
    expect(lens).toMatch(/never writes/i);
    expect(lens).toContain('Severity guidance');
  });

  it('documents review as an explicit domain that never warns and is never injected, in every routing doc', () => {
    const routing = join(SCAFFOLD_SKILLS_DIR, 'tdk-delegate-routing/references');
    const injection = resolve(import.meta.dir, '../../../plugins/tdk-core/skills/tdk-plan/references/delegate-routing-injection.md');
    for (const path of [join(routing, 'delegate-routing-proposal-format.md'), join(patterns, 'delegate-routing-proposal-format.md')]) {
      expect({ path, ok: /`review`[^\n]*no warning|`review`[^\n]*carries no warning/.test(read(path)) }).toEqual({ path, ok: true });
    }
    expect(read(join(routing, 'delegate-routing-file-contract.md'))).toMatch(/`review` routes are read only by `\/tdk-review`[^\n]*never injected/);
    expect(read(injection)).toMatch(/`review` is an explicit domain[^\n]*never injected into phase delegate sections/);
  });

  it('never derives a review route from keywords', () => {
    expect(read(join(patterns, 'delegate-routing-proposal-format.md'))).toMatch(/emit it only from an approved `review` decision, never from keyword inference/);
  });
});

describe('TDK scaffold routing handoff contracts', () => {
  const skill = existsSync(SKILL_PATH) ? read(SKILL_PATH) : '';
  const proposalFormat = existsSync(PROPOSAL_FORMAT_PATH) ? read(PROPOSAL_FORMAT_PATH) : '';
  const reviewRegister = existsSync(REVIEW_REGISTER_PATH) ? read(REVIEW_REGISTER_PATH) : '';
  const recommendSkill = existsSync(RECOMMEND_SKILL_PATH) ? read(RECOMMEND_SKILL_PATH) : '';

  it('reads every reference the routing handoff depends on', () => {
    for (const path of [SKILL_PATH, PROPOSAL_FORMAT_PATH, REVIEW_REGISTER_PATH, RECOMMEND_SKILL_PATH]) {
      expect(existsSync(path)).toBe(true);
    }
  });

  it('derives routing entries for delegates no suggestion covers', () => {
    expect(skill).toContain('that no suggestion covers');
    expect(skill).toContain('no `## Routing Suggestions` section');
  });

  it('pins every proposal entry to the register operation', () => {
    expect(skill).toContain('operation: "register"');
    expect(proposalFormat).toContain('`add` is rejected once the route already exists');
  });

  it('states all four route-file parse rules across skill and proposal format', () => {
    const routingPrompt = skill + proposalFormat;
    for (const rule of [
      '<!--',
      'no delegate',
      'no special skill',
      'Prefix a skill token with',
      'keep an `@`-prefixed agent token verbatim',
      'case-insensitive',
    ]) {
      expect(routingPrompt).toContain(rule);
    }
  });

  it('states the goal for a missing route file and translates the CLI error', () => {
    expect(skill).toContain('must exist at');
    expect(skill).toContain('delegate-routing-template.tpl');
    expect(skill).toContain('status: "missing"');
  });

  it('prints the diff, register, verify sequence when the route file is present', () => {
    expect(skill).toContain('routing delegate diff');
    expect(skill).toContain('routing delegate verify');
  });

  it('keeps the next step visible in dry-run without writing files', () => {
    expect(skill).toContain('exactly the same next step');
    expect(skill).toContain('Dry run complete. No files written.');
  });

  it('warns instead of aborting when .specify.json is missing', () => {
    expect(skill).toContain('both the present and missing branches');
    expect(skill).toContain('Missing config: <path>');
    expect(skill).toContain('Do not abort the scaffold.');
  });

  it('routes scaffolded agents through the proposal instead of warning they have no destination', () => {
    expect(skill).not.toContain('has no routing destination yet');
    expect(skill).toContain('@<agent-name>');
    expect(skill).toContain('travel the same proposal');
    expect(proposalFormat).toContain('kept verbatim and is never rewritten to `/`');
  });

  it('surfaces reason and derived provenance at the register review gate', () => {
    expect(reviewRegister).toContain('operations, `reason`, and warnings');
    expect(reviewRegister).toContain('`reason` contains `derived` (case-insensitive)');
    expect(reviewRegister).toContain('`from` → `to`');
  });

  it('declares the empty routing-suggestions consequence upstream', () => {
    expect(recommendSkill).toContain('Leaving `## Routing Suggestions` empty is supported');
  });
});

describe('TDK scaffold outcome baseline contracts', () => {
  const skill = existsSync(SKILL_PATH) ? read(SKILL_PATH) : '';
  const recommendSkill = existsSync(RECOMMEND_SKILL_PATH) ? read(RECOMMEND_SKILL_PATH) : '';
  const recordReferencePath = join(SCAFFOLD_SKILLS_DIR, 'tdk-scaffold-from-recommendation/references/scaffold-outcome-record.md');
  const recordReference = existsSync(recordReferencePath) ? read(recordReferencePath) : '';
  const command = 'bun --no-install <loaded-skill-root>/scripts/scaffold-outcome-record.ts';

  it('delegates every sidecar read and write to the skill-local script', () => {
    expect(skill).toContain('references/scaffold-outcome-record.md');
    expect(skill).toContain('only its script reads or writes `scaffold-outcome.json`');
    expect(skill).toContain(`${command} compare --project-root <root> --recommendation <repo-relative>`);
    expect(skill).toContain(`${command} record --project-root <root> --recommendation <repo-relative>`);
    expect(existsSync(join(SCAFFOLD_SKILLS_DIR, 'tdk-scaffold-from-recommendation/scripts/scaffold-outcome-record.ts'))).toBe(true);
  });

  it('records only after an approved run that is not a dry run', () => {
    expect(skill).toContain('Record only for an approved run that is not `--dry-run`');
    expect(skill).toContain('after the proposal write in Routing handoff');
    expect(skill).toContain('the preview also lists the baseline sidecar `scaffold-outcome.json`');
    expect(skill).toContain('baseline: skipped (dry-run)');
    expect(skill).toContain('baseline: not recorded ({error})');
    expect(skill).toContain('Dry run complete. No files written.');
  });

  it('labels artifacts against the baseline and never trusts a missing or foreign one', () => {
    expect(skill).toContain('changed since last scaffold ({recorded_at})');
    expect(skill).toContain('`baseline: not checked ({state}: {reason})`, never unchanged');
    expect(skill).toContain('`since baseline` column');
    expect(skill).toContain('`Apply patch may undo edits made after the last scaffold (hand edit or retro)`');
  });

  it('keeps foreign or invalid sidecars untouched and never stores readiness', () => {
    expect(skill).toContain('`foreign_sidecar` or `invalid_sidecar`');
    expect(skill).toContain('Never overwrite it');
    expect(skill).toContain('never store readiness');
    expect(recordReference).toContain('never stores readiness');
    expect(recordReference).toContain('every `\\r\\n` pair is folded to `\\n` first');
  });

  it('lets the recommender read scaffold outcomes as evidence without hashing', () => {
    expect(recommendSkill).toContain('scaffold-outcome.json');
    expect(recommendSkill).toContain('Read only each row\'s `kind`, `path`, `outcome`, and `recorded_at`: never hash files, compare them, or call the scaffold script');
    expect(recommendSkill).toContain('record the sidecar path and state `present`, `missing`, or `unreadable`');
  });
});

// Unattended runs: each child skill keeps its manual gates and adds one `--auto` clause that
// picks the non-writing branch for every question it cannot answer from approved input.
describe('TDK scaffold unattended auto-mode contracts', () => {
  const skill = existsSync(SKILL_PATH) ? read(SKILL_PATH) : '';
  const routingSkill = existsSync(ROUTING_SKILL_PATH) ? read(ROUTING_SKILL_PATH) : '';
  const routeTemplate = existsSync(ROUTE_TEMPLATE_PATH) ? read(ROUTE_TEMPLATE_PATH) : '';

  function argumentHint(text: string): string {
    return text.match(/^argument-hint: (.*)$/m)?.[1] ?? '';
  }

  it('lets scaffold treat an approved recommendation as run approval before any gate is read', () => {
    expect(argumentHint(skill)).toContain('[--auto]');
    expect(skill).toContain('## Auto mode');
    expect(skill.indexOf('## Auto mode')).toBeLessThan(skill.indexOf('## Resolve Input File'));
    expect(skill).toContain('counts as the step 6 run approval, Record Baseline included');
    expect(skill).toContain('without the step 6 question');
    expect(skill).toContain('only `created` and `reused` rows');
    expect(skill).toContain('non-writing branch');
    expect(skill).toContain('nothing is patched or regenerated');
    expect(skill).toContain('aborts the run');
  });

  it('keeps the manual scaffold approval gates unchanged', () => {
    expect(skill).toContain('ask approval to apply this reconciliation plan even when frontmatter is `status: approved`');
    expect(skill).toContain('`status: approved` alone does not count');
    expect(skill).toContain('If status is not approved, ask `Proceed anyway`');
  });

  it('lets routing register unattended only as additions into a new section', () => {
    expect(argumentHint(routingSkill)).toContain('[--auto]');
    expect(routingSkill).toContain('## Auto mode');
    expect(routingSkill).toContain('never a CLI flag');
    expect(routingSkill).toContain('steps 1–3 without step 4');
    expect(routingSkill).toContain('every `diff` operation is `add`');
    expect(routingSkill).toContain('new routing section');
    for (const refusal of ['`update`', '`noop`', 'a conflict error', '`approval_required`', '`stale_approval`']) {
      expect(routingSkill).toContain(refusal);
    }
    expect(routingSkill).toContain('`references/workflow-review-register.md`');
    expect(routingSkill).toContain('`derived` reasons are reported without blocking');
    expect(routingSkill).toContain('never retried');
  });

  it('ships a route template whose global section has no active delegate', () => {
    expect(existsSync(ROUTE_TEMPLATE_PATH)).toBe(true);
    const globalHeading = routeTemplate.match(/^## global[ \t]*$/m);
    expect(globalHeading).not.toBeNull();
    const afterGlobal = routeTemplate.slice((globalHeading?.index ?? 0) + (globalHeading?.[0].length ?? 0));
    const nextSection = afterGlobal.search(/^(<!-- )?## /m);
    const globalBlock = nextSection === -1 ? afterGlobal : afterGlobal.slice(0, nextSection);
    const activeDelegates = globalBlock
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('<!--'))
      .filter((line) => /^\s*-\s*[\w-]+:\s*.*[/@]/.test(line));
    expect(activeDelegates).toEqual([]);
    expect(globalBlock).toContain('- test: (default - no delegate)');
  });
});

// The bootstrap entry is prompt-only: it orchestrates the child skills and ships no script or reference.
describe('TDK sub-workspace bootstrap entry contracts', () => {
  const bootstrapDir = join(SCAFFOLD_SKILLS_DIR, 'tdk-sub-workspace-bootstrap');
  const bootstrapPath = join(bootstrapDir, 'SKILL.md');
  const bootstrap = existsSync(bootstrapPath) ? read(bootstrapPath) : '';

  it('ships exactly one SKILL.md', () => {
    expect(existsSync(bootstrapDir)).toBe(true);
    expect(readdirSync(bootstrapDir)).toEqual(['SKILL.md']);
  });

  it('is listed in the plugin manifest at its frontmatter version', () => {
    const manifest = JSON.parse(read(resolve(SCAFFOLD_SKILLS_DIR, '../../manifest.json')));
    const entry = manifest.plugins['tdk-scaffold'].components.skills['tdk-sub-workspace-bootstrap'];
    expect(entry).toBeDefined();
    expect(bootstrap).toContain(`version: "${entry.version}"`);
  });

  it('states run consent and the non-writing branch for child questions', () => {
    expect(bootstrap).toContain('name: tdk-sub-workspace-bootstrap');
    expect(bootstrap).toContain('Running this command is the consent to create every missing artifact');
    expect(bootstrap).toContain('take its non-writing branch');
    expect(bootstrap).toContain('Never modify, overwrite, or delete existing bytes');
  });

  it('runs every child skill per sub-workspace in unattended mode and reports for later review', () => {
    for (const token of [
      '--sub-workspace <name>',
      '--auto --no-community-search',
      '/tdk-scaffold-from-recommendation <recommendation-path> --auto',
      'bootstrap-report.md',
      'Needs your review',
      '.omp/',
      'deferred',
      'evidence: thin',
      'Next: review "Needs your review", then /tdk-plan',
    ]) {
      expect(bootstrap).toContain(token);
    }
  });

  it('registers routes unattended with an absolute proposal path and lists them for review', () => {
    expect(bootstrap).toMatch(/\/tdk-delegate-routing register --project-root <root> --proposal <absolute-proposal-path> --auto/);
    expect(bootstrap).toContain('each registered route');
    expect(bootstrap).toContain('kept from an earlier run');
    expect(bootstrap).toContain('created while an earlier proposal or the `## <name>` route section was kept');
    expect(bootstrap).toContain('restored after it was removed since the last scaffold');
  });

  it('reruns scaffold only for planned creates that are neither on disk nor recorded', () => {
    expect(bootstrap).toContain('`Artifacts` tables under `## Executor Decisions`');
    expect(bootstrap).toContain('The tables exist and hold no row with action `create`, `patch`, or `reuse` → record `scaffold: nothing to scaffold`');
    expect(bootstrap).toContain('Without these tables, run it on the first two conditions only.');
    expect(bootstrap).toContain('`kept-unresolved` with each reason');
    expect(bootstrap).toContain('a `create` row\'s source path has neither a file nor a row in that sidecar');
    expect(bootstrap).toContain('never trigger a rerun on their own');
    expect(bootstrap).toContain('its report section\'s scaffold line lists as `kept-unresolved` for conflicting requirements or a runtime-only twin');
    expect(bootstrap).toContain('a sidecar that does not parse or names another recommendation');
    expect(bootstrap).toContain('scaffold recording its own `scaffold-outcome.json` again');
  });

  it('keeps unchanged report sections byte-for-byte across reruns', () => {
    expect(bootstrap).toContain('rewritten only when that sub-workspace\'s outcome changes');
    expect(bootstrap).toContain('keep its section byte-for-byte');
    expect(bootstrap).toContain('Create the report when it does not exist');
  });

  it('never runs docs for all targets at once or community skill lookup', () => {
    expect(bootstrap).not.toContain('/tdk-sub-workspace-docs --all');
    expect(bootstrap).not.toContain('npx');
    expect(bootstrap).not.toContain('skills find');
  });
});
