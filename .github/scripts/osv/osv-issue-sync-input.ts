import type { ExistingIssue } from "./osv-issue-sync-planner";

export const tokenRemediation = "Set GH_TOKEN to the built-in GITHUB_TOKEN (github.token), grant the sync job issues: write, and check repository Actions token-permission policies.";
export interface SyncConfig {
  token: string; repo: string; apiUrl: string;
}
export type SyncEnvironment = Record<string, string | undefined>;

function endpoint(value: string, name: string): string {
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error();
    return url.href.replace(/\/+$/, "");
  } catch { throw new Error(`Invalid ${name}; use an HTTP(S) GitHub endpoint without credentials.`); }
}

export function loadSyncConfig(env: SyncEnvironment): SyncConfig {
  const token = env.GH_TOKEN?.trim();
  if (!token || /\s/.test(token)) throw new Error(`Missing or invalid GH_TOKEN. ${tokenRemediation}`);
  const repo = env.GITHUB_REPOSITORY?.trim();
  if (!repo || !/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/.test(repo) || [".", ".."].includes(repo.split("/")[1])) {
    throw new Error(`GITHUB_REPOSITORY must be owner/repo. ${tokenRemediation}`);
  }
  return { token, repo, apiUrl: endpoint(env.GITHUB_API_URL || "https://api.github.com", "GITHUB_API_URL") };
}

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected a GitHub response object");
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value) throw new Error("Expected a nonempty GitHub response string");
  return value;
}
export function issueNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new Error("Expected a positive GitHub issue number");
  return value;
}

function parseIssue(value: unknown, github: boolean): ExistingIssue {
  const entry = object(value);
  const number = issueNumber(entry.number);
  const title = text(entry.title);
  const body = github && entry.body === null ? "" : entry.body;
  if (typeof body !== "string" || !Array.isArray(entry.labels)) throw new Error("Malformed issue body or labels");
  const labels = entry.labels.map((label: unknown) => text(github && typeof label !== "string" ? object(label).name : label));
  const state = entry.state;
  const stateReason = github ? entry.state_reason ?? null : entry.stateReason;
  if (state !== "open" && state !== "closed") throw new Error("Malformed issue state");
  if (stateReason !== null && stateReason !== "completed" && stateReason !== "not_planned" && stateReason !== "reopened" && stateReason !== "duplicate") throw new Error("Malformed issue state reason");
  return { number, title, body, labels, state, stateReason };
}

export function parseExistingIssues(value: unknown): ExistingIssue[] {
  try {
    if (!Array.isArray(value)) throw new Error();
    return value.map((entry) => parseIssue(entry, false));
  } catch { throw new Error("Existing issue JSON must be an array of valid ExistingIssue records."); }
}

export function parseGithubIssuePage(value: unknown): { issues: ExistingIssue[]; count: number } {
  try {
    if (!Array.isArray(value)) throw new Error();
    return { count: value.length, issues: value.filter((entry) => !("pull_request" in object(entry)))
      .map((entry) => parseIssue(entry, true)) };
  } catch { throw new Error(`GitHub security issue list has an unexpected shape. ${tokenRemediation}`); }
}
