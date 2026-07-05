import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Command } from 'commander';
import {
  checkPlanSkillRouting,
  diffRoutingProposal,
  formatPlanSkillRouting,
  optimizePlanSkillRouting,
  parsePlanSkillRouting,
  PlanSkillRoutingError,
  readPlanSkillRoutingTemplate,
  registerRoutingProposal,
  resolvePlanSkillRoutingPath,
  verifyRoutingProposal,
} from '../../utils/plan-skill-routing';
import {
  RoutingProposalError,
  validateRoutingProposal,
} from '../../utils/plan-skill-routing-proposal';
import { formatAgentJson, writeAgentJson, writeStderrLine } from '../../utils/agent-output';

type ProjectRootOptions = { projectRoot?: string };
type ProposalOptions = ProjectRootOptions & { proposal?: string };
type WriteOptions = ProposalOptions & { yes?: boolean };
type OptimizeOptions = ProjectRootOptions & { yes?: boolean; dryRun?: boolean };

function projectRootFrom(options: ProjectRootOptions): string {
  return resolve(options.projectRoot ?? process.cwd());
}

function fail(message: string): never {
  writeStderrLine(`Error: ${message}`);
  process.exit(1);
}

function writeFailedPayload(payload: Record<string, unknown>): never {
  process.stdout.write(formatAgentJson({ ok: false, ...payload }));
  process.exit(1);
}

function handleActionError(error: unknown): never {
  if (error instanceof PlanSkillRoutingError || error instanceof RoutingProposalError) {
    writeFailedPayload({ status: 'error', errors: [error.message] });
  }
  throw error;
}

function readProposal(path: string | undefined) {
  if (!path) fail('Need --proposal <path>');
  const proposalPath = resolve(path);
  if (!existsSync(proposalPath)) fail(`Proposal not found: ${proposalPath}`);
  try {
    return {
      proposalPath,
      proposal: validateRoutingProposal(JSON.parse(readFileSync(proposalPath, 'utf-8'))),
    };
  } catch (error) {
    if (error instanceof RoutingProposalError) fail(error.message);
    if (error instanceof SyntaxError) fail(`Invalid proposal JSON: ${error.message}`);
    throw error;
  }
}

function readRoutingFile(projectRoot: string): { routingFile: string; markdown?: string } {
  const routingFile = resolvePlanSkillRoutingPath(projectRoot);
  if (!existsSync(routingFile)) return { routingFile };
  return { routingFile, markdown: readFileSync(routingFile, 'utf-8') };
}

export function createPlanSkillRoutingCommand(): Command {
  const command = new Command('plan-skill')
    .description('Manage {docs.path}/custom-workflow/plan-skill-routing.md');

  command
    .command('init')
    .description('Create the first plan-skill-routing.md from the template')
    .option('--project-root <root>', 'project root', process.cwd())
    .action((opts: ProjectRootOptions) => {
      try {
        const projectRoot = projectRootFrom(opts);
        const routingFile = resolvePlanSkillRoutingPath(projectRoot);
        if (existsSync(routingFile)) {
          writeFailedPayload({ status: 'exists', routingFile });
        }
        mkdirSync(dirname(routingFile), { recursive: true });
        const template = readPlanSkillRoutingTemplate(projectRoot);
        writeFileSync(routingFile, template, 'utf-8');
        writeAgentJson({ ok: true, status: 'created', routingFile });
      } catch (error) {
        handleActionError(error);
      }
    });

  command
    .command('inspect')
    .description('Read routing sections and active routes')
    .option('--project-root <root>', 'project root', process.cwd())
    .action((opts: ProjectRootOptions) => {
      try {
        const projectRoot = projectRootFrom(opts);
        const { routingFile, markdown } = readRoutingFile(projectRoot);
        if (markdown === undefined) {
          writeAgentJson({ ok: true, status: 'missing', routingFile, sections: [], routes: [] });
          return;
        }
        const document = parsePlanSkillRouting(markdown);
        const check = checkPlanSkillRouting(document);
        writeAgentJson({
          ok: true,
          status: 'present',
          routingFile,
          sections: document.sections.map((section) => section.name),
          routes: document.routes.map((route) => ({
            section: route.section,
            domain: route.domain,
            skills: route.skills,
          })),
          warnings: check.warnings,
          errors: check.errors,
        });
      } catch (error) {
        handleActionError(error);
      }
    });

  command
    .command('check')
    .description('Validate duplicate and conflict policy without writing')
    .option('--project-root <root>', 'project root', process.cwd())
    .action((opts: ProjectRootOptions) => {
      try {
        const projectRoot = projectRootFrom(opts);
        const { routingFile, markdown } = readRoutingFile(projectRoot);
        if (markdown === undefined) {
          writeFailedPayload({ status: 'missing', routingFile, errors: ['routing file is missing'] });
        }
        const document = parsePlanSkillRouting(markdown);
        const check = checkPlanSkillRouting(document);
        const payload = {
          status: check.errors.length > 0 ? 'invalid' : 'valid',
          routingFile,
          warnings: check.warnings,
          errors: check.errors,
        };
        if (check.errors.length > 0) writeFailedPayload(payload);
        writeAgentJson({ ok: true, ...payload });
      } catch (error) {
        handleActionError(error);
      }
    });

  command
    .command('diff')
    .description('Compare a routing proposal with the current route file')
    .option('--project-root <root>', 'project root', process.cwd())
    .requiredOption('--proposal <path>', 'plan-skill-routing-proposal.json path')
    .action((opts: ProposalOptions) => {
      try {
        const projectRoot = projectRootFrom(opts);
        const { proposalPath, proposal } = readProposal(opts.proposal);
        const { routingFile, markdown } = readRoutingFile(projectRoot);
        const document = parsePlanSkillRouting(markdown ?? '');
        const diff = diffRoutingProposal(document, proposal);
        writeAgentJson({
          ok: true,
          status: markdown === undefined ? 'missing' : 'present',
          routingFile,
          proposalPath,
          operations: diff.operations,
          warnings: markdown === undefined
            ? ['routing file is missing; run init before register', ...diff.warnings]
            : diff.warnings,
        });
      } catch (error) {
        handleActionError(error);
      }
    });

  command
    .command('register')
    .description('Apply a routing proposal; requires --yes and an existing route file')
    .option('--project-root <root>', 'project root', process.cwd())
    .requiredOption('--proposal <path>', 'plan-skill-routing-proposal.json path')
    .option('--yes', 'confirm route file mutation', false)
    .action((opts: WriteOptions) => {
      try {
        const projectRoot = projectRootFrom(opts);
        const { proposalPath, proposal } = readProposal(opts.proposal);
        const { routingFile, markdown } = readRoutingFile(projectRoot);
        if (!opts.yes) {
          writeFailedPayload({ status: 'confirmation_required', routingFile, proposalPath });
        }
        if (markdown === undefined) {
          writeFailedPayload({
            status: 'missing',
            routingFile,
            proposalPath,
            errors: ['run init before register'],
          });
        }
        const result = registerRoutingProposal(markdown, proposal);
        if (result.changed) writeFileSync(routingFile, result.markdown, 'utf-8');
        writeAgentJson({
          ok: true,
          status: result.changed ? 'registered' : 'noop',
          routingFile,
          proposalPath,
          operations: result.operations,
          warnings: result.warnings,
        });
      } catch (error) {
        handleActionError(error);
      }
    });

  command
    .command('verify')
    .description('Verify that a proposal is already reflected in the route file')
    .option('--project-root <root>', 'project root', process.cwd())
    .requiredOption('--proposal <path>', 'plan-skill-routing-proposal.json path')
    .action((opts: ProposalOptions) => {
      try {
        const projectRoot = projectRootFrom(opts);
        const { proposalPath, proposal } = readProposal(opts.proposal);
        const { routingFile, markdown } = readRoutingFile(projectRoot);
        if (markdown === undefined) {
          writeFailedPayload({ status: 'missing', routingFile, proposalPath });
        }
        const result = verifyRoutingProposal(parsePlanSkillRouting(markdown), proposal);
        const payload = {
          status: result.verified ? 'verified' : 'mismatch',
          routingFile,
          proposalPath,
          operations: result.operations,
          warnings: result.warnings,
        };
        if (!result.verified) writeFailedPayload(payload);
        writeAgentJson({ ok: true, ...payload });
      } catch (error) {
        handleActionError(error);
      }
    });

  command
    .command('optimize')
    .description('Dedupe repeated route lines; dry-run by default, write with --yes')
    .option('--project-root <root>', 'project root', process.cwd())
    .option('--dry-run', 'preview only', false)
    .option('--yes', 'write safe cleanup changes', false)
    .action((opts: OptimizeOptions) => {
      try {
        const projectRoot = projectRootFrom(opts);
        const { routingFile, markdown } = readRoutingFile(projectRoot);
        if (markdown === undefined) {
          writeFailedPayload({ status: 'missing', routingFile });
        }
        const result = optimizePlanSkillRouting(markdown);
        const dryRun = !opts.yes || !!opts.dryRun;
        if (!dryRun && result.changed) writeFileSync(routingFile, result.markdown, 'utf-8');
        writeAgentJson({
          ok: true,
          status: result.changed ? 'optimized' : 'noop',
          routingFile,
          dryRun,
          operations: result.operations,
          warnings: result.warnings,
        });
      } catch (error) {
        handleActionError(error);
      }
    });

  return command;
}

if (import.meta.main) {
  createPlanSkillRoutingCommand().parse();
}
