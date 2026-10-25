import { parseOsvScan } from "./osv-scan-model";
import { escapeAnnotation } from "./osv-issue-sync-body";
import { GithubIssueClient, loadSyncConfig, parseExistingIssues, type GithubFetch } from "./osv-issue-sync-github-client";
import { planIssueActions, type ExistingIssue, type IssueAction, type IssueSyncContext } from "./osv-issue-sync-planner";
import type { SyncEnvironment } from "./osv-issue-sync-input";
export { planIssueActions } from "./osv-issue-sync-planner";
export type { ExistingIssue, IssueAction, IssueSyncContext } from "./osv-issue-sync-planner";

interface SyncArgs { scan: string; scanRoot: string; existing?: string; dryRun: boolean; fixtureMode: boolean }
const usage = "Usage: bun osv-issue-sync.ts --scan scan.json [--scan-root dir] [--fixture-mode] [--dry-run [--existing issues.json]]";

export function parseIssueSyncArgs(argv: string[]): SyncArgs {
  const options: SyncArgs = { scan: "", scanRoot: process.cwd(), dryRun: false, fixtureMode: false };
  const seen = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (seen.has(flag)) throw new Error(`Repeated sync argument. ${usage}`);
    seen.add(flag);
    if (flag === "--dry-run") options.dryRun = true;
    else if (flag === "--fixture-mode") options.fixtureMode = true;
    else if (["--scan", "--scan-root", "--existing"].includes(flag)) {
      const value = argv[++i];
      if (!value || value.startsWith("--")) throw new Error(`Missing sync argument value. ${usage}`);
      if (flag === "--scan") options.scan = value;
      else if (flag === "--scan-root") options.scanRoot = value;
      else options.existing = value;
    } else throw new Error(`Unknown sync argument. ${usage}`);
  }
  if (!options.scan || (options.existing && !options.dryRun)) throw new Error(usage);
  return options;
}

async function readJson(path: string, label: string): Promise<unknown> {
  try { return await Bun.file(path).json(); }
  catch { throw new Error(`Cannot read ${label} JSON; check the input file and JSON syntax.`); }
}

function runContext(env: SyncEnvironment, fixtureMode: boolean): IssueSyncContext {
  const server = (env.GITHUB_SERVER_URL || "https://github.com").replace(/\/+$/, "");
  const runUrl = env.RUN_URL || (env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID
    ? `${server}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}` : "");
  return { runUrl, scannedAt: new Date().toISOString(), fixtureMode };
}

async function applyActions(client: GithubIssueClient, actions: IssueAction[], existing: ExistingIssue[]): Promise<void> {
  for (const action of actions) {
    if (action.kind === "noop") continue;
    if (action.kind === "create") {
      const created = await client.createIssue({ title: action.title, body: action.body, labels: action.labels });
      await client.addToProjectWithStatus(created.nodeId);
    } else if (action.kind === "mark-not-detected") {
      const issue = existing.find((candidate) => candidate.number === action.issue);
      if (!issue) throw new Error("Cannot mark an issue absent from the validated security issue list");
      await client.addComment(action.issue, action.comment);
      await client.updateIssue(action.issue, { labels: [...new Set([...issue.labels, "no-longer-detected"])] });
    } else {
      await client.updateIssue(action.issue, { title: action.title, body: action.body, labels: action.labels,
        ...(action.kind === "reopen" ? { state: "open" as const } : {}) });
      if (action.comment) await client.addComment(action.issue, action.comment);
    }
  }
}

export async function runIssueSync(
  argv: string[], env: SyncEnvironment = process.env, fetcher: GithubFetch = fetch,
): Promise<IssueAction[]> {
  const options = parseIssueSyncArgs(argv);
  const config = options.dryRun ? undefined : loadSyncConfig(env);
  const findings = parseOsvScan(await readJson(options.scan, "scan"), options.scanRoot);
  const ctx = runContext(env, options.fixtureMode);
  if (options.dryRun) {
    const existing = options.existing ? parseExistingIssues(await readJson(options.existing, "existing issues")) : [];
    const actions = planIssueActions(findings, existing, ctx);
    console.log(JSON.stringify(actions, null, 2));
    return actions;
  }
  const client = new GithubIssueClient(config!, fetcher);
  await client.validateToken();
  const existing = await client.listSecurityIssues();
  const actions = planIssueActions(findings, existing, ctx);
  await applyActions(client, actions, existing);
  console.log(`OSV issue sync completed: ${actions.length} planned actions.`);
  return actions;
}

if (import.meta.main) {
  try { await runIssueSync(Bun.argv.slice(2)); }
  catch (error) {
    let message = error instanceof Error ? error.message : "OSV issue sync failed";
    for (const token of [process.env.GH_TOKEN, process.env.GH_TOKEN?.trim()]) {
      if (token) message = message.replaceAll(token, "[redacted]");
    }
    console.error(`::error::${escapeAnnotation(message)}`);
    process.exitCode = 1;
  }
}
