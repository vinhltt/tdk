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

export function codexSkillRoot(name: string): string {
  return posixTargetPath('.agents', 'skills', toCodexSlug(name));
}

export function codexSkillTarget(name: string, skillRelativePath: string): string {
  return posixTargetPath(codexSkillRoot(name), skillRelativePath);
}
