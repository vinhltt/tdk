import type { OsvFinding, SeverityLevel } from "./osv-scan-model";
import { issueMarkerKey, packageMarkerKey, renderIssueBody, storedGroupIds } from "./osv-issue-sync-body";

export interface ExistingIssue {
  number: number;
  nodeId: string;
  title: string;
  body: string;
  labels: string[];
  state: "open" | "closed";
  stateReason: "completed" | "not_planned" | "reopened" | "duplicate" | null;
}
export type IssueAction =
  | { kind: "create"; markerKey: string; title: string; body: string; labels: string[] }
  | { kind: "update"; issue: number; title: string; body: string; labels: string[]; comment?: string }
  | { kind: "reopen"; issue: number; title: string; body: string; labels: string[]; comment: string }
  | { kind: "mark-not-detected"; issue: number; comment: string }
  | { kind: "noop"; issue: number };
export interface IssueSyncContext { runUrl: string; scannedAt: string; fixtureMode: boolean }

const levels: SeverityLevel[] = ["unrated", "low", "moderate", "high", "critical"];
const fixtureKey = "npm:tdk-osv-sync-fixture";

function issueLabels(existing: string[], level: SeverityLevel): string[] {
  const unrelated = existing.filter((label) => !label.startsWith("severity:")
    && !["security", "dependencies", "no-longer-detected"].includes(label));
  return [...new Set([...unrelated, "security", "dependencies", `severity:${level}`])];
}

function preferredIssue(issues: ExistingIssue[]): ExistingIssue | undefined {
  // Keep the oldest open thread; absent one, honor the most recent manual lifecycle decision.
  return [...issues].sort((a, b) => a.state !== b.state ? (a.state === "open" ? -1 : 1)
    : a.state === "open" ? a.number - b.number : b.number - a.number)[0];
}

export function planIssueActions(
  findings: OsvFinding[], existingIssues: ExistingIssue[], ctx: IssueSyncContext,
): IssueAction[] {
  const grouped = new Map<string, OsvFinding[]>();
  for (const finding of findings) {
    const key = packageMarkerKey(finding);
    if (ctx.fixtureMode && key !== fixtureKey) continue;
    const group = grouped.get(key);
    if (group) group.push(finding);
    else grouped.set(key, [finding]);
  }
  const marked = existingIssues.filter((issue) => issue.labels.includes("security"))
    .map((issue) => ({ issue, key: issueMarkerKey(issue.body) }))
    .filter(({ key }) => key && (!ctx.fixtureMode || key === fixtureKey));
  const actions: IssueAction[] = [];
  for (const [markerKey, group] of [...grouped].sort(([a], [b]) => a.localeCompare(b))) {
    const existing = preferredIssue(marked.filter(({ key }) => key === markerKey).map(({ issue }) => issue));
    if (existing?.state === "closed" && (existing.stateReason === "not_planned" || existing.stateReason === "duplicate")) {
      actions.push({ kind: "noop", issue: existing.number });
      continue;
    }
    const groupIds = [...new Set(group.map((finding) => finding.groupId))].sort();
    const level = group.reduce((max, finding) => levels.indexOf(finding.level) > levels.indexOf(max)
      ? finding.level : max, "unrated" as SeverityLevel);
    const payload = {
      title: `[security][tdk] ${group[0].packageName}: ${groupIds.length} advisories (max ${level})`,
      body: renderIssueBody(group, ctx), labels: issueLabels(existing?.labels ?? [], level),
    };
    if (!existing) {
      actions.push({ kind: "create", markerKey, ...payload });
    } else if (existing.state === "closed") {
      actions.push({ kind: "reopen", issue: existing.number, ...payload,
        comment: "OSV detected again after this issue was closed as fixed. Reopening for regression review." });
    } else {
      const previous = storedGroupIds(existing.body);
      // Missing/human-edited metadata is not evidence that the advisory set changed.
      const changed = previous !== null && JSON.stringify(previous) !== JSON.stringify(groupIds);
      actions.push({ kind: "update", issue: existing.number, ...payload,
        ...(changed ? { comment: "The OSV advisory set changed. The issue body now reflects the latest scan." } : {}) });
    }
  }
  if (!ctx.fixtureMode) {
    for (const { issue, key } of marked.sort((a, b) => a.issue.number - b.issue.number)) {
      if (issue.state === "open" && !grouped.has(key!) && !issue.labels.includes("no-longer-detected")) {
        actions.push({ kind: "mark-not-detected", issue: issue.number,
          comment: "This package is no longer detected as vulnerable by OSV. Close manually after confirming the fix on main; CI does not auto-close." });
      }
    }
  }
  return actions;
}
