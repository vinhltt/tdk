// Thin CLI wrapper around auto-gen-markers parse/splice for Bash-invocable use by tdk-docs-writer agent.
// Usage:
//   bun src/lib/auto-gen-markers-cli.ts parse <file>
//     → stdout: JSON array of AutoGenSection (without bodyStartLineIdx/bodyEndLineIdx)
//   bun src/lib/auto-gen-markers-cli.ts splice <file> <replacements.json>
//     → stdout: JSON { content, warnings }
// Errors → stderr + exit 1.

import { readFileSync } from 'node:fs';
import { parseAutoGenSections, spliceAutoGenSections } from './auto-gen-markers';

function fail(msg: string): never {
  process.stderr.write(`auto-gen-markers-cli: ${msg}\n`);
  process.exit(1);
}

function main(argv: string[]): void {
  const [, , cmd, ...rest] = argv;
  if (cmd === 'parse') {
    const file = rest[0];
    if (!file) fail('parse: <file> argument required');
    const content = readFileSync(file, 'utf-8');
    const sections = parseAutoGenSections(content).map(s => ({
      id: s.id,
      sources: s.sources,
      instruction: s.instruction,
      body: s.body,
      startLine: s.startLine,
      endLine: s.endLine,
    }));
    process.stdout.write(`${JSON.stringify(sections)}\n`);
    return;
  }
  if (cmd === 'splice') {
    const [file, replacementsPath] = rest;
    if (!file || !replacementsPath) {
      fail('splice: <file> <replacements.json> arguments required');
    }
    const content = readFileSync(file, 'utf-8');
    const raw = readFileSync(replacementsPath, 'utf-8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      fail(`splice: replacements file is not valid JSON (${replacementsPath})`);
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      fail('splice: replacements must be a JSON object { id: body, ... }');
    }
    const map = new Map<string, string>();
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v !== 'string') fail(`splice: replacement for "${k}" must be a string`);
      map.set(k, v as string);
    }
    const result = spliceAutoGenSections(content, map);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  fail(`unknown command "${cmd ?? ''}". Use: parse | splice`);
}

if (import.meta.main) main(process.argv);
