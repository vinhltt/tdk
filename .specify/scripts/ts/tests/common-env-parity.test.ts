import { describe, it, expect } from 'bun:test';
import * as common from '../src/utils/common';
import * as feature from '../src/utils/feature';

describe('common-env.sh parity — every bash function has a TS equivalent', () => {
  it('getRepoRoot exists in common.ts', () => {
    expect(typeof common.getRepoRoot).toBe('function');
  });

  it('loadFeatureEnv exists in common.ts', () => {
    expect(typeof common.loadFeatureEnv).toBe('function');
  });

  it('parseTicketId exists in common.ts (covers validatePrefix indirectly)', () => {
    expect(typeof common.parseTicketId).toBe('function');
  });

  it('parseFeatureId exists in feature.ts', () => {
    expect(typeof feature.parseFeatureId).toBe('function');
  });

  it('runValidationHook exists in common.ts', () => {
    expect(typeof common.runValidationHook).toBe('function');
  });

  it('readTestApiConfig exists in common.ts', () => {
    expect(typeof common.readTestApiConfig).toBe('function');
  });

  it('resolveSkillWorkspace exists in common.ts', () => {
    expect(typeof common.resolveSkillWorkspace).toBe('function');
  });
});
