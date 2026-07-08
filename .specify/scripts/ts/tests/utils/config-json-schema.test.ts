import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Ajv from 'ajv';
import {
  getSpecifyConfigJsonSchema,
  getSpecifyConfigJsonSchemaText,
  type JsonObject,
} from '../../src/utils/config-json-schema';

const SCHEMA_PATH = resolve(import.meta.dir, '../../../../schemas/specify.schema.json');
const TDK_CONFIG_PATH = resolve(import.meta.dir, '../../../../.specify.json');
const EXAMPLE_CONFIG_PATH = resolve(import.meta.dir, '../../../../.specify.json.example');

function createValidator() {
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(getSpecifyConfigJsonSchema());
  return (config: JsonObject) => ({
    valid: validate(config),
    errors: validate.errors,
  });
}

describe('config-json-schema.test.ts', () => {
  it('matches the committed schema artifact', () => {
    const committed = readFileSync(SCHEMA_PATH, 'utf-8');
    expect(committed).toBe(getSpecifyConfigJsonSchemaText());
  });

  it('validates minimal config', () => {
    const validate = createValidator();
    const result = validate({ name: 'minimal-workspace' });
    expect(result.valid).toBe(true);
    expect(result.errors).toBeNull();
  });

  it('validates current TDK config', () => {
    const validate = createValidator();
    const config = JSON.parse(readFileSync(TDK_CONFIG_PATH, 'utf-8')) as JsonObject;
    const result = validate(config);
    expect(result.valid).toBe(true);
    expect(result.errors).toBeNull();
  });

  it('validates rules.path config and tolerates unknown top-level keys', () => {
    const validate = createValidator();
    const result = validate({
      name: 'rules-workspace',
      rules: { path: '.specify/rules' },
      pluginOwnedKey: true,
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toBeNull();
  });

  it('does not advertise removed subWorkspaces testMapping field', () => {
    expect(getSpecifyConfigJsonSchemaText()).not.toContain('"testMapping"');
    expect(readFileSync(SCHEMA_PATH, 'utf-8')).not.toContain('"testMapping"');
    expect(readFileSync(EXAMPLE_CONFIG_PATH, 'utf-8')).not.toContain('"testMapping"');
  });
});
