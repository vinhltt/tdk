import { toCodexSlug } from '../../lib/harness-transform/codex-slug';
import { posixTargetPath } from './target-relative-path';

export function codexAgentTarget(filename: string): string {
  return posixTargetPath('.codex', 'agents', filename);
}

export function codexConfigTarget(): string {
  return posixTargetPath('.codex', 'config.toml');
}

export function codexHooksJsonTarget(): string {
  return posixTargetPath('.codex', 'hooks.json');
}

export function codexHookFileTarget(hookRelativePath: string): string {
  return posixTargetPath('.codex', 'hooks', hookRelativePath);
}

export function codexHookWrapperTarget(filename: string): string {
  return posixTargetPath('.codex', 'hooks', 'wrappers', filename);
}

export function codexLibTarget(libRelativePath: string): string {
  return posixTargetPath('.codex', 'lib', libRelativePath);
}

export function isCodexInternalSkillName(name: string): boolean {
  return name.startsWith('_');
}

export function isCodexInternalSkillEntrypoint(name: string, skillRelativePath: string): boolean {
  return isCodexInternalSkillName(name) && skillRelativePath.replace(/\\/g, '/') === 'SKILL.md';
}

function codexSkillSlug(name: string): string {
  if (!isCodexInternalSkillName(name)) return toCodexSlug(name);
  return `_${toCodexSlug(name.slice(1))}`;
}

export function codexSkillRoot(name: string): string {
  return posixTargetPath('.agents', 'skills', codexSkillSlug(name));
}

export function codexSkillTarget(name: string, skillRelativePath: string): string {
  return posixTargetPath(codexSkillRoot(name), skillRelativePath);
}
