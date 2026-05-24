'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('./vendored/yaml.cjs');

const SOFT_MAX_RULES = 20;
const SOFT_MAX_BODY_BYTES = 2048;

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return null;

  try {
    const meta = yaml.parse(match[1]) || {};
    const paths = Array.isArray(meta.paths) ? meta.paths : [];
    const description = typeof meta.description === 'string' ? meta.description : '';
    const rawInject = typeof meta.inject === 'string' ? meta.inject : '';
    const inject = rawInject === 'reference' ? 'reference' : 'full';
    const body = match[2].trim();
    const isAlwaysApply = paths.length === 1 && paths[0] === '**';

    return { paths, description, inject, body, isAlwaysApply };
  } catch {
    return null;
  }
}

function needsRebuild(cacheFile, rulesDir) {
  if (!fs.existsSync(cacheFile)) return true;

  let cacheStat;
  try { cacheStat = fs.statSync(cacheFile); } catch { return true; }

  let files;
  try { files = fs.readdirSync(rulesDir).filter(f => f.endsWith('.md')); } catch { return true; }

  let cached;
  try { cached = JSON.parse(fs.readFileSync(cacheFile, 'utf-8')); } catch { return true; }
  if (files.length !== cached.fileCount) return true;

  const cacheMtime = cacheStat.mtimeMs;
  for (const f of files) {
    try {
      if (fs.statSync(path.join(rulesDir, f)).mtimeMs > cacheMtime) return true;
    } catch { return true; }
  }

  return false;
}

function rebuildCache(rulesDir, cacheFile) {
  let files;
  try { files = fs.readdirSync(rulesDir).filter(f => f.endsWith('.md')); } catch { return []; }

  if (files.length > SOFT_MAX_RULES) {
    process.stderr.write(`[rule-loader] Warning: ${files.length} rules exceed soft cap of ${SOFT_MAX_RULES}\n`);
  }

  const rules = [];
  for (const f of files) {
    try {
      const content = fs.readFileSync(path.join(rulesDir, f), 'utf-8');
      const parsed = parseFrontmatter(content);
      if (!parsed) {
        process.stderr.write(`[rule-loader] Warning: skipping ${f} — malformed frontmatter\n`);
        continue;
      }
      if (Buffer.byteLength(parsed.body) > SOFT_MAX_BODY_BYTES) {
        process.stderr.write(`[rule-loader] Warning: ${f} body exceeds ${SOFT_MAX_BODY_BYTES} bytes\n`);
      }
      rules.push({ file: f, ...parsed });
    } catch (e) {
      process.stderr.write(`[rule-loader] Warning: failed to read ${f} — ${e.message}\n`);
    }
  }

  const cacheData = { generatedAt: new Date().toISOString(), fileCount: files.length, rules };
  try { fs.writeFileSync(cacheFile, JSON.stringify(cacheData, null, 2)); } catch { /* fail-open */ }

  return rules;
}

function loadRules(rulesDir) {
  if (!rulesDir || !fs.existsSync(rulesDir)) return [];

  const cacheFile = path.join(rulesDir, 'rules-cache.json');
  if (needsRebuild(cacheFile, rulesDir)) return rebuildCache(rulesDir, cacheFile);

  try {
    return JSON.parse(fs.readFileSync(cacheFile, 'utf-8')).rules;
  } catch {
    return rebuildCache(rulesDir, cacheFile);
  }
}

module.exports = { loadRules, parseFrontmatter, needsRebuild };
