import { describe, expect, spyOn, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseIssueSyncArgs, runIssueSync, type ExistingIssue } from "./osv-issue-sync";
import type { GithubFetch } from "./osv-issue-sync-github-client";

const fixture = new URL("./fixtures/osv-scan-dispatch-sample.json", import.meta.url).pathname;
const clean = new URL("./fixtures/osv-scan-clean.json", import.meta.url).pathname;
const environment = { GH_TOKEN: "test-only-token", TDK_BUILDER_REPO: "owner/issues", TDK_BUILDER_PROJECT_ID: "P_1",
  TDK_BUILDER_STATUS_FIELD_ID: "F_1", TDK_BUILDER_TODO_OPTION_ID: "todo", RUN_URL: "https://example.com/run",
  GITHUB_API_URL: "http://localhost/api", GITHUB_GRAPHQL_URL: "http://localhost/graphql" };
const noNetwork: GithubFetch = () => { throw new Error("Dry-run must not access the network"); };

async function withQuietOutput<T>(body: (logs: string[]) => Promise<T>): Promise<T> {
  const logs: string[] = [];
  const log = spyOn(console, "log").mockImplementation((message) => { logs.push(String(message)); });
  try { return await body(logs); } finally { log.mockRestore(); }
}

describe("OSV issue sync CLI", () => {
  test("requires a scan, validates flags, and defaults scan root to cwd", () => {
    expect(parseIssueSyncArgs(["--scan", "scan.json", "--dry-run"]).scanRoot).toBe(process.cwd());
    expect(parseIssueSyncArgs(["--scan", "scan.json", "--scan-root", "/other", "--fixture-mode"]).scanRoot).toBe("/other");
    for (const args of [[], ["--scan"], ["--unknown"], ["--scan", "x", "--scan", "y"],
      ["--scan", "x", "--existing", "existing.json"], ["--scan", "x", "--scan-root", "--dry-run"]]) {
      expect(() => parseIssueSyncArgs(args)).toThrow();
    }
  });
  test("offline dry-run prints fixture actions without secrets or vars and never makes requests", async () => {
    await withQuietOutput(async (logs) => {
      const actions = await runIssueSync(["--scan", fixture, "--fixture-mode", "--dry-run"], {}, noNetwork);
      expect(actions).toHaveLength(1);
      expect(actions[0]).toMatchObject({ kind: "create", markerKey: "npm:tdk-osv-sync-fixture" });
      expect(JSON.parse(logs[0])).toEqual(actions);
    });
  });
  test("offline --existing proves quiet update and one-time no-longer-detected transitions", async () => {
    const dir = await mkdtemp(join(tmpdir(), "osv-sync-"));
    try {
      await withQuietOutput(async () => {
        const created = (await runIssueSync(["--scan", fixture, "--dry-run"], {}, noNetwork))[0];
        if (created.kind !== "create") throw new Error("Expected create");
        const existing: ExistingIssue = { number: 7, nodeId: "I_7", title: created.title, body: created.body,
          labels: created.labels, state: "open", stateReason: null };
        const path = join(dir, "existing.json");
        await writeFile(path, JSON.stringify([existing]));
        const args = ["--dry-run", "--existing", path];
        const updated = await runIssueSync(["--scan", fixture, ...args], {}, noNetwork);
        expect(updated[0]).toMatchObject({ kind: "update", issue: 7 });
        expect("comment" in updated[0]).toBe(false);
        expect(await runIssueSync(["--scan", clean, ...args], {}, noNetwork))
          .toEqual([{ kind: "mark-not-detected", issue: 7, comment: expect.any(String) }]);
        expect(await runIssueSync(["--scan", clean, "--fixture-mode", ...args], {}, noNetwork)).toEqual([]);
        await writeFile(path, JSON.stringify([{ ...existing, labels: [...existing.labels, "no-longer-detected"] }]));
        expect(await runIssueSync(["--scan", clean, ...args], {}, noNetwork)).toEqual([]);
        await writeFile(path, "{}");
        await expect(runIssueSync(["--scan", fixture, ...args], {}, noNetwork)).rejects.toThrow("Existing issue");
      });
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  test("fails for missing/unreadable or malformed scan files, never printing clean actions", async () => {
    const dir = await mkdtemp(join(tmpdir(), "osv-sync-invalid-"));
    try {
      await withQuietOutput(async (logs) => {
        const path = join(dir, "scan.json");
        await expect(runIssueSync(["--scan", path, "--dry-run"], {}, noNetwork)).rejects.toThrow();
        for (const json of ["not-json", "{}", "null"]) {
          await writeFile(path, json);
          await expect(runIssueSync(["--scan", path, "--dry-run"], {}, noNetwork)).rejects.toThrow();
        }
        expect(logs).toEqual([]);
      });
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  test("missing token or any board variable fails before requests and mutations", async () => {
    let requests = 0;
    const fetcher: GithubFetch = () => { requests++; return Response.json({}); };
    for (const name of ["GH_TOKEN", "TDK_BUILDER_REPO", "TDK_BUILDER_PROJECT_ID", "TDK_BUILDER_STATUS_FIELD_ID", "TDK_BUILDER_TODO_OPTION_ID"]) {
      await expect(runIssueSync(["--scan", fixture], { ...environment, [name]: "" }, fetcher)).rejects.toThrow();
    }
    expect(requests).toBe(0);
  });
  test("invalid token and failed listing never mutate", async () => {
    const calls: string[] = [];
    const fetcher = ((input: string | URL | Request, init: RequestInit = {}) => {
      const path = new URL(String(input)).pathname;
      calls.push(`${init.method} ${path}`);
      return path.endsWith("/user") ? Response.json({ login: "owner" }) : Response.json({}, { status: 403 });
    }) satisfies GithubFetch;
    await expect(runIssueSync(["--scan", fixture], environment, fetcher)).rejects.toThrow("classic PAT");
    expect(calls).toEqual(["GET /api/user", "GET /api/repos/owner/issues/issues"]);
    calls.length = 0;
    const invalid = ((input: string | URL | Request, init: RequestInit = {}) => {
      calls.push(`${init.method} ${new URL(String(input)).pathname}`);
      return Response.json({}, { status: 401 });
    }) satisfies GithubFetch;
    await expect(runIssueSync(["--scan", fixture], environment, invalid)).rejects.toThrow("classic PAT");
    expect(calls).toEqual(["GET /api/user"]);
  });
  test("live fixture create uses REST then board while board failure remains a warning", async () => {
    const requests: { path: string; method: string; body?: unknown }[] = [];
    const warning = spyOn(console, "warn").mockImplementation(() => {});
    const fetcher = ((input: string | URL | Request, init: RequestInit = {}) => {
      const path = new URL(String(input)).pathname;
      requests.push({ path, method: init.method!, ...(init.body ? { body: JSON.parse(String(init.body)) } : {}) });
      if (path.endsWith("/user")) return Response.json({ login: "owner" });
      if (path.endsWith("/graphql")) return Response.json({ errors: [{ message: "invalid board" }] });
      return init.method === "GET" ? Response.json([]) : Response.json({ number: 7, node_id: "I_7" });
    }) satisfies GithubFetch;
    try {
      await withQuietOutput(async () => {
        expect((await runIssueSync(["--scan", fixture, "--fixture-mode"], environment, fetcher))[0].kind).toBe("create");
        expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
          "GET /api/user", "GET /api/repos/owner/issues/issues", "POST /api/repos/owner/issues/issues", "POST /graphql",
        ]);
        expect(requests[2].body).toMatchObject({ body: expect.stringContaining(environment.RUN_URL) });
        expect(warning).toHaveBeenCalledTimes(1);
      });
    } finally { warning.mockRestore(); }
  });
  test.each(["open", "completed", "not_planned", "absent"] as const)("applies the live %s transition without unrelated mutations", async (mode) => {
    await withQuietOutput(async () => {
      const created = (await runIssueSync(["--scan", fixture, "--dry-run"], {}, noNetwork))[0];
      if (created.kind !== "create") throw new Error("Expected create");
      const raw = { number: 7, node_id: "I_7", title: created.title, body: created.body,
        labels: [...created.labels, "team-owned"].map((name) => ({ name })),
        state: mode === "completed" || mode === "not_planned" ? "closed" : "open",
        state_reason: mode === "completed" || mode === "not_planned" ? mode : null };
      const mutations: { method: string; path: string; body: unknown }[] = [];
      const fetcher = ((input: string | URL | Request, init: RequestInit = {}) => {
        const path = new URL(String(input)).pathname;
        if (path.endsWith("/user")) return Response.json({ login: "owner" });
        if (init.method === "GET") return Response.json([raw]);
        mutations.push({ method: init.method!, path, body: JSON.parse(String(init.body)) });
        return Response.json(path.endsWith("/comments") ? { id: 1 } : { number: 7, node_id: "I_7" });
      }) satisfies GithubFetch;
      await runIssueSync(["--scan", mode === "absent" ? clean : fixture], environment, fetcher);
      if (mode === "not_planned") expect(mutations).toEqual([]);
      else if (mode === "absent") {
        expect(mutations.map(({ method }) => method)).toEqual(["POST", "PATCH"]);
        expect(mutations[0].body).toMatchObject({ body: expect.stringContaining("no longer detected") });
        expect(mutations[1].body).toEqual({ labels: [...created.labels, "team-owned", "no-longer-detected"] });
      } else {
        expect(mutations.map(({ method }) => method)).toEqual(mode === "open" ? ["PATCH"] : ["PATCH", "POST"]);
        expect(mutations[0].body).toMatchObject({ labels: expect.arrayContaining(["team-owned", "security", "dependencies"]) });
        if (mode === "completed") expect(mutations[0].body).toMatchObject({ state: "open" });
      }
      expect(mutations.every(({ path }) => !path.includes("graphql"))).toBe(true);
    });
  });
  test("REST mutation failures are hard failures, unlike board-only failures", async () => {
    await withQuietOutput(async () => {
      const fetcher = ((input: string | URL | Request, init: RequestInit = {}) => {
        if (String(input).endsWith("/user")) return Response.json({ login: "owner" });
        return init.method === "GET" ? Response.json([]) : Response.json({}, { status: 403 });
      }) satisfies GithubFetch;
      await expect(runIssueSync(["--scan", fixture], environment, fetcher)).rejects.toThrow("TDK_BUILDER_ISSUES_TOKEN");
    });
  });
});
