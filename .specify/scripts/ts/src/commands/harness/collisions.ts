import type { Collision, RequiredPrompt } from './types';

function promptKey(kind: Collision['kind'], pathValue: string | undefined): string {
  return `${kind}\0${pathValue ?? ''}`;
}

function promptKind(prompt: RequiredPrompt): Collision['kind'] {
  return prompt.type === 'managed-drift-overwrite'
    ? 'managed-drift'
    : 'unmanaged-target-exists';
}

export function isPromptableCollision(collision: Collision, prompts: RequiredPrompt[]): boolean {
  const promptKeys = new Set(prompts.map((prompt) => promptKey(promptKind(prompt), prompt.path)));
  return promptKeys.has(promptKey(collision.kind, collision.path));
}

export function blockingCollisions(collisions: Collision[], prompts: RequiredPrompt[]): Collision[] {
  return collisions.filter((collision) => !isPromptableCollision(collision, prompts));
}
