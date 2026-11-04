import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
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
    assert.match(flat(contract), /Append `--allow-external-root` to every later runtime `hash\|validate\|resolve` call of the operation in that case, and only then/);
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

  test('every runtime hash/validate/resolve call forwards the permission flag, except the agent check', () => {
    const callers = [];
    for (const file of markdownFiles(PLUGIN_ROOT)) {
      const relativePath = relative(PLUGIN_ROOT, file);
      if (relativePath === 'README.md' || relativePath === 'agents/tdk-memory-agent.md') continue;
      for (const line of readFileSync(file, 'utf8').split('\n')) {
        if (/memory-manifest\.cjs" (hash|validate|resolve)/.test(line)) callers.push({ relativePath, line });
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
    assert.match(flat(agent), /`external-not-allowed`, `containment`, or `config-invalid`/);
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
    assert.match(nominate, /The term is the whole query for `tdk-memory-query`, the same literal the file flow greps, and one keyword or evidence phrase at a time for the agent/);
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
    const steps = ['Locate the binary. Reason: `not-installed`', 'vault info=path', 'Compare the `realpath` output with `root`'];
    const positions = steps.map((step) => probe.indexOf(step));
    assert.ok(positions.every((position) => position >= 0), positions.join());
    assert.deepEqual(positions, [...positions].sort((left, right) => left - right));
    assert.match(flat(probe), /`unknown-vault`: reason `vault-mismatch`\. `failed`, more than one line, or any other payload that is not an absolute path: reason `not-running`/);
    assert.match(probe, /Different: reason `vault-mismatch`/);
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

  test('the documented term pattern admits real queries and nothing a shell would interpret', () => {
    const pattern = /`(\^\[\\p\{L\}[^`]*)`/.exec(cliReader);
    assert.ok(pattern, 'term pattern');
    const term = new RegExp(pattern[1], 'u');
    for (const accepted of ['business rules', 'tài khoản', 'giao dịch', 'order-state_v1.2']) {
      assert.match(accepted, term, accepted);
    }
    for (const refused of ['', 'x'.repeat(65), 'a"b', '$(id)', 'a`b', 'a;b', 'a|b', 'a\nb', 'a\\b', "a'b"]) {
      assert.doesNotMatch(refused, term, JSON.stringify(refused));
    }
  });

  test('filters nominated paths before ranking and keeps the file ranking', () => {
    const nominate = flat(section('Nominate'));
    for (const excluded of ['_templates', '_deprecated', 'memory-architect', 'assets', '.obsidian', '.trash']) {
      assert.ok(nominate.includes(`\`${excluded}\``), excluded);
    }
    assert.match(nominate, /absolute \(leading `\/` or `\\`, or a drive letter\), has a `\.\.` segment/);
    assert.match(nominate, /contains a backslash, control character, U\+2028, U\+2029, `` ` ``, `\$`, or `"`/);
    assert.match(nominate, /only a path that passed this filter may reach a shell/);
    assert.match(nominate, /existing regular file under `root`, applying both containment layers/);
    assert.match(nominate, /same scoring and sort from `flow-query\.md`/);
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
      assert.match(read(path), /^metadata:\s*\r?\n  version: 4\.3\.0$/m, path);
    }
    assert.match(agent, /^metadata:\r?\n  version: "4\.3\.0"$/m);
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
  });
});
