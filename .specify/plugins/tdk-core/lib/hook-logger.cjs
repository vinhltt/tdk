const fs = require('fs');
const path = require('path');

const { loadSpeckitConfig } = require('./speckit-config-reader.cjs');

const LOG_LEVELS = { trace: 0, debug: 1, information: 2, warning: 3, error: 4, critical: 5 };

function shouldLogContent() {
  try {
    const config = loadSpeckitConfig(process.env.CLAUDE_PROJECT_DIR || process.cwd());
    const level = (config.logLevel || 'Information').toLowerCase();
    return (LOG_LEVELS[level] ?? 2) <= LOG_LEVELS.debug;
  } catch (_) {
    return false;
  }
}

const PROJECT_HOOK_LOG_DIR = process.env.CLAUDE_PROJECT_DIR
  ? path.join(process.env.CLAUDE_PROJECT_DIR, '.claude', 'hooks', '.logs')
  : null;

const LOG_DIR = PROJECT_HOOK_LOG_DIR || path.join(__dirname, '..', '.logs');
const LOG_FILE = path.join(LOG_DIR, 'hook-log.jsonl');
const LOCK_FILE = path.join(LOG_DIR, 'hook-log.lock');
const MAX_LINES = 1000;
const TRUNCATE_TO = 500;
const LOCK_TIMEOUT_MS = 250;
const LOCK_RETRY_MS = 10;

function sleep(ms) {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch (_) {
    const end = Date.now() + ms;
    while (Date.now() < end) {}
  }
}

function ensureLogDir() {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch (_) {}
}

function withLogLock(fn) {
  ensureLogDir();
  const startedAt = Date.now();

  while (Date.now() - startedAt < LOCK_TIMEOUT_MS) {
    let fd;
    try {
      fd = fs.openSync(LOCK_FILE, 'wx');
      try {
        return fn();
      } finally {
        try { fs.closeSync(fd); } catch (_) {}
        try { fs.unlinkSync(LOCK_FILE); } catch (_) {}
      }
    } catch (error) {
      if (!error || error.code !== 'EEXIST') throw error;
      sleep(LOCK_RETRY_MS);
    }
  }

  return null;
}

function rotateIfNeeded() {
  try {
    if (!fs.existsSync(LOG_FILE)) return;
    const lines = fs.readFileSync(LOG_FILE, 'utf-8').split('\n').filter(Boolean);
    if (lines.length >= MAX_LINES) {
      fs.writeFileSync(LOG_FILE, `${lines.slice(-TRUNCATE_TO).join('\n')}\n`, 'utf-8');
    }
  } catch (_) {}
}

function logHook(hookName, data) {
  try {
    const entry = {
      ts: new Date().toISOString(),
      hook: hookName,
      event: data.event || '',
      note: data.note || '',
      message: data.message || '',
      dur: data.dur || 0,
      status: data.status || 'ok',
      exit: data.exit !== undefined ? data.exit : 0,
      error: data.error || '',
      ...(data.content && shouldLogContent() ? { content: data.content } : {})
    };

    const serialized = `${JSON.stringify(entry)}\n`;
    const wroteWithLock = withLogLock(() => {
      fs.appendFileSync(LOG_FILE, serialized, 'utf-8');
      rotateIfNeeded();
      return true;
    });

    if (wroteWithLock === null) {
      fs.appendFileSync(LOG_FILE, serialized, 'utf-8');
    }
  } catch (_) {}
}

function createHookTimer(hookName, baseData = {}) {
  const start = Date.now();
  let ended = false;
  return {
    end(data = {}) {
      if (ended) return;
      ended = true;
      const dur = Date.now() - start;
      logHook(hookName, { ...baseData, ...data, dur });
    }
  };
}

function logHookCrash(hookName, error, data = {}) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : String(error || 'unknown error');

  logHook(hookName, {
    ...data,
    status: 'crash',
    exit: data.exit !== undefined ? data.exit : 0,
    error: message
  });
}

module.exports = {
  logHook,
  createHookTimer,
  logHookCrash
};
