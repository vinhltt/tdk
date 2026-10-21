const fs = require('fs');
const path = require('path');
const { classifySessionLine } = require('./session-provenance.cjs');
const { taskFolderCandidates } = require('./session-ticket-resolver.cjs');

const LOCK_RETRIES = 5;
const LOCK_BACKOFF_MS = 20;
const SLEEP_BUF = new Int32Array(new SharedArrayBuffer(4));

function syncSleep(ms) {
  Atomics.wait(SLEEP_BUF, 0, 0, ms);
}

/** Read a session file, or `null` when it does not exist. Other errors propagate. */
function readSessionFile(file) {
  try {
    return fs.readFileSync(file, 'utf-8');
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

/** True when `content` already associates `sessionId`. Corrupt lines are skipped. */
function containsSession(content, sessionId) {
  if (content === null) return false;
  for (const line of content.split('\n')) {
    const classified = classifySessionLine(line);
    if (classified.kind === 'skip') continue;
    if (classified.session === sessionId) return true;
  }
  return false;
}

/**
 * Directory that receives `sessions.jsonl` for a ticket, or `null` when there is none.
 * The active dir wins; the archived copy is used only when the active one is gone.
 * Never creates a directory.
 */
function resolveTaskFolder(cwd, specsRoot, defaultFolder, ticketId) {
  const { active, archived } = taskFolderCandidates({ workspaceRoot: cwd, specsRoot, defaultFolder }, ticketId);
  if (fs.existsSync(active)) return active;
  return archived !== null && fs.existsSync(archived) ? archived : null;
}

/**
 * Record one `(session, ticket)` first association in `sessions.jsonl`.
 *
 * Single writer: the legacy `sessions.txt` is read for dedup and never
 * written, created or deleted. Expensive metadata is produced by the lazy
 * `provenance` factory, invoked only when an append will actually happen and
 * always outside the lock, so the 100 ms lock budget never spans a git call.
 *
 * @param {{specsRoot:string, defaultFolder:string, ticketId:string, sessionId:string, cwd:string,
 *          provenance?:() => Object}} args
 * @returns {{skipped:string}|{recorded:boolean, isNew:boolean}}
 */
function recordSession({ specsRoot, defaultFolder, ticketId, sessionId, cwd, provenance }) {
  if (!ticketId || !sessionId) return { skipped: 'missing-id' };

  const folder = resolveTaskFolder(cwd, specsRoot, defaultFolder, ticketId);
  if (folder === null) return { skipped: 'no-task-folder' };

  const file = path.join(folder, 'sessions.jsonl');
  const legacyFile = path.join(folder, 'sessions.txt');
  const lockPath = file + '.lock';

  // Optimistic pass: a dedup hit costs no lock and no provenance collection.
  if (containsSession(readSessionFile(file), sessionId)) return { recorded: false, isNew: false };
  if (containsSession(readSessionFile(legacyFile), sessionId)) return { recorded: false, isNew: false };

  const built = typeof provenance === 'function' ? provenance() : null;
  const record = built && typeof built === 'object' && !Array.isArray(built)
    ? built
    : { v: 1, session: sessionId };

  let fd;
  for (let i = 0; i < LOCK_RETRIES; i++) {
    try {
      fd = fs.openSync(lockPath, 'wx');
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      syncSleep(LOCK_BACKOFF_MS);
    }
  }
  if (fd === undefined) return { skipped: 'lock-timeout' };

  try {
    const content = readSessionFile(file);
    if (containsSession(content, sessionId)) return { recorded: false, isNew: false };
    if (containsSession(readSessionFile(legacyFile), sessionId)) return { recorded: false, isNew: false };

    // A truncated final line must not be fused with the new record.
    const boundary = content && !content.endsWith('\n') ? '\n' : '';
    fs.appendFileSync(file, boundary + JSON.stringify(record) + '\n');
    return { recorded: true, isNew: true };
  } finally {
    fs.closeSync(fd);
    try { fs.unlinkSync(lockPath); } catch { /* lock already gone */ }
  }
}

module.exports = { recordSession };
