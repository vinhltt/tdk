// Pure ranking for free-text memory queries: tokenizing, scoring, sorting, and selection.
// The caller supplies note text and identity. A new reader only has to narrow which
// notes are supplied, so nothing here depends on where a nomination came from.

export type NoteIdentity = {
  id?: string;
  title?: string;
  aliases: string[];
};

export type RankableNote = {
  path: string;
  text: string;
  identity: NoteIdentity;
};

export type RankedNote = {
  path: string;
  score: number;
  tier: number;
  occurrences: number;
  pinned: boolean;
};

export type Ranking = {
  total: number;
  selected: RankedNote[];
  omitted: number;
};

// One whitespace or separator delimited word of a term, with its camelCase parts.
type TermWord = {
  compact: string;
  parts: string[];
};

type ParsedTerm = {
  compact: string;
  words: TermWord[];
};

// Long tokens search the continuous text, so `github` finds `GitHub`. Short tokens search
// the text split at camelCase boundaries, so `ai` finds `fooAi` and still not `email`.
type SearchableText = {
  continuous: string;
  splitAtCamelCase: string;
};

type ScoredMatch = {
  score: number;
  occurrences: number;
};

const SCORE_ID = 5;
const SCORE_STEM = 4;
const SCORE_TITLE = 3;
const SCORE_ALIAS = 2;
const SCORE_PATH = 1;
const SCORE_BODY = 0;

// The first positions are always kept. Past them only a tie at the highest score of at
// least this value and a pinned note stay, so body-only matches cannot grow without bound.
const GUARANTEED_POSITIONS = 5;
const MIN_SCORE_FOR_TIES = 1;

const TIER_NOTE = 0;
const TIER_ARC42 = 1;
const TIER_ROOT_CONTROL = 2;
const TIER_ARC42_README = 3;
const ROOT_CONTROL_FILES = new Set(["README.md", "CHANGELOG.md", "memory-index.md"]);
const ARC42_README = "arc42/README.md";
const ARC42_PREFIX = "arc42/";

const PINNED_PATH = "constitution.md";
const PINNED_DOMAIN_OVERVIEW = /^domains\/[^/]+\/domain-overview\.md$/;

// A short token matches only as a whole word, so `ai` does not match `email`.
const MAX_WORD_BOUNDED_LENGTH = 2;
const PRINTABLE_TERM = /^[\p{L}\p{N} ._-]{1,64}$/u;

// A query naming a note's file means that note, so `README.md` searches like `README`.
// The lookbehind keeps a bare `.md` as a word of its own.
const NOTE_EXTENSION = /(?<=.)\.md$/iu;
const WORD_CHARACTER_AT_END = /[\p{L}\p{N}]$/u;
const WORD_CHARACTER_AT_START = /^[\p{L}\p{N}]/u;

function splitCamelCase(value: string): string {
  return value.replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, "$1 $2");
}

function wordsOf(value: string): string[] {
  return value
    .normalize("NFC")
    .trim()
    .replace(NOTE_EXTENSION, "")
    .split(/[\s._-]+/u)
    .filter((word) => word.length > 0);
}

function partsOf(word: string): string[] {
  return splitCamelCase(word)
    .split(" ")
    .map((part) => part.toLowerCase());
}

function compactForm(value: string): string {
  return wordsOf(value).flatMap(partsOf).join("");
}

// The term a search tool may receive: lowercase tokens over characters that stay inert
// inside double quotes. Null means the tool must not be asked at all.
export function printableTerm(term: string): string | null {
  const printable = wordsOf(term).flatMap(partsOf).join(" ");
  return PRINTABLE_TERM.test(printable) ? printable : null;
}

function isWordBounded(literal: string): boolean {
  return Array.from(literal).length <= MAX_WORD_BOUNDED_LENGTH;
}

function parseTerm(term: string): ParsedTerm {
  const words = wordsOf(term).map((word) => {
    const parts = partsOf(word);
    return { compact: parts.join(""), parts };
  });
  return { compact: words.map((word) => word.compact).join(""), words };
}

// Two code units are enough to see a whole character, including a surrogate pair.
function isWholeWord(text: string, start: number, end: number): boolean {
  return (
    !WORD_CHARACTER_AT_END.test(text.slice(Math.max(0, start - 2), start)) &&
    !WORD_CHARACTER_AT_START.test(text.slice(end, end + 2))
  );
}

// Counts non-overlapping matches. Terms are untrusted, so no regular expression is ever
// built from one: its size or syntax could fail with a message that repeats the term.
function countOccurrences(literal: string, text: string, wholeWordOnly: boolean): number {
  // `indexOf` never returns -1 for an empty literal, so the loop below could not end.
  if (literal.length === 0) return 0;
  let count = 0;
  let position = text.indexOf(literal);
  while (position !== -1) {
    const end = position + literal.length;
    if (wholeWordOnly && !isWholeWord(text, position, end)) {
      position = text.indexOf(literal, position + 1);
    } else {
      count += 1;
      position = text.indexOf(literal, end);
    }
  }
  return count;
}

function fewestOf<T>(items: T[], occurrencesOf: (item: T) => number): number {
  let fewest = Number.POSITIVE_INFINITY;
  for (const item of items) {
    fewest = Math.min(fewest, occurrencesOf(item));
    if (fewest === 0) break;
  }
  return fewest;
}

function occurrencesOfPart(part: string, text: SearchableText): number {
  return isWordBounded(part)
    ? countOccurrences(part, text.splitAtCamelCase, true)
    : countOccurrences(part, text.continuous, false);
}

// A word split at camelCase also counts its joined form as one whole word, because a note
// may spell it differently: `iOS` finds `ios` and `IOS`, and still not `aioli`.
function occurrencesOfWord(word: TermWord, text: SearchableText): number {
  const asParts = fewestOf(word.parts, (part) => occurrencesOfPart(part, text));
  return word.parts.length > 1 ? Math.max(asParts, countOccurrences(word.compact, text.continuous, true)) : asParts;
}

function fileTier(path: string): number {
  if (path === ARC42_README) return TIER_ARC42_README;
  if (ROOT_CONTROL_FILES.has(path)) return TIER_ROOT_CONTROL;
  if (path.startsWith(ARC42_PREFIX)) return TIER_ARC42;
  return TIER_NOTE;
}

function isPinned(path: string): boolean {
  return path === PINNED_PATH || PINNED_DOMAIN_OVERVIEW.test(path);
}

function pathMatches(term: ParsedTerm, pathWithoutExtension: string): boolean {
  if (isWordBounded(term.compact)) {
    return countOccurrences(term.compact, splitCamelCase(pathWithoutExtension).toLowerCase(), true) > 0;
  }
  return pathWithoutExtension.toLowerCase().replace(/[\s._-]/gu, "").includes(term.compact);
}

function scoreNote(term: ParsedTerm, note: RankableNote, text: SearchableText): ScoredMatch | undefined {
  const occurrences = fewestOf(term.words, (word) => occurrencesOfWord(word, text));
  const pathWithoutExtension = note.path.normalize("NFC").replace(/\.md$/u, "");
  const stem = pathWithoutExtension.slice(pathWithoutExtension.lastIndexOf("/") + 1);
  const { id, title, aliases } = note.identity;

  const matches = (value: string | undefined): boolean => value !== undefined && compactForm(value) === term.compact;
  if (matches(id)) return { score: SCORE_ID, occurrences };
  if (matches(stem)) return { score: SCORE_STEM, occurrences };
  if (matches(title)) return { score: SCORE_TITLE, occurrences };
  if (aliases.some(matches)) return { score: SCORE_ALIAS, occurrences };
  if (pathMatches(term, pathWithoutExtension)) return { score: SCORE_PATH, occurrences };
  return occurrences > 0 ? { score: SCORE_BODY, occurrences } : undefined;
}

function bestMatch(terms: ParsedTerm[], note: RankableNote): ScoredMatch | undefined {
  const normalized = note.text.normalize("NFC");
  const text = { continuous: normalized.toLowerCase(), splitAtCamelCase: splitCamelCase(normalized).toLowerCase() };
  let best: ScoredMatch | undefined;
  for (const term of terms) {
    const match = scoreNote(term, note, text);
    if (match === undefined) continue;
    if (best === undefined || match.score > best.score || (match.score === best.score && match.occurrences > best.occurrences)) {
      best = match;
    }
  }
  return best;
}

function compareRanked(left: RankedNote, right: RankedNote): number {
  return (
    right.score - left.score ||
    left.tier - right.tier ||
    right.occurrences - left.occurrences ||
    Buffer.compare(Buffer.from(left.path, "utf8"), Buffer.from(right.path, "utf8"))
  );
}

export function rankNotes(terms: string[], notes: RankableNote[]): Ranking {
  // A term without tokens matches nothing. Kept, it would have no words to require, and
  // every note would count as a body match.
  const parsedTerms = terms.map(parseTerm).filter((term) => term.compact.length > 0);
  const ranked: RankedNote[] = [];

  for (const note of notes) {
    const match = bestMatch(parsedTerms, note);
    if (match === undefined) continue;
    ranked.push({
      path: note.path,
      score: match.score,
      tier: fileTier(note.path),
      occurrences: match.occurrences,
      pinned: isPinned(note.path),
    });
  }
  ranked.sort(compareRanked);

  const highestScore = ranked[0]?.score;
  const selected = ranked.filter(
    (note, position) =>
      position < GUARANTEED_POSITIONS || (note.score >= MIN_SCORE_FOR_TIES && note.score === highestScore) || note.pinned,
  );
  return { total: ranked.length, selected, omitted: ranked.length - selected.length };
}
