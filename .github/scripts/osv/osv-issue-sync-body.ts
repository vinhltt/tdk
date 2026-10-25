import type { OsvFinding } from "./osv-scan-model";

export function packageMarkerKey(finding: Pick<OsvFinding, "ecosystem" | "packageName">): string {
  if (!finding.ecosystem || /[:\s<>]/.test(finding.ecosystem) || !finding.packageName || /[<>\r\n]/.test(finding.packageName)) {
    throw new Error("OSV finding cannot be represented by a safe package marker");
  }
  return `${finding.ecosystem}:${finding.packageName}`;
}

export function issueMarkerKey(body: string): string | undefined {
  const keys = new Set<string>();
  for (const line of body.split(/\r?\n/)) {
    const match = /^<!-- osv:tdk:([^:\s<>]+):([^<>\r\n]+) -->$/.exec(line);
    if (match) keys.add(`${match[1]}:${match[2]}`);
  }
  return keys.size === 1 ? [...keys][0] : undefined;
}

export function storedGroupIds(body: string): string[] | null {
  const markers = body.split(/\r?\n/).filter((line) => line.startsWith("<!-- osv:tdk-groups:"));
  if (markers.length !== 1) return null;
  const match = /^<!-- osv:tdk-groups:(.+) -->$/.exec(markers[0]);
  if (!match) return null;
  try {
    const ids: unknown = JSON.parse(decodeURIComponent(match[1]));
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string" || !id)) return null;
    return [...new Set(ids as string[])].sort();
  } catch {
    return null;
  }
}

export function escapeMarkdown(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replace(/[\\`*_{}\[\]()|#~]/g, "\\$&").replaceAll("@", "&#64;").replace(/\r\n|\r|\n/g, "<br>");
}

export function escapeAnnotation(value: string): string {
  return value.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
}

function runLink(value: string): string {
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return "Not provided";
    const escaped = url.href.replace(/[()<>\[\]]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
    return `[workflow run](${escaped})`;
  } catch {
    return "Not provided";
  }
}

export function renderIssueBody(findings: OsvFinding[], ctx: { runUrl: string; scannedAt: string }): string {
  const groupIds = [...new Set(findings.map((finding) => finding.groupId))].sort();
  const lockfiles = [...new Set(findings.map((finding) => finding.lockfile))].sort();
  const rows = [...findings].sort((a, b) => a.groupId.localeCompare(b.groupId)
    || a.lockfile.localeCompare(b.lockfile) || a.version.localeCompare(b.version)).map((finding) => {
    const cells = [
      finding.groupId,
      [...new Set(finding.advisoryIds)].filter((id) => id !== finding.groupId).sort().join(", ") || "—",
      `${finding.level} (${finding.score === null ? "unscored" : finding.score})`,
      `${finding.lockfile}@${finding.version}`,
      [...new Set(finding.fixedVersions)].sort().join(", ") || "No published fix",
    ];
    return `| ${cells.map(escapeMarkdown).join(" | ")} |`;
  });
  const upstream = lockfiles.some((path) => path.startsWith(".specify/plugins/tdk-memory/"))
    ? ["", "Fix upstream in `vinhltt/tdk-memory`, then pull the subtree."] : [];
  return [
    `<!-- osv:tdk:${packageMarkerKey(findings[0])} -->`,
    `<!-- osv:tdk-groups:${encodeURIComponent(JSON.stringify(groupIds))} -->`,
    "", "| Advisory | Aliases | Level / score | Lockfile@version | Fixed in |",
    "| --- | --- | --- | --- | --- |", ...rows, "", "## Lockfiles",
    ...lockfiles.map((path) => `- ${escapeMarkdown(path)}`), ...upstream,
    "", `Run: ${runLink(ctx.runUrl)}`, `Last scanned: ${escapeMarkdown(ctx.scannedAt)}`,
    "", "Close manually after the fix lands on `main` (CI does not auto-close).",
  ].join("\n");
}
