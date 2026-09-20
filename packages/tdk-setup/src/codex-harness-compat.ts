import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Codex harness capability preflight.
 *
 * A generated Codex wrapper exports `TDK_HARNESS=codex` into the hook it runs.
 * An installed `harness-payload.cjs` without a `codex` dispatch throws on that
 * value, and `destructive-command-block.cjs` catches the throw and returns 0 —
 * which means *allow*. So a wrapper that labels codex must never be emitted
 * against a lib that cannot dispatch it, and the refusal has to happen before
 * the first filesystem write.
 *
 * The probe reads the dispatch surface of the file it will actually run
 * against. A version string would pass on a repackaged old lib.
 */

export const HARNESS_PAYLOAD_RELATIVE_PATH = 'lib/harness-payload.cjs';

export type CodexHarnessCompatReason =
  | 'missing-harness-payload'
  | 'no-codex-dispatch';

export interface CodexHarnessCompat {
  compatible: boolean;
  reason?: CodexHarnessCompatReason;
  message?: string;
}

export interface CodexHarnessCompatInput {
  /** Hook sources that will run under a generated wrapper. */
  hookSources: Array<{ path: string; content: Buffer | string }>;
  /** Installed `harness-payload.cjs` contents, or `null` when the file is absent. */
  harnessPayload: Buffer | string | null | undefined;
  /** Where the lib was looked for, quoted in the rejection message. */
  harnessPayloadPath: string;
}

const CODEX_DISPATCH = /case\s*(['"`])codex\1\s*:/;
const REQUIRES_LOADER = /harness-payload/;
const REMEDY = 'Upgrade the installed tdk-core plugin to a version whose lib/harness-payload.cjs dispatches the codex harness, then re-run this conversion.';

/**
 * Capability probe over the contents of an installed `harness-payload.cjs`.
 * `null` (file absent) and "present without codex dispatch" are distinct
 * rejections, because they need different remedies.
 */
export function probeCodexHarnessSupport(
  source: Buffer | string | null | undefined,
  harnessPayloadPath = HARNESS_PAYLOAD_RELATIVE_PATH,
): CodexHarnessCompat {
  if (source === null || source === undefined) {
    return {
      compatible: false,
      reason: 'missing-harness-payload',
      message: `Codex harness preflight failed: ${harnessPayloadPath} not found, but the hooks being converted require it. ${REMEDY}`,
    };
  }
  const text = typeof source === 'string' ? source : source.toString('utf-8');
  if (!CODEX_DISPATCH.test(text)) {
    return {
      compatible: false,
      reason: 'no-codex-dispatch',
      message: `Codex harness preflight failed: ${harnessPayloadPath} has no "codex" dispatch, so a codex-labelled wrapper would disable the destructive-command block. ${REMEDY}`,
    };
  }
  return { compatible: true };
}

/**
 * Full preflight: the probe only applies to hook sets that actually load the
 * harness payload contract. Hooks that never call `loadPayloadHarness` cannot
 * be broken by the codex label.
 */
export function checkCodexHarnessCompat(input: CodexHarnessCompatInput): CodexHarnessCompat {
  const requiresLoader = input.hookSources.some((source) => REQUIRES_LOADER.test(
    typeof source.content === 'string' ? source.content : source.content.toString('utf-8'),
  ));
  if (!requiresLoader) return { compatible: true };
  return probeCodexHarnessSupport(input.harnessPayload, input.harnessPayloadPath);
}

/** Throws before any write when the installed lib cannot dispatch codex. */
export function assertCodexHarnessCompat(input: CodexHarnessCompatInput, label: string): void {
  const result = checkCodexHarnessCompat(input);
  if (result.compatible) return;
  throw new Error(`${label}: ${result.message}`);
}

/** Reads an installed `harness-payload.cjs`, returning `null` when absent. */
export function readInstalledHarnessPayload(libDir: string): Buffer | null {
  try {
    return fs.readFileSync(path.join(libDir, 'harness-payload.cjs'));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}
