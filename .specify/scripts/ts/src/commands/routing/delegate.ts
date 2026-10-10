import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { Command } from 'commander';
import {
  checkDelegateRouting,
  diffRoutingProposal,
  DelegateRoutingError,
  parseDelegateRouting,
  registerRoutingProposal,
  resolveDelegateRoutingPath,
  routingApprovalDigest,
  verifyRoutingProposal,
  type DelegateRoutingDocument,
} from '../../utils/delegate-routing';
import {
  RoutingProposalError,
  validateRoutingProposal,
} from '../../utils/delegate-routing-proposal';
import { formatAgentJson, writeAgentJson, writeStderrLine } from '../../utils/agent-output';

type ProjectRootOptions = { projectRoot?: string };
type ProposalOptions = ProjectRootOptions & { proposal?: string };
type WriteOptions = ProposalOptions & { yes?: boolean; approval?: string };

const LEGACY_ROUTING_WARNING =
  'Legacy routing file detected; rename to delegate-routing.md and migrate @agent syntax';

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
  if (error instanceof DelegateRoutingError || error instanceof RoutingProposalError) {
    writeFailedPayload({ status: 'error', errors: [error.message] });
  }
  throw error;
}

function missingFileHint(routingFile: string): string {
  return `Routing file not found at ${routingFile}. Copy .specify/templates/plan/delegate-routing-template.tpl to that path, then rerun diff.`;
}

// Shared warning assembly for diff/register/verify: route-file + proposal + operation-specific.
function collectWarnings(
  document: DelegateRoutingDocument,
  proposalWarnings: string[],
  operationWarnings: string[] = [],
): string[] {
  return [...checkDelegateRouting(document).warnings, ...proposalWarnings, ...operationWarnings];
}

function readProposal(path: string | undefined) {
  if (!path) fail('Need --proposal <path>');
  const proposalPath = resolve(path);
  if (!existsSync(proposalPath)) fail(`Proposal not found: ${proposalPath}`);
  try {
    const { proposal, warnings } = validateRoutingProposal(
      JSON.parse(readFileSync(proposalPath, 'utf-8')),
    );
    return { proposalPath, proposal, warnings };
  } catch (error) {
    if (error instanceof RoutingProposalError) fail(error.message);
    if (error instanceof SyntaxError) fail(`Invalid proposal JSON: ${error.message}`);
    throw error;
  }
}

function readRoutingFile(projectRoot: string): { routingFile: string; markdown?: string; bytes?: Buffer } {
  const routingFile = resolveDelegateRoutingPath(projectRoot);
  if (!existsSync(routingFile)) return { routingFile };
  const bytes = readFileSync(routingFile);
  return { routingFile, markdown: bytes.toString('utf-8'), bytes };
}

export function createDelegateRoutingCommand(): Command {
  const command = new Command('delegate')
    .description('Manage {docs.path}/custom-workflow/delegate-routing.md');

  command
    .command('diff')
    .description('Compare a routing proposal with the current route file')
    .option('--project-root <root>', 'project root', process.cwd())
    .requiredOption('--proposal <path>', 'delegate-routing-proposal.json path')
    .action((opts: ProposalOptions) => {
      try {
        const projectRoot = projectRootFrom(opts);
        const { proposalPath, proposal, warnings: proposalWarnings } = readProposal(opts.proposal);
        const { routingFile, markdown, bytes } = readRoutingFile(projectRoot);
        const document = parseDelegateRouting(markdown ?? '');
        const diff = diffRoutingProposal(document, proposal);
        // Detection-only legacy-file check: never read or parse it, just flag it.
        const legacyFile = join(dirname(routingFile), 'plan-skill-routing.md');
        const warnings = [
          ...(markdown === undefined
            ? [missingFileHint(routingFile), ...(existsSync(legacyFile) ? [LEGACY_ROUTING_WARNING] : [])]
            : []),
          ...collectWarnings(document, proposalWarnings, diff.warnings),
        ];
        writeAgentJson({
          ok: true,
          status: markdown === undefined ? 'missing' : 'present',
          routingFile,
          proposalPath,
          approvalDigest: routingApprovalDigest(proposal, bytes),
          operations: diff.operations,
          warnings,
        });
      } catch (error) {
        handleActionError(error);
      }
    });

  command
    .command('register')
    .description('Apply a reviewed routing proposal; requires --yes, --approval and an existing route file')
    .option('--project-root <root>', 'project root', process.cwd())
    .requiredOption('--proposal <path>', 'delegate-routing-proposal.json path')
    .option('--yes', 'confirm route file mutation', false)
    .option('--approval <digest>', 'approvalDigest from the reviewed diff')
    .action((opts: WriteOptions) => {
      try {
        const projectRoot = projectRootFrom(opts);
        const { proposalPath, proposal, warnings: proposalWarnings } = readProposal(opts.proposal);
        const { routingFile, markdown, bytes } = readRoutingFile(projectRoot);
        if (!opts.yes) {
          writeFailedPayload({ status: 'confirmation_required', routingFile, proposalPath });
        }
        if (!opts.approval) {
          writeFailedPayload({ status: 'approval_required', routingFile, proposalPath });
        }
        if (opts.approval !== routingApprovalDigest(proposal, bytes)) {
          writeFailedPayload({
            status: 'stale_approval',
            routingFile,
            proposalPath,
            errors: ['Proposal or route file changed since diff; rerun diff and review.'],
          });
        }
        if (markdown === undefined) {
          writeFailedPayload({
            status: 'missing',
            routingFile,
            proposalPath,
            errors: [missingFileHint(routingFile)],
          });
        }
        const document = parseDelegateRouting(markdown);
        const result = registerRoutingProposal(markdown, proposal);
        if (result.changed) writeFileSync(routingFile, result.markdown, 'utf-8');
        writeAgentJson({
          ok: true,
          status: result.changed ? 'registered' : 'noop',
          routingFile,
          proposalPath,
          operations: result.operations,
          warnings: collectWarnings(document, proposalWarnings),
        });
      } catch (error) {
        handleActionError(error);
      }
    });

  command
    .command('verify')
    .description('Verify that a proposal is already reflected in the route file')
    .option('--project-root <root>', 'project root', process.cwd())
    .requiredOption('--proposal <path>', 'delegate-routing-proposal.json path')
    .action((opts: ProposalOptions) => {
      try {
        const projectRoot = projectRootFrom(opts);
        const { proposalPath, proposal, warnings: proposalWarnings } = readProposal(opts.proposal);
        const { routingFile, markdown } = readRoutingFile(projectRoot);
        if (markdown === undefined) {
          writeFailedPayload({ status: 'missing', scope: 'route-equality', routingFile, proposalPath });
        }
        const document = parseDelegateRouting(markdown);
        const result = verifyRoutingProposal(document, proposal);
        const payload = {
          status: result.verified ? 'verified' : 'mismatch',
          scope: 'route-equality',
          routingFile,
          proposalPath,
          operations: result.operations,
          warnings: collectWarnings(document, proposalWarnings, result.warnings),
        };
        if (!result.verified) writeFailedPayload(payload);
        writeAgentJson({ ok: true, ...payload });
      } catch (error) {
        handleActionError(error);
      }
    });

  return command;
}

if (import.meta.main) {
  createDelegateRoutingCommand().parse();
}
