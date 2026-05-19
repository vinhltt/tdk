// Splits a repomix pack into per-file blocks. Supports two delimiter formats:
//
//  1) Markdown style (repomix v1.x default): a single `## File: <path>` line,
//     followed by a fenced ```lang\n...\n``` body block.
//  2) Legacy / plain style: a `={2,}\nFile: <path>\n={2,}\n` envelope.
//
// We unify both into FileBlock { path, body } where `body` has the fence stripped.

import type { FileBlock } from './types';

const MD_HEADER_RE = /^## File: (.+)$/gm;
const EQ_HEADER_RE = /^={2,}\nFile: (.+?)\n={2,}\n?/gm;

interface HeaderMatch {
  path: string;
  bodyStart: number;
  headerStart: number;
}

export function splitPack(content: string): FileBlock[] {
  const headers = collectHeaders(content);
  if (headers.length === 0) return [];

  // Sort by header position; cap each block at the next header start.
  headers.sort((a, b) => a.headerStart - b.headerStart);

  const blocks: FileBlock[] = [];
  for (let i = 0; i < headers.length; i++) {
    const cur = headers[i];
    const next = headers[i + 1];
    if (!cur || !cur.path) continue;
    const end = next ? next.headerStart : content.length;
    const raw = content.slice(cur.bodyStart, end);
    blocks.push({ path: cur.path, body: stripFencedBody(raw) });
  }
  return blocks;
}

function collectHeaders(content: string): HeaderMatch[] {
  const headers: HeaderMatch[] = [];

  for (const m of content.matchAll(MD_HEADER_RE)) {
    if (m.index === undefined) continue;
    headers.push({
      path: (m[1] ?? '').trim(),
      headerStart: m.index,
      bodyStart: m.index + m[0].length + 1, // +1 to skip trailing newline
    });
  }
  for (const m of content.matchAll(EQ_HEADER_RE)) {
    if (m.index === undefined) continue;
    headers.push({
      path: (m[1] ?? '').trim(),
      headerStart: m.index,
      bodyStart: m.index + m[0].length,
    });
  }
  return headers;
}

// Strip ONE leading fenced block (```lang\n ... \n```) if present at the body's start.
// Trailing whitespace before the next header is trimmed too.
function stripFencedBody(raw: string): string {
  const lines = raw.split('\n');
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

  if (lines.length >= 2) {
    const first = (lines[0] ?? '').trimStart();
    if (/^```[\w-]*$/.test(first)) {
      // Find the matching closing fence (prefer the LAST line if it's ```).
      const last = lines[lines.length - 1] ?? '';
      if (last.trim() === '```') {
        return lines.slice(1, -1).join('\n');
      }
      // Fenced open without close at end (rare): drop just the opener.
      return lines.slice(1).join('\n');
    }
  }
  return lines.join('\n');
}
