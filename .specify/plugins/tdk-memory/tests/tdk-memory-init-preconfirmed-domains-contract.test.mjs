import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';

const TESTS_DIR = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(TESTS_DIR, '..');
const INIT_SKILL_DIR = join(PLUGIN_ROOT, 'skills', 'tdk-memory-init');

const read = (...segments) => readFileSync(join(...segments), 'utf8');

const skill = read(INIT_SKILL_DIR, 'SKILL.md');
const fresh = read(INIT_SKILL_DIR, 'references', 'fresh-init-flow.md');
const rerun = read(INIT_SKILL_DIR, 'references', 're-run-flow.md');
const overviewTemplate = read(INIT_SKILL_DIR, 'references', 'domain-overview-template.md');
const agent = read(PLUGIN_ROOT, 'agents', 'tdk-memory-agent.md');

const OPEN = '===TDK-MEMORY-DOMAIN===';
const CLOSE = '===END-DOMAIN===';
const REQUIRED = ['domain', 'provenance', 'sourceFiles', 'evidence'];
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Section of fresh-init-flow.md that defines the mode (between its heading and Step 3).
const modeSection = fresh.slice(
  fresh.indexOf('## Dispatch: preconfirmed domain mode'),
  fresh.indexOf('## Step 3: Ask for Source Files'),
);
// Section of re-run-flow.md that adapts the re-run steps to the mode.
const rerunSection = rerun.slice(
  rerun.indexOf('## Preconfirmed domain mode'),
  rerun.indexOf('## Step 1: Ask for Source Files for New Domains'),
);

/**
 * Reference implementation of the documented detection rule. The mode is a
 * prompt contract, so this parser pins the rule the prompt text must describe.
 * Returns the parsed blocks for a complete input, or null when the input must
 * fall back to the interactive flow.
 */
function parseDomains(rawArguments) {
  const lines = rawArguments
    .replace(/--allow-external-root/g, '')
    .replace(/--memory-root\s+\S+/g, '')
    .split('\n');
  let i = lines.findIndex((line) => line.trim() !== '');
  if (i === -1 || lines[i].trim() !== OPEN) return null;

  const blocks = [];
  while (i < lines.length) {
    const current = lines[i].trim();
    if (current === '') {
      i += 1;
      continue;
    }
    if (current !== OPEN) return null;
    const close = lines.findIndex((line, j) => j > i && line.trim() === CLOSE);
    if (close === -1) return null;
    const body = lines.slice(i + 1, close);
    if (body.some((line) => line.trim() === OPEN)) return null;

    const fields = {};
    let listKey = null;
    for (const line of body) {
      if (line.trim() === '') continue;
      const item = line.match(/^- (.+)$/);
      if (item) {
        if (listKey !== 'sourceFiles') return null;
        fields.sourceFiles.push(item[1].trim());
        continue;
      }
      const pair = line.match(/^([A-Za-z]+):\s*(.*)$/);
      if (!pair) return null;
      const [, key, value] = pair;
      if (!REQUIRED.includes(key) || key in fields) return null;
      if (key === 'sourceFiles') {
        if (value.trim() !== '') return null;
        fields.sourceFiles = [];
        listKey = 'sourceFiles';
      } else {
        fields[key] = value.trim();
        listKey = null;
      }
    }

    if (!REQUIRED.every((key) => key in fields)) return null;
    if (!KEBAB.test(fields.domain)) return null;
    if (!['inferred', 'confirmed'].includes(fields.provenance)) return null;
    if (!fields.sourceFiles.length || fields.sourceFiles.some((path) => path === '')) return null;
    if (fields.evidence === '') return null;
    blocks.push(fields);
    i = close + 1;
  }

  const names = blocks.map((block) => block.domain);
  if (new Set(names).size !== names.length) return null;
  return blocks;
}

function domainBlock({
  domain = 'sample-billing',
  provenance = 'inferred',
  sourceFiles = ['docs/sample/billing-overview.md'],
  evidence = 'Billing issues invoices and tracks payment status.',
  omit = [],
  extra = [],
} = {}) {
  const lines = [OPEN];
  if (!omit.includes('domain')) lines.push(`domain: ${domain}`);
  if (!omit.includes('provenance')) lines.push(`provenance: ${provenance}`);
  if (!omit.includes('sourceFiles')) {
    lines.push('sourceFiles:');
    for (const path of sourceFiles) lines.push(`- ${path}`);
  }
  if (!omit.includes('evidence')) lines.push(`evidence: ${evidence}`);
  lines.push(...extra, CLOSE);
  return lines.join('\n');
}

describe('tdk-memory-init preconfirmed domain mode', () => {
  test('documents the exact block and completeness rule in SKILL.md and fresh-init-flow.md', () => {
    for (const [name, doc] of [['SKILL.md', skill], ['fresh-init-flow.md', modeSection]]) {
      assert.ok(doc.includes(OPEN), `${name} lacks the opening marker`);
      assert.ok(doc.includes(CLOSE), `${name} lacks the closing marker`);
      for (const field of REQUIRED) assert.match(doc, new RegExp(`\\b${field}\\b`), `${name} lacks ${field}`);
      assert.match(doc, /inferred\|confirmed|`inferred` or `confirmed`/, `${name} lacks the provenance values`);
      assert.match(doc, /unknown or\s+duplicate key/, `${name} lacks the strict-key rule`);
      assert.match(doc, /first\s+non-blank/, `${name} lacks the position rule`);
    }
    assert.match(skill, /When `--ensure-templates` is absent/);
    assert.match(modeSection, /`--ensure-templates` stops first,\s+then this mode, then\s+the interactive Steps 2–8/);
    assert.match(modeSection, /no domain appears in two blocks/);
    assert.match(modeSection, /do not normalize an\s+unsafe name into a different one/);
    // The numbered rule states every line shape the reference parser accepts.
    assert.match(modeSection, /every non-blank line between\s+the markers is `key: value` for one of the four keys/);
    assert.match(modeSection, /no\s+opening marker appears inside a block/);
    assert.match(skill, /no other\s+line than those keys and the `- <path>` lines under `sourceFiles:`/);
    // The mode is known before Step 1, so Step 1 stops never fall back to a question.
    assert.match(modeSection, /Detect this mode before Step 1, from `\$ARGUMENTS` alone/);
    assert.match(skill, /In preconfirmed domain mode, every stop in this step ends with\s+`Result: error: <reason>` instead of a question/);
  });

  test('the documented example is complete and the rule rejects each gap', () => {
    const example = modeSection.match(/```text\n(===TDK-MEMORY-DOMAIN===[\s\S]*?===END-DOMAIN===)\n```/);
    assert.ok(example, 'fresh-init-flow.md must carry a literal example block');
    assert.ok(parseDomains(example[1]), 'documented example must be complete');

    assert.equal(parseDomains(domainBlock()).length, 1, 'one complete block is detected');
    assert.equal(
      parseDomains(`${domainBlock()}\n\n${domainBlock({ domain: 'sample-orders' })}\n`).length,
      2,
      'consecutive blocks separated by blank lines are detected',
    );
    assert.ok(parseDomains(`--memory-root memory --allow-external-root\n${domainBlock()}`), 'flags may precede the blocks');
    assert.ok(parseDomains(domainBlock({ provenance: 'confirmed' })), 'confirmed provenance is allowed');
    assert.ok(
      parseDomains(domainBlock({ sourceFiles: ['docs/sample/a.md', 'src/sample/README.md'] })),
      'several source files are allowed',
    );

    for (const field of REQUIRED) {
      assert.equal(parseDomains(domainBlock({ omit: [field] })), null, `missing ${field} must not be preconfirmed`);
    }
    assert.equal(parseDomains(domainBlock({ extra: ['domain: sample-orders'] })), null, 'duplicate key');
    assert.equal(parseDomains(domainBlock({ extra: ['owner: sample-team'] })), null, 'unknown key');
    assert.equal(parseDomains(domainBlock({ provenance: 'guessed' })), null, 'invalid provenance');
    assert.equal(parseDomains(domainBlock({ extra: ['and a second evidence line'] })), null, 'multi-line evidence');
    assert.equal(
      parseDomains(domainBlock().replace('sourceFiles:\n- ', 'sourceFiles: ')),
      null,
      'inline sourceFiles value',
    );
    assert.equal(parseDomains(domainBlock({ extra: [OPEN] })), null, 'opening marker inside a block');
    assert.equal(parseDomains(domainBlock({ evidence: '' })), null, 'blank evidence');
    assert.equal(parseDomains(domainBlock({ sourceFiles: [] })), null, 'empty sourceFiles');
    for (const unsafe of ['_x', 'a/b', '.', '..', 'Sample-Billing', 'sample billing']) {
      assert.equal(parseDomains(domainBlock({ domain: unsafe })), null, `unsafe domain name ${unsafe}`);
    }
    assert.equal(parseDomains(`Please add these:\n${domainBlock()}`), null, 'prose before the blocks');
    assert.equal(
      parseDomains(`${domainBlock()}\nand this one:\n${domainBlock({ domain: 'sample-orders' })}`),
      null,
      'prose between blocks',
    );
    assert.equal(parseDomains(`${domainBlock()}\nthanks.\n`), null, 'text after the last block');
    assert.equal(parseDomains(`${domainBlock()}\n${domainBlock()}`), null, 'a domain repeated across blocks');
    assert.equal(parseDomains(`${domainBlock()}\n${domainBlock({ omit: ['evidence'] })}`), null, 'one incomplete block');
    assert.equal(parseDomains('Initialize memory with billing and orders domains.'), null, 'natural language');

    assert.match(modeSection, /Anything else[\s\S]*is NOT preconfirmed[\s\S]*interactive flow\s+exactly as written/);
    assert.match(skill, /Any gap in any block runs the interactive flow unchanged/);
  });

  test('a complete input runs without prompts and skips the interactive confirmations', () => {
    assert.match(modeSection, /no\s+`AskUserQuestion` anywhere in this mode except the external-root write consent/);
    assert.match(modeSection, /Take only the pattern lists from that file; none of its Inform or Ask steps\s+apply in this mode/);
    assert.match(modeSection, /Steps 2 and 3 skipped/);
    assert.match(modeSection, /no Domains exist guard and no force re-init/);
    assert.match(modeSection, /no Domain\s+Source Files prompt/);
    assert.match(modeSection, /`sourceFiles` are provenance only/);
    assert.match(skill, /`sourceFiles` are provenance\s+only and are never read/);
    assert.match(rerunSection, /No `AskUserQuestion` anywhere in this mode except\s+that external-root write consent/);
    assert.match(rerunSection, /Step 1 skipped/);
  });

  test('the path is chosen from the resolve status before any write, not from domains/', () => {
    assert.match(modeSection, /Decide from the `resolve` JSON of Step 1, which runs before any write/);
    assert.match(modeSection, /Never decide\s+from the files after Step 1/);
    assert.match(modeSection, /`status: uninitialized`, or `error: root-missing` with a non-null `root` \(a fresh\s+root\): run Steps 4–8/);
    assert.match(modeSection, /`status: ready`: run `references\/re-run-flow\.md` \("Preconfirmed domain mode"\)/);
    assert.match(modeSection, /any other `error`, including `memory-incomplete`: end with\s+`Result: error: <error>` and write nothing/);
    assert.match(rerunSection, /when the `resolve` JSON of Step 1 reports `status: ready`/);
    assert.match(skill, /`uninitialized` \(or\s+`error: root-missing` with a non-null `root`\) takes the fresh path, `ready` takes the re-run path/);
    assert.match(modeSection, /Check each block\s+in this order and stop at the first match: present, path check, redaction/);
    assert.match(modeSection, /no blank value other than the bare `sourceFiles:` line/);
    assert.match(modeSection, /`sourceFiles:` takes\s+no inline value/);
    // A domain is present by its overview or by an existing Domain Map row, on both paths.
    assert.match(modeSection, /present when `domains\/\{domain\}\/domain-overview\.md` exists or the\s+`resolve` JSON lists it in `domains`/);
    // Nothing is written after Step 1 unless at least one block domain is written.
    assert.match(modeSection, /Run the path check and redaction below for every block before the first write after\s+Step 1/);
    assert.match(modeSection, /When no block domain is left to write or index \(each is listed by the\s+`resolve` JSON or has an error\), write nothing after Step 1/);
    // An overview left without a Domain Map row is indexed, never rewritten.
    assert.match(modeSection, /A present domain that the `resolve` JSON does not\s+list is unindexed/);
    assert.match(modeSection, /its overview\s+stays byte-identical, but the index steps still list it/);
  });

  test('the re-run path only adds index rows and keeps every other line', () => {
    assert.match(rerunSection, /Step 4 only adds rows/);
    assert.match(rerunSection, /keep every existing line of `memory-index\.md`\s+byte-identical/);
    assert.match(rerunSection, /including arc42, decision and other typed rows/);
    assert.match(rerunSection, /except the\s+`Binding coverage:` line/);
    assert.match(rerunSection, /Recount both\s+`Binding coverage:` numbers from the\s+filesystem/);
    assert.match(rerunSection, /Result: already present <domain>` and writes nothing/);
    assert.match(rerunSection, /when every block domain is listed by the `resolve`\s+JSON or has an error, skip Steps 2–5 and the canvas/);
    assert.match(rerunSection, /Append one Domain Map row per new or unindexed domain/);
    assert.match(rerunSection, /for an\s+unindexed domain, of its overview's Description paragraph/);
    assert.match(rerunSection, /an\s+unindexed one still gets its index row and section in Step 4, its canvas node\s+and its Step 5 receipt/);
    assert.match(rerunSection, /regenerate `memory-map\.canvas` with the fresh path's\s+Step 6\.5 from every domain under `domains\/` that has a `domain-overview\.md`/);
    assert.match(rerunSection, /The node order \(`index` in Step 6\.5\) is the Domain Map order of the updated\s+`memory-index\.md`/);
    assert.match(rerunSection, /records the regenerated `memory-map\.canvas`\s+receipt/);
    assert.match(rerunSection, /`memory-index\.md: \{N\} rows added` instead of\s+`regenerated`, where `\{N\}` is the\s+number of rows added/);
    assert.match(rerunSection, /memory-map\.canvas receipt recorded/);
    assert.match(rerunSection, /check that `memory-index\.md` has both\s+`## Domain Map` and `## Files by Domain`; otherwise end with\s+`Result: error: memory-index-sections-missing` and write nothing/);
    // The interactive re-run still rebuilds the whole index.
    assert.match(rerun, /## Step 4: Regenerate memory-index\.md \(full\)/);
  });

  test('block fields replace the skipped extraction and evidence is redacted', () => {
    assert.match(modeSection, /`\{scope-summary-from-step-3\}` is the first sentence of `evidence`,\s+cut to 120 characters/);
    assert.match(rerunSection, /`\{scope-summary-from-step-1\}` as the first sentence of `evidence` \(for an\s+unindexed domain, of its overview's Description paragraph\) cut to 120\s+characters/);
    assert.match(modeSection, /"content extracted in Step 3" is the block's `evidence` and\s+`sourceFiles`/);
    assert.match(modeSection, /report `extracted via preconfirmed block`/);
    assert.match(modeSection, /evidence\s+snippet redaction in `references\/domain-extraction-and-confirmation\.md`/);
    assert.match(modeSection, /`error: <domain>: evidence redacted` and writes nothing/);
    assert.match(modeSection, /Path Restriction Guard/);
    assert.match(modeSection, /`error: <domain>: invalid path <path>`; the other domains continue/);
    assert.match(modeSection, /an absolute path \(starting\s+with `\/`, `\\`, `~` or a drive letter such as `C:`\)/);
    assert.match(modeSection, /The Description paragraph is `evidence` verbatim/);
    assert.match(modeSection, /with `\|` escaped as `\\\|`/);
  });

  test('ends with one Result line per domain and keeps external-root consent', () => {
    assert.match(modeSection, /Result: written <domain> \| Result: already present <domain> \| Result: error: <domain>: <reason>/);
    assert.match(modeSection, /stops the whole run \(script error, external-root consent\) prints a\s+single `Result: error: <reason>` line/);
    assert.match(skill, /`Result: written <domain>`, `Result: already present <domain>`, or\s+`Result: error: <domain>: <reason>`/);
    assert.match(modeSection, /replaces the STOP-and-ask rule of the interactive flow/);
    assert.match(modeSection, /a preflight, script, template, write or checksum failure ends with/);
    assert.match(modeSection, /never delete files already written, but list them in the report/);
    assert.match(modeSection, /When it cannot ask or the user declines/);
    assert.match(skill, /preconfirmed domain mode instead ends with\s+`Result: error: <reason>` and never prompts/);
    assert.match(modeSection, /Write consent for an external root is unchanged \(contract section 2\)/);
    assert.match(modeSection, /`Result: error: external-root-consent-required — <memory\.path as configured>`/);
  });

  test('records provenance in the domain overview', () => {
    assert.match(overviewTemplate, /_Generated by tdk-memory-init \(provenance: \{provenance\}\) from: \{source-file path \| "text description"\}_/);
    assert.match(overviewTemplate, /`\{provenance\}` = `confirmed` when the user confirmed the domain in the interactive flow/);
    assert.match(overviewTemplate, /the block's `provenance` \(`inferred` or `confirmed`\)/);
    // Provenance is prose only; the binding authority fields stay as before.
    assert.match(overviewTemplate, /^authority: memory$/m);
    assert.match(overviewTemplate, /^binding: true$/m);
    assert.match(overviewTemplate, /^status: active$/m);
  });

  test('adds no flag, keeps the interactive prompts and stays separate from other blocks', () => {
    assert.match(skill, /No flag enables it and\s+the default flow is unchanged/);
    assert.doesNotMatch(skill, /--preconfirm/i);
    assert.match(fresh, /Header: "Domain Source Files"/);
    assert.match(skill, /Header: "Memory Already Initialized"/);
    assert.match(rerun, /Header: "Add Domains - Source Files"/);
    assert.match(modeSection, /NOT\s+the `===TDK-MEMORY-CONTROL===` header/);
    assert.match(skill, /nor the `===TDK-MEMORY-CANDIDATE===` block of `tdk-memory-update`/);
    assert.doesNotMatch(agent, /TDK-MEMORY-DOMAIN/);
  });

  test('release 4.5.1 indexes an overview an interrupted run left behind', () => {
    const changelog = read(PLUGIN_ROOT, 'CHANGELOG.md');
    const release = /## \[4\.5\.1\][\s\S]*?(?=\n## \[)/.exec(changelog);
    assert.ok(release, '4.5.1 section');
    assert.match(release[0], /### Fixed[\s\S]*Domain Map/);
  });

  test('release 4.5.0 documents the mode', () => {
    const changelog = read(PLUGIN_ROOT, 'CHANGELOG.md');
    const release = /## \[4\.5\.0\][\s\S]*?(?=\n## \[)/.exec(changelog);
    assert.ok(release, '4.5.0 section');
    assert.match(release[0], /### Added[\s\S]*===TDK-MEMORY-DOMAIN===/);
    assert.match(release[0], /provenance/);
  });
});
