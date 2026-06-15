const fs = require('fs');
const path = require('path');

const LOCK_RETRIES = 5;
const LOCK_BACKOFF_MS = 20;
const SLEEP_BUF = new Int32Array(new SharedArrayBuffer(4));

function syncSleep(ms) {
  Atomics.wait(SLEEP_BUF, 0, 0, ms);
}

function recordSession({ specsRoot, ticketId, sessionId, cwd }) {
  if (!ticketId || !sessionId) return { skipped: 'missing-id' };

  const folder = path.join(cwd, specsRoot, ticketId);
  if (!fs.existsSync(folder)) return { skipped: 'no-task-folder' };

  const file = path.join(folder, 'sessions.txt');
  const lockPath = file + '.lock';

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
    if (fs.existsSync(file)) {
      const lines = fs.readFileSync(file, 'utf-8').split('\n');
      if (lines.includes(sessionId)) return { recorded: false, isNew: false };
    }
    fs.appendFileSync(file, sessionId + '\n');
    return { recorded: true, isNew: true };
  } finally {
    fs.closeSync(fd);
    try { fs.unlinkSync(lockPath); } catch { /* lock already gone */ }
  }
}

module.exports = { recordSession };
