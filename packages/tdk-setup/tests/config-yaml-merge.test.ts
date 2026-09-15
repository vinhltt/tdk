import { describe, expect, test } from 'bun:test';
import { mergeConfigTomlWithDiagnostics } from '../src/lib/harness-transform/config-toml-merge';
import {
  extractOmpManagedPayload,
  mergeConfigYaml,
  OMP_SENTINEL_END,
  OMP_SENTINEL_START,
} from '../src/lib/harness-transform/config-yaml-merge';

describe('config sentinel merge', () => {
  test('preserves CRLF user bytes and trailing newlines across an idempotent YAML merge', () => {
    const existing = 'modelRoleStorage: project\r\n\r\n\r\n';
    const managed = 'tools:\n  approval:\n    read: allow';

    const first = mergeConfigYaml(existing, managed);
    const second = mergeConfigYaml(first.content, managed);

    expect(first.error).toBeUndefined();
    expect(first.unmanagedContent).toBe(existing);
    expect(first.content).toContain(`${OMP_SENTINEL_START}\r\n`);
    expect(first.content).toContain(`\r\n${OMP_SENTINEL_END}\r\n`);
    expect(extractOmpManagedPayload(first.content)).toBe('tools:\r\n  approval:\r\n    read: allow');
    expect(second).toEqual(first);
  });

  test('preserves a user file without a terminal newline and strips an empty managed block exactly', () => {
    const existing = 'modelRoles:\n  default: user/model';
    const merged = mergeConfigYaml(existing, 'defaultThinkingLevel: high');
    const stripped = mergeConfigYaml(merged.content, '');

    expect(merged.unmanagedContent).toBe(existing);
    expect(stripped.error).toBeUndefined();
    expect(stripped.content).toBe(existing);
    expect(stripped.unmanagedContent).toBe(existing);
    expect(extractOmpManagedPayload(stripped.content)).toBeUndefined();
  });

  test('keeps a line boundary when stripping sentinels between user prefix and suffix', () => {
    const yamlOriginal = 'userPrefix: true';
    const yamlMerged = mergeConfigYaml(yamlOriginal, 'defaultThinkingLevel: high');
    const yamlWithSuffix = `${yamlMerged.content}userSuffix: true`;
    const tomlOriginal = 'user_prefix = true';
    const tomlMerged = mergeConfigTomlWithDiagnostics(tomlOriginal, '[agents.reviewer]\ndescription = "Review"');
    const tomlWithSuffix = `${tomlMerged.content}user_suffix = true`;

    expect(mergeConfigYaml(yamlWithSuffix, '').content).toBe(`${yamlOriginal}\nuserSuffix: true`);
    expect(mergeConfigTomlWithDiagnostics(tomlWithSuffix, '').content).toBe(`${tomlOriginal}\nuser_suffix = true`);
  });

  test('does not add a blank line when stripping a CRLF-managed block between user content', () => {
    const yamlOriginal = 'userPrefix: true\r\n';
    const yamlMerged = mergeConfigYaml(yamlOriginal, 'defaultThinkingLevel: high');
    const yamlWithSuffix = `${yamlMerged.content}userSuffix: true\r\n`;

    expect(mergeConfigYaml(yamlWithSuffix, '').content).toBe(`${yamlOriginal}userSuffix: true\r\n`);
  });

  test('rejects duplicate ownership roots and malformed user YAML without returning mutated content', () => {
    const duplicate = mergeConfigYaml('tools:\n  approval: {}\n', 'tools:\n  approval:\n    read: allow');
    const malformed = mergeConfigYaml('tools: [\n', 'defaultThinkingLevel: high');


    expect(duplicate.content).toBe('tools:\n  approval: {}\n');
    expect(duplicate.error).toMatch(/ownership conflict.*tools/);
    expect(malformed.content).toBe('tools: [\n');
    expect(malformed.error).toMatch(/invalid user YAML/i);
  });
  test('rejects an explicit YAML document end that would strand the appended managed block', () => {
    const existing = 'retry:\n  enabled: true\n...\n';
    const result = mergeConfigYaml(existing, 'defaultThinkingLevel: high');

    expect(result.content).toBe(existing);
    expect(result.error).toMatch(/invalid merged YAML/i);
  });

  test('keeps the Codex TOML wrapper byte-preserving and idempotent', () => {
    const existing = '[features]\r\nuser_flag = true\r\n\r\n';
    const managed = '[agents.reviewer]\ndescription = "Review"';

    const first = mergeConfigTomlWithDiagnostics(existing, managed);
    const second = mergeConfigTomlWithDiagnostics(first.content, managed);

    expect(first.error).toBeUndefined();
    expect(first.unmanagedContent).toBe(existing);
    expect(second.content).toBe(first.content);
    expect(second.unmanagedContent).toBe(existing);
  });
});
