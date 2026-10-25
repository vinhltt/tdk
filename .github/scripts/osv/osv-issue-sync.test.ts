import { describe, expect, test } from "bun:test";
import type { OsvFinding, SeverityLevel } from "./osv-scan-model";
import { planIssueActions, type ExistingIssue } from "./osv-issue-sync";

const ctx = { runUrl: "https://github.com/vinhltt/tdk/actions/runs/1", scannedAt: "2026-10-25", fixtureMode: false };
const finding = (overrides: Partial<OsvFinding> = {}): OsvFinding => ({
  lockfile: "packages/tdk-setup/bun.lock", ecosystem: "npm", packageName: "example", version: "1.0.0",
  groupId: "GHSA-one", advisoryIds: ["GHSA-one", "CVE-2026-1234"], score: 8, level: "high",
  blocking: true, fixedVersions: ["2.0.0"], ...overrides,
});
const create = (findings = [finding()]) => {
  const action = planIssueActions(findings, [], ctx)[0];
  if (action.kind !== "create") throw new Error("Expected create action");
  return action;
};
const issue = (overrides: Partial<ExistingIssue> = {}): ExistingIssue => ({
  number: 1, nodeId: "I_1", title: "Existing", body: create().body,
  labels: ["security", "dependencies", "severity:high", "team-owned"],
  state: "open", stateReason: null, ...overrides,
});

describe("OSV issue planner", () => {
  test.each(["critical", "high", "moderate", "low", "unrated"] as SeverityLevel[])("creates %s findings", (level) => {
    const action = create([finding({ level })]);
    expect(action.markerKey).toBe("npm:example");
    expect(action.title).toBe(`[security][tdk] example: 1 advisories (max ${level})`);
    expect(action.body.split("\n")[0]).toBe("<!-- osv:tdk:npm:example -->");
    expect(action.labels).toEqual(["security", "dependencies", `severity:${level}`]);
    for (const value of ["GHSA-one", "CVE-2026-1234", "1.0.0", "2.0.0", "Last scanned", ctx.runUrl, "Close manually"]) {
      expect(action.body).toContain(value);
    }
  });
  test("groups multiple versions and lockfiles, deduplicating advisory groups", () => {
    const action = create([
      finding({ packageName: "@types/node", version: "18.0.0" }),
      finding({ packageName: "@types/node", version: "22.0.0", lockfile: ".specify/scripts/ts/bun.lock" }),
      finding({ packageName: "@types/node", groupId: "GHSA-two", level: "critical" }),
    ]);
    expect(action.title).toBe("[security][tdk] @types/node: 2 advisories (max critical)");
    expect(action.body).toContain("18.0.0");
    expect(action.body).toContain("22.0.0");
    expect(action.body).toContain(".specify/scripts/ts/bun.lock");
  });
  test("renders lockfile versions and scoped aliases without escaped HTML entities", () => {
    const action = create([finding({ advisoryIds: ["GHSA-one", "@owner"] })]);
    expect(action.body).toContain("packages/tdk-setup/bun.lock&#64;1.0.0");
    expect(action.body).toContain("&#64;owner");
    expect(action.body).not.toContain("&\\#64;");
    expect(action.body).not.toContain("@owner");
  });
  test("rewrites title/body quietly for unchanged group sets, even when rows or aliases change", () => {
    const fs = [finding(), finding({ groupId: "GHSA-two", advisoryIds: ["GHSA-two"] })];
    const old = issue({ body: create(fs).body });
    const actions = planIssueActions([fs[1], finding({ version: "1.1.0", advisoryIds: ["new-alias"] })], [old], ctx);
    expect(actions[0]).toMatchObject({ kind: "update", issue: 1 });
    expect("comment" in actions[0]).toBe(false);
  });
  test("comments on changed group sets, not substring or alias matches elsewhere in body", () => {
    const old = issue({ body: create().body + "\nGHSA-one-longer is only a note" });
    const action = planIssueActions([finding({ groupId: "GHSA-one-longer" })], [old], ctx)[0];
    expect(action).toMatchObject({ kind: "update", issue: 1, comment: expect.stringContaining("advisory set changed") });
  });
  test("matches only exact marker lines, not prose, padding, or other package prefixes", () => {
    for (const body of ["prose <!-- osv:tdk:npm:example -->", " <!-- osv:tdk:npm:example -->", "<!-- osv:tdk:npm:examples -->"]) {
      expect(planIssueActions([finding()], [issue({ body })], ctx)[0].kind).toBe("create");
    }
    const body = "Human note\r\n" + create().body.replaceAll("\n", "\r\n");
    expect(planIssueActions([finding()], [issue({ body })], ctx)[0].kind).toBe("update");
  });
  test("ignores non-security issues and ambiguously marked bodies", () => {
    expect(planIssueActions([finding()], [issue({ labels: ["dependencies"] })], ctx)[0].kind).toBe("create");
    const body = create().body + "\n<!-- osv:tdk:npm:other -->";
    expect(planIssueActions([finding()], [issue({ body })], ctx)[0].kind).toBe("create");
  });
  test("preserves unrelated labels while swapping severity and clearing missing label", () => {
    const action = planIssueActions([finding({ level: "low" })], [issue({ labels: ["security", "severity:high", "severity:low", "no-longer-detected", "team-owned"] })], ctx)[0];
    expect(action).toMatchObject({ kind: "update", labels: ["team-owned", "security", "dependencies", "severity:low"] });
  });
  test("marks absent open packages exactly once, never auto-closes or touches unmarked issues", () => {
    expect(planIssueActions([], [issue()], ctx)).toEqual([
      { kind: "mark-not-detected", issue: 1, comment: expect.stringContaining("no longer detected") },
    ]);
    expect(planIssueActions([], [issue({ labels: ["security", "no-longer-detected"] })], ctx)).toEqual([]);
    expect(planIssueActions([], [issue({ state: "closed", stateReason: "completed" })], ctx)).toEqual([]);
    expect(planIssueActions([], [issue({ body: "Human-created security issue" })], ctx)).toEqual([]);
  });
  test("honors accepted risk without creating, rewriting, commenting or reopening", () => {
    expect(planIssueActions([finding()], [issue({ state: "closed", stateReason: "not_planned" })], ctx))
      .toEqual([{ kind: "noop", issue: 1 }]);
  });
  test("honors duplicate closure without reopening the duplicate or creating another issue", () => {
    expect(planIssueActions([finding()], [issue({ state: "closed", stateReason: "duplicate" })], ctx))
      .toEqual([{ kind: "noop", issue: 1 }]);
  });
  test.each(["completed", null] as const)("reopens %s closure with a regression comment", (stateReason) => {
    expect(planIssueActions([finding()], [issue({ state: "closed", stateReason })], ctx)[0])
      .toMatchObject({ kind: "reopen", issue: 1, comment: expect.stringContaining("detected again") });
  });
  test("prefers open matches, with deterministic oldest-open then newest-closed selection", () => {
    const fs = [finding()];
    const issues = [issue({ number: 5, state: "closed", stateReason: "not_planned" }), issue({ number: 3 }), issue({ number: 2 })];
    expect(planIssueActions(fs, issues, ctx)[0]).toMatchObject({ kind: "update", issue: 2 });
    expect(planIssueActions(fs, [...issues].reverse(), ctx)[0]).toMatchObject({ kind: "update", issue: 2 });
    const closed = [issue({ number: 3, state: "closed", stateReason: "completed" }), issues[0]];
    expect(planIssueActions(fs, closed, ctx)).toEqual([{ kind: "noop", issue: 5 }]);
    expect(planIssueActions(fs, [...closed].reverse(), ctx)).toEqual([{ kind: "noop", issue: 5 }]);
  });
  test("fixture mode cannot touch real packages, even when supplied with real findings", () => {
    const fixture = finding({ packageName: "tdk-osv-sync-fixture" });
    const actions = planIssueActions([finding(), fixture], [issue()], { ...ctx, fixtureMode: true });
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ kind: "create", markerKey: "npm:tdk-osv-sync-fixture" });
    expect(planIssueActions([], [issue(), issue({ number: 2, body: create([fixture]).body })], { ...ctx, fixtureMode: true })).toEqual([]);
    expect(planIssueActions([finding({ packageName: "tdk-osv-sync-fixture", ecosystem: "other" })], [], { ...ctx, fixtureMode: true })).toEqual([]);
  });
  test("routes memory subtree fixes upstream only for the actual subtree", () => {
    expect(create([finding({ lockfile: ".specify/plugins/tdk-memory/a/bun.lock" })]).body)
      .toContain("Fix upstream in `vinhltt/tdk-memory`, then pull the subtree");
    expect(create([finding({ lockfile: ".specify/plugins/tdk-memory-other/bun.lock" })]).body).not.toContain("Fix upstream");
  });
  test("escapes untrusted markdown, line breaks, mentions, and run URL delimiters", () => {
    const f = finding({ packageName: "bad|[x]", advisoryIds: ["<script>", "@owner"], lockfile: "bad|file\n::error::oops", version: "`v`" });
    const action = planIssueActions([f], [], { ...ctx, runUrl: "https://example.com/run(a)", scannedAt: "now\n<!-- forged -->" })[0];
    if (action.kind !== "create") throw new Error("Expected create");
    expect(action.body).not.toContain("<script>");
    expect(action.body).not.toContain("\n::error::oops");
    expect(action.body).not.toContain("@owner");
    expect(action.body).toContain("run%28a%29");
    expect(action.body).not.toContain("\n<!-- forged -->");
  });
});
