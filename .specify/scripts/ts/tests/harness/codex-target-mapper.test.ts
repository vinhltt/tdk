import { describe, expect, test } from 'bun:test';
import {
  codexAgentTarget,
  codexConfigTarget,
  codexHookFileTarget,
  codexHooksJsonTarget,
  codexHookWrapperTarget,
  codexSkillRoot,
  codexSkillTarget,
  isCodexInternalSkillEntrypoint,
} from '../../src/commands/harness/codex-target-mapper';

describe('codex target mapper', () => {
  test('maps core Codex files to stable target roots', () => {
    expect(codexAgentTarget('reviewer.toml')).toBe('.codex/agents/reviewer.toml');
    expect(codexConfigTarget()).toBe('.codex/config.toml');
    expect(codexHooksJsonTarget()).toBe('.codex/hooks.json');
  });

  test('maps hook files and generated wrappers under .codex/hooks', () => {
    expect(codexHookFileTarget('privacy/block.cjs')).toBe('.codex/hooks/privacy/block.cjs');
    expect(codexHookFileTarget('privacy\\block.cjs')).toBe('.codex/hooks/privacy/block.cjs');
    expect(codexHookWrapperTarget('abc123-hook.cjs')).toBe('.codex/hooks/wrappers/abc123-hook.cjs');
  });

  test('maps Codex skills through slugged .agents skill roots', () => {
    expect(codexSkillRoot('Plan Work')).toBe('.agents/skills/plan-work');
    expect(codexSkillTarget('Plan Work', 'nested\\README.md')).toBe('.agents/skills/plan-work/nested/README.md');
  });

  test('preserves leading underscore for internal shared skill assets', () => {
    expect(codexSkillRoot('_shared')).toBe('.agents/skills/_shared');
    expect(codexSkillTarget('_shared', 'retro-feedback-schema.md')).toBe('.agents/skills/_shared/retro-feedback-schema.md');
    expect(isCodexInternalSkillEntrypoint('_shared', 'SKILL.md')).toBe(true);
    expect(isCodexInternalSkillEntrypoint('_shared', 'retro-feedback-schema.md')).toBe(false);
  });
});
