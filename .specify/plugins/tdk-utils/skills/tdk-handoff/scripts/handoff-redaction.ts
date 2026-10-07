const MARKER_SOURCE = String.raw`\[REDACTED:[a-z][a-z0-9-]*\]`;
const URL_SOURCE = String.raw`(?:\b[a-z][a-z0-9+.-]*:\/\/|(?<![\w/])\/\/(?=[^/\s<>"\x60]*(?:\.|@|\[)))[^\s<>"\x60]+`;
const URL_IN_VALUE = new RegExp(URL_SOURCE, 'i');
const EXACT_URL = new RegExp(`^${URL_SOURCE}$`, 'i');
const TOKEN_SOURCE = String.raw`(?:AKIA|ASIA)[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,}|xox[abprs]-[A-Za-z0-9-]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+`;
const ONLY_MARKERS = new RegExp(`^(?:\\s*${MARKER_SOURCE})+\\s*$`);
const EXACT_TOKEN = new RegExp(`^(?:${TOKEN_SOURCE})$`, 'i');
const URL_TOKEN = new RegExp(`(?<!\\w)(?:${TOKEN_SOURCE})(?![\\w-])`, 'i');
// Branding rewrites the literal tdk- prefix in distributed payloads. Only this
// public token is exempt: a root file with this exact name is indistinguishable
// from the command, but descendants and other slash-prefixed strings are paths.
const PUBLIC_SPECIFY_COMMAND = '/tdk-specify';

function tokenCategory(value: string): string | null {
  if (!EXACT_TOKEN.test(value)) return null;
  if (/^(?:AKIA|ASIA)/i.test(value)) return 'aws-key-id';
  if (/^(?:gh[pousr]_|github_pat_)/i.test(value)) return 'github-token';
  if (/^xox/i.test(value)) return 'slack-token';
  return 'jwt';
}

function assignmentCategory(key: string, value: string): string | null {
  const auth = /^(?:proxy[-_])?authorization$/i.test(key);
  const generic = /^(?:api[-_]?key|apikey|access[-_]?token|secret)$/i.test(key);
  const env = /^[A-Z][A-Z0-9_]*$/.test(key)
    && /PASSWORD|SECRET|TOKEN|KEY|CREDENTIAL|PASSWD|API|AUTH|SESSION/.test(key);
  const credential = !/^(?:key|api)$/i.test(key)
    && /(?:^|[_.-])(?:password|passwd|secret|token|key|credential|credentials|api|apikey|auth|session)(?:$|[_.-])/i.test(key);
  if (!auth && !generic && !env && !credential) return null;

  const trimmed = value.trim();
  const header = /^(Bearer|Basic)\s+([\s\S]+)$/i.exec(trimmed);
  const specific = tokenCategory((header?.[2] ?? trimmed).trim());
  if (specific) return specific;
  if (/^aws_secret_/i.test(key)) return 'aws-key';
  if (/^aws_access_key_id$/i.test(key)) return 'aws-key-id';
  const embeddedUrl = URL_IN_VALUE.exec(trimmed)?.[0];
  const url = embeddedUrl ? urlCategory(splitUrlTrailer(embeddedUrl).url) : null;
  if (url) return url;
  if (auth && header) return header[1]?.toLowerCase() === 'basic' ? 'basic-auth' : 'bearer';
  return generic ? 'api-key' : 'env-value';
}

function isInternalHost(host: string): boolean {
  const name = host.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (/(?:^|\.)(?:internal|corp|localhost)$/.test(name)
    || /(?:^|\.)staging\.[a-z0-9-]+(?:\.[a-z0-9-]+)*$/.test(name)) return true;
  if (name === '::1' || /^(?:f[cd][0-9a-f]{2}|fe[89ab][0-9a-f]):/.test(name)) return true;
  if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(name)) return false;
  const octets = name.split('.').map(Number);
  if (octets.some(octet => octet > 255)) return false;
  return octets[0] === 10
    || (octets[0] === 172 && (octets[1] ?? 0) >= 16 && (octets[1] ?? 0) <= 31)
    || (octets[0] === 192 && octets[1] === 168)
    || octets[0] === 127
    || (octets[0] === 169 && octets[1] === 254);
}

function urlCategory(value: string): string | null {
  const normalized = value.startsWith('//') ? `https:${value}` : value;
  const protocol = normalized.slice(0, normalized.indexOf(':')).toLowerCase();
  if (protocol === 'file' || /^[a-z]$/.test(protocol)) return 'absolute-path';
  const authority = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/i.exec(normalized)?.[1] ?? '';
  if (authority.includes('@')) {
    if (/^(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|rediss)$/.test(protocol)) return 'db-url';
    return /^https?$/.test(protocol) ? 'basic-auth-url' : 'credential-url';
  }
  const queryStart = value.indexOf('?');
  if (queryStart !== -1) {
    const fragmentStart = value.indexOf('#', queryStart);
    const query = new URLSearchParams(value.slice(queryStart + 1, fragmentStart === -1 ? undefined : fragmentStart));
    for (const key of query.keys()) {
      if (/^(?:token|sig|signature|(?:x-)?amz-signature|(?:x-)?goog-signature|access[-_]?token|api[-_]?key|secret|password|credential|authorization|auth)$/i.test(key)) {
        return 'signed-url';
      }
    }
  }
  const knownToken = URL_TOKEN.exec(value)?.[0];
  if (knownToken) return tokenCategory(knownToken);
  let host = authority.replace(/:\d+$/, '');
  try {
    host = new URL(normalized).hostname;
  } catch {
    // An invalid URL can still disclose a lexically recognizable private host.
  }
  return isInternalHost(host) ? 'internal-host' : null;
}

function splitUrlTrailer(value: string, singleQuoted = false): { url: string; trailer: string } {
  let end = value.length;
  let parentheses = 0;
  let brackets = 0;
  for (const character of value) {
    if (character === '(') parentheses++;
    if (character === ')') parentheses--;
    if (character === '[') brackets++;
    if (character === ']') brackets--;
  }
  while (end > 0) {
    const character = value[end - 1];
    if (character && /[.,;!]/.test(character)) end--;
    else if (character === ')' && parentheses < 0) { end--; parentheses++; }
    else if (character === ']' && brackets < 0) { end--; brackets++; }
    else if (character === "'" && singleQuoted) { end--; singleQuoted = false; }
    else break;
  }
  return { url: value.slice(0, end), trailer: value.slice(end) };
}

interface AssignmentValue {
  end: number;
  raw: string;
  opening: string;
  closing: string;
}

function lineEnd(value: string, start: number): number {
  const newline = value.indexOf('\n', start);
  const end = newline === -1 ? value.length : newline;
  return value[end - 1] === '\r' ? end - 1 : end;
}

function indentedEnd(value: string, start: number, baseIndent: number): number {
  let cursor = value.indexOf('\n', start);
  if (cursor === -1) return start;
  cursor++;
  let end = start;
  while (cursor < value.length) {
    const nextEnd = lineEnd(value, cursor);
    const line = value.slice(cursor, nextEnd);
    const indent = /^[ \t]*/.exec(line)?.[0].length ?? 0;
    if (line.trim() && indent <= baseIndent) break;
    if (line.trim()) end = nextEnd;
    const newline = value.indexOf('\n', cursor);
    if (newline === -1) break;
    cursor = newline + 1;
  }
  return end;
}

function shellAssignmentValue(value: string, start: number, schemeLength: number): AssignmentValue {
  let cursor = start + schemeLength;
  let opening = '';
  let firstQuoteEnd = -1;
  const nextAssignment = /(?:;|&&|\|\|)[ \t]*(?:export[ \t]+)?[A-Za-z_][\w.-]*[ \t]*=/y;
  while (cursor < value.length) {
    const character = value[cursor];
    if (character === '\\') {
      cursor += value[cursor + 1] === '\r' && value[cursor + 2] === '\n' ? 3 : 2;
      continue;
    }
    if (character === '"' || character === "'" || character === '`') {
      const quoteStart = cursor;
      const delimiter = value.startsWith(character.repeat(3), cursor) ? character.repeat(3) : character;
      cursor += delimiter.length;
      let closed = false;
      while (cursor < value.length) {
        // A POSIX single-quoted segment treats backslashes literally.
        if (value[cursor] === '\\' && (character !== "'" || delimiter.length > 1)) {
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
        return { end: value.length, raw: value.slice(start), opening: '', closing: '' };
      }
      if (quoteStart === start) { opening = delimiter; firstQuoteEnd = cursor; }
      // Adjacent quoted and unquoted segments belong to the same shell word.
      continue;
    }
    if (character === ';' || character === '&' || character === '|') {
      nextAssignment.lastIndex = cursor;
      if (nextAssignment.test(value)) break;
    }
    if (!character || /\s/.test(character)) break;
    cursor++;
  }
  const end = Math.min(cursor, value.length);
  if (opening && firstQuoteEnd === end) {
    return { end, raw: value.slice(start + opening.length, end - opening.length), opening, closing: opening };
  }
  return { end, raw: value.slice(start, end), opening: '', closing: '' };
}

function assignmentValue(value: string, start: number, keyStart: number, shell: boolean): AssignmentValue {
  const character = value[start];
  const initialEnd = lineEnd(value, start);
  const initial = value.slice(start, initialEnd);
  const block = /^[|>](?:[1-9][+-]?|[+-][1-9]?)?(?:[ \t]+#.*)?$/.test(initial.trim());
  if (shell && !block && character !== '\r' && character !== '\n') {
    const schemeLength = /^(?:Bearer|Basic)[ \t]+/i.exec(initial)?.[0].length ?? 0;
    return shellAssignmentValue(value, start, schemeLength);
  }
  if (character === '"' || character === "'" || character === '`') {
    const opening = character !== "'" && value.startsWith(character.repeat(3), start) ? character.repeat(3) : character;
    let cursor = start + opening.length;
    while (cursor < value.length) {
      if (character === "'" && opening.length === 1 && value.startsWith("''", cursor)) { cursor += 2; continue; }
      if (value[cursor] === '\\' && character !== "'") { cursor += 2; continue; }
      if (value.startsWith(opening, cursor)) {
        return { end: cursor + opening.length, raw: value.slice(start + opening.length, cursor), opening, closing: opening };
      }
      cursor++;
    }
    // Never leave the tail of an unterminated credential quote visible.
    return { end: value.length, raw: value.slice(start + opening.length), opening: '', closing: '' };
  }

  const lineStart = value.lastIndexOf('\n', keyStart - 1) + 1;
  const baseIndent = /^[ \t]*/.exec(value.slice(lineStart, keyStart))?.[0].length ?? 0;
  let end = shell ? initialEnd : Math.max(initialEnd, indentedEnd(value, start, baseIndent));
  if (block || character === '\r' || character === '\n') {
    const blockEnd = indentedEnd(value, start, baseIndent);
    if (blockEnd > start) end = blockEnd;
    else if (character === '\r' || character === '\n') {
      // The catalog's whitespace-delimited assignment also includes a value
      // captured on the next line without YAML/shell indentation.
      let cursor = value.indexOf('\n', start);
      while (cursor !== -1 && cursor + 1 < value.length) {
        const nextEnd = lineEnd(value, cursor + 1);
        if (value.slice(cursor + 1, nextEnd).trim()) { end = nextEnd; break; }
        cursor = value.indexOf('\n', cursor + 1);
      }
    }
  } else {
    // Backslash continuations are credential values even without indentation.
    let cursor = start;
    while (/\\[ \t]*$/.test(value.slice(cursor, end))) {
      const newline = value.indexOf('\n', end);
      if (newline === -1 || newline + 1 >= value.length) break;
      cursor = newline + 1;
      end = lineEnd(value, cursor);
    }
    // Consume the whole unquoted value: punctuation can be credential material,
    // and preserving a suffix after a comma/semicolon would expose part of it.
  }
  return { end, raw: value.slice(start, end), opening: '', closing: '' };
}

/** Fixed, finite passes over an in-memory string; no context gathering or persistence. */
export function sanitizeHandoffText(value: string): { text: string; redactions: number } {
  let redactions = 0;
  const redact = (category: string): string => {
    redactions++;
    return `[REDACTED:${category}]`;
  };
  let text = value.replace(
    /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----[\s\S]*?(?:-----END (?:[A-Z0-9]+ )*PRIVATE KEY-----|$)/g,
    () => redact('private-key-block'),
  );

  // URLs and existing markers are consumed before assignment candidates, so a
  // safe URL's path/query and a marker's category never become false assignments.
  const assignments = new RegExp(`${URL_SOURCE}|${MARKER_SOURCE}|(?<![\\w.-])(["']?)([A-Za-z_][\\w.-]*)\\1([ \\t]*[:=][ \\t]*)`, 'gi');
  const pieces: string[] = [];
  let copiedUntil = 0;
  let match: RegExpExecArray | null;
  while ((match = assignments.exec(text)) !== null) {
    const key = match[2];
    if (!key || !assignmentCategory(key, '')) continue;
    const start = match.index + match[0].length;
    const parsed = assignmentValue(text, start, match.index, match[3]?.includes('=') ?? false);
    assignments.lastIndex = Math.max(assignments.lastIndex, parsed.end);
    if (!parsed.raw.trim() || ONLY_MARKERS.test(parsed.raw)) continue;
    const category = assignmentCategory(key, parsed.raw);
    if (!category) continue;
    pieces.push(text.slice(copiedUntil, start), parsed.opening, redact(category), parsed.closing);
    copiedUntil = parsed.end;
  }
  pieces.push(text.slice(copiedUntil));
  text = pieces.join('');
  text = text.replace(new RegExp(URL_SOURCE, 'gi'), (match: string, offset: number, source: string) => {
    const { url, trailer } = splitUrlTrailer(match, source[offset - 1] === "'");
    const category = urlCategory(url);
    return category ? redact(category) + trailer : match;
  });

  text = text.replace(new RegExp(`${URL_SOURCE}|${MARKER_SOURCE}|(?<!\\w)(?:${TOKEN_SOURCE})(?![\\w-])`, 'gi'), token => {
    const category = tokenCategory(token);
    return category ? redact(category) : token;
  });

  const hostSource = String.raw`(?<![\w@.-])(?:(?:[a-z0-9-]+\.)+(?:internal|corp)|(?:[a-z0-9-]+\.)*staging\.[a-z0-9-]+(?:\.[a-z0-9-]+)*)(?::\d+)?(?![\w-]|\.[a-z0-9-])`;
  const cidrSource = String.raw`(?<![\w.:])(?:(?:\d{1,3}\.){3}\d{1,3}|f[cd][0-9a-f:]+|fe[89ab][0-9a-f:]+|::1)\/\d{1,3}(?![\w/])`;
  text = text.replace(new RegExp(`${URL_SOURCE}|${MARKER_SOURCE}|${hostSource}|${cidrSource}`, 'gi'), host => {
    if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(host) || host.startsWith('[REDACTED:')) return host;
    const slash = host.lastIndexOf('/');
    if (slash !== -1) {
      const address = host.slice(0, slash);
      const mask = Number(host.slice(slash + 1));
      return mask <= (address.includes(':') ? 128 : 32) && isInternalHost(address) ? redact('internal-host') : host;
    }
    return isInternalHost(host.replace(/:\d+$/, '')) ? redact('internal-host') : host;
  });

  const quotedPath = String.raw`(["'\x60])(?!${PUBLIC_SPECIFY_COMMAND}(?=[ \t"'\x60]))((?:[a-z]:[\\/]|\\\\|\/)[^"'\x60\r\n]+)\1`;
  const pathCharacter = String.raw`(?:\\[ \t]|[^\s<>"'\x60()\[\]{},;])`;
  const barePath = String.raw`(?<![\p{L}\p{M}\p{N}_./\\:])(?:[a-z]:[\\/]${pathCharacter}*|\\\\[^\\\s<>"'\x60]+\\${pathCharacter}+|\/\/[a-z0-9._-]+\/${pathCharacter}+|\/[^\s<>"'\x60()\[\]{},;/\\]${pathCharacter}*)`;
  text = text.replace(new RegExp(`${URL_SOURCE}|${MARKER_SOURCE}|${quotedPath}|${barePath}`, 'giu'), (path: string, quote?: string, quoted?: string) => {
    if ((/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(path) && EXACT_URL.test(path))
      || path.startsWith('[REDACTED:') || path === PUBLIC_SPECIFY_COMMAND) return path;
    if (quote && quoted) {
      if (EXACT_URL.test(quoted) && !urlCategory(quoted)) return path;
      return quote + redact('absolute-path') + quote;
    }
    const suffix = /[.!?]+$/.exec(path)?.[0] ?? '';
    return redact('absolute-path') + suffix;
  });
  return { text, redactions };
}

export function containsSensitiveHandoffText(value: string): boolean {
  return sanitizeHandoffText(value).text !== value;
}
