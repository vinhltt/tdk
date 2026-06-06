#!/usr/bin/env bun
// CLI utility to read or write a field in a JSON file using dot-notation paths.
//
// Usage:
//   bun json-field.ts get <file> <path>            → print value as string
//   bun json-field.ts get <file> <path> --json     → print value as JSON
//   bun json-field.ts set <file> <path> <value>    → update field in-place
//
// Examples:
//   bun json-field.ts get .claude-plugin/marketplace.json metadata.version
//   bun json-field.ts set .claude-plugin/marketplace.json metadata.version 1.34.0

import * as fs from "node:fs";
import { parseArgs } from "node:util";
import { writeAgentJson } from "./agent-output";

const { positionals, values } = parseArgs({
  args: Bun.argv.slice(2),
  options: { json: { type: "boolean", default: false } },
  allowPositionals: true,
});

const [command, filePath, dotPath, newValue] = positionals;

if (!command || !filePath || !dotPath) {
  console.error("Usage: json-field.ts get|set <file> <dot.path> [value]");
  process.exit(1);
}

const raw = fs.readFileSync(filePath, "utf-8");
const data = JSON.parse(raw);
const keys = dotPath.split(".");

function getNestedValue(obj: unknown, keys: string[]): unknown {
  return keys.reduce((acc, key) => (acc as Record<string, unknown>)?.[key], obj);
}

function setNestedValue(obj: Record<string, unknown>, keys: string[], value: string): void {
  const last = keys.at(-1)!;
  const parent = keys.slice(0, -1).reduce((acc, key) => {
    if (!(acc as Record<string, unknown>)[key]) (acc as Record<string, unknown>)[key] = {};
    return (acc as Record<string, unknown>)[key];
  }, obj as unknown) as Record<string, unknown>;
  parent[last] = value;
}

if (command === "get") {
  const val = getNestedValue(data, keys);
  if (val === undefined) { console.error(`Field "${dotPath}" not found`); process.exit(1); }
  if (values.json) {
    writeAgentJson(val);
  } else {
    console.log(String(val));
  }
} else if (command === "set") {
  if (newValue === undefined) { console.error("Missing value for set"); process.exit(1); }
  setNestedValue(data, keys, newValue);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
} else {
  console.error(`Unknown command: ${command}`);
  process.exit(1);
}
