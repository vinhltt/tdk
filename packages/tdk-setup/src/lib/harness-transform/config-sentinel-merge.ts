export interface ConfigSentinelSpec {
  start: string;
  end: string;
  label: string;
}

export interface ConfigSentinelMergeResult {
  content: string;
  unmanagedContent: string;
  warnings: string[];
  error?: string;
}

interface SentinelBlock {
  start: number;
  end: number;
  payload: string;
}

function detectLineEnding(content: string): '\n' | '\r\n' {
  return content.includes('\r\n') ? '\r\n' : '\n';
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sentinelBlocks(content: string, spec: ConfigSentinelSpec): { blocks: SentinelBlock[]; malformed: boolean } {
  const startLine = new RegExp(`^${escapeRegExp(spec.start)}[ \\t]*$`, 'gm');
  const endLine = new RegExp(`^${escapeRegExp(spec.end)}[ \\t]*$`, 'gm');
  const starts = [...content.matchAll(startLine)];
  const ends = [...content.matchAll(endLine)];
  if (starts.length !== ends.length) return { blocks: [], malformed: true };

  const blockPattern = new RegExp(
    `^${escapeRegExp(spec.start)}[ \\t]*\\r?\\n([\\s\\S]*?)\\r?\\n^${escapeRegExp(spec.end)}[ \\t]*(?:\\r?\\n)?`,
    'gm',
  );
  const matches = [...content.matchAll(blockPattern)];
  if (matches.length !== starts.length) return { blocks: [], malformed: true };

  return {
    blocks: matches.map((match) => ({
      start: match.index,
      end: match.index + match[0].length,
      payload: match[1] ?? '',
    })),
    malformed: false,
  };
}

export function stripConfigSentinelBlocks(
  content: string,
  spec: ConfigSentinelSpec,
): { content: string; payloads: string[]; malformed: boolean } {
  const parsed = sentinelBlocks(content, spec);
  if (parsed.malformed) return { content, payloads: [], malformed: true };

  let stripped = content;
  for (const block of [...parsed.blocks].reverse()) {
    let start = block.start;
    let end = block.end;
    let installerSeparatorLength = 0;
    if (start > 0 && stripped.slice(0, start).endsWith('\r\n')) installerSeparatorLength = 2;
    else if (start > 0 && stripped[start - 1] === '\n') installerSeparatorLength = 1;
    start -= installerSeparatorLength;

    const following = stripped.slice(end);
    const followingManagedSeparator = following.match(/^(?:\r\n|\n)(?=# --- tdk-managed-)/)?.[0];
    if (followingManagedSeparator) end += followingManagedSeparator.length;

    const trailingLineEndingLength = stripped.slice(start, block.end).endsWith('\r\n')
      ? 2
      : stripped.slice(start, block.end).endsWith('\n')
        ? 1
        : 0;
    const hasUserPrefix = start > 0;
    const hasUserSuffix = following.length > 0 && followingManagedSeparator === undefined;
    const userPrefixEndsWithLineEnding = stripped[start - 1] === '\n';
    if (hasUserPrefix && hasUserSuffix && !userPrefixEndsWithLineEnding && trailingLineEndingLength > 0) {
      end -= trailingLineEndingLength;
    }
    stripped = `${stripped.slice(0, start)}${stripped.slice(end)}`;
  }
  return { content: stripped, payloads: parsed.blocks.map((block) => block.payload), malformed: false };
}

export function extractConfigSentinelPayload(content: string, spec: ConfigSentinelSpec): string | undefined {
  const parsed = sentinelBlocks(content, spec);
  if (parsed.malformed || parsed.blocks.length !== 1) return undefined;
  return parsed.blocks[0]?.payload;
}

export function mergeConfigSentinelBlock(
  existing: string,
  managedBlock: string,
  spec: ConfigSentinelSpec,
): ConfigSentinelMergeResult {
  const stripped = stripConfigSentinelBlocks(existing, spec);
  const warnings: string[] = [];
  if (stripped.malformed) {
    return {
      content: existing,
      unmanagedContent: existing,
      warnings,
      error: `Malformed ${spec.label} sentinels`,
    };
  }
  if (stripped.payloads.length > 1) {
    warnings.push(`Found ${stripped.payloads.length} ${spec.label} blocks; collapsing into one`);
  }

  const normalized = managedBlock.trim();
  if (!normalized) {
    return { content: stripped.content, unmanagedContent: stripped.content, warnings };
  }

  const lineEnding = detectLineEnding(existing);
  const payload = normalized.replace(/\r?\n/g, lineEnding);
  const separator = stripped.content ? lineEnding : '';
  return {
    content: `${stripped.content}${separator}${spec.start}${lineEnding}${payload}${lineEnding}${spec.end}${lineEnding}`,
    unmanagedContent: stripped.content,
    warnings,
  };
}
