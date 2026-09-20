'use strict';

// Session provenance record builder (schema v1).
//
// Pure: every environment read (clock, os, crypto, git) arrives through the
// injected `deps` object so unit tests never touch the real host. The only
// ambient reads are `process.env` flags, which are themselves overridable
// through `deps.env`.
//
// Record shape (fixed key order, so committed records stay diffable):
//   {"v","session","harness","harnessSource","firstSeen","machineId",
//    "host","user","os","osRelease","repo","branch","cwd","transcript","source"}
// `host` and `user` keys are OMITTED (not nulled) under
// TDK_SESSION_IDENTITY=hashed.

const path = require('path');

const SCHEMA_VERSION = 1;
const KNOWN_VERSIONS = new Set([SCHEMA_VERSION]);
const MACHINE_ID_LENGTH = 12;

/** Run `fn`, returning `null` instead of propagating an environment failure. */
function nullable(fn) {
  try {
    const value = fn();
    return value === undefined ? null : value;
  } catch (_) {
    return null;
  }
}

/**
 * Identity emission mode. Forward-only opt-out; never rewrites history.
 * @param {Record<string,string|undefined>} [env]
 * @returns {'full'|'hashed'}
 */
function identityMode(env = process.env) {
  return env?.TDK_SESSION_IDENTITY === 'hashed' ? 'hashed' : 'full';
}

/**
 * Host/user/platform fingerprint. Stable only while all three inputs are
 * unchanged: not rename-surviving, not unique across identical inputs,
 * not anonymity.
 * @param {typeof import('os')} os
 * @param {typeof import('crypto')} crypto
 * @returns {string|null}
 */
function machineFingerprint(os, crypto) {
  return nullable(() => {
    const hostname = os.hostname();
    const username = os.userInfo().username;
    const platform = os.platform();
    return crypto
      .createHash('sha256')
      .update(`${hostname}\0${username}\0${platform}`)
      .digest('hex')
      .slice(0, MACHINE_ID_LENGTH);
  });
}

/**
 * `<platform>-<arch>`, plus `+wsl` when the kernel release names Microsoft.
 * @param {typeof import('os')} os
 * @returns {string|null}
 */
function osDescriptor(os) {
  return nullable(() => {
    const base = `${os.platform()}-${os.arch()}`;
    const release = nullable(() => os.release()) || '';
    return /microsoft/i.test(release) ? `${base}+wsl` : base;
  });
}

/**
 * Containment-aware locator: `"."` when equal to the root, a POSIX relative
 * path when inside it, `null` otherwise. Windows drive/UNC mismatches and
 * non-absolute inputs resolve to `null` rather than being string-substituted.
 * @param {unknown} target
 * @param {unknown} root
 * @returns {string|null}
 */
function relativeLocator(target, root) {
  if (typeof target !== 'string' || !target) return null;
  if (typeof root !== 'string' || !root) return null;
  if (!path.isAbsolute(target) || !path.isAbsolute(root)) return null;

  const relative = nullable(() => path.relative(root, target));
  if (relative === null) return null;
  if (relative === '') return '.';
  if (path.isAbsolute(relative)) return null;
  if (relative === '..' || relative.startsWith(`..${path.sep}`)) return null;

  return relative.split(path.sep).join('/');
}

/**
 * Encoded forms of the home path that harnesses embed in file names
 * (Claude writes transcripts under `~/.claude/projects/-home-alice-project/`).
 * Emitting such a name would republish the home path AC7 forbids.
 * @param {string} home
 * @returns {string[]}
 */
function encodedHomeVariants(home) {
  const encoded = home.replace(/[\\/:]+/g, '-');
  const variants = new Set([encoded]);
  if (encoded.startsWith('-')) variants.add(encoded.slice(1));
  return [...variants].filter((variant) => variant.length > 1);
}

/**
 * Locator for an activity path: relative to the workspace root when contained,
 * else `~`-anchored when inside the home directory, else `null`.
 * @param {unknown} target
 * @param {string|null|undefined} workspaceRoot
 * @param {string|null|undefined} home
 * @returns {string|null}
 */
function pathLocator(target, workspaceRoot, home) {
  const inRoot = relativeLocator(target, workspaceRoot);
  if (inRoot !== null) return inRoot;

  const inHome = relativeLocator(target, home);
  if (inHome === null) return null;
  if (inHome === '.') return '~';

  const locator = `~/${inHome}`;
  const leaks = encodedHomeVariants(home).some((variant) => locator.includes(variant));
  return leaks ? null : locator;
}

/**
 * Classify one line of a session file. Single shared rule for the writer, the
 * dedup pass and the documented consumer recipes.
 * @param {unknown} line
 * @returns {{kind:'record', session:string, record:Object}|{kind:'legacy', session:string}|{kind:'skip'}}
 */
function classifySessionLine(line) {
  if (typeof line !== 'string') return { kind: 'skip' };
  const trimmed = line.trim();
  if (!trimmed) return { kind: 'skip' };

  const looksJson = trimmed.startsWith('{') || trimmed.startsWith('[');
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch (_) {
    // A truncated or corrupt JSON line is skipped, never mistaken for an ID.
    return looksJson ? { kind: 'skip' } : { kind: 'legacy', session: trimmed };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { kind: 'skip' };
  if (typeof parsed.session !== 'string' || !parsed.session) return { kind: 'skip' };
  if (!KNOWN_VERSIONS.has(parsed.v)) return { kind: 'skip' };

  return { kind: 'record', session: parsed.session, record: parsed };
}

function homeDirectory(os, env) {
  const fromOs = nullable(() => os.homedir());
  if (typeof fromOs === 'string' && fromOs) return fromOs;
  const fromEnv = env?.HOME || env?.USERPROFILE;
  return typeof fromEnv === 'string' && fromEnv ? fromEnv : null;
}

/**
 * Build a schema-v1 provenance record for a `(session, ticket)` first
 * association. `firstSeen` is stamped here — at the moment of the association
 * that actually gets written, never at session start.
 *
 * @param {{sessionId:string|null, harness:string|null, cwd:string|null,
 *          transcriptPath:string|null, workspaceRoot:string, source:string}} input
 * @param {{now?:Function, os?:Object, crypto?:Object, getGitBranch?:Function,
 *          env?:Record<string,string|undefined>}} [deps]
 * @returns {Object}
 */
function buildSessionProvenance(input, deps = {}) {
  const {
    sessionId = null,
    harness = null,
    cwd = null,
    transcriptPath = null,
    workspaceRoot = null,
    source = null
  } = input || {};

  const now = deps.now || (() => new Date());
  const os = deps.os || require('os');
  const crypto = deps.crypto || require('crypto');
  const getGitBranch = deps.getGitBranch || (() => null);
  const env = deps.env || process.env;

  const home = homeDirectory(os, env);
  const cwdLocator = pathLocator(cwd, workspaceRoot, home);
  // No git probe on an unvalidated activity location: the prompt-mention path
  // returns before the resolver validates cwd.
  const branch = cwdLocator === null ? null : nullable(() => getGitBranch(cwd));

  const record = {
    v: SCHEMA_VERSION,
    session: sessionId,
    harness,
    // Derived from the env var, never from payload.harness: the payload cannot
    // distinguish "claude because told so" from "claude because default".
    harnessSource: typeof env.TDK_HARNESS === 'string' && env.TDK_HARNESS.length > 0 ? 'env' : 'default',
    firstSeen: nullable(() => new Date(now()).toISOString()),
    machineId: machineFingerprint(os, crypto)
  };

  if (identityMode(env) !== 'hashed') {
    record.host = nullable(() => os.hostname());
    record.user = nullable(() => os.userInfo().username);
  }

  record.os = osDescriptor(os);
  record.osRelease = nullable(() => os.release());
  record.repo = typeof workspaceRoot === 'string' && workspaceRoot ? path.basename(workspaceRoot) : null;
  record.branch = branch;
  record.cwd = cwdLocator;
  record.transcript = pathLocator(transcriptPath, workspaceRoot, home);
  record.source = source;

  return record;
}

module.exports = {
  SCHEMA_VERSION,
  KNOWN_VERSIONS,
  buildSessionProvenance,
  classifySessionLine,
  identityMode,
  machineFingerprint,
  osDescriptor,
  pathLocator,
  relativeLocator
};
