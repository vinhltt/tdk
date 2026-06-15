import { toCodexSlug } from '../../lib/harness-transform';

export interface CodexPrefixSettings {
  sourcePrefix: string;
  targetPrefix: string;
}

function stripTrailingDash(value: string): string {
  return value.endsWith('-') ? value.slice(0, -1) : value;
}

export function rewriteHyphenPrefix(value: string, settings: CodexPrefixSettings): string {
  if (settings.sourcePrefix === settings.targetPrefix) return value;
  return value.startsWith(settings.sourcePrefix)
    ? `${settings.targetPrefix}${value.slice(settings.sourcePrefix.length)}`
    : value;
}

export function rewriteCodexSlugPrefix(value: string, settings: CodexPrefixSettings): string {
  if (settings.sourcePrefix === settings.targetPrefix) return value;
  const sourceSlugPrefix = `${toCodexSlug(stripTrailingDash(settings.sourcePrefix))}_`;
  const targetSlugPrefix = `${toCodexSlug(stripTrailingDash(settings.targetPrefix))}_`;
  return value.startsWith(sourceSlugPrefix)
    ? `${targetSlugPrefix}${value.slice(sourceSlugPrefix.length)}`
    : value;
}

export function rewriteCodexGeneratedText(value: string, settings: CodexPrefixSettings): string {
  if (settings.sourcePrefix === settings.targetPrefix) return value;
  const sourceSlugPrefix = `${toCodexSlug(stripTrailingDash(settings.sourcePrefix))}_`;
  const targetSlugPrefix = `${toCodexSlug(stripTrailingDash(settings.targetPrefix))}_`;
  return value
    .split(settings.sourcePrefix).join(settings.targetPrefix)
    .split(sourceSlugPrefix).join(targetSlugPrefix);
}
