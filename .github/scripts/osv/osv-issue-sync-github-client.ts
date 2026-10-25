import type { ExistingIssue } from "./osv-issue-sync-planner";
import { issueNumber, object, parseGithubIssuePage, tokenRemediation, type SyncConfig } from "./osv-issue-sync-input";
export { loadSyncConfig, parseExistingIssues } from "./osv-issue-sync-input";

export interface IssuePatch { title?: string; body?: string; labels?: string[]; state?: "open" }
export type GithubFetch = (input: string | URL | Request, init?: RequestInit) => Response | Promise<Response>;

export class GithubIssueClient {
  constructor(private readonly config: SyncConfig, private readonly fetcher: GithubFetch = fetch) {}

  private async request(url: string, method = "GET", body?: unknown): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetcher(url, { method, redirect: "error", headers: {
        Authorization: `Bearer ${this.config.token}`, Accept: "application/vnd.github+json",
        "Content-Type": "application/json", "X-GitHub-Api-Version": "2022-11-28",
      }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    } catch { throw new Error(`GitHub API request failed. ${tokenRemediation}`); }
    if (!response.ok) throw new Error(`GitHub API request failed (HTTP ${response.status}). ${tokenRemediation}`);
    try { return await response.json(); }
    catch { throw new Error(`GitHub API returned invalid JSON. ${tokenRemediation}`); }
  }

  private rest(path: string, method = "GET", body?: unknown): Promise<unknown> {
    return this.request(`${this.config.apiUrl}${path}`, method, body);
  }

  async listSecurityIssues(): Promise<ExistingIssue[]> {
    const issues: ExistingIssue[] = [];
    for (let page = 1; ; page++) {
      const result = parseGithubIssuePage(await this.rest(`/repos/${this.config.repo}/issues?state=all&labels=security&per_page=100&page=${page}`));
      issues.push(...result.issues);
      if (result.count < 100) return issues;
    }
  }

  async createIssue(payload: { title: string; body: string; labels: string[] }): Promise<void> {
    issueNumber(object(await this.rest(`/repos/${this.config.repo}/issues`, "POST", payload)).number);
  }

  async updateIssue(number: number, payload: IssuePatch): Promise<void> {
    issueNumber(object(await this.rest(`/repos/${this.config.repo}/issues/${number}`, "PATCH", payload)).number);
  }

  async addComment(number: number, body: string): Promise<void> {
    const result = object(await this.rest(`/repos/${this.config.repo}/issues/${number}/comments`, "POST", { body }));
    if (typeof result.id !== "number" || !Number.isSafeInteger(result.id) || result.id < 1) throw new Error("GitHub returned a malformed comment response");
  }
}
