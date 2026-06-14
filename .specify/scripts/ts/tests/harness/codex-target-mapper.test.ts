import { describe, expect, test } from 'bun:test';
import {
  codexAgentTarget,
  codexConfigTarget,
  codexHookFileTarget,
  codexHooksJsonTarget,
  codexHookWrapperTarget,
  codexSkillRoot,
  codexSkillTarget,
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
    expect(codexSkillRoot('Plan Work')).toBe('.agents/skills/plan_work');
    expect(codexSkillTarget('Plan Work', 'nested\\README.md')).toBe('.agents/skills/plan_work/nested/README.md');
  });
});
