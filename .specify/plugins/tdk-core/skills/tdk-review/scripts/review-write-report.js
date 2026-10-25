// @bun
// review-write-report.ts
import { lstatSync as lstatSync2, mkdirSync, readFileSync, realpathSync } from "fs";
import { join, resolve } from "path";
import { parseArgs } from "util";

// ../../../../../scripts/ts/src/utils/agent-output.ts
function formatAgentJson(value) {
  return `${JSON.stringify(value)}
`;
}
function writeAgentJson(value) {
  process.stdout.write(formatAgentJson(value));
}

// ../../../../../scripts/ts/src/utils/create-new-file.ts
import * as fs from "fs";
function createNewFile(path, body, mode) {
  let existing;
  try {
    existing = fs.lstatSync(path, { throwIfNoEntry: false });
  } catch {
    return "write_failed";
  }
  if (existing)
    return "collision_exists";
  let fd;
  try {
    fd = fs.openSync(path, "wx", mode);
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "EEXIST" ? "collision_exists" : "write_failed";
  }
  let identity;
  let closed = false;
  try {
    identity = fs.fstatSync(fd, { bigint: true });
    fs.writeFileSync(fd, body, "utf8");
    fs.closeSync(fd);
    closed = true;
    return null;
  } catch {
    if (!closed) {
      try {
        fs.closeSync(fd);
      } catch {}
    }
    try {
      const current = fs.lstatSync(path, { bigint: true });
      if (identity && current.isFile() && current.dev === identity.dev && current.ino === identity.ino)
        fs.unlinkSync(path);
    } catch {}
    return "write_failed";
  }
}

// ../../../../../scripts/ts/src/utils/path-within.ts
import { relative, isAbsolute } from "path";
function isWithin(ancestor, descendant) {
  if (ancestor === descendant)
    return true;
  const rel = relative(ancestor, descendant);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

// review-redaction.ts
var MARKER_SOURCE = String.raw`\[REDACTED:[a-z][a-z0-9-]*\]`;
var URL_SOURCE = String.raw`(?:\b[a-z][a-z0-9+.-]*:\/\/|(?<![\w/])\/\/(?=[^/\s<>"\x60]*(?:\.|@|\[)))[^\s<>"\x60]+`;
var URL_IN_VALUE = new RegExp(URL_SOURCE, "i");
var EXACT_URL = new RegExp(`^${URL_SOURCE}$`, "i");
var TOKEN_SOURCE = String.raw`(?:AKIA|ASIA)[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,}|xox[abprs]-[A-Za-z0-9-]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+`;
var ONLY_MARKERS = new RegExp(`^(?:\\s*${MARKER_SOURCE})+\\s*$`);
var EXACT_TOKEN = new RegExp(`^(?:${TOKEN_SOURCE})$`, "i");
var URL_TOKEN = new RegExp(`(?<!\\w)(?:${TOKEN_SOURCE})(?![\\w-])`, "i");
var MACHINE_ROOTS = [
  "home",
  "Users",
  "root",
  "tmp",
  "var",
  "etc",
  "opt",
  "mnt",
  "private",
  "srv",
  "workspace",
  "usr",
  "Volumes",
  "media",
  "run",
  "workspaces",
  "github",
  "builds",
  "proc",
  "nix"
];
var MACHINE_ROOT_PATH = new RegExp(String.raw`(?<![\p{L}\p{M}\p{N}_])\/(?:${MACHINE_ROOTS.join("|")})(?![\p{L}\p{N}_-])|(?<![\p{L}\p{N}_/.-])[A-Za-z]:[\\/]|\\\\|(?<![\w:/])\/\/[\w.-]+\/|(?<![\p{L}\p{M}\p{N}_])\/[A-Za-z]:[\\/]|(?<![\p{L}\p{N}_])[A-Za-z]:\\|(?<![\p{L}\p{M}\p{N}_])\/(?:cygdrive\/[A-Za-z]|[A-Za-z]\/(?:Users|home))(?![\p{L}\p{N}_-])|(?<![\p{L}\p{N}_])[Ff][Ii][Ll][Ee]:\/\/`, "u");
function keepsRepoPath(candidate) {
  return candidate.startsWith("/") && !candidate.startsWith("//") && !MACHINE_ROOT_PATH.test(candidate) && !urlCategory(candidate);
}
function tokenCategory(value) {
  if (!EXACT_TOKEN.test(value))
    return null;
  if (/^(?:AKIA|ASIA)/i.test(value))
    return "aws-key-id";
  if (/^(?:gh[pousr]_|github_pat_)/i.test(value))
    return "github-token";
  if (/^xox/i.test(value))
    return "slack-token";
  return "jwt";
}
function assignmentCategory(key, value) {
  const auth = /^(?:proxy[-_])?authorization$/i.test(key);
  const generic = /^(?:api[-_]?key|apikey|access[-_]?token|secret)$/i.test(key);
  const env = /^[A-Z][A-Z0-9_]*$/.test(key) && /PASSWORD|SECRET|TOKEN|KEY|CREDENTIAL|PASSWD|API|AUTH|SESSION/.test(key);
  const credential = !/^(?:key|api)$/i.test(key) && /(?:^|[_.-])(?:password|passwd|secret|token|key|credential|credentials|api|apikey|auth|session)(?:$|[_.-])/i.test(key);
  if (!auth && !generic && !env && !credential)
    return null;
  const trimmed = value.trim();
  const header = /^(Bearer|Basic)\s+([\s\S]+)$/i.exec(trimmed);
  const specific = tokenCategory((header?.[2] ?? trimmed).trim());
  if (specific)
    return specific;
  if (/^aws_secret_/i.test(key))
    return "aws-key";
  if (/^aws_access_key_id$/i.test(key))
    return "aws-key-id";
  const embeddedUrl = URL_IN_VALUE.exec(trimmed)?.[0];
  const url = embeddedUrl ? urlCategory(splitUrlTrailer(embeddedUrl).url) : null;
  if (url)
    return url;
  if (auth && header)
    return header[1]?.toLowerCase() === "basic" ? "basic-auth" : "bearer";
  return generic ? "api-key" : "env-value";
}
function isInternalHost(host) {
  const name = host.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (/(?:^|\.)(?:internal|corp|localhost)$/.test(name) || /(?:^|\.)staging\.[a-z0-9-]+(?:\.[a-z0-9-]+)*$/.test(name))
    return true;
  if (name === "::1" || /^(?:f[cd][0-9a-f]{2}|fe[89ab][0-9a-f]):/.test(name))
    return true;
  if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(name))
    return false;
  const octets = name.split(".").map(Number);
  if (octets.some((octet) => octet > 255))
    return false;
  return octets[0] === 10 || octets[0] === 172 && (octets[1] ?? 0) >= 16 && (octets[1] ?? 0) <= 31 || octets[0] === 192 && octets[1] === 168 || octets[0] === 127 || octets[0] === 169 && octets[1] === 254;
}
function urlCategory(value) {
  const normalized = value.startsWith("//") ? `https:${value}` : value;
  const protocol = normalized.slice(0, normalized.indexOf(":")).toLowerCase();
  if (protocol === "file" || /^[a-z]$/.test(protocol))
    return "absolute-path";
  const authority = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/i.exec(normalized)?.[1] ?? "";
  if (authority.includes("@")) {
    if (/^(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|rediss)$/.test(protocol))
      return "db-url";
    return /^https?$/.test(protocol) ? "basic-auth-url" : "credential-url";
  }
  const queryStart = value.indexOf("?");
  if (queryStart !== -1) {
    const fragmentStart = value.indexOf("#", queryStart);
    const query = new URLSearchParams(value.slice(queryStart + 1, fragmentStart === -1 ? undefined : fragmentStart));
    for (const key of query.keys()) {
      if (/^(?:token|sig|signature|(?:x-)?amz-signature|(?:x-)?goog-signature|access[-_]?token|api[-_]?key|secret|password|credential|authorization|auth)$/i.test(key)) {
        return "signed-url";
      }
    }
  }
  const knownToken = URL_TOKEN.exec(value)?.[0];
  if (knownToken)
    return tokenCategory(knownToken);
  let host = authority.replace(/:\d+$/, "");
  try {
    host = new URL(normalized).hostname;
  } catch {}
  return isInternalHost(host) ? "internal-host" : null;
}
function splitUrlTrailer(value, singleQuoted = false) {
  let end = value.length;
  let parentheses = 0;
  let brackets = 0;
  for (const character of value) {
    if (character === "(")
      parentheses++;
    if (character === ")")
      parentheses--;
    if (character === "[")
      brackets++;
    if (character === "]")
      brackets--;
  }
  while (end > 0) {
    const character = value[end - 1];
    if (character && /[.,;!]/.test(character))
      end--;
    else if (character === ")" && parentheses < 0) {
      end--;
      parentheses++;
    } else if (character === "]" && brackets < 0) {
      end--;
      brackets++;
    } else if (character === "'" && singleQuoted) {
      end--;
      singleQuoted = false;
    } else
      break;
  }
  return { url: value.slice(0, end), trailer: value.slice(end) };
}
function lineEnd(value, start) {
  const newline = value.indexOf(`
`, start);
  const end = newline === -1 ? value.length : newline;
  return value[end - 1] === "\r" ? end - 1 : end;
}
function indentedEnd(value, start, baseIndent) {
  let cursor = value.indexOf(`
`, start);
  if (cursor === -1)
    return start;
  cursor++;
  let end = start;
  while (cursor < value.length) {
    const nextEnd = lineEnd(value, cursor);
    const line = value.slice(cursor, nextEnd);
    const indent = /^[ \t]*/.exec(line)?.[0].length ?? 0;
    if (line.trim() && indent <= baseIndent)
      break;
    if (line.trim())
      end = nextEnd;
    const newline = value.indexOf(`
`, cursor);
    if (newline === -1)
      break;
    cursor = newline + 1;
  }
  return end;
}
function shellAssignmentValue(value, start, schemeLength) {
  let cursor = start + schemeLength;
  let opening = "";
  let firstQuoteEnd = -1;
  const nextAssignment = /(?:;|&&|\|\|)[ \t]*(?:export[ \t]+)?[A-Za-z_][\w.-]*[ \t]*=/y;
  while (cursor < value.length) {
    const character = value[cursor];
    if (character === "\\") {
      cursor += value[cursor + 1] === "\r" && value[cursor + 2] === `
` ? 3 : 2;
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      const quoteStart = cursor;
      const delimiter = value.startsWith(character.repeat(3), cursor) ? character.repeat(3) : character;
      cursor += delimiter.length;
      let closed = false;
      while (cursor < value.length) {
        if (value[cursor] === "\\" && (character !== "'" || delimiter.length > 1)) {
          cursor += 2;
          continue;
        }
        if (value.startsWith(delimiter, cursor)) {
          cursor += delimiter.length;
          closed = true;
          break;
        }
        cursor++;
      }
      if (!closed) {
        return { end: value.length, raw: value.slice(start), opening: "", closing: "" };
      }
      if (quoteStart === start) {
        opening = delimiter;
        firstQuoteEnd = cursor;
      }
      continue;
    }
    if (character === ";" || character === "&" || character === "|") {
      nextAssignment.lastIndex = cursor;
      if (nextAssignment.test(value))
        break;
    }
    if (!character || /\s/.test(character))
      break;
    cursor++;
  }
  const end = Math.min(cursor, value.length);
  if (opening && firstQuoteEnd === end) {
    return { end, raw: value.slice(start + opening.length, end - opening.length), opening, closing: opening };
  }
  return { end, raw: value.slice(start, end), opening: "", closing: "" };
}
function assignmentValue(value, start, keyStart, shell) {
  const character = value[start];
  const initialEnd = lineEnd(value, start);
  const initial = value.slice(start, initialEnd);
  const block = /^[|>](?:[1-9][+-]?|[+-][1-9]?)?(?:[ \t]+#.*)?$/.test(initial.trim());
  if (shell && !block && character !== "\r" && character !== `
`) {
    const schemeLength = /^(?:Bearer|Basic)[ \t]+/i.exec(initial)?.[0].length ?? 0;
    return shellAssignmentValue(value, start, schemeLength);
  }
  if (character === '"' || character === "'" || character === "`") {
    const opening = character !== "'" && value.startsWith(character.repeat(3), start) ? character.repeat(3) : character;
    let cursor = start + opening.length;
    while (cursor < value.length) {
      if (character === "'" && opening.length === 1 && value.startsWith("''", cursor)) {
        cursor += 2;
        continue;
      }
      if (value[cursor] === "\\" && character !== "'") {
        cursor += 2;
        continue;
      }
      if (value.startsWith(opening, cursor)) {
        return { end: cursor + opening.length, raw: value.slice(start + opening.length, cursor), opening, closing: opening };
      }
      cursor++;
    }
    return { end: value.length, raw: value.slice(start + opening.length), opening: "", closing: "" };
  }
  const lineStart = value.lastIndexOf(`
`, keyStart - 1) + 1;
  const baseIndent = /^[ \t]*/.exec(value.slice(lineStart, keyStart))?.[0].length ?? 0;
  let end = shell ? initialEnd : Math.max(initialEnd, indentedEnd(value, start, baseIndent));
  if (block || character === "\r" || character === `
`) {
    const blockEnd = indentedEnd(value, start, baseIndent);
    if (blockEnd > start)
      end = blockEnd;
    else if (character === "\r" || character === `
`) {
      let cursor = value.indexOf(`
`, start);
      while (cursor !== -1 && cursor + 1 < value.length) {
        const nextEnd = lineEnd(value, cursor + 1);
        if (value.slice(cursor + 1, nextEnd).trim()) {
          end = nextEnd;
          break;
        }
        cursor = value.indexOf(`
`, cursor + 1);
      }
    }
  } else {
    let cursor = start;
    while (/\\[ \t]*$/.test(value.slice(cursor, end))) {
      const newline = value.indexOf(`
`, end);
      if (newline === -1 || newline + 1 >= value.length)
        break;
      cursor = newline + 1;
      end = lineEnd(value, cursor);
    }
  }
  return { end, raw: value.slice(start, end), opening: "", closing: "" };
}
function sanitizeReviewText(value) {
  let redactions = 0;
  const redact = (category) => {
    redactions++;
    return `[REDACTED:${category}]`;
  };
  let text = value.replace(/-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----[\s\S]*?(?:-----END (?:[A-Z0-9]+ )*PRIVATE KEY-----|$)/g, () => redact("private-key-block"));
  const assignments = new RegExp(`${URL_SOURCE}|${MARKER_SOURCE}|(?<![\\w.-])(["']?)([A-Za-z_][\\w.-]*)\\1([ \\t]*[:=][ \\t]*)`, "gi");
  const pieces = [];
  let copiedUntil = 0;
  let match;
  while ((match = assignments.exec(text)) !== null) {
    const key = match[2];
    if (!key || !assignmentCategory(key, ""))
      continue;
    const start = match.index + match[0].length;
    const parsed = assignmentValue(text, start, match.index, match[3]?.includes("=") ?? false);
    assignments.lastIndex = Math.max(assignments.lastIndex, parsed.end);
    if (!parsed.raw.trim() || ONLY_MARKERS.test(parsed.raw))
      continue;
    const category = assignmentCategory(key, parsed.raw);
    if (!category)
      continue;
    pieces.push(text.slice(copiedUntil, start), parsed.opening, redact(category), parsed.closing);
    copiedUntil = parsed.end;
  }
  pieces.push(text.slice(copiedUntil));
  text = pieces.join("");
  text = text.replace(new RegExp(URL_SOURCE, "gi"), (match2, offset, source) => {
    const { url, trailer } = splitUrlTrailer(match2, source[offset - 1] === "'");
    const category = urlCategory(url);
    return category ? redact(category) + trailer : match2;
  });
  text = text.replace(new RegExp(`${URL_SOURCE}|${MARKER_SOURCE}|(?<!\\w)(?:${TOKEN_SOURCE})(?![\\w-])`, "gi"), (token) => {
    const category = tokenCategory(token);
    return category ? redact(category) : token;
  });
  const hostSource = String.raw`(?<![\w@.-])(?:(?:[a-z0-9-]+\.)+(?:internal|corp)|(?:[a-z0-9-]+\.)*staging\.[a-z0-9-]+(?:\.[a-z0-9-]+)*)(?::\d+)?(?![\w-]|\.[a-z0-9-])`;
  const cidrSource = String.raw`(?<![\w.:])(?:(?:\d{1,3}\.){3}\d{1,3}|f[cd][0-9a-f:]+|fe[89ab][0-9a-f:]+|::1)\/\d{1,3}(?![\w/])`;
  text = text.replace(new RegExp(`${URL_SOURCE}|${MARKER_SOURCE}|${hostSource}|${cidrSource}`, "gi"), (host) => {
    if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(host) || host.startsWith("[REDACTED:"))
      return host;
    const slash = host.lastIndexOf("/");
    if (slash !== -1) {
      const address = host.slice(0, slash);
      const mask = Number(host.slice(slash + 1));
      return mask <= (address.includes(":") ? 128 : 32) && isInternalHost(address) ? redact("internal-host") : host;
    }
    return isInternalHost(host.replace(/:\d+$/, "")) ? redact("internal-host") : host;
  });
  const quotedPath = String.raw`(["'\x60])((?:[a-z]:[\\/]|\\\\|\/)[^"'\x60\r\n]+)\1`;
  const pathCharacter = String.raw`(?:\\[ \t]|[^\s<>"'\x60()\[\]{},;])`;
  const barePath = String.raw`(?<![\p{L}\p{M}\p{N}_./\\:])(?:[a-z]:[\\/]${pathCharacter}*|\\\\[^\\\s<>"'\x60]+\\${pathCharacter}+|\/\/[a-z0-9._-]+\/${pathCharacter}+|\/[^\s<>"'\x60()\[\]{},;/\\]${pathCharacter}*)`;
  text = text.replace(new RegExp(`${URL_SOURCE}|${MARKER_SOURCE}|${quotedPath}|${barePath}`, "giu"), (path, quote, quoted) => {
    if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(path) && EXACT_URL.test(path) || path.startsWith("[REDACTED:"))
      return path;
    if (quote && quoted) {
      if (EXACT_URL.test(quoted) && !urlCategory(quoted))
        return path;
      if (keepsRepoPath(quoted))
        return path;
      return quote + redact("absolute-path") + quote;
    }
    if (keepsRepoPath(path))
      return path;
    const suffix = /[.!?]+$/.exec(path)?.[0] ?? "";
    return redact("absolute-path") + suffix;
  });
  return { text, redactions };
}

// review-write-report.ts
var pad = (value, width = 2) => String(value).padStart(width, "0");
function stamp(now) {
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}
function prepareReviewsDir(featureDir, reviews) {
  let canonicalFeature;
  try {
    canonicalFeature = realpathSync(featureDir);
  } catch {
    return false;
  }
  try {
    const info = lstatSync2(reviews);
    return info.isDirectory() && !info.isSymbolicLink() && isWithin(canonicalFeature, realpathSync(reviews));
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT")
      return false;
  }
  try {
    mkdirSync(reviews);
  } catch {
    return false;
  }
  return isWithin(canonicalFeature, realpathSync(reviews));
}
function writeReviewReport(projectRoot, featureDirectory, slug, body, now = new Date) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 50)
    return { ok: false, error: "invalid_slug" };
  const featureDir = resolve(featureDirectory);
  const reviews = join(featureDir, "reviews");
  let insideProject = false;
  try {
    insideProject = isWithin(realpathSync(projectRoot), realpathSync(featureDir));
  } catch {}
  if (!insideProject || !prepareReviewsDir(featureDir, reviews))
    return { ok: false, error: "unsafe_output_path" };
  const path = join(reviews, `${stamp(now)}-${slug}.md`);
  const { text, redactions } = sanitizeReviewText(body);
  const failure = createNewFile(path, text, 420);
  return failure ? { ok: false, error: failure } : { ok: true, path, redactions };
}
if (import.meta.main) {
  let values;
  try {
    values = parseArgs({
      args: process.argv.slice(2),
      options: { "project-root": { type: "string" }, "feature-dir": { type: "string" }, slug: { type: "string" } },
      allowPositionals: false,
      strict: true
    }).values;
  } catch {}
  if (!values?.["project-root"] || !values["feature-dir"] || values.slug === undefined) {
    writeAgentJson({ ok: false, error: "invalid_arguments" });
    process.exitCode = 1;
  } else {
    const result = writeReviewReport(values["project-root"], values["feature-dir"], values.slug, readFileSync(0, "utf-8"));
    writeAgentJson(result);
    if (!result.ok)
      process.exitCode = result.error === "write_failed" ? 2 : 1;
  }
}
export {
  writeReviewReport
};
