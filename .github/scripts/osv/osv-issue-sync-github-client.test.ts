import { describe, expect, spyOn, test } from "bun:test";
import { GithubIssueClient, loadSyncConfig, parseExistingIssues } from "./osv-issue-sync-github-client";

const env = {
  GH_TOKEN: "test-only-token", TDK_BUILDER_REPO: "owner/issues", TDK_BUILDER_PROJECT_ID: "P_1",
  TDK_BUILDER_STATUS_FIELD_ID: "F_1", TDK_BUILDER_TODO_OPTION_ID: "todo",
  GITHUB_API_URL: "http://127.0.0.1:1234/api", GITHUB_GRAPHQL_URL: "http://127.0.0.1:1234/graphql",
};
const rawIssue = (number = 1) => ({ number, node_id: `I_${number}`, title: "Issue", body: null,
  labels: [{ name: "security" }], state: "closed", state_reason: "not_planned" });
const makeClient = (respond: (url: URL, init: RequestInit) => Response | Promise<Response>) => {
  const fetcher = (input: string | URL | Request, init: RequestInit = {}) => respond(new URL(String(input)), init);
  return new GithubIssueClient(loadSyncConfig(env), fetcher);
};

describe("OSV GitHub configuration and input boundaries", () => {
  test("requires GH_TOKEN and every board/repo variable before any requests", () => {
    for (const name of ["GH_TOKEN", "TDK_BUILDER_REPO", "TDK_BUILDER_PROJECT_ID", "TDK_BUILDER_STATUS_FIELD_ID", "TDK_BUILDER_TODO_OPTION_ID"]) {
      expect(() => loadSyncConfig({ ...env, [name]: "" })).toThrow(name === "GH_TOKEN" ? "TDK_BUILDER_ISSUES_TOKEN" : name);
    }
    expect(() => loadSyncConfig({ ...env, TDK_BUILDER_REPO: "../../outside" })).toThrow("TDK_BUILDER_REPO");
    expect(() => loadSyncConfig({ ...env, GITHUB_API_URL: "file:///tmp/a" })).toThrow("GITHUB_API_URL");
    expect(() => loadSyncConfig({ ...env, GITHUB_GRAPHQL_URL: "http://user:password@example.com" })).toThrow("GITHUB_GRAPHQL_URL");
  });
  test("validates offline ExistingIssue JSON instead of treating malformed data as empty", () => {
    const issue = { number: 1, nodeId: "I_1", title: "Issue", body: "", labels: ["security"], state: "open" as const, stateReason: null };
    expect(parseExistingIssues([issue])).toEqual([issue]);
    for (const value of [{}, null, [null], [{ ...issue, number: "1" }], [{ ...issue, labels: [{}] }],
      [{ ...issue, body: null }], [{ ...issue, stateReason: "unknown" }], [{ ...issue, stateReason: ["completed"] }],
      [{ ...issue, stateReason: undefined }], [{ ...issue, number: 0 }]]) {
      expect(() => parseExistingIssues(value)).toThrow("Existing issue");
    }
  });
  test("token validation suppresses sensitive response and network error content", async () => {
    const denied = makeClient(() => Response.json({ message: env.GH_TOKEN }, { status: 401 }));
    await expect(denied.validateToken()).rejects.toThrow("classic PAT");
    const offline = makeClient(() => { throw new Error(`network ${env.GH_TOKEN}`); });
    let failure: unknown;
    try { await offline.validateToken(); } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).toContain("GitHub API request failed");
    expect(String(failure)).not.toContain(env.GH_TOKEN);
    await expect(makeClient(() => Response.json({})).validateToken()).rejects.toThrow("token validation");
  });
});

describe("OSV GitHub REST adapter", () => {
  test("paginates all security issue states, excludes pull requests and maps closed reasons", async () => {
    const calls: URL[] = [];
    const client = makeClient((url, init) => {
      calls.push(url);
      expect(new Headers(init.headers).get("authorization")).toBe(`Bearer ${env.GH_TOKEN}`);
      expect(init.redirect).toBe("error");
      expect(url.searchParams.get("state")).toBe("all");
      expect(url.searchParams.get("labels")).toBe("security");
      expect(url.searchParams.get("per_page")).toBe("100");
      const page = url.searchParams.get("page");
      if (page === "1") return Response.json(Array.from({ length: 100 }, (_, i) => i === 0
        ? { ...rawIssue(i + 1), pull_request: { url: "https://example.com/pr" } } : rawIssue(i + 1)));
      return Response.json([rawIssue(101)]);
    });
    const issues = await client.listSecurityIssues();
    expect(calls).toHaveLength(2);
    expect(calls[1].searchParams.get("page")).toBe("2");
    expect(issues).toHaveLength(100);
    expect(issues[0]).toMatchObject({ number: 2, nodeId: "I_2", body: "", stateReason: "not_planned", labels: ["security"] });
  });
  test("accepts duplicate closures in the security issue list without poisoning other issues", async () => {
    const client = makeClient(() => Response.json([
      { ...rawIssue(1), state_reason: "duplicate" }, rawIssue(2),
    ]));
    const issues = await client.listSecurityIssues();
    expect(issues.map(({ number, stateReason }) => ({ number, stateReason }))).toEqual([
      { number: 1, stateReason: "duplicate" }, { number: 2, stateReason: "not_planned" },
    ]);
  });
  test("list failure, unknown response and malformed issue fields fail closed", async () => {
    await expect(makeClient(() => Response.json({}, { status: 403 })).listSecurityIssues()).rejects.toThrow("TDK_BUILDER_ISSUES_TOKEN");
    for (const response of [{}, [null], [{ ...rawIssue(), labels: [1] }], [{ ...rawIssue(), body: {} }],
      [{ ...rawIssue(), state: "unknown" }], [{ ...rawIssue(), state_reason: "unknown" }]]) {
      await expect(makeClient(() => Response.json(response)).listSecurityIssues()).rejects.toThrow();
    }
    await expect(makeClient(() => new Response("not-json")).listSecurityIssues()).rejects.toThrow("JSON");
  });
  test("uses explicit endpoints and minimal mutation payloads, including reopen", async () => {
    const requests: { path: string; method: string; body: unknown }[] = [];
    const client = makeClient((url, init) => {
      requests.push({ path: url.pathname, method: init.method!, body: JSON.parse(String(init.body)) });
      return Response.json(url.pathname.endsWith("comments") ? { id: 9 } : { number: 7, node_id: "I_7" });
    });
    expect(await client.createIssue({ title: "Title", body: "Body", labels: ["security"] })).toEqual({ number: 7, nodeId: "I_7" });
    await client.updateIssue(7, { state: "open", title: "Updated", body: "New", labels: ["team", "security"] });
    await client.addComment(7, "Regression");
    expect(requests).toEqual([
      { path: "/api/repos/owner/issues/issues", method: "POST", body: { title: "Title", body: "Body", labels: ["security"] } },
      { path: "/api/repos/owner/issues/issues/7", method: "PATCH", body: { state: "open", title: "Updated", body: "New", labels: ["team", "security"] } },
      { path: "/api/repos/owner/issues/issues/7/comments", method: "POST", body: { body: "Regression" } },
    ]);
  });
  test("rejects malformed create, update and comment responses", async () => {
    const client = makeClient(() => Response.json({}));
    await expect(client.createIssue({ title: "Title", body: "", labels: [] })).rejects.toThrow();
    await expect(client.updateIssue(1, { labels: [] })).rejects.toThrow();
    await expect(client.addComment(1, "Comment")).rejects.toThrow();
  });
});

describe("OSV GitHub project adapter", () => {
  test("adds created issue and sets Todo via the returned item id", async () => {
    const calls: { query: string; variables: Record<string, string> }[] = [];
    const client = makeClient((url, init) => {
      expect(url.href).toBe(env.GITHUB_GRAPHQL_URL);
      const payload = JSON.parse(String(init.body));
      calls.push(payload);
      return Response.json(calls.length === 1 ? { data: { addProjectV2ItemById: { item: { id: "PVTI_1" } } } }
        : { data: { updateProjectV2ItemFieldValue: { projectV2Item: { id: "PVTI_1" } } } });
    });
    await client.addToProjectWithStatus("I_7");
    expect(calls[0].query).toContain("addProjectV2ItemById");
    expect(calls[0].variables).toMatchObject({ projectId: "P_1", contentId: "I_7" });
    expect(calls[1].query).toContain("updateProjectV2ItemFieldValue");
    expect(calls[1].variables).toMatchObject({ projectId: "P_1", itemId: "PVTI_1", fieldId: "F_1", optionId: "todo" });
  });
  test("board HTTP, GraphQL and response-shape failures only warn without response secrets", async () => {
    const warnings = spyOn(console, "warn").mockImplementation(() => {});
    try {
      for (const response of [() => Response.json({}, { status: 403 }),
        () => Response.json({ errors: [{ message: env.GH_TOKEN }] }), () => Response.json({ data: {} })]) {
        await expect(makeClient(response).addToProjectWithStatus("I_7")).resolves.toBeUndefined();
      }
      expect(warnings).toHaveBeenCalledTimes(3);
      for (const [message] of warnings.mock.calls) {
        expect(message).toContain("::warning::");
        expect(message).not.toContain(env.GH_TOKEN);
      }
    } finally { warnings.mockRestore(); }
  });
  test("a failed status mutation is also a warning after successful add", async () => {
    const warning = spyOn(console, "warn").mockImplementation(() => {});
    let calls = 0;
    try {
      const client = makeClient(() => ++calls === 1 ? Response.json({ data: { addProjectV2ItemById: { item: { id: "PVTI_1" } } } })
        : Response.json({ errors: [{ message: "bad field" }] }));
      await client.addToProjectWithStatus("I_7");
      expect(calls).toBe(2);
      expect(warning).toHaveBeenCalledTimes(1);
    } finally { warning.mockRestore(); }
  });
});
