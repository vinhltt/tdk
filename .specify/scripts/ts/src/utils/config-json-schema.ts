import { zodToJsonSchema } from 'zod-to-json-schema';
import { SpecifyConfigSchema } from './types';

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

const ORDERED_KEYS = [
  '$schema',
  '$id',
  'title',
  'description',
  'type',
  'required',
  'properties',
  'items',
  'anyOf',
  'enum',
  'default',
  'additionalProperties',
  'definitions',
];

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stripRejectUnknownProperties(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(stripRejectUnknownProperties);
  }

  if (!isJsonObject(value)) {
    return value;
  }

  const next: JsonObject = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === 'additionalProperties' && child === false) {
      continue;
    }
    next[key] = stripRejectUnknownProperties(child);
  }
  return next;
}

function sortJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }

  if (!isJsonObject(value)) {
    return value;
  }

  const keys = Object.keys(value).sort((a, b) => {
    const aIndex = ORDERED_KEYS.indexOf(a);
    const bIndex = ORDERED_KEYS.indexOf(b);
    if (aIndex !== -1 || bIndex !== -1) {
      return (aIndex === -1 ? ORDERED_KEYS.length : aIndex) - (bIndex === -1 ? ORDERED_KEYS.length : bIndex);
    }
    return a.localeCompare(b);
  });

  const sorted: JsonObject = {};
  for (const key of keys) {
    sorted[key] = sortJson(value[key] as JsonValue);
  }
  return sorted;
}

export function getSpecifyConfigJsonSchema(): JsonObject {
  const generated = zodToJsonSchema(SpecifyConfigSchema, {
    target: 'jsonSchema7',
    $refStrategy: 'none',
  }) as JsonObject;

  const schema: JsonObject = {
    ...generated,
    '$schema': 'http://json-schema.org/draft-07/schema#',
    '$id': 'https://raw.githubusercontent.com/vinhltt/tdk/main/.specify/schemas/specify.schema.json',
    title: 'TDK .specify.json',
    description: 'Editor-facing JSON Schema for TDK workspace configuration.',
  };

  return sortJson(stripRejectUnknownProperties(schema)) as JsonObject;
}

export function getSpecifyConfigJsonSchemaText(): string {
  return `${JSON.stringify(getSpecifyConfigJsonSchema(), null, 2)}\n`;
}
