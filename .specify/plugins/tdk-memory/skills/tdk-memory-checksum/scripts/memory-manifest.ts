#!/usr/bin/env node

import { createHash } from "node:crypto";
import { constants as fsConstants, promises as fs, type Dirent, type FileHandle, type Stats } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { isAlias, isMap, isScalar, isSeq, parseDocument, type Node } from "yaml";

const MANIFEST_VERSION = "2";
const DEFAULT_MANIFEST_PATH = "memory.yaml";
const INDEX_PATH = "memory-index.md";
const CHANGELOG_PATH = "CHANGELOG.md";
const MEMORY_MAP_PATH = "memory-map.canvas";
const TEMPLATE_DIRECTORY = "_templates";
const EXCLUDED_DIRECTORY_NAMES: Record<string, true> = {
  _deprecated: true,
  "memory-architect": true,
  [TEMPLATE_DIRECTORY]: true,
  assets: true,
};
const MAX_MANIFEST_BYTES = 1_048_576;
const MAX_YAML_NODES = 20_000;
const MAX_YAML_DEPTH = 32;
const MAX_INVENTORY_ENTRIES = 100_000;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

type Invocation =
  | { command: "hash"; memoryRootArgument: string; relativePath: string; allowExternalRoot: boolean }
  | { command: "validate"; memoryRootArgument: string; manifestRelativePath: string; allowExternalRoot: boolean };

type FileReceipt = {
  path: string;
  sha256: string;
  updated_at: string;
  updated_by: string;
};

type TemplateReceipt = {
  path: string;
  sha256: string;
  source_version: string;
};

type Manifest = {
  generatedAt: string;
  memoryIndexSha256: string;
  files: FileReceipt[];
  templates: TemplateReceipt[];
};

type HashMismatch = {
  path: string;
  expected: string | null;
  actual: string | null;
};

class CliError extends Error {}

function fail(message: string): never {
  throw new CliError(message);
}

function usage(): never {
  fail(
    "Usage:\n" +
      "  node memory-manifest.cjs hash <memoryRoot> <relPath> [--allow-external-root]\n" +
      "  node memory-manifest.cjs validate <memoryRoot> [--manifest <relativePath>] [--allow-external-root]",
  );
}

function parseInvocation(argumentsAfterNode: string[]): Invocation {
  const [command, ...rest] = argumentsAfterNode;

  if (command === "hash") {
    let allowExternalRoot = false;
    const positional: string[] = [];

    for (const argument of rest) {
      if (argument === "--allow-external-root") {
        if (allowExternalRoot) fail("--allow-external-root may only be provided once");
        allowExternalRoot = true;
      } else if (argument.startsWith("--")) {
        usage();
      } else {
        positional.push(argument);
      }
    }

    if (positional.length !== 2) usage();
    return {
      command,
      memoryRootArgument: positional[0],
      relativePath: positional[1],
      allowExternalRoot,
    };
  }

  if (command === "validate") {
    if (rest.length === 0 || rest[0].startsWith("--")) usage();

    const memoryRootArgument = rest[0];
    let allowExternalRoot = false;
    let manifestRelativePath = DEFAULT_MANIFEST_PATH;
    let manifestProvided = false;

    for (let index = 1; index < rest.length; index += 1) {
      const argument = rest[index];
      if (argument === "--allow-external-root") {
        if (allowExternalRoot) fail("--allow-external-root may only be provided once");
        allowExternalRoot = true;
        continue;
      }
      if (argument === "--manifest") {
        if (manifestProvided || index + 1 >= rest.length || rest[index + 1].startsWith("--")) usage();
        manifestProvided = true;
        manifestRelativePath = rest[index + 1];
        index += 1;
        continue;
      }
      usage();
    }

    return { command, memoryRootArgument, manifestRelativePath, allowExternalRoot };
  }

  usage();
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : String(error.code);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function lstatOptional(filePath: string): Promise<Stats | undefined> {
  try {
    return await fs.lstat(filePath);
  } catch (error) {
    if (errorCode(error) === "ENOENT") return undefined;
    fail(`cannot inspect ${filePath}: ${errorMessage(error)}`);
  }
}

async function realpathFromNearestExisting(inputPath: string): Promise<string> {
  let candidate = resolve(inputPath);
  const missingSegments: string[] = [];

  while (true) {
    try {
      const physical = await fs.realpath(candidate);
      return resolve(physical, ...missingSegments.reverse());
    } catch (error) {
      if (errorCode(error) !== "ENOENT" && errorCode(error) !== "ENOTDIR") {
        fail(`cannot resolve ${candidate}: ${errorMessage(error)}`);
      }

      const parent = dirname(candidate);
      if (parent === candidate) fail(`cannot resolve an existing ancestor for ${inputPath}`);
      missingSegments.push(basename(candidate));
      candidate = parent;
    }
  }
}

function requireContained(parentPath: string, childPath: string, subject: string): void {
  const relation = relative(parentPath, childPath);
  if (relation === "" || (!relation.startsWith(`..${sep}`) && relation !== ".." && !isAbsolute(relation))) return;
  fail(`${subject} escapes containment: ${childPath} is not within ${parentPath}`);
}

async function discoverWorkspaceRoot(): Promise<string> {
  const cwd = await fs.realpath(process.cwd());
  let candidate = cwd;

  while (true) {
    const hasGit = await lstatOptional(join(candidate, ".git"));
    const hasSpecify = await lstatOptional(join(candidate, ".specify"));
    if (hasGit !== undefined || hasSpecify !== undefined) return candidate;

    const parent = dirname(candidate);
    if (parent === candidate) {
      console.error(`WARNING: no .git or .specify ancestor found; using cwd as workspace root: ${cwd}`);
      return cwd;
    }
    candidate = parent;
  }
}

async function resolveMemoryRoot(memoryRootArgument: string, allowExternalRoot: boolean): Promise<string> {
  const workspaceRoot = await discoverWorkspaceRoot();
  const lexicalPath = resolve(workspaceRoot, memoryRootArgument);
  if (!allowExternalRoot) requireContained(workspaceRoot, lexicalPath, "memory root path");
  const candidate = await realpathFromNearestExisting(lexicalPath);
  if (!allowExternalRoot) requireContained(workspaceRoot, candidate, "memory root symlink");
  const info = await lstatOptional(lexicalPath);
  if (info === undefined) fail(`memory root does not exist: ${lexicalPath}`);

  let memoryRoot: string;
  try {
    memoryRoot = await fs.realpath(lexicalPath);
  } catch (error) {
    fail(`cannot resolve memory root ${lexicalPath}: ${errorMessage(error)}`);
  }

  if (!allowExternalRoot) requireContained(workspaceRoot, memoryRoot, "memory root");
  if (!info.isDirectory() && !info.isSymbolicLink()) fail(`memory root is not a directory: ${lexicalPath}`);

  const physicalInfo = await lstatOptional(memoryRoot);
  if (physicalInfo === undefined || !physicalInfo.isDirectory()) fail(`memory root is not a directory: ${memoryRoot}`);
  return memoryRoot;
}

function validateRelativePath(relativePath: string, subject: string): string[] {
  if (relativePath.length === 0 || relativePath.includes("\0")) fail(`${subject} must be a non-empty relative path`);
  if (relativePath.includes("\\") || relativePath.startsWith("/") || /^[A-Za-z]:/.test(relativePath)) {
    fail(`${subject} must use a portable relative path`);
  }

  const parts = relativePath.split("/");
  if (parts.some((part) => part.length === 0 || part === "." || part === "..")) {
    fail(`${subject} must not contain empty, dot, or parent path segments`);
  }
  return parts;
}

async function rejectSymlink(entryPath: string, memoryRoot: string): Promise<never> {
  let destination: string;
  try {
    destination = await fs.realpath(entryPath);
  } catch (error) {
    fail(`cannot resolve symbolic link ${entryPath}: ${errorMessage(error)}`);
  }
  requireContained(memoryRoot, destination, "symbolic link target");
  fail(`symbolic links are not permitted in memory inventory paths: ${entryPath}`);
}

type InspectedTarget =
  | { kind: "missing" }
  | { kind: "non-file" }
  | { kind: "file"; path: string };

async function inspectContainedTarget(memoryRoot: string, relativePath: string, subject: string): Promise<InspectedTarget> {
  const parts = validateRelativePath(relativePath, subject);
  let candidate = memoryRoot;

  for (const part of parts) {
    candidate = join(candidate, part);
    const info = await lstatOptional(candidate);
    if (info === undefined) return { kind: "missing" };
    if (info.isSymbolicLink()) await rejectSymlink(candidate, memoryRoot);
  }

  requireContained(memoryRoot, candidate, subject);
  const info = await lstatOptional(candidate);
  if (info === undefined) return { kind: "missing" };
  if (!info.isFile()) return { kind: "non-file" };
  return { kind: "file", path: candidate };
}

async function hashRegularFile(filePath: string): Promise<string> {
  let handle: FileHandle | undefined;
  try {
    handle = await fs.open(filePath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    const info = await handle.stat();
    if (!info.isFile()) fail(`not a regular file: ${filePath}`);

    const digest = createHash("sha256");
    const stream = handle.createReadStream({ autoClose: false });
    for await (const chunk of stream) digest.update(chunk);
    return digest.digest("hex");
  } catch (error) {
    if (error instanceof CliError) throw error;
    fail(`cannot read ${filePath}: ${errorMessage(error)}`);
  } finally {
    await handle?.close();
  }
}

async function readManifestSource(filePath: string): Promise<string> {
  let handle: FileHandle | undefined;
  try {
    handle = await fs.open(filePath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    const info = await handle.stat();
    if (!info.isFile()) fail(`manifest is not a regular file: ${filePath}`);
    if (info.size > MAX_MANIFEST_BYTES) fail(`manifest exceeds ${MAX_MANIFEST_BYTES} bytes: ${filePath}`);
    return await handle.readFile({ encoding: "utf8" });
  } catch (error) {
    if (error instanceof CliError) throw error;
    fail(`cannot read manifest ${filePath}: ${errorMessage(error)}`);
  } finally {
    await handle?.close();
  }
}

function rejectUnsupportedYamlNodes(node: Node | null | undefined, state: { nodes: number; depth: number }): void {
  if (node === null || node === undefined) return;
  state.nodes += 1;
  if (state.nodes > MAX_YAML_NODES) fail(`manifest exceeds ${MAX_YAML_NODES} YAML nodes`);
  if (state.depth > MAX_YAML_DEPTH) fail(`manifest exceeds YAML nesting depth ${MAX_YAML_DEPTH}`);
  if (isAlias(node)) fail("manifest YAML aliases are not allowed");
  if ("anchor" in node && node.anchor !== undefined) fail("manifest YAML anchors are not allowed");
  if (node.tag !== undefined && !node.tag.startsWith("tag:yaml.org,2002:")) {
    fail(`manifest YAML custom tag is not allowed: ${node.tag}`);
  }

  if (isMap(node)) {
    for (const pair of node.items) {
      state.depth += 1;
      rejectUnsupportedYamlNodes(pair.key, state);
      rejectUnsupportedYamlNodes(pair.value, state);
      state.depth -= 1;
    }
  } else if (isSeq(node)) {
    for (const item of node.items) {
      state.depth += 1;
      rejectUnsupportedYamlNodes(item, state);
      state.depth -= 1;
    }
  }
}

function mapEntries(node: Node | null | undefined, subject: string): Map<string, Node | null> {
  if (!isMap(node)) fail(`${subject} must be a mapping`);
  const result = new Map<string, Node | null>();

  for (const pair of node.items) {
    if (!isScalar(pair.key) || typeof pair.key.value !== "string") fail(`${subject} keys must be strings`);
    if (result.has(pair.key.value)) fail(`${subject} contains duplicate key ${pair.key.value}`);
    result.set(pair.key.value, pair.value ?? null);
  }

  return result;
}

function requireExactKeys(entries: Map<string, Node | null>, required: string[], optional: string[], subject: string): void {
  const allowed = new Set([...required, ...optional]);
  for (const key of entries.keys()) {
    if (!allowed.has(key)) fail(`${subject} contains unsupported key ${key}`);
  }
  for (const key of required) {
    if (!entries.has(key)) fail(`${subject} is missing required key ${key}`);
  }
}

function stringValue(node: Node | null | undefined, subject: string): string {
  if (!isScalar(node) || typeof node.value !== "string") fail(`${subject} must be a string`);
  return node.value;
}

function requireHash(value: string, subject: string): string {
  if (!SHA256_PATTERN.test(value)) fail(`${subject} must be a lowercase 64-character SHA-256 hexadecimal digest`);
  return value;
}

function requireTimestamp(value: string, subject: string): string {
  if (!ISO_TIMESTAMP_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
    fail(`${subject} must be an ISO 8601 timestamp with a timezone`);
  }
  return value;
}

function requireNonEmpty(value: string, subject: string): string {
  if (value.trim().length === 0) fail(`${subject} must not be empty`);
  return value;
}

function requireFileInventoryPath(value: string, subject: string): string {
  const parts = validateRelativePath(value, subject);
  if (parts.includes(TEMPLATE_DIRECTORY)) {
    fail(`${subject} is a template asset; use templates[] instead`);
  }
  if (value === INDEX_PATH) fail(`${subject} must not be ${INDEX_PATH}; it is covered by memory_index_sha256`);
  if (value !== MEMORY_MAP_PATH && !value.endsWith(".md")) {
    fail(`${subject} must name a Markdown note or ${MEMORY_MAP_PATH}`);
  }
  return value;
}

function requireTemplateInventoryPath(value: string, subject: string): string {
  const parts = validateRelativePath(value, subject);
  if (parts[0] !== TEMPLATE_DIRECTORY || !value.endsWith(".md.tpl")) {
    fail(`${subject} must be a .md.tpl file below ${TEMPLATE_DIRECTORY}/`);
  }
  if (parts.slice(1).some((part) => part === "_deprecated" || part === "memory-architect" || part === "assets")) {
    fail(`${subject} must not be inside an excluded directory`);
  }
  return value;
}

function parseFileReceipt(node: Node | null | undefined, index: number): FileReceipt {
  const subject = `files[${index}]`;
  const entries = mapEntries(node, subject);
  requireExactKeys(entries, ["path", "sha256", "updated_at", "updated_by"], [], subject);
  return {
    path: requireFileInventoryPath(stringValue(entries.get("path"), `${subject}.path`), `${subject}.path`),
    sha256: requireHash(stringValue(entries.get("sha256"), `${subject}.sha256`), `${subject}.sha256`),
    updated_at: requireTimestamp(stringValue(entries.get("updated_at"), `${subject}.updated_at`), `${subject}.updated_at`),
    updated_by: requireNonEmpty(stringValue(entries.get("updated_by"), `${subject}.updated_by`), `${subject}.updated_by`),
  };
}

function parseTemplateReceipt(node: Node | null | undefined, index: number): TemplateReceipt {
  const subject = `templates[${index}]`;
  const entries = mapEntries(node, subject);
  requireExactKeys(entries, ["path", "sha256", "source_version"], [], subject);
  return {
    path: requireTemplateInventoryPath(stringValue(entries.get("path"), `${subject}.path`), `${subject}.path`),
    sha256: requireHash(stringValue(entries.get("sha256"), `${subject}.sha256`), `${subject}.sha256`),
    source_version: requireNonEmpty(stringValue(entries.get("source_version"), `${subject}.source_version`), `${subject}.source_version`),
  };
}

function parseReceiptSequence<T>(node: Node | null | undefined, subject: string, parseReceipt: (item: Node | null | undefined, index: number) => T): T[] {
  if (!isSeq(node)) fail(`${subject} must be a sequence`);
  return node.items.map((item, index) => parseReceipt(item, index));
}

async function readManifest(manifestPath: string): Promise<Manifest> {
  const source = await readManifestSource(manifestPath);
  let document;
  try {
    document = parseDocument(source, {
      customTags: null,
      merge: false,
      prettyErrors: false,
      resolveKnownTags: false,
      schema: "core",
      strict: true,
      stringKeys: true,
      uniqueKeys: true,
      version: "1.2",
    });
  } catch (error) {
    fail(`failed to parse manifest ${manifestPath}: ${errorMessage(error)}`);
  }

  if (document.errors.length > 0 || document.warnings.length > 0) {
    const diagnostics = [...document.errors, ...document.warnings].map((diagnostic) => diagnostic.message).join("; ");
    fail(`failed to parse manifest ${manifestPath}: ${diagnostics}`);
  }

  rejectUnsupportedYamlNodes(document.contents, { nodes: 0, depth: 0 });
  const entries = mapEntries(document.contents, "manifest");
  requireExactKeys(entries, ["version", "generated_at", "memory_index_sha256", "files"], ["templates"], "manifest");

  const version = stringValue(entries.get("version"), "manifest.version");
  if (version !== MANIFEST_VERSION) fail(`manifest.version must be ${MANIFEST_VERSION}`);

  const manifest: Manifest = {
    generatedAt: requireTimestamp(stringValue(entries.get("generated_at"), "manifest.generated_at"), "manifest.generated_at"),
    memoryIndexSha256: requireHash(
      stringValue(entries.get("memory_index_sha256"), "manifest.memory_index_sha256"),
      "manifest.memory_index_sha256",
    ),
    files: parseReceiptSequence(entries.get("files"), "manifest.files", parseFileReceipt),
    templates: entries.has("templates")
      ? parseReceiptSequence(entries.get("templates"), "manifest.templates", parseTemplateReceipt)
      : [],
  };

  const paths = new Set<string>();
  for (const receipt of [...manifest.files, ...manifest.templates]) {
    if (paths.has(receipt.path)) fail(`manifest contains duplicate receipt path ${receipt.path}`);
    paths.add(receipt.path);
  }

  return manifest;
}


async function scanFiles(
  memoryRoot: string,
  startingRelativePath: string,
  includeFile: (relativePath: string) => boolean,
): Promise<string[]> {
  const found: string[] = [];
  const pending: Array<{ path: string; relativePath: string }> = [
    { path: startingRelativePath === "" ? memoryRoot : join(memoryRoot, ...startingRelativePath.split("/")), relativePath: startingRelativePath },
  ];
  let visitedEntries = 0;

  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) break;

    let entries: Dirent[];
    try {
      entries = await fs.readdir(current.path, { withFileTypes: true });
    } catch (error) {
      fail(`cannot read directory ${current.path}: ${errorMessage(error)}`);
    }

    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      visitedEntries += 1;
      if (visitedEntries > MAX_INVENTORY_ENTRIES) fail(`memory inventory exceeds ${MAX_INVENTORY_ENTRIES} entries`);

      const absolutePath = join(current.path, entry.name);
      const relativePath = current.relativePath === "" ? entry.name : `${current.relativePath}/${entry.name}`;
      const info = await lstatOptional(absolutePath);
      if (info === undefined) fail(`memory inventory entry disappeared while scanning: ${absolutePath}`);
      if (info.isSymbolicLink()) await rejectSymlink(absolutePath, memoryRoot);

      if (info.isDirectory()) {
        requireContained(memoryRoot, absolutePath, "memory inventory directory");
        if (EXCLUDED_DIRECTORY_NAMES[entry.name] !== true) pending.push({ path: absolutePath, relativePath });
        continue;
      }
      if (info.isFile()) {
        if (includeFile(relativePath)) found.push(relativePath);
        continue;
      }
      fail(`unsupported filesystem entry in memory inventory: ${absolutePath}`);
    }
  }

  return found.sort();
}

async function scanManifestFiles(memoryRoot: string): Promise<string[]> {
  return scanFiles(memoryRoot, "", (relativePath) => {
    if (relativePath === INDEX_PATH || relativePath === CHANGELOG_PATH || relativePath === MEMORY_MAP_PATH) return false;
    return relativePath.endsWith(".md");
  });
}

async function scanTemplateFiles(memoryRoot: string): Promise<string[]> {
  const templateRoot = await inspectContainedTarget(memoryRoot, TEMPLATE_DIRECTORY, "template directory");
  if (templateRoot.kind === "missing") return [];
  if (templateRoot.kind !== "non-file") fail(`template directory is not a directory: ${join(memoryRoot, TEMPLATE_DIRECTORY)}`);

  const templateInfo = await lstatOptional(join(memoryRoot, TEMPLATE_DIRECTORY));
  if (templateInfo === undefined || !templateInfo.isDirectory()) {
    fail(`template directory is not a directory: ${join(memoryRoot, TEMPLATE_DIRECTORY)}`);
  }
  return scanFiles(memoryRoot, TEMPLATE_DIRECTORY, (relativePath) => relativePath.endsWith(".md.tpl"));
}

async function hashContainedFile(memoryRoot: string, relativePath: string, subject: string): Promise<string | undefined> {
  const target = await inspectContainedTarget(memoryRoot, relativePath, subject);
  if (target.kind !== "file") return undefined;
  return hashRegularFile(target.path);
}


async function validate(memoryRootArgument: string, manifestRelativePath: string, allowExternalRoot: boolean): Promise<void> {
  const memoryRoot = await resolveMemoryRoot(memoryRootArgument, allowExternalRoot);
  const manifestTarget = await inspectContainedTarget(memoryRoot, manifestRelativePath, "manifest path");
  if (manifestTarget.kind !== "file") fail(`manifest not found: ${join(memoryRoot, ...validateRelativePath(manifestRelativePath, "manifest path"))}`);

  const manifest = await readManifest(manifestTarget.path);
  const diskFiles = new Set(await scanManifestFiles(memoryRoot));
  const diskTemplates = new Set(await scanTemplateFiles(memoryRoot));
  const manifestPaths = new Set(manifest.files.map((receipt) => receipt.path));
  const templatePaths = new Set(manifest.templates.map((receipt) => receipt.path));

  const mismatches: HashMismatch[] = [];
  const missingFromDisk: string[] = [];
  let verifiedCount = 0;

  for (const receipt of [...manifest.files].sort((left, right) => left.path.localeCompare(right.path))) {
    const actual = await hashContainedFile(memoryRoot, receipt.path, `manifest file ${receipt.path}`);
    if (actual === undefined) {
      missingFromDisk.push(receipt.path);
    } else if (actual !== receipt.sha256) {
      mismatches.push({ path: receipt.path, expected: receipt.sha256, actual });
    } else {
      verifiedCount += 1;
    }
  }

  const indexActual = await hashContainedFile(memoryRoot, INDEX_PATH, "memory index");
  const indexMismatch = indexActual === undefined || indexActual !== manifest.memoryIndexSha256;

  const templateMismatches: HashMismatch[] = [];
  for (const receipt of [...manifest.templates].sort((left, right) => left.path.localeCompare(right.path))) {
    const actual = await hashContainedFile(memoryRoot, receipt.path, `template ${receipt.path}`);
    if (actual === undefined || actual !== receipt.sha256) {
      templateMismatches.push({ path: receipt.path, expected: receipt.sha256, actual: actual ?? null });
    }
  }
  for (const relativePath of [...diskTemplates].sort((left, right) => left.localeCompare(right))) {
    if (templatePaths.has(relativePath)) continue;
    const actual = await hashContainedFile(memoryRoot, relativePath, `template ${relativePath}`);
    if (actual === undefined) fail(`template disappeared while validating: ${relativePath}`);
    templateMismatches.push({ path: relativePath, expected: null, actual });
  }

  const result = {
    mismatches: mismatches.sort((left, right) => left.path.localeCompare(right.path)),
    missing_from_manifest: [...diskFiles].filter((relativePath) => !manifestPaths.has(relativePath)).sort((left, right) => left.localeCompare(right)),
    missing_from_disk: missingFromDisk.sort((left, right) => left.localeCompare(right)),
    verified_count: verifiedCount,
    index_mismatch: indexMismatch,
    templates_mismatches: templateMismatches.sort((left, right) => left.path.localeCompare(right.path)),
  };
  console.log(JSON.stringify(result, null, 2));
}

async function hash(memoryRootArgument: string, relativePath: string, allowExternalRoot: boolean): Promise<void> {
  const memoryRoot = await resolveMemoryRoot(memoryRootArgument, allowExternalRoot);
  const target = await inspectContainedTarget(memoryRoot, relativePath, "hash path");
  if (target.kind !== "file") fail(`file not found: ${join(memoryRoot, ...validateRelativePath(relativePath, "hash path"))}`);
  console.log(await hashRegularFile(target.path));
}

async function main(): Promise<void> {
  if (Number(process.versions.node.split(".")[0]) < 18) fail("Node.js >=18 is required");
  const invocation = parseInvocation(process.argv.slice(2));
  if (invocation.command === "hash") {
    await hash(invocation.memoryRootArgument, invocation.relativePath, invocation.allowExternalRoot);
  } else {
    await validate(invocation.memoryRootArgument, invocation.manifestRelativePath, invocation.allowExternalRoot);
  }
}

void main().catch((error: unknown) => {
  console.error(`ERROR: ${errorMessage(error)}`);
  process.exitCode = 1;
});
