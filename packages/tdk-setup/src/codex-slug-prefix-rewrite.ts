import { toCodexSlug } from './lib/harness-transform';

export interface CodexPrefixSettings {
  sourcePrefix: string;
  targetPrefix: string;
}

function stripTrailingDash(value: string): string {
  return value.endsWith('-') ? value.slice(0, -1) : value;
}

function kebabSlugPrefix(value: string): string {
  return `${toCodexSlug(stripTrailingDash(value))}-`;
}

function legacyUnderscoreSlugPrefix(value: string): string {
  return `${toCodexSlug(stripTrailingDash(value))}_`;
}

export function rewriteHyphenPrefix(value: string, settings: CodexPrefixSettings): string {
  if (settings.sourcePrefix === settings.targetPrefix) return value;
  return value.startsWith(settings.sourcePrefix)
    ? `${settings.targetPrefix}${value.slice(settings.sourcePrefix.length)}`
    : value;
}

export function rewriteCodexSlugPrefix(value: string, settings: CodexPrefixSettings): string {
  if (settings.sourcePrefix === settings.targetPrefix) return value;
  const sourceKebabPrefix = kebabSlugPrefix(settings.sourcePrefix);
  const targetKebabPrefix = kebabSlugPrefix(settings.targetPrefix);
  const sourceLegacyPrefix = legacyUnderscoreSlugPrefix(settings.sourcePrefix);
  if (value.startsWith(sourceKebabPrefix)) {
    return `${targetKebabPrefix}${value.slice(sourceKebabPrefix.length)}`;
  }
  return value.startsWith(sourceLegacyPrefix)
    ? `${targetKebabPrefix}${value.slice(sourceLegacyPrefix.length)}`
    : value;
}

export function rewriteCodexGeneratedText(value: string, settings: CodexPrefixSettings): string {
  if (settings.sourcePrefix === settings.targetPrefix) return value;
  const sourceLegacyPrefix = legacyUnderscoreSlugPrefix(settings.sourcePrefix);
  const targetKebabPrefix = kebabSlugPrefix(settings.targetPrefix);
  return value
    .split(settings.sourcePrefix).join(settings.targetPrefix)
    .split(sourceLegacyPrefix).join(targetKebabPrefix);
}
