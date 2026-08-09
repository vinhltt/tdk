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

  it('advertises only current subWorkspaces fields', () => {
    const schema = getSpecifyConfigJsonSchema();
    const schemaProperties = schema.properties as Record<string, JsonObject>;
    const subWorkspaces = schemaProperties.subWorkspaces as JsonObject;
    const item = subWorkspaces.items as JsonObject;
    const properties = item.properties as Record<string, JsonObject>;
    const modules = properties.modules as JsonObject;
    const moduleItem = modules.items as JsonObject;
    const moduleProperties = moduleItem.properties as Record<string, JsonObject>;

    expect(Object.keys(properties).sort()).toEqual(['hasModules', 'modules', 'name', 'path']);
    expect(Object.keys(moduleProperties).sort()).toEqual(['name', 'path']);
    expect(readFileSync(SCHEMA_PATH, 'utf-8')).toBe(getSpecifyConfigJsonSchemaText());

    const exampleConfig = JSON.parse(readFileSync(EXAMPLE_CONFIG_PATH, 'utf-8')) as JsonObject;
    const exampleSubWorkspace = (exampleConfig.subWorkspaces as JsonObject[] | undefined)?.[0];
    expect(exampleSubWorkspace ? Object.keys(exampleSubWorkspace).sort() : []).toEqual([
      'modules',
      'name',
      'path',
    ]);
    const exampleModule = (exampleSubWorkspace?.modules as JsonObject[] | undefined)?.[0];
    expect(exampleModule ? Object.keys(exampleModule).sort() : []).toEqual(['name', 'path']);
  });
});
