#!/usr/bin/env bun
import { createHash } from "node:crypto";
import {
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
  writeSync,
  type Stats,
} from "node:fs";
import { basename, join, resolve, sep } from "node:path";
import { parseArgs } from "node:util";

import { assertReleaseManifestRelativePath } from "./release-manifest-paths.ts";
import { PYTHON_WORD } from "./python-word-character-ranges.ts";

// Python str regexes use Unicode letters/numbers for \w. Its \s also includes
// NEL and U+001C–U+001F, but not the BOM that JavaScript's \s would consume.
const PYTHON_WHITESPACE = "\\u0009-\\u000d\\u001c-\\u0020\\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
const UTF8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Port of distribute.sh's Python rewrite; protection and restoration order matter. */
export function rewritePayloadText(text: string, sourcePrefix: string, targetPrefix: string): string {
  const sourceBrand = sourcePrefix.endsWith("-") ? sourcePrefix.slice(0, -1) : sourcePrefix;
  const targetBrand = targetPrefix.endsWith("-") ? targetPrefix.slice(0, -1) : targetPrefix;
  const sourceLower = sourceBrand.toLowerCase();
  const sourceUpper = sourceBrand.toUpperCase();
  const targetLower = targetBrand.toLowerCase();
  const targetUpper = targetBrand.toUpperCase();
  const protectedText: string[] = [];
  const pathCharacter = "[^" + PYTHON_WHITESPACE + "\"'`)\\]}]";

  function protect(pattern: string): void {
    text = text.replace(new RegExp(pattern, "gu"), (match: string) => {
      protectedText.push(match);
      return `\ue000${protectedText.length - 1}\ue001`;
    });
  }

  // Plugin paths, cache paths, filename references, and JSON keys are not renamed.
  // The hard-coded tdk- path rules intentionally match the original Python.
  protect("\\.specify/(?:codex-)?plugins/" + pathCharacter + "+");
  protect("\\.specify/cache/tdk-" + pathCharacter + "+");
  protect("(?:(?:\\.{1,2}|[A-Za-z0-9_.-]+)/)+" + pathCharacter + "*tdk-" + pathCharacter + "*");
  protect("(?:[A-Za-z0-9_.-]+/)*tdk-" + pathCharacter + "+\\.(?:md|mdx|png|svg|excalidraw|json|yaml|yml|tpl|ts|sh)");
  protect("(['\"])" + escapeRegex(sourcePrefix) + "[A-Za-z0-9_-]+\\1(?=[" + PYTHON_WHITESPACE + "]*:)");

  text = text.replace(
    new RegExp("(\\]\\([^" + PYTHON_WHITESPACE + ")]*#)([^)" + PYTHON_WHITESPACE + "]+)(\\))", "gu"),
    (_match: string, before: string, fragment: string, after: string) => {
      if (sourcePrefix && targetPrefix) {
        fragment = fragment.replace(
          new RegExp("(^|-)" + escapeRegex(sourcePrefix), "gu"),
          (_anchor: string, leading: string) => leading + targetPrefix,
        );
      }
      if (sourceBrand && targetBrand) {
        fragment = fragment.replace(
          new RegExp("(^|-)" + escapeRegex(sourceLower) + "(?=$|-)", "gu"),
          (_anchor: string, leading: string) => leading + targetLower,
        );
        fragment = fragment.replace(
          new RegExp("(^|-)" + escapeRegex(sourceUpper) + "(?=$|-)", "gu"),
          (_anchor: string, leading: string) => leading + targetUpper,
        );
      }
      return before + fragment + after;
    },
  );

  text = text.replace(new RegExp("(?<![a-z0-9-])" + escapeRegex(sourcePrefix), "gu"), () => targetPrefix);
  if (sourceBrand && targetBrand) {
    // Consume the preceding code point: Unicode lookbehind in JavaScriptCore
    // can split an astral letter's surrogate pair and violate Python's \w boundary.
    text = text.replace(
      new RegExp("(^|[^" + PYTHON_WORD + "${-])" + escapeRegex(sourceLower) + "(?![" + PYTHON_WORD + "-])", "gu"),
      (_match: string, leading: string) => leading + targetLower,
    );
    text = text.replace(
      new RegExp("(^|[^" + PYTHON_WORD + "${-])" + escapeRegex(sourceUpper) + "(?![" + PYTHON_WORD + "-])", "gu"),
      (_match: string, leading: string) => leading + targetUpper,
    );
  }

  // Deliberately retain Python's sentinel collisions and cascading restoration.
  for (const [index, value] of protectedText.entries()) {
    text = text.replaceAll(`\ue000${index}\ue001`, () => value);
  }
  return text;
}

/** Mirrors should_rewrite_source_file, including its .specify/ root gate. */
export function isRewriteCandidate(rel: string): boolean {
  if (!rel.startsWith(".specify/")) return false;
  const path = rel.slice(".specify/".length);
  if (path.startsWith("scripts/ts/") && /\.(?:ts|json|md|txt|yaml|yml)(?![\s\S])/.test(path)) return true;
  if (path === "setup.sh" || path === "CHANGELOG.md" || (path.startsWith(".specify") && path.endsWith(".example"))) return true;
  if (/^(?:plugins|codex-plugins|scripts|schemas)\//.test(path)) return false;
  return /^(?:docs|templates|claude-rules)\//.test(path)
    && /\.(?:md|mdx|txt|json|yaml|yml|tpl|sh|svg|excalidraw)(?![\s\S])/.test(path);
}

function pathStat(path: string, followSymlinks: boolean): Stats | undefined {
  try {
    return followSymlinks ? statSync(path) : lstatSync(path);
  } catch (error) {
    if (error instanceof Error && "code" in error && (error.code === "ENOENT" || error.code === "ENOTDIR")) {
      return undefined;
    }
    throw error;
  }
}

function findPathPattern(pattern: string): RegExp {
  // find -path uses fnmatch, not globstar: '*' crosses '/' and leading dots.
  // Preserve ordinary ranges/negation/backslash escapes. Locale-dependent
  // POSIX character, collating, and equivalence classes are not used by the
  // current config; reject them loudly rather than pretending JS is libc.
  let regex = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index]!;
    if (character === "*") {
      regex += "[\\s\\S]*";
      while (pattern[index + 1] === "*") index += 1;
    } else if (character === "?") {
      regex += "[\\s\\S]";
    } else if (character === "\\") {
      if (index + 1 === pattern.length) return new RegExp("(?!)");
      regex += escapeRegex(pattern[++index]!);
    } else if (character === "[") {
      let cursor = index + 1;
      let bracket = "";
      if (pattern[cursor] === "!" || pattern[cursor] === "^") {
        bracket = "^";
        cursor += 1;
      }
      if (pattern[cursor] === "]") {
        bracket += "\\]";
        cursor += 1;
      }
      for (; cursor < pattern.length && pattern[cursor] !== "]"; cursor += 1) {
        let member = pattern[cursor]!;
        if (member === "\\") {
          cursor += 1;
          if (cursor === pattern.length) break;
          member = pattern[cursor]!;
          bracket += /[\\\]\[^\-]/.test(member) ? "\\" + member : member;
        } else {
          if (member === "[" && /[:.=]/.test(pattern[cursor + 1] ?? "")) {
            throw new Error(`Locale-dependent find -path bracket classes are unsupported: ${JSON.stringify(pattern)}`);
          }
          bracket += /[\\\]\[^]/.test(member) ? "\\" + member : member;
        }
      }
      if (cursor === pattern.length) {
        regex += "\\[";
      } else {
        regex += "[" + bracket + "]";
        index = cursor;
      }
    } else {
      regex += escapeRegex(character);
    }
  }
  return new RegExp(regex + "(?![\\s\\S])", "u");
}

/**
 * Coupled to distribute.sh collect_files/is_excluded, not the release resolver:
 * include order, then LC_ALL=C byte order for each directory's full file list;
 * literal file postfilter plus find -path directory pruning; no recursive symlinks.
 * An explicit file include follows symlinks, but a directory-symlink include is
 * empty (find's default -P). Dotfiles and duplicate includes remain included.
 * The legacy _*_cache__ basename special case is unreachable with the current
 * distribute.json and deliberately omitted, as required by the phase plan.
 */
export function collectDistributionFiles(
  sourceRoot: string,
  includes: readonly string[],
  excludes: readonly string[],
): string[] {
  // Native Bun uses Windows separators; find's pattern escapes must apply only
  // to configured patterns, never to those native root separators.
  if (sep === "\\") sourceRoot = sourceRoot.replaceAll("\\", "/");
  const pruneRoot = sourceRoot.endsWith("/") ? sourceRoot.slice(0, -1) : sourceRoot;
  const rules = excludes.map((pattern) => ({
    directory: pattern.endsWith("/"),
    path: pattern.endsWith("/") ? pattern.slice(0, -1) : pattern,
    prune: pattern.endsWith("/") ? findPathPattern(pruneRoot + "/" + pattern.slice(0, -1)) : undefined,
  }));
  const files: string[] = [];

  function isExcluded(path: string): boolean {
    // The shell postfilter is literal even when find's directory prune is not.
    return rules.some((rule) => path === rule.path || (rule.directory && path.startsWith(rule.path + "/")));
  }

  function walk(directory: string, relativeDirectory: string, found: { path: string; bytes: Buffer }[]): void {
    if (rules.some((rule) => rule.prune?.test(directory))) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const rel = relativeDirectory + "/" + entry.name;
      const absolutePath = directory + "/" + entry.name;
      // find's -prune predicate also applies to regular files, not just dirs.
      if (rules.some((rule) => rule.prune?.test(absolutePath))) continue;
      if (entry.isDirectory()) {
        walk(absolutePath, rel, found);
      } else if (entry.isFile() && !isExcluded(rel)) {
        found.push({ path: rel, bytes: Buffer.from(rel) });
      }
    }
  }

  for (const include of includes) {
    const relativePath = include.endsWith("/") ? include.slice(0, -1) : include;
    const absolutePath = sourceRoot + "/" + relativePath;
    const stat = pathStat(absolutePath, true);
    if (stat?.isFile()) {
      if (!isExcluded(include)) files.push(include);
    } else if (stat?.isDirectory() && !lstatSync(absolutePath).isSymbolicLink()) {
      const found: { path: string; bytes: Buffer }[] = [];
      walk(absolutePath, relativePath, found);
      found.sort((left, right) => Buffer.compare(left.bytes, right.bytes));
      for (const file of found) files.push(file.path);
    }
  }
  return files;
}

function requiredOption(value: string | undefined, name: string): string {
  if (!value || value.includes("\0")) throw new Error(`--${name} requires a non-empty value without NUL bytes`);
  return value;
}

function configPaths(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || value.some((path: unknown) => typeof path !== "string" || !path || path.includes("\0"))) {
    throw new Error(`Invalid distribute.json ${name}: expected an array of non-empty strings without NUL bytes`);
  }
  return value;
}

function emitRecord(action: string, rel: string, sha: string, renderedPath: string): void {
  const record = Buffer.from(`${action}\0${rel}\0${sha}\0${renderedPath}\0`);
  let written = 0;
  while (written < record.length) {
    const count = writeSync(1, record, written, record.length - written);
    if (count === 0) throw new Error("Unable to write classification output");
    written += count;
  }
}

function main(): void {
  const { values } = parseArgs({
    options: {
      "source-root": { type: "string" },
      "target-root": { type: "string" },
      "render-dir": { type: "string" },
      prefix: { type: "string" },
      mode: { type: "string" },
      "paths-file": { type: "string" },
    },
    allowPositionals: false,
    strict: true,
  });
  const sourceRoot = resolve(requiredOption(values["source-root"], "source-root"));
  const targetRoot = resolve(requiredOption(values["target-root"], "target-root"));
  const renderDir = resolve(requiredOption(values["render-dir"], "render-dir"));
  const prefix = requiredOption(values.prefix, "prefix");
  const mode = requiredOption(values.mode, "mode");
  if (!/^[a-z0-9][a-z0-9-]*-$(?![\s\S])/.test(prefix)) throw new Error("--prefix must be a normalized lowercase prefix ending in '-'");
  if (mode !== "compare" && mode !== "bootstrap" && mode !== "force") throw new Error(`Invalid --mode: ${mode}`);
  if (values["paths-file"] !== undefined && mode !== "force") throw new Error("--paths-file requires --mode force");
  for (const [name, path] of Object.entries({ "source-root": sourceRoot, "target-root": targetRoot, "render-dir": renderDir })) {
    if (!pathStat(path, true)?.isDirectory()) throw new Error(`--${name} must be an existing directory: ${path}`);
  }

  let files: string[];
  if (values["paths-file"] !== undefined) {
    const inventory = UTF8.decode(readFileSync(requiredOption(values["paths-file"], "paths-file")));
    if (inventory && !inventory.endsWith("\0")) throw new Error("--paths-file must contain NUL-terminated relative paths");
    files = inventory ? inventory.slice(0, -1).split("\0").map(assertReleaseManifestRelativePath) : [];
    // The shell supplies validated force source paths and the manifest itself.
    // Do not re-resolve release ownership, sort this inventory, or add deletions.
  } else {
    const config: unknown = JSON.parse(UTF8.decode(readFileSync(join(sourceRoot, "distribute.json"))));
    if (!config || typeof config !== "object" || Array.isArray(config)) throw new Error("Invalid distribute.json: expected an object");
    const includes = configPaths("ship" in config ? config.ship : undefined, "ship");
    const excludes = configPaths("doNotShip" in config ? config.doNotShip : undefined, "doNotShip");
    files = collectDistributionFiles(sourceRoot, includes, excludes);
  }

  const batchDir = mkdtempSync(join(renderDir, "batch-"));
  let count = 0;
  for (const rel of files) {
    const sourcePath = join(sourceRoot, rel);
    if (mode === "force") {
      // Same direct-source check as the legacy force branch. Ancestor safety and
      // release-manifest ownership remain the shell's validated preconditions.
      const sourceStat = pathStat(sourcePath, false);
      if (!sourceStat?.isFile()) throw new Error(`Force source path is not a regular non-symlink file: ${rel}`);
    }
    const source = readFileSync(sourcePath);
    let payload = source;
    if (isRewriteCandidate(rel)) {
      let text: string;
      try {
        text = UTF8.decode(source);
      } catch (error) {
        throw new Error(`Invalid UTF-8 payload: ${rel}`, { cause: error });
      }
      payload = Buffer.from(rewritePayloadText(text, "tdk-", prefix), "utf8");
    }
    const renderedPath = join(batchDir, String(count));
    writeFileSync(renderedPath, payload, { flag: "wx" });
    const sha = createHash("sha256").update(payload).digest("hex");
    const targetPath = join(targetRoot, rel);
    let action: "new" | "updated" | "unchanged" = "new";
    if (mode === "force") {
      if (pathStat(targetPath, false)) action = "updated";
    } else if (pathStat(targetPath, true)?.isFile()) {
      action = "updated";
      if (mode === "compare" && createHash("sha256").update(readFileSync(targetPath)).digest("hex") === sha) {
        action = "unchanged";
      }
    }
    // Transport a root-relative POSIX name; Bash owns TMPDIR spelling and native
    // Bun paths must never cross the Bash boundary as absolute Windows paths.
    emitRecord(action, rel, sha, `${basename(batchDir)}/${count}`);
    count += 1;
  }
  // The shell checks both exit status and this count before trusting any record.
  // Failures may leave a partial stream, but never a successful trailer.
  emitRecord("end", String(count), "", "");
}

if (import.meta.main) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
