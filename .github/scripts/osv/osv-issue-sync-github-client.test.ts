import { describe, expect, test } from "bun:test";
import { GithubIssueClient, loadSyncConfig, parseExistingIssues } from "./osv-issue-sync-github-client";

const env = { GH_TOKEN: "test-only-token", GITHUB_REPOSITORY: "owner/issues", GITHUB_API_URL: "http://127.0.0.1:1234/api" };
const rawIssue = (number = 1) => ({ number, title: "Issue", body: null,
  labels: [{ name: "security" }], state: "closed", state_reason: "not_planned" });
const makeClient = (respond: (url: URL, init: RequestInit) => Response | Promise<Response>) => {
  const fetcher = (input: string | URL | Request, init: RequestInit = {}) => respond(new URL(String(input)), init);
  return new GithubIssueClient(loadSyncConfig(env), fetcher);
};

describe("OSV GitHub configuration and input boundaries", () => {
  test("rejects malformed repository, token and API endpoint configuration", () => {
    expect(() => loadSyncConfig({ ...env, GITHUB_REPOSITORY: "../../outside" })).toThrow("GITHUB_REPOSITORY");
    expect(() => loadSyncConfig({ ...env, GITHUB_REPOSITORY: "owner/.." })).toThrow("GITHUB_REPOSITORY");
    expect(() => loadSyncConfig({ ...env, GH_TOKEN: "invalid token" })).toThrow("GH_TOKEN");
    for (const GITHUB_API_URL of ["file:///tmp/a", "http://user:password@example.com", "https://example.com?token=secret"]) {
      expect(() => loadSyncConfig({ ...env, GITHUB_API_URL })).toThrow("GITHUB_API_URL");
    }
  });
  test("validates offline ExistingIssue JSON instead of treating malformed data as empty", () => {
    const issue = { number: 1, title: "Issue", body: "", labels: ["security"], state: "open" as const, stateReason: null };
    expect(parseExistingIssues([issue])).toEqual([issue]);
    for (const value of [{}, null, [null], [{ ...issue, number: "1" }], [{ ...issue, labels: [{}] }],
      [{ ...issue, body: null }], [{ ...issue, stateReason: "unknown" }], [{ ...issue, stateReason: ["completed"] }],
      [{ ...issue, stateReason: undefined }], [{ ...issue, number: 0 }]]) {
      expect(() => parseExistingIssues(value)).toThrow("Existing issue");
    }
  });
  test("API failures reject without exposing response or network secrets", async () => {
    for (const respond of [
      () => Response.json({ message: env.GH_TOKEN }, { status: 401 }),
      () => Response.json({ message: env.GH_TOKEN }, { status: 403 }),
      () => { throw new Error(`network ${env.GH_TOKEN}`); },
      () => new Response(env.GH_TOKEN), () => Response.json({ message: env.GH_TOKEN }),
    ]) {
      let failure: unknown;
      try { await makeClient(respond).listSecurityIssues(); } catch (error) { failure = error; }
      expect(failure).toBeInstanceOf(Error);
      expect(String(failure)).not.toContain(env.GH_TOKEN);
    }
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
    expect(issues[0]).toMatchObject({ number: 2, body: "", stateReason: "not_planned", labels: ["security"] });
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
  test("unknown responses and malformed issue fields fail closed", async () => {
    for (const response of [{}, [null], [{ ...rawIssue(), labels: [1] }], [{ ...rawIssue(), body: {} }],
      [{ ...rawIssue(), state: "unknown" }], [{ ...rawIssue(), state_reason: "unknown" }]]) {
      await expect(makeClient(() => Response.json(response)).listSecurityIssues()).rejects.toThrow();
    }
    await expect(makeClient(() => new Response("not-json")).listSecurityIssues()).rejects.toThrow("JSON");
  });
  test("creates, reopens and comments on repository issues with minimal payloads", async () => {
    const requests: { path: string; method: string; body: unknown }[] = [];
    const client = makeClient((url, init) => {
      requests.push({ path: url.pathname, method: init.method!, body: JSON.parse(String(init.body)) });
      return Response.json(url.pathname.endsWith("comments") ? { id: 9 } : { number: 7 });
    });
    await client.createIssue({ title: "Title", body: "Body", labels: ["security"] });
    await client.updateIssue(7, { state: "open", title: "Updated", body: "New", labels: ["team", "security"] });
    await client.addComment(7, "Regression");
    expect(requests).toEqual([
      { path: "/api/repos/owner/issues/issues", method: "POST", body: { title: "Title", body: "Body", labels: ["security"] } },
      { path: "/api/repos/owner/issues/issues/7", method: "PATCH", body: { state: "open", title: "Updated", body: "New", labels: ["team", "security"] } },
      { path: "/api/repos/owner/issues/issues/7/comments", method: "POST", body: { body: "Regression" } },
    ]);
  });
  test("rejects malformed create, update and comment responses", async () => {
    for (const response of [{}, { number: 0, id: 0 }, { number: "1", id: "1" }]) {
      const client = makeClient(() => Response.json(response));
      await expect(client.createIssue({ title: "Title", body: "", labels: [] })).rejects.toThrow();
      await expect(client.updateIssue(1, { labels: [] })).rejects.toThrow();
      await expect(client.addComment(1, "Comment")).rejects.toThrow();
    }
  });
});
