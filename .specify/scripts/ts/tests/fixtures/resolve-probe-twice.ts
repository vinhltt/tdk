// Probe for matrix row 12: cache lifetime.
//
// Calls getRepoRoot() twice in ONE process with cwd and CLAUDE_PROJECT_DIR held constant, creating
// a workspace config in between. Holding the inputs constant is the whole point — a cache keyed on
// `(cwd, env)` would still be a hit on the second call and would answer with the pre-creation host.
// Changing cwd between the calls would change that key and let a stale cache pass.
//
// Deliberately no reset hook: a hook would only prove the test can be made to pass.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getRepoRoot } from '../../src/utils/index';

const first = getRepoRoot();

const createAt = process.env['PROBE_CREATE_CONFIG_AT'];
if (createAt !== undefined && createAt !== '') {
  mkdirSync(join(createAt, '.specify'), { recursive: true });
  writeFileSync(
    join(createAt, '.specify/.specify.json'),
    `${JSON.stringify({ name: 'created-mid-process' }, null, 2)}\n`,
  );
}

const second = getRepoRoot();

process.stdout.write(`${JSON.stringify({ cwd: process.cwd(), first, second })}\n`);
