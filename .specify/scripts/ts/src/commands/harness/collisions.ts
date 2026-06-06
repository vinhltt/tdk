import type { Collision, RequiredPrompt } from './types';

function promptKey(kind: Collision['kind'], pathValue: string | undefined): string {
  return `${kind}\0${pathValue ?? ''}`;
}

function promptKind(prompt: RequiredPrompt): Collision['kind'] {
  if (prompt.type === 'managed-drift-overwrite') return 'managed-drift';
  if (prompt.type === 'unmanaged-stale-hooks-json-cleanup') return 'unmanaged-stale-hooks-json';
  return 'unmanaged-target-exists';
}

export function isPromptableCollision(collision: Collision, prompts: RequiredPrompt[]): boolean {
  const promptKeys = new Set(prompts.map((prompt) => promptKey(promptKind(prompt), prompt.path)));
  return promptKeys.has(promptKey(collision.kind, collision.path));
}

export function blockingCollisions(collisions: Collision[], prompts: RequiredPrompt[]): Collision[] {
  return collisions.filter((collision) => !isPromptableCollision(collision, prompts));
}
