// Builds a hierarchical tree from flat file paths.
// Caps sibling count at 50 (emits `_more: N` summary) and depth at 8.

import type { TreeNode } from './types';

const MAX_DEPTH = 8;
const MAX_SIBLINGS = 50;

export function buildTree(paths: string[]): TreeNode {
  const root: TreeNode = {};
  for (const p of paths) {
    if (!p) continue;
    const parts = p.split('/').filter(Boolean);
    insertPath(root, parts, 0);
  }
  return summarize(root) as TreeNode;
}

function insertPath(node: TreeNode, parts: string[], depth: number): void {
  if (parts.length === 0) return;
  if (depth >= MAX_DEPTH) {
    const bucket = (node['__truncated__'] as string[] | undefined) ?? [];
    bucket.push(parts.join('/'));
    node['__truncated__'] = bucket;
    return;
  }
  const head = parts[0];
  if (head === undefined) return;

  if (parts.length === 1) {
    const files = (node['__files__'] as string[] | undefined) ?? [];
    files.push(head);
    node['__files__'] = files;
    return;
  }

  const existing = node[head];
  let child: TreeNode;
  if (existing && !Array.isArray(existing)) {
    child = existing;
  } else {
    child = {};
    node[head] = child;
  }
  insertPath(child, parts.slice(1), depth + 1);
}

// Apply MAX_SIBLINGS cap: collapse overflow into `_more: N` placeholder.
function summarize(node: TreeNode): TreeNode {
  const out: TreeNode = {};
  for (const [k, v] of Object.entries(node)) {
    if (k === '__files__' && Array.isArray(v)) {
      out['__files__'] = v.length > MAX_SIBLINGS
        ? [...v.slice(0, MAX_SIBLINGS), `_more: ${v.length - MAX_SIBLINGS}`]
        : v;
    } else if (k === '__truncated__' && Array.isArray(v)) {
      out[k] = v;
    } else if (!Array.isArray(v)) {
      out[k] = summarize(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}
