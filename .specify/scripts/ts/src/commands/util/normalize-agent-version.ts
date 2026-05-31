// CLI: normalize-agent-version — fold a stray top-level `version:` in agent
// frontmatter into `metadata.version` (block style) and remove the top-level line.
// plugin-bump writes a top-level `version:` for agents, leaving any existing
// `metadata.version` stale. This reconciles them: the fresh top-level value wins.
// Usage: bun src/commands/util/normalize-agent-version.ts <agent-md-path>
//
// Line-based edit only — NO YAML parse+reserialize (a round-trip reformats
// folded multi-line description blocks and quoting, exploding the diff).

import { readFileSync, writeFileSync } from 'node:fs';

const TOP_VERSION_RE = /^version:\s*(.+?)\s*$/;
const METADATA_RE = /^metadata:\s*$/;
const META_VERSION_RE = /^(\s+)version:\s*.+$/;

function unquote(v: string): string {
  const m = /^(["'])(.*)\1$/.exec(v);
  return m ? m[2]! : v;
}

/**
 * Fold a top-level `version:` in an agent file's YAML frontmatter into
 * `metadata.version`. Returns a one-line summary. Throws on real errors.
 * Idempotent: when there is no top-level `version:`, performs no write.
 */
export function normalizeAgentVersion(filePath: string): string {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  if (lines[0]?.trim() !== '---') {
    throw new Error(`no YAML frontmatter block found in ${filePath}`);
  }

  let fmEnd = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === '---') { fmEnd = i; break; }
  }
  if (fmEnd === -1) throw new Error(`unterminated frontmatter in ${filePath}`);

  // Pass 1: locate the top-level version line within the frontmatter.
  let topIdx = -1;
  let version = '';
  for (let i = 1; i < fmEnd; i++) {
    const m = TOP_VERSION_RE.exec(lines[i]!);
    if (m) { topIdx = i; version = unquote(m[1]!); break; }
  }

  if (topIdx === -1) return 'noop: no top-level version';

  // Pass 2: remove the top-level version line (shifts fmEnd left by one).
  lines.splice(topIdx, 1);
  fmEnd -= 1;

  // Pass 3: re-scan the mutated array for a block-style metadata: mapping.
  let metaIdx = -1;
  for (let i = 1; i < fmEnd; i++) {
    if (METADATA_RE.test(lines[i]!)) { metaIdx = i; break; }
  }

  if (metaIdx === -1) {
    // No metadata block — append one before the closing `---`.
    lines.splice(fmEnd, 0, 'metadata:', `  version: "${version}"`);
  } else {
    // Scan contiguous indented children; stop at first top-level key or fmEnd.
    let childVersionIdx = -1;
    let childIndent = '';
    let siblingIndent = '';
    for (let i = metaIdx + 1; i < fmEnd; i++) {
      if (lines[i]!.length > 0 && !/^\s/.test(lines[i]!)) break; // top-level key
      const sib = /^(\s+)\S/.exec(lines[i]!);
      if (sib && !siblingIndent) siblingIndent = sib[1]!;
      const child = META_VERSION_RE.exec(lines[i]!);
      if (child) { childVersionIdx = i; childIndent = child[1]!; break; }
    }
    if (childVersionIdx !== -1) {
      lines[childVersionIdx] = `${childIndent}version: "${version}"`;
    } else {
      lines.splice(metaIdx + 1, 0, `${siblingIndent || '  '}version: "${version}"`);
    }
  }

  writeFileSync(filePath, lines.join('\n'), 'utf-8');
  return `normalized: version ${version} -> metadata.version (top-level removed)`;
}

if (import.meta.main) {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: bun normalize-agent-version.ts <agent-md-path>');
    process.exit(1);
  }
  try {
    console.log(normalizeAgentVersion(filePath));
  } catch (err) {
    console.error(`✗ ${(err as Error).message}`);
    process.exit(1);
  }
}
