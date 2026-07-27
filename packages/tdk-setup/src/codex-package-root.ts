import * as path from 'node:path';
import { validateSafeSegment } from './install-settings-paths';

/**
 * Derives the Codex package root for a given plugin in a consumer repo.
 * The package root is `.specify/codex-plugins/<plugin>/` — a generated-on-demand
 * Codex artifact tree materialized beside the Claude source tree.
 *
 * Reused by: emitter write-base, install reader source-base,
 * discovery mapping, tree-adapter freshness check.
 *
 * Contract: pluginName MUST pass validateSafeSegment before path join.
 */
export function codexPackageRoot(consumerRoot: string, pluginName: string): string {
  validateSafeSegment(pluginName, 'plugin id');
  return path.join(consumerRoot, '.specify', 'codex-plugins', pluginName);
}
