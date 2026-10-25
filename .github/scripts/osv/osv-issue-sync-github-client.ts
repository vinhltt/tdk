import type { ExistingIssue } from "./osv-issue-sync-planner";
import { issueIdentity, object, parseGithubIssuePage, text, tokenRemediation, type SyncConfig } from "./osv-issue-sync-input";
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

  async validateToken(): Promise<void> {
    const result = await this.rest("/user");
    try { text(object(result).login); }
    catch { throw new Error(`GitHub token validation returned unexpected user data. ${tokenRemediation}`); }
  }

  async listSecurityIssues(): Promise<ExistingIssue[]> {
    const issues: ExistingIssue[] = [];
    for (let page = 1; ; page++) {
      const result = parseGithubIssuePage(await this.rest(`/repos/${this.config.repo}/issues?state=all&labels=security&per_page=100&page=${page}`));
      issues.push(...result.issues);
      if (result.count < 100) return issues;
    }
  }

  async createIssue(payload: { title: string; body: string; labels: string[] }): Promise<{ number: number; nodeId: string }> {
    return issueIdentity(await this.rest(`/repos/${this.config.repo}/issues`, "POST", payload));
  }

  async updateIssue(number: number, payload: IssuePatch): Promise<void> {
    issueIdentity(await this.rest(`/repos/${this.config.repo}/issues/${number}`, "PATCH", payload));
  }

  async addComment(number: number, body: string): Promise<void> {
    const result = object(await this.rest(`/repos/${this.config.repo}/issues/${number}/comments`, "POST", { body }));
    if (typeof result.id !== "number" || !Number.isSafeInteger(result.id) || result.id < 1) throw new Error("GitHub returned a malformed comment response");
  }

  private async graphql(query: string, variables: Record<string, string>): Promise<Record<string, unknown>> {
    const response = object(await this.request(this.config.graphqlUrl, "POST", { query, variables }));
    if (response.errors !== undefined && (!Array.isArray(response.errors) || response.errors.length)) throw new Error("GitHub GraphQL returned errors");
    return object(response.data);
  }

  async addToProjectWithStatus(nodeId: string): Promise<void> {
    try {
      const added = await this.graphql(
        "mutation($projectId: ID!, $contentId: ID!) { addProjectV2ItemById(input: {projectId: $projectId, contentId: $contentId}) { item { id } } }",
        { projectId: this.config.projectId, contentId: nodeId },
      );
      const itemId = text(object(object(added.addProjectV2ItemById).item).id);
      const updated = await this.graphql(
        "mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) { updateProjectV2ItemFieldValue(input: {projectId: $projectId, itemId: $itemId, fieldId: $fieldId, value: {singleSelectOptionId: $optionId}}) { projectV2Item { id } } }",
        { projectId: this.config.projectId, itemId, fieldId: this.config.statusFieldId, optionId: this.config.todoOptionId },
      );
      text(object(object(updated.updateProjectV2ItemFieldValue).projectV2Item).id);
    } catch {
      console.warn("::warning::Issue saved, but Project Todo placement failed. Add it to the board manually and check TDK_BUILDER_PROJECT_ID, TDK_BUILDER_STATUS_FIELD_ID, TDK_BUILDER_TODO_OPTION_ID and the PAT project scope.");
    }
  }
}
