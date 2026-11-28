import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';

const TESTS_DIR = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(TESTS_DIR, '..');
const SKILLS = join(PLUGIN_ROOT, 'skills');

const read = (...segments) => readFileSync(join(PLUGIN_ROOT, ...segments), 'utf8');

function markdownFiles(directory) {
  const found = [];
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) found.push(...markdownFiles(path));
    else if (name.endsWith('.md')) found.push(path);
  }
  return found;
}

const handshake = read('skills/tdk-memory-query/references/status-handshake.md');
const cliReader = read('skills/tdk-memory-query/references/obsidian-cli-reader.md');
const queryFlow = read('skills/tdk-memory-query/references/flow-query.md');
const querySkill = read('skills/tdk-memory-query/SKILL.md');
const contract = read('skills/tdk-memory-init/references/memory-root-and-asset-contract.md');
const agent = read('agents/tdk-memory-agent.md');
const readme = read('README.md');
const flat = (text) => text.replace(/\s+/g, ' ');

describe('status handshake', () => {
  test('defines the block fields once, in a fixed order', () => {
    const block = /```text\n(===TDK-MEMORY-STATUS===[\s\S]*?===END-STATUS===)\n```/.exec(handshake);
    assert.ok(block, 'status block fence');
    const fields = block[1]
      .split('\n')
      .slice(1, -1)
      .map((line) => line.split(':')[0]);
    assert.deepEqual(fields, [
      'status',
      'root',
      'memory_path',
      'external',
      'reader',
      'reader_fallback',
      'binding_coverage',
      'domains',
      'constitution',
      'warning',
      'error',
    ]);

    const definitions = markdownFiles(PLUGIN_ROOT).filter((file) => /^reader_fallback:/m.test(readFileSync(file, 'utf8')));
    assert.deepEqual(definitions.map((file) => relative(PLUGIN_ROOT, file)), [
      'skills/tdk-memory-query/references/status-handshake.md',
    ]);
  });

  test('lists every error code and the warning codes', () => {
    for (const code of [
      'config-invalid',
      'external-not-allowed',
      'root-missing',
      'ambiguous-default',
      'memory-incomplete',
      'containment',
      'reader-not-installed',
      'reader-not-running',
      'reader-vault-mismatch',
    ]) {
      assert.match(handshake, new RegExp(`\\| \`${code}\` \\|`), code);
    }
    assert.match(handshake, /`absolute-path`/);
    assert.match(handshake, /`legacy-constitution`/);
    assert.match(handshake, /`reader-config-invalid`/);
  });

  test('requires provenance, bounded lifetime, a rerun after loss, and no persisted root', () => {
    assert.match(handshake, /trusts only the single block in the direct output of its own\s+`--status` call/);
    assert.match(handshake, /Several blocks, or a block\s+that does not follow this format, count as `error`/);
    assert.match(handshake, /run `--status` again; never\s+infer a path/);
    assert.match(handshake, /Agents never run\s+`--status`/);
    assert.match(handshake, /Persist `memory_path`[^.]*never `root`/);
    assert.match(handshake, /writes nothing and spawns no agent/);
    assert.match(handshake, /never an\s+absolute path/);
  });

  test('is handled before the query preflight and is the only reference loaded in that mode', () => {
    const statusAt = querySkill.indexOf('## Status mode (`--status`)');
    const preflightAt = querySkill.indexOf('## Memory root resolution');
    assert.ok(statusAt > 0 && statusAt < preflightAt, '--status precedes the preflight');
    assert.match(querySkill, /load only\s+`references\/status-handshake\.md`/);
    assert.match(querySkill, /skips the preflight, the contract, and the query flow/);
    assert.match(querySkill, /`--status` — print the Status Block/);
  });
});

describe('external root contract', () => {
  test('makes resolve the single source for root and permission', () => {
    assert.match(contract, /\*\*Step 1 of every operation\*\*/);
    assert.match(contract, /`<memoryRoot>` is the JSON `root`/);
    assert.match(contract, /never re-derive any of them by comparing\s+paths yourself/);
    assert.match(contract, /External-root permission is present when `external` is `true` and `root` is\s+non-null/);
    assert.match(contract, /`error` is `root-missing` with a non-null `root`: only initialization accepts it/);
    assert.match(contract, /`error` is `memory-incomplete` with a non-null `root`: only `checksum --fix`/);
    assert.match(contract, /`external-not-allowed — <memory\.path as configured>`|STOP with `<code> — <memory\.path as configured>`/);
  });

  test('documents the permission rule resolve implements, with distinct remediation hints', () => {
    assert.match(contract, /`--allow-external-root`, or\s+`memory\.allowExternal: true` with a canonical root equal to the canonical root of\s+`memory\.path`/);
    assert.match(contract, /explicit `--memory-root` naming another external root needs the\s+flag/);
    assert.match(contract, /`enable-allow-external`/);
    assert.match(contract, /`explicit-root-differs`/);
    assert.match(contract, /Do not|never re-derive/);
    assert.match(handshake, /Do not suggest enabling what is already enabled/);
  });

  test('states that a forwarded flag is permission and never consent', () => {
    assert.match(contract, /\*\*Permission is not consent\.\*\*/);
    assert.match(flat(contract), /A flag that a skill forwarded \(because `resolve` reported an external root\) is permission, never consent/);
    assert.match(contract, /a skill called inline by another skill/);
    assert.match(contract, /no\s+`AskUserQuestion`, as in a subagent/);
  });

  test('no longer claims permission is never inferred from configuration', () => {
    for (const file of markdownFiles(PLUGIN_ROOT)) {
      const text = readFileSync(file, 'utf8');
      assert.doesNotMatch(text, /never inferred from configuration/i, relative(PLUGIN_ROOT, file));
      assert.doesNotMatch(text, /Never infer consent from config/i, relative(PLUGIN_ROOT, file));
      assert.doesNotMatch(text, /report external evidence using\s+its canonical absolute path/i, relative(PLUGIN_ROOT, file));
    }
  });

  test('confirms the first write per session and treats ensure-templates on an uninitialized root as init', () => {
    assert.match(contract, /first write to an external root in a\s+session/);
    assert.match(contract, /confirmed once by\s+the session that is running the skill/);
    assert.match(flat(contract), /if unsure it was already asked, for example after context compaction, ask again/);
    assert.match(flat(contract), /STOP with remediation\s+instead of writing/);
    assert.match(contract, /requires `memory\.yaml` for every operation except\s+initialization/);
    assert.match(contract, /including `--ensure-templates` on an external\s+root that is not yet initialized, always confirms first/);
    assert.match(read('skills/tdk-memory-init/references/ensure-template-set.md'), /this run is an initialization/);
    assert.match(flat(read('skills/tdk-memory-init/SKILL.md')), /Initialization of an external\s+root is always confirmed first/);
  });

  test('defines the forwarding rule, validation, worktree base, and portable evidence', () => {
    assert.match(flat(contract), /Append `--allow-external-root` to every later runtime `hash\|validate\|rank\|resolve` call of the operation in that case, and only then/);
    assert.match(contract, /C0 controls \(U\+0000-U\+001F\), DEL\s+and C1 controls \(U\+007F-U\+009F\), U\+2028, U\+2029, backslash/);
    assert.match(contract, /`~` is a literal segment/);
    assert.match(contract, /equal to the filesystem root, to the workspace, or to any ancestor of the\s+workspace is `containment`/);
    assert.match(contract, /sub-workspace that has its own\s+`\.specify\/` below the repository's `\.git`/);
    assert.match(flat(contract), /a hit in `memory\.path` itself, judged by the strict set above, is `config-invalid`; a hit in a resolved location, judged by the narrow set, is `containment`/);
    assert.match(flat(contract), /`&`, `'`, `;`, `\|`, `<`,\s+`>` are fine in a location/);
    assert.match(flat(agent), /`\$`, or `"`, or a backslash when not running on Windows/);
    assert.match(flat(readme), /A memory root equal to the workspace is refused/);
    assert.match(contract, /git worktree list --porcelain/);
    assert.match(contract, /relative to the memory root \(no `\.\.`, no absolute\s+path/);
    assert.match(contract, /Do not use string-prefix checks/);
  });

  test('no longer tells TDK consumers to avoid a custom memory.path', () => {
    assert.doesNotMatch(contract, /TDK consumers keep using/);
    assert.doesNotMatch(contract, /upstream existence gates/);
    assert.doesNotMatch(flat(readme), /do not set `memory\.path` in a TDK workspace/);
    assert.match(flat(readme), /TDK consumers route through `--status`/);
  });

  test('every runtime hash/validate/rank/resolve call forwards the permission flag, except the agent check', () => {
    const callers = [];
    for (const file of markdownFiles(PLUGIN_ROOT)) {
      const relativePath = relative(PLUGIN_ROOT, file);
      if (relativePath === 'README.md' || relativePath === 'agents/tdk-memory-agent.md') continue;
      for (const line of readFileSync(file, 'utf8').split('\n')) {
        if (/memory-manifest\.cjs" (hash|validate|resolve|rank ")/.test(line)) callers.push({ relativePath, line });
      }
    }
    assert.ok(callers.length >= 8, `found ${callers.length} runtime calls`);
    for (const { relativePath, line } of callers) {
      assert.match(line, /--allow-external-root/, `${relativePath}: ${line.trim()}`);
    }
  });

  test('prose-only runtime callers also forward the flag', () => {
    for (const path of [
      'skills/tdk-memory-init/references/re-run-flow.md',
      'skills/tdk-memory-init/references/ensure-template-set.md',
      'skills/tdk-memory-update/references/deprecation-flow.md',
      'skills/tdk-memory-update/references/finalize-written-files.md',
      'skills/tdk-memory-changelog/references/changelog-entry-format-and-change-type-taxonomy.md',
    ]) {
      assert.match(read(path), /--allow-external-root/, path);
    }
    assert.match(read('skills/tdk-memory-update/SKILL.md'), /forward\s+`--allow-external-root` to that nested invocation and to every runtime call/);
    assert.match(read('skills/tdk-memory-update/SKILL.md'), /subagent context without `AskUserQuestion` cannot/);
    assert.match(read('skills/tdk-memory-update/SKILL.md'), /preconfirmed\s+candidate/);
    assert.match(read('skills/tdk-memory-update/SKILL.md'), /external-root-consent-required/);
  });

  test('every skill delegates root and permission to resolve', () => {
    for (const path of [
      'skills/tdk-memory-init/SKILL.md',
      'skills/tdk-memory-update/SKILL.md',
      'skills/tdk-memory-checksum/SKILL.md',
      'skills/tdk-memory-changelog/SKILL.md',
      'skills/tdk-memory-query/SKILL.md',
    ]) {
      const text = read(path);
      assert.match(text, /`?(memory-manifest\.cjs )?resolve`?/, path);
      assert.match(text, /JSON `root`/, path);
      assert.doesNotMatch(text, /for the root `memory\.path` names|canonical (root|path) equal/, path);
    }
  });

  test('nested-call wording passes the flag when the invocation carries it, and checksum stops with a --fix hint', () => {
    for (const path of ['init', 'update', 'checksum', 'changelog', 'query']) {
      const text = flat(read(`skills/tdk-memory-${path}/SKILL.md`));
      assert.doesNotMatch(text, /only if the user typed it/, path);
      assert.match(text, /if present in this invocation's arguments, typed or forwarded/, path);
    }
    assert.match(flat(contract), /whether the user typed it or a parent skill forwarded it/);
    assert.match(flat(read('skills/tdk-memory-checksum/SKILL.md')), /without `--fix`, `memory-incomplete` STOPs with a message suggesting `\/tdk-memory-checksum --fix`/);
  });

  test('changelog uses the memory repository for an external root', () => {
    const changelog = read('skills/tdk-memory-changelog/SKILL.md');
    assert.match(changelog, /git -C "<memoryRoot>" diff --staged --name-status/);
    assert.match(changelog, /rev-parse --show-prefix/);
    assert.match(changelog, /rev-parse --show-toplevel/);
    assert.match(changelog, /git diff --staged --name-status -- "<memoryRoot>\/"/);
  });
});

describe('agent control block', () => {
  test('treats reader as the only optional field and checks external roots through resolve', () => {
    assert.match(agent, /reader: file\|obsidian-cli +# optional; omitted means file/);
    assert.match(agent, /`reader` is the only optional field/);
    assert.match(agent, /any value\s+other than `file` or `obsidian-cli` is a configuration error/);
    assert.match(agent, /only when the caller\s+supplied the field/);
    assert.match(agent, /memory-manifest\.cjs" resolve --memory-root "<memory_root>"`/);
    assert.match(agent, /reject it as a configuration error\s+if it is blank or contains a control character/);
    assert.match(agent, /If `resolve` exits nonzero or prints no JSON, refuse/);
    assert.match(agent, /never add `--allow-external-root`/);
    assert.match(flat(agent), /The one exception is your `rank` call in Step 3\.5: add the flag there only when this `resolve` returned `external: true` with a non-null root/);
    assert.match(flat(contract), /`tdk-memory-agent` never adds the flag to `resolve`; it adds it only to `rank`/);
    assert.match(flat(agent), /`external-not-allowed`, `containment`, or `config-invalid`/);
  });
});

describe('free-text ranking goes through the runtime', () => {
  test('the query flow ranks through a quoted heredoc and never through argv', () => {
    assert.match(queryFlow, /rank "<memoryRoot>" \[--allow-external-root\] <<'TDK_RANK_INPUT'\n\{"terms":\["<query encoded as a JSON string>"\]\}\nTDK_RANK_INPUT$/m);
    assert.match(flat(queryFlow), /without a plugin root, use the sibling `\.\.\/tdk-memory-checksum\/scripts\/memory-manifest\.cjs`/);
    assert.match(flat(queryFlow), /never emit a real line break/);
    assert.match(flat(queryFlow), /only through this quoted heredoc, never into argv or a shell variable/);
    assert.match(flat(queryFlow), /Set CANDIDATE_FILES to `selected`, in that order/);
    assert.match(flat(queryFlow), /STOP with `rank-failed — <memory\.path as configured>` and show the runtime's error line, which never repeats the query\. There is no manual ranking path/);
  });

  test('the documented rank blocks run as printed in a real shell', { skip: process.platform === 'win32' }, () => {
    const bundle = join(SKILLS, 'tdk-memory-checksum/scripts/memory-manifest.cjs');
    const printedBlock = (text, marker) => {
      const block = new RegExp(String.raw`^\`\`\`sh\n(node [^\n]*${marker}[\s\S]*?)^\`\`\`$`, 'm').exec(text);
      assert.ok(block, marker);
      return block[1];
    };
    const runBlock = (script, cwd) => {
      const result = spawnSync('sh', ['-c', script], { cwd, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      return JSON.parse(result.stdout);
    };

    const sandbox = mkdtempSync(join(tmpdir(), 'tdk-memory-rank-block-'));
    try {
      mkdirSync(join(sandbox, 'notes'));
      writeFileSync(join(sandbox, 'notes/alpha.md'), 'plain\n');

      const queryRanking = runBlock(
        printedBlock(queryFlow, 'rank "<memoryRoot>"')
          .replace('$' + '{CLAUDE_PLUGIN_ROOT}', PLUGIN_ROOT)
          .replace('<memoryRoot>', sandbox)
          .replace('[--allow-external-root]', '--allow-external-root')
          .replace('<query encoded as a JSON string>', 'alpha.md'),
        sandbox,
      );
      assert.deepEqual(queryRanking.selected.map((note) => note.path), ['notes/alpha.md']);

      const agentRanking = runBlock(
        printedBlock(agent, 'rank "<memoryRoot>"')
          .replace('<plugin root>', PLUGIN_ROOT)
          .replace('<memoryRoot>', sandbox)
          .replace('--scope "<prefix>" [--scope "<prefix>"]...', '--scope "notes"')
          .replace('[--allow-external-root]', '--allow-external-root')
          .replace('<keyword encoded as a JSON string>', 'alpha'),
        sandbox,
      );
      assert.deepEqual(agentRanking.selected.map((note) => note.path), ['notes/alpha.md']);

      const printed = runBlock(
        printedBlock(cliReader, 'rank --print-term')
          .replace('<runtime>', bundle)
          .replace('<term encoded as a JSON string>', 'Foo Bar'),
        sandbox,
      );
      assert.deepEqual(printed, { term: 'foo bar' });
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  test('a term the search cannot take and an empty ranking both fall back to file nomination', () => {
    assert.match(flat(cliReader), /use file nomination for this query under any `on_unavailable`, because no search ran and so none failed/);
    assert.match(flat(cliReader), /`total: 0` counts as a failed search, so falling back repeats `rank` once without `candidates`/);
    assert.match(flat(agent), /If any keyword prints `\{"term":null\}`, or its search fails and falls back, or the call reports `total: 0`, drop `candidates` for the whole call and record file nomination/);
    assert.match(flat(agent), /one runtime call, repeated only when the Reader section falls back/);
    assert.doesNotMatch(flat(queryFlow), /Rank once/);
  });

  test('hand ranking rules are gone from every prompt', () => {
    for (const [name, text] of Object.entries({ queryFlow, cliReader, agent })) {
      for (const phrase of [/literal body match/, /UTF-8 byte order/, /UTF-8 bytes/, /stands in/, /top five/, /grep for exact keyword/, /Enumerate the complete eligible/]) {
        assert.doesNotMatch(flat(text), phrase, `${name}: ${phrase}`);
      }
    }
  });

  test('the agent ranks over scoped prefixes and reads all of the selection', () => {
    const agentText = flat(agent);
    assert.match(agent, /rank "<memoryRoot>" --scope "<prefix>" \[--scope "<prefix>"\]\.\.\. \[--allow-external-root\] <<'TDK_RANK_INPUT'/);
    assert.match(agentText, /Exact-read all of `selected`, in order, and do not trim it further/);
    assert.match(agentText, /With no relevant prefix, skip the call/);
    assert.match(agentText, /remove a trailing `\/`/);
    assert.match(agentText, /cut one holding a pattern \(`\*`, `\?`, `\{`, `\}`, `\[`, `\]`\) back to the segments before it, so `domains\/\*\/flows` becomes `domains`/);
    assert.match(agentText, /drop one that contains a control character, a backslash, `` ` ``, `\$`, or `"`, or that starts with `-`/);
    assert.match(agentText, /Never pass `data-model`, and never add `constitution\.md` to the scope/);
    assert.match(agentText, /in `load` mode its keywords add no paths and each is named under `## Constraints & Warnings` as `rank failed: <keyword>`/);
    assert.match(agentText, /in `validate` mode a claim whose only route to evidence was this call is `NOT CHECKED`/);
    assert.doesNotMatch(agent, /Scoped (Glob\/)?Grep/);
  });

  test('the CLI reader only nominates, through a normalized term', () => {
    assert.match(cliReader, /rank --print-term <<'TDK_RANK_INPUT'/);
    assert.match(flat(cliReader), /`\{"term":null\}`, as with a question mark or a path in the query, means skip the CLI/);
    assert.doesNotMatch(cliReader, /\^\[\\p\{L\}/);
    assert.match(flat(queryFlow), /a query that falls back calls `rank` without `candidates`/);
  });

  test('the contract describes rank and keeps terms out of argv', () => {
    const text = flat(contract);
    assert.match(text, /`rank "<memoryRoot>" \[--scope <prefix>\]\.\.\. \[--allow-external-root\]` reads `\{"terms":\[\.\.\.\],"candidates":\[\.\.\.\]\}` from stdin/);
    assert.match(text, /they go only through a quoted heredoc, never argv/);
    assert.match(text, /paths and integers, never note contents/);
    assert.match(text, /`rank --print-term` takes exactly one term and no root/);
  });
});

describe('normal mode result footer', () => {
  test('prints integrity and coverage after the files read line', () => {
    assert.match(queryFlow, /Files read: \{N\} \| Domains: \{list\} \| Content type: \{type\}\nIntegrity: \{clean, or: N changed, M untracked, K missing, U unsafe, index ok\|mismatch, templates T, or: no manifest\}\nCoverage: \{binding_coverage\}\n/);
  });

  test('reads every value from the preflight without another command', () => {
    for (const row of [
      '| N changed | `mismatches` |',
      '| M untracked | `missing_from_manifest` |',
      '| K missing | `missing_from_disk` |',
      '| U unsafe | `unsafe_paths` |',
      '| index ok or mismatch | `index_mismatch` |',
      '| templates T | `templates_mismatches` |',
    ]) {
      assert.ok(queryFlow.includes(row), row);
    }
    assert.match(flat(queryFlow), /they cost no extra command/);
    assert.match(flat(queryFlow), /`binding_coverage` from `resolve`, copied as is, including `unknown` and `n\/a`/);
    assert.match(flat(querySkill), /Keep that JSON until the render step, whose `Integrity:` line reads it/);
  });

  test('never claims clean without the data for it', () => {
    assert.match(flat(queryFlow), /Print `clean` only when every count is 0 and the index is ok/);
    assert.match(flat(queryFlow), /`legacy_receipts` does not count/);
    assert.match(flat(queryFlow), /print `Integrity: no manifest`, run nothing extra, and never infer `clean`/);
    assert.match(flat(queryFlow), /manifest integrity only, not screen completeness/);
  });

  test('a free-text result also names its candidate count', () => {
    assert.match(flat(queryFlow), /print `Candidates: \{selected\} of \{total\}` from the `rank` output, next to any `reader:` line/);
  });

  test('the agent envelope stays free of the footer', () => {
    const agentMode = queryFlow.slice(queryFlow.indexOf('**Agent mode** (`--for-agent` flag):'));
    assert.doesNotMatch(agentMode, /^Integrity:/m);
    assert.doesNotMatch(agentMode, /^Coverage:/m);
  });
});

describe('obsidian cli reader', () => {
  const section = (title) => {
    const found = new RegExp(`## ${title}\\n([\\s\\S]*?)(?=\\n## |$)`).exec(cliReader);
    assert.ok(found, title);
    return found[1];
  };

  test('no document still refuses the backend with the removed error code', () => {
    for (const file of markdownFiles(PLUGIN_ROOT)) {
      const relativePath = relative(PLUGIN_ROOT, file);
      if (relativePath === 'CHANGELOG.md') continue;
      assert.doesNotMatch(readFileSync(file, 'utf8'), /unsupported-reader/, relativePath);
    }
  });

  test('every load point keys on the runtime JSON, never on the config key', () => {
    assert.doesNotMatch(flat(querySkill), /memory\.reader\.backend/);
    assert.match(flat(querySkill), /only when the runtime JSON reports `reader: obsidian-cli` and `status: ready`/);
    assert.match(flat(queryFlow), /\(relative to this skill, not the memory root\)/);
    assert.match(flat(agent), /check your own `resolve` first\. If its JSON does not report `reader: obsidian-cli`/);
  });

  test('defines the term and the reader line for each caller', () => {
    const nominate = flat(section('Nominate'));
    assert.match(nominate, /The term is the whole query for `tdk-memory-query`, the same text the file flow ranks, and one keyword or evidence phrase at a time for the agent/);
    assert.match(nominate, /The agent's own free-text evidence step reaches it; its `tdk-memory-query --for-agent` calls do not/);
    assert.match(flat(cliReader), /`tdk-memory-agent` skips Probe/);
    assert.match(flat(section('Record the reader')), /A Probe that falls back in `tdk-memory-query` counts as file nomination, and that result also prints `warning: reader-<reason>`/);
  });

  test('a file reader never loads the reference or reaches the CLI', () => {
    assert.match(flat(handshake), /Only when JSON `reader` is `obsidian-cli` and `status` is `ready`, load `references\/obsidian-cli-reader\.md`/);
    assert.match(flat(handshake), /including `reader: file`, skips this step and never touches the CLI/);
    assert.match(flat(queryFlow), /With `reader: file` skip this bullet and load nothing/);
    assert.match(flat(agent), /With `reader: file` or no `reader`, never touch the Obsidian CLI and never load its reference/);
    assert.match(flat(contract), /`reader: file` never touches the CLI/);
  });

  test('confines the CLI to nomination', () => {
    assert.match(flat(cliReader), /Never use it for writes, checksums, changelogs, index regeneration, exact `id` or path resolution, typed data-model resolution, or evidence verification/);
    assert.match(flat(contract), /\*\*Forbidden for the CLI:\*\* writes, checksum, changelog, index regeneration, exact `id` or path resolution, typed data-model resolution, and evidence verification/);
    assert.match(flat(queryFlow), /Only when this is not a `--for-agent` call and `resolve` reports `reader: obsidian-cli`/);
    assert.match(flat(section('Nominate')), /Typed queries, `--domain`, `--type`, `--for-agent` calls, and known paths never reach this section/);
    assert.match(flat(agent), /Typed entities, `tdk-memory-query` calls, exact-path reads, and evidence verification stay file-based/);
  });

  test('the probe runs binary, then vault, then root comparison, and names one reason each', () => {
    const probe = section('Probe');
    const steps = ['Locate the binary. Reason: `not-installed`', 'vault info=path', '-ef "<root>"', 'Read the last line'];
    const positions = steps.map((step) => probe.indexOf(step));
    assert.ok(positions.every((position) => position >= 0), positions.join());
    assert.deepEqual(positions, [...positions].sort((left, right) => left - right));
    assert.match(flat(probe), /`unknown-vault`: reason `vault-mismatch`\. `failed`, more than one line, or any other payload that is not an absolute path: reason `not-running`/);
    assert.match(flat(probe), /`same` passes, and `different` is reason `vault-mismatch`/);
  });

  test('the probe snippet compares directories rather than path strings', { skip: process.platform === 'win32' || spawnSync('timeout', ['1', 'true']).error !== undefined }, () => {
    const block = /```sh\n(\s*vault_path=[\s\S]*?)```/.exec(section('Probe'));
    assert.ok(block, 'probe snippet');
    const sandbox = mkdtempSync(join(tmpdir(), 'tdk-memory-probe-'));
    try {
      const stub = join(sandbox, 'stub-cli');
      writeFileSync(stub, '#!/bin/sh\nprintf \'%s\\n\' "$STUB_PAYLOAD"\n');
      chmodSync(stub, 0o755);
      const root = join(sandbox, 'vault');
      const other = join(sandbox, 'other');
      const link = join(sandbox, 'link-to-vault');
      mkdirSync(root);
      mkdirSync(other);
      symlinkSync(root, link);
      const snippet = block[1].replaceAll('<binary>', stub).replaceAll('<vault>', 'vault-name').replaceAll('<root>', root);
      const probe = (payload) => {
        const result = spawnSync('sh', ['-c', snippet], {
          encoding: 'utf8',
          env: { PATH: process.env.PATH, STUB_PAYLOAD: payload },
        });
        assert.equal(result.status, 0, result.stderr);
        const lines = result.stdout.trim().split('\n');
        return { payload: lines[0], verdict: lines.at(-1) };
      };

      assert.deepEqual(probe(root), { payload: `payload: ${root}`, verdict: 'same' });
      assert.deepEqual(probe(link), { payload: `payload: ${link}`, verdict: 'same' });
      assert.deepEqual(probe(other), { payload: `payload: ${other}`, verdict: 'different' });
      assert.deepEqual(probe(''), { payload: 'payload: ', verdict: 'different' });
      assert.deepEqual(probe('Vault not found.'), { payload: 'payload: Vault not found.', verdict: 'different' });
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  test('the probe canonicalizes only a payload shaped like an absolute path', () => {
    const block = /case "\$vault_path" in[\s\S]*?\n\s*esac/.exec(section('Probe'));
    assert.ok(block, 'probe case block');
    const canonicalize = (payload) => spawnSync('sh', ['-c', block[0]], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH, vault_path: payload },
    }).stdout;
    for (const notAPath of ['', 'Error: vault closed', 'No matches found.', 'Vault not found.', 'relative/path']) {
      assert.equal(canonicalize(notAPath), '', notAPath);
    }
    assert.equal(canonicalize('/').trim(), '/');
    assert.notEqual(canonicalize('D:\\memory').trim(), '', 'a Windows path reaches realpath');
  });

  test('runs only a vetted absolute binary with stdin closed and treats exit codes as no signal', () => {
    const locate = flat(section('Locate the binary'));
    assert.match(locate, /Refuse a candidate whose path contains a control character, `` ` ``, `\$`, or `"` before any further command/);
    assert.match(locate, /only when it is an absolute path/);
    assert.match(locate, /Canonicalize the candidate with `realpath` and compare by path segment/);
    assert.match(locate, /inside `workspace` or `root`, refuse it and report `not-installed` without trying another candidate/);
    assert.match(locate, /Never run a bare name and never go through `cmd\.exe \/c`/);
    assert.match(flat(cliReader), /The exit code carries no signal/);
    const calls = cliReader.split('\n').filter((line) => line.includes('"vault=<vault>"'));
    assert.ok(calls.length >= 3, `found ${calls.length} calls`);
    for (const call of calls) {
      assert.match(call, /"<binary>" "vault=<vault>" /, call);
      assert.match(call, /<\/dev\/null/, call);
    }
  });

  test('settles an unavailable reader by onUnavailable, falling back when it cannot ask', () => {
    const probe = flat(section('Probe'));
    assert.match(probe, /Use `AskUserQuestion`: "Obsidian CLI `<reason>`\. Fall back to reading files\?" Yes is fall back; No is refuse/);
    assert.match(probe, /A run that cannot ask \(non-interactive, no question tool\) falls back/);
    assert.match(probe, /\*\*Fall back:\*\* `reader` becomes `file`, `reader_fallback` becomes `<reason>`, and `warnings` gains `reader-<reason>`/);
    assert.match(probe, /\*\*Refuse:\*\* `status` becomes `error` and `error` becomes `reader-<reason>`/);
  });

  test('the agent nominates without probing or asking', () => {
    const nominate = flat(section('Nominate'));
    assert.match(flat(agent), /You never probe and never ask the user/);
    assert.match(nominate, /Locate the binary only\. Never probe and never ask/);
    assert.match(nominate, /\| Acts as `fallback` \|/);
  });

  test('filters nominated paths before ranking and keeps the file ranking', () => {
    const nominate = flat(section('Nominate'));
    for (const excluded of ['_templates', '_deprecated', 'memory-architect', 'assets', '.obsidian', '.trash']) {
      assert.ok(nominate.includes(`\`${excluded}\``), excluded);
    }
    assert.match(nominate, /absolute \(leading `\/` or `\\`, or a drive letter\), has a `\.\.` segment/);
    assert.match(nominate, /contains a backslash, control character, U\+2028, U\+2029, `` ` ``, `\$`, or `"`/);
    assert.match(nominate, /only a path that passed this filter may reach a shell/);
    assert.doesNotMatch(nominate, /existing regular file under `root`/);
    assert.match(nominate, /`rank` keeps only paths in its own inventory, which applies containment and the exclusions/);
    assert.match(nominate, /The remaining paths become `candidates` of the `rank` call/);
    assert.match(nominate, /`total: 0` counts as a failed search/);
    assert.match(nominate, /CLI result order never affects rank/);
  });

  test('a failed search falls back per query and fail leaves claims unchecked', () => {
    const nominate = flat(section('Nominate'));
    assert.match(nominate, /`failed`, `unknown-vault`, `no-matches`, an unparseable payload, and a full result all count as a failed search/);
    assert.match(nominate, /fewer than 50 entries/);
    assert.match(nominate, /The `\(file nomination\)` label below is the only warning: add nothing to a Guardian Report section or its counts/);
    assert.match(nominate, /a claim whose only route to evidence was that search is `NOT CHECKED`; a claim with evidence from a file-based read keeps its result/);
    assert.match(nominate, /Agent `load`: the keyword adds no paths and is named under `## Constraints & Warnings`/);
    assert.match(flat(agent), /a claim whose only route to evidence was that search is `NOT CHECKED`, and a claim with evidence from a file-based read keeps its result/);
    assert.match(flat(agent), /adds no paths and is named under `## Constraints & Warnings`/);
    assert.match(flat(section('Record the reader')), /`reader: obsidian-cli \(file nomination\)` when any free-text query in the operation used file nomination, and `reader: obsidian-cli` otherwise/);
    assert.equal((agent.match(/\{reader: \{value\} — only when the caller's control block supplied reader\}/g) ?? []).length, 2);
  });

  test('every inventory prose list excludes vault state', () => {
    for (const path of [
      'skills/tdk-memory-update/references/regenerate-memory-index-flow.md',
      'skills/tdk-memory-update/references/finalize-written-files.md',
      'skills/tdk-memory-checksum/SKILL.md',
      'skills/tdk-memory-init/references/re-run-flow.md',
      'skills/tdk-memory-init/references/fresh-init-flow.md',
      'skills/tdk-memory-init/references/memory-index-template.md',
    ]) {
      const text = read(path);
      assert.match(text, /`\.obsidian\/(\*\*)?`/, path);
      assert.match(text, /`\.trash\/(\*\*)?`/, path);
    }
    const changelog = read('skills/tdk-memory-changelog/SKILL.md');
    assert.equal((changelog.match(/":\(exclude,glob\)\*\*\/\.obsidian\/\*\*" ":\(exclude,glob\)\*\*\/\.trash\/\*\*"/g) ?? []).length, 2);
  });

  test('every inlined hash command is guarded by the note path check', () => {
    const contract = read('skills/tdk-memory-init/references/memory-root-and-asset-contract.md');
    assert.match(contract, /Double quotes do not protect a note path/);
    assert.match(contract, /STOP with `unsafe-note-path`/);
    assert.match(contract, /leaves a path that fails the note path check out of every other\s+list/);
    assert.match(contract, /`unsafe_paths` is data as well: reads continue/);
    assert.match(read('skills/tdk-memory-checksum/SKILL.md'), /An entry in `unsafe_paths\[\]` is an ERROR/);
    for (const site of ['skills/tdk-memory-update/references/flow-update.md', 'skills/tdk-memory-changelog/SKILL.md']) {
      assert.match(read(site), /note path check \(root contract, section 1\)/, site);
    }
  });

  test('the agent cites the anchor form the gate compares against', () => {
    const agent = read('agents/tdk-memory-agent.md');
    assert.match(agent, /lowercase slug/);
    assert.match(agent, /`## Rounding Rule` is `#rounding-rule`/);
    assert.match(agent, /#\{lowercase-heading-slug-or-\^block-id\}/);
  });

  test('documents the vault rules, side effect, and exclusions', () => {
    const text = flat(readme);
    assert.match(text, /Prefer the vault id/);
    assert.match(text, /One vault per project/);
    assert.match(text, /can launch the Obsidian app/);
    assert.match(text, /ignore `\.obsidian\/workspace\*\.json` and `\.trash\/`/);
    assert.match(flat(contract), /`\.obsidian\/` and `\.trash\/` are vault state at any depth, excluded for every reader/);
    assert.match(flat(contract), /The vault root must equal the memory root/);
    assert.match(flat(contract), /`\^\[A-Za-z0-9 \._-\]\{1,64\}\$`/);
  });
});

describe('coverage label and release', () => {
  test('index template and regeneration flow use the same Binding coverage label', () => {
    const template = read('skills/tdk-memory-init/references/memory-index-template.md');
    const regeneration = read('skills/tdk-memory-update/references/regenerate-memory-index-flow.md');
    assert.match(template, /^Binding coverage: \{binding-true-count\} of \{typed-file-count\} typed files$/m);
    assert.match(regeneration, /`Binding coverage: X of N typed files`/);
    assert.doesNotMatch(regeneration, /N\/M typed files/);
  });

  test('every modified skill and the agent carry the release version', () => {
    for (const path of [
      'skills/tdk-memory-query/SKILL.md',
      'skills/tdk-memory-init/SKILL.md',
      'skills/tdk-memory-update/SKILL.md',
      'skills/tdk-memory-checksum/SKILL.md',
      'skills/tdk-memory-changelog/SKILL.md',
    ]) {
      assert.match(read(path), /^metadata:\s*\r?\n  version: 4\.5\.1$/m, path);
    }
    assert.match(agent, /^metadata:\r?\n  version: "4\.5\.1"$/m);
  });

  test('documents the added, changed, and note entries in the changelog', () => {
    const changelog = read('CHANGELOG.md');
    const section = /## \[4\.2\.0\][\s\S]*?(?=\n## \[)/.exec(changelog);
    assert.ok(section, '4.2.0 section');
    assert.match(section[0], /### Added[\s\S]*--status[\s\S]*resolve[\s\S]*allowExternal/);
    assert.match(section[0], /### Changed[\s\S]*External-root permission can now come from configuration/);
    assert.match(section[0], /### Notes[\s\S]*Codex/);
    const current = /## \[4\.3\.0\][\s\S]*?(?=\n## \[)/.exec(changelog);
    assert.ok(current, '4.3.0 section');
    assert.match(current[0], /### Added[\s\S]*obsidian-cli/);
    assert.match(current[0], /### Changed[\s\S]*`unsupported-reader` is gone/);
    assert.match(current[0], /`\.obsidian\/` and `\.trash\/`[\s\S]*\/tdk-memory-checksum --fix/);
    const release = /## \[4\.4\.0\][\s\S]*?(?=\n## \[)/.exec(changelog);
    assert.ok(release, '4.4.0 section');
    assert.match(release[0], /### Added[\s\S]*`rank[\s\S]*`legacy_receipts`[\s\S]*`hash --raw`[\s\S]*`Integrity:`/);
    assert.match(release[0], /### Changed[\s\S]*fold CRLF to LF[\s\S]*Free-text results come from `rank`/);
    assert.match(release[0], /### Fixed[\s\S]*core\.autocrlf=true[\s\S]*`-ef`/);
  });
});

describe('flows that depend on the runtime hash', () => {
  const templates = flat(read('skills/tdk-memory-init/references/ensure-template-set.md'));
  const finalize = flat(read('skills/tdk-memory-update/references/finalize-written-files.md'));
  const indexFlow = flat(read('skills/tdk-memory-update/references/regenerate-memory-index-flow.md'));
  const checksum = flat(read('skills/tdk-memory-checksum/SKILL.md'));
  const changelog = flat(read('skills/tdk-memory-changelog/SKILL.md'));
  const taxonomy = flat(read('skills/tdk-memory-changelog/references/changelog-entry-format-and-change-type-taxonomy.md'));

  test('the template flow hashes a seed through the runtime and never treats the flag as consent', () => {
    assert.doesNotMatch(templates, /node:crypto/);
    assert.match(templates, /hash "<seedDir>" "<name>\.md\.tpl" --allow-external-root/);
    assert.match(templates, /trusted read-only asset source wherever it is installed\. It lets the runtime read the seed and is not write consent/);
    assert.match(flat(contract), /always passes the flag to hash a trusted seed template/);
    assert.match(flat(contract), /never pass the flag on their own, except to hash a trusted seed template/);
  });

  test('the template flow maps every validate entry to one branch and compares the seed by hash', () => {
    for (const row of [
      /\| No entry, destination absent \| No receipt, not installed \| Copy seed \|/,
      /\| No entry, destination present \| Receipt present, destination equals recorded, including a legacy receipt \| `equals recorded` rows \|/,
      /\| `actual: null` \| Receipt present, destination deleted \| Restore from the current seed \|/,
      /\| `expected: null` \| No receipt, destination present \| Recovery row \|/,
      /\| `expected` and `actual` both non-null \| Destination differs from recorded \| `differs from recorded` rows \|/,
    ]) {
      assert.match(templates, row);
    }
    assert.match(templates, /always compare `hash` values, never raw bytes/);
    assert.match(templates, /only repair a missing\/stale receipt, including a legacy receipt; do not rewrite the destination/);
  });

  test('index edit detection reads the runtime result and skips without a manifest', () => {
    assert.match(indexFlow, /read `index_mismatch` from the shipped `validate` command/);
    assert.match(indexFlow, /Without a manifest, skip detection/);
    assert.doesNotMatch(indexFlow, /Compute SHA256 of current/);
  });

  test('finalize accepts a raw or normalized handoff and always records the hash value', () => {
    assert.match(finalize, /with `hash --raw` and with `hash`/);
    assert.match(finalize, /must equal one of the two results/);
    assert.match(finalize, /the value `hash` printed for each, even when the handoff carried the raw digest/);
  });

  test('checksum reports legacy receipts without an issue and re-baselines only on approval', () => {
    assert.match(checksum, /Legacy receipts: \{N\} \(verified, not an issue\)/);
    assert.match(checksum, /a report with only legacy receipts stays `CLEAN`/);
    assert.match(checksum, /Re-baseline legacy receipts, which is optional/);
    assert.match(checksum, /Show the count and every path in `legacy_receipts\[\]` and obtain explicit approval/);
    assert.match(checksum, /run `hash` for each approved path; run `validate` again on the current manifest and keep only paths it still lists in `legacy_receipts\[\]`, reporting the rest as not re-baselined/);
    assert.match(checksum, /change only `sha256` of the kept paths, or `memory_index_sha256` for `memory-index\.md`, to the value `hash` printed, and keep `updated_at`, `updated_by`, and `source_version`/);
    assert.match(checksum, /must list none of the kept paths in `legacy_receipts\[\]` and report the same `mismatches\[\]` as that second `validate`/);
    assert.match(checksum, /On refusal write nothing/);
    assert.match(checksum, /Non-interactive recovery STOPs/);
  });

  test('the changelog says what Verified records', () => {
    assert.match(changelog, /differs from `sha256sum` on a CRLF file/);
    assert.match(changelog, /use `hash --raw`/);
    assert.match(taxonomy, /differs from `sha256sum`/);
    assert.match(flat(readme), /`Verified` differs from `sha256sum` on a CRLF file/);
  });
});
