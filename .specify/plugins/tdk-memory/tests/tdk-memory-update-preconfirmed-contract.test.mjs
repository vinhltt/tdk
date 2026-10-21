import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';

const TESTS_DIR = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(TESTS_DIR, '..');
const UPDATE_SKILL_DIR = join(PLUGIN_ROOT, 'skills', 'tdk-memory-update');

const read = (...segments) => readFileSync(join(...segments), 'utf8');

const skill = read(UPDATE_SKILL_DIR, 'SKILL.md');
const flow = read(UPDATE_SKILL_DIR, 'references', 'flow-update.md');
const domainSourceFlow = read(UPDATE_SKILL_DIR, 'references', 'domain-source-extraction-flow.md');
const agent = read(PLUGIN_ROOT, 'agents', 'tdk-memory-agent.md');

const OPEN = '===TDK-MEMORY-CANDIDATE===';
const CLOSE = '===END-CANDIDATE===';
const REQUIRED = ['type', 'domain', 'action', 'sourceFiles', 'content'];
const OPTIONAL = ['name'];

// Section of flow-update.md that defines the mode (between its heading and Step 1).
const modeSection = flow.slice(
  flow.indexOf('## Dispatch: preconfirmed candidate mode'),
  flow.indexOf('## Step 1: Guard checks'),
);

/**
 * Reference implementation of the documented detection rule. The mode is a
 * prompt contract, so this parser pins the rule the prompt text must describe.
 */
function parseCandidate(rawArguments) {
  const lines = rawArguments
    .replace(/--allow-external-root/g, '')
    .replace(/--memory-root\s+\S+/g, '')
    .split('\n');
  const first = lines.findIndex((line) => line.trim() !== '');
  if (first === -1 || lines[first].trim() !== OPEN) return null;

  const closers = lines.reduce((all, line, i) => (line.trim() === CLOSE ? [...all, i] : all), []);
  const openers = lines.filter((line) => line.trim() === OPEN).length;
  if (openers !== 1 || closers.length !== 1) return null;
  const close = closers[0];
  if (lines.slice(close + 1).some((line) => line.trim() !== '')) return null;

  const contentAt = lines.findIndex((line, i) => i > first && line.trim() === 'content:');
  if (contentAt === -1 || contentAt > close) return null;

  const fields = {};
  let listKey = null;
  for (const line of lines.slice(first + 1, contentAt)) {
    if (line.trim() === '') continue;
    const item = line.match(/^- (.+)$/);
    if (item && listKey === 'sourceFiles') {
      fields.sourceFiles.push(item[1].trim());
      continue;
    }
    const pair = line.match(/^([A-Za-z]+):\s*(.*)$/);
    if (!pair) return null;
    const [, key, value] = pair;
    if (![...REQUIRED, ...OPTIONAL].includes(key) || key === 'content' || key in fields) return null;
    if (key === 'sourceFiles') {
      if (value.trim() !== '') return null;
      fields.sourceFiles = [];
      listKey = 'sourceFiles';
    } else {
      fields[key] = value.trim();
      listKey = null;
    }
  }
  fields.content = lines.slice(contentAt + 1, close).join('\n');

  if (!fields.type || !fields.domain || !['merge', 'replace'].includes(fields.action)) return null;
  if (!fields.sourceFiles?.length || fields.sourceFiles.some((p) => p === '')) return null;
  if (fields.content.trim() === '') return null;
  return fields;
}

function candidate({ omit = [], extraHeader = [], before = '', after = '' } = {}) {
  const header = {
    type: 'type: business-rule',
    domain: 'domain: sample-billing',
    action: 'action: merge',
    sourceFiles: 'sourceFiles:\n- specs/sample/close-out.md',
  };
  const lines = [OPEN];
  for (const key of ['type', 'domain', 'action', 'sourceFiles']) {
    if (!omit.includes(key)) lines.push(header[key]);
  }
  lines.push(...extraHeader);
  if (!omit.includes('content')) lines.push('content:', 'Invoices above the credit limit require approval.');
  lines.push(CLOSE);
  return `${before}${lines.join('\n')}\n${after}`;
}

describe('tdk-memory-update preconfirmed candidate mode', () => {
  test('documents the exact block and completeness rule in SKILL.md and flow-update.md', () => {
    for (const [name, doc] of [['SKILL.md', skill], ['flow-update.md', flow]]) {
      assert.ok(doc.includes(OPEN), `${name} lacks the opening marker`);
      assert.ok(doc.includes(CLOSE), `${name} lacks the closing marker`);
      for (const field of REQUIRED) assert.match(doc, new RegExp(`\\b${field}\\b`), `${name} lacks ${field}`);
      assert.match(doc, /merge\|replace|`merge` or `replace`/, `${name} lacks the action values`);
      assert.match(doc, /unknown or\s+duplicate (header )?key/, `${name} lacks the strict-key rule`);
      assert.match(doc, /first\s+non-blank/, `${name} lacks the position rule`);
    }
    assert.match(skill, /neither `--deprecate` nor `--finalize-written`/);
    assert.match(modeSection, /`--deprecate`, then\s+`--finalize-written`, then this mode/);
  });

  test('the documented example is a complete candidate and the rule rejects each gap', () => {
    const example = modeSection.match(/```text\n(===TDK-MEMORY-CANDIDATE===[\s\S]*?===END-CANDIDATE===)\n```/);
    assert.ok(example, 'flow-update.md must carry a literal example block');
    assert.ok(parseCandidate(example[1]), 'documented example must be complete');

    assert.ok(parseCandidate(candidate()), 'complete candidate is detected');
    assert.ok(parseCandidate(candidate({ extraHeader: ['name: invoice-approval'] })), 'optional name is allowed');
    assert.ok(parseCandidate(`--memory-root memory\n${candidate()}`), 'flags may precede the block');
  });

  test('new-file enrichment runs in candidate mode without a prompt', () => {
    assert.match(modeSection, /new-file enrichment with block IDs and\s+wikilinks/);
    assert.match(modeSection, /Step 5\.1 runs without a\s+prompt whenever Step 5 creates a new file/);
    const enrichment = flow.slice(
      flow.indexOf('## Step 5.1 '),
      flow.indexOf('## Step 5.2 '),
    );
    assert.ok(enrichment.length > 0, 'Step 5.1 section exists');
    assert.doesNotMatch(enrichment, /AskUserQuestion/);
  });

  test('complete candidate runs without prompts and skips the interactive confirmations', () => {
    assert.match(modeSection, /no `AskUserQuestion` anywhere in this mode/);
    assert.match(modeSection, /Step 2\.5 skipped/);
    assert.match(modeSection, /No Domain Source\s+Files prompt/);
    assert.match(modeSection, /no domain confirm or mismatch check/);
    assert.match(modeSection, /Step 4\.5 skipped/);
    assert.match(modeSection, /Run Steps 1, 3, 5, 5\.1, 5\.2, 6 and 7 unchanged/);
    assert.match(modeSection, /memory-index\.md/);
    assert.match(modeSection, /`memory\.yaml`\s+checksums/);
    assert.match(modeSection, /Result: written \| already present \| error: <reason>/);
  });

  test('any missing or invalid field falls back to the unchanged interactive flow', () => {
    for (const field of REQUIRED) {
      assert.equal(parseCandidate(candidate({ omit: [field] })), null, `missing ${field} must not be preconfirmed`);
    }
    assert.equal(parseCandidate(candidate({ extraHeader: ['action: skip'] })), null, 'duplicate action key');
    assert.equal(parseCandidate(candidate().replace('action: merge', 'action: append')), null, 'invalid action');
    assert.equal(parseCandidate(candidate({ extraHeader: ['extra: 1'] })), null, 'unknown key');
    assert.equal(parseCandidate(candidate().replace('- specs/sample/close-out.md\n', '')), null, 'empty sourceFiles');
    assert.equal(parseCandidate(candidate({ before: 'Please record this:\n' })), null, 'prose before block');
    assert.equal(parseCandidate(candidate({ after: 'and also this.\n' })), null, 'text after block');
    assert.equal(parseCandidate(`${candidate()}${candidate()}`), null, 'two blocks');
    assert.equal(parseCandidate('Add a service to the sample domain.'), null, 'natural language');

    assert.match(modeSection, /Anything else[\s\S]*is NOT preconfirmed[\s\S]*interactive flow below exactly as written/);
    assert.match(modeSection, /Natural-language callers and manual use keep every\s+confirmation/);
    // The interactive steps and prompts are still present and unchanged.
    assert.match(flow, /## Step 4\.5: Merge vs Replace \(domain-level updates only\)/);
    assert.match(flow, /"Is this a new feature extending the domain, or replacing existing logic\?"/);
    assert.match(flow, /Options: A\) Merge \(additive\) \| B\) Replace \(overwrite affected entries\)/);
    assert.match(domainSourceFlow, /Header: "Domain Source Files"/);
    assert.match(domainSourceFlow, /AskUserQuestion/);
    assert.match(flow, /\*\*If ambiguous:\*\* AskUserQuestion to clarify content type and\/or domain\./);
    // No new flag and no default change.
    assert.doesNotMatch(skill, /--preconfirm/i);
    assert.match(skill, /No flag enables it and the default flow is\s+unchanged/);
  });

  test('action decides merge versus replace', () => {
    assert.ok(parseCandidate(candidate().replace('action: merge', 'action: replace')));
    assert.match(modeSection, /`action` decides/);
    assert.match(modeSection, /`merge` follows the additive strategy/);
    assert.match(modeSection, /`replace` swaps the existing entry/);
    assert.match(modeSection, /without a\s+confirmation/);
    assert.match(modeSection, /no matching entry appends/);
    assert.match(modeSection, /error: ambiguous replace target/);
  });

  test('an identical entry is a no-op reported as already present', () => {
    assert.match(modeSection, /Idempotency \(before Step 5\)/);
    assert.match(modeSection, /make no write, no index regeneration and no `memory\.yaml` change/);
    assert.match(modeSection, /result is `already present`/);
    assert.match(skill, /An entry already in the target section is a no-op/);
    assert.match(skill, /Result: already present/);
  });

  test('unknown domain returns an error result without prompting', () => {
    assert.match(modeSection, /error: unknown domain\s+\{name\}/);
    assert.match(modeSection, /writes nothing/);
    assert.match(skill, /Result: error: <reason>/);
    assert.match(skill, /unknown domain/);
  });

  test('uninitialised memory returns an error result without prompting', () => {
    assert.match(modeSection, /`memory-index\.md` or `memory\.yaml` missing in Step 1 is\s+`error: memory not initialised`/);
    assert.match(modeSection, /Do not prompt, retry or partially\s+write/);
    assert.match(skill, /memory not initialised/);
    // The interactive guard it replaces is unchanged.
    assert.match(flow, /Either missing → STOP: "Run \/tdk-memory-init first\."/);
  });

  test('stays separate from the read-only agent control header', () => {
    assert.match(modeSection, /NOT the `===TDK-MEMORY-CONTROL===` header/);
    assert.doesNotMatch(agent, /TDK-MEMORY-CANDIDATE/);
    assert.match(agent, /===TDK-MEMORY-CONTROL===/);
  });

  test('release metadata is 4.1.1 across manifests and the update skill', () => {
    for (const manifest of ['.claude-plugin', '.codex-plugin', '.cursor-plugin']) {
      const { version } = JSON.parse(read(PLUGIN_ROOT, manifest, 'plugin.json'));
      assert.equal(version, '4.1.1', `${manifest} version`);
    }
    assert.match(skill, /^metadata:\r?\n  version: 4\.1\.1$/m);
    assert.match(read(PLUGIN_ROOT, 'CHANGELOG.md'), /^## \[4\.1\.1\] - 2026-10-21$/m);
  });
});
